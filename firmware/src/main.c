#include <zephyr/kernel.h>
#include <zephyr/net/net_ip.h>
#include <zephyr/net/socket.h>
#include <zephyr/sys/printk.h>

#include <errno.h>
#include <string.h>

/*
 * Outbound TCP connectivity test with HTTP verification.
 *
 * The v86 network relay is a NAT gateway: v86 guests can initiate outbound
 * TCP connections to the Internet but the relay cannot forward inbound
 * connections to a listening server inside the guest.
 *
 * Network path:
 *   zsock → native_sim offloaded sockets → Buildroot Linux guest →
 *   ne2k NIC → v86 wsproxy backend → relay server → Internet
 *
 * Test stages:
 *   1. TCP connect to relay gateway (verifies guest→relay path)
 *   2. DNS resolve + TCP connect to example.com:80 (verifies DNS + relay NAT)
 *   3. HTTP GET and response read (verifies end-to-end data flow)
 */

/* RootlessRelay defaults — override with your relay's gateway address */
#define RELAY_GATEWAY_ADDR "10.0.2.2"
#define RELAY_GATEWAY_PORT 53

/* Use DNS resolution so we always reach the live CDN, not a stale IP */
#define EXTERNAL_HOST   "example.com"
#define EXTERNAL_PORT   80

/* Timeout for connect and recv operations (seconds) */
#define SOCKET_TIMEOUT_SEC 10

#define HTTP_REQUEST "GET / HTTP/1.0\r\nHost: " EXTERNAL_HOST "\r\n\r\n"
#define HTTP_RECV_BUF_SIZE 512

static void print_socket_error(const char *label)
{
	printk("%s failed: errno=%d\n", label, errno);
}

static int set_socket_timeouts(int fd, int timeout_sec)
{
	struct zsock_timeval tv = {
		.tv_sec = timeout_sec,
		.tv_usec = 0,
	};
	int ret;

	ret = zsock_setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
	if (ret < 0) {
		print_socket_error("setsockopt(SO_SNDTIMEO)");
		return -errno;
	}

	ret = zsock_setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
	if (ret < 0) {
		print_socket_error("setsockopt(SO_RCVTIMEO)");
		return -errno;
	}

	return 0;
}

static int resolve_external(struct sockaddr_in *out, char *ip_buf, size_t ip_buf_len)
{
	struct zsock_addrinfo hints = {
		.ai_family   = AF_INET,
		.ai_socktype = SOCK_STREAM,
	};
	struct zsock_addrinfo *res;
	int ret;

	printk("Resolving %s (timeout %ds) ...\n", EXTERNAL_HOST, SOCKET_TIMEOUT_SEC);

	ret = zsock_getaddrinfo(EXTERNAL_HOST, NULL, &hints, &res);
	if (ret != 0) {
		printk("DNS failed: zsock_getaddrinfo returned %d (errno=%d)\n",
		       ret, errno);
		return -ENOENT;
	}

	memcpy(out, res->ai_addr, sizeof(*out));
	zsock_freeaddrinfo(res);

	net_addr_ntop(AF_INET, &out->sin_addr, ip_buf, ip_buf_len);
	printk("Resolved %s -> %s\n", EXTERNAL_HOST, ip_buf);
	return 0;
}

static int probe_tcp_endpoint(const char *name, struct sockaddr_in *remote)
{
	char ip_str[NET_IPV4_ADDR_LEN];
	int fd;

	net_addr_ntop(AF_INET, &remote->sin_addr, ip_str, sizeof(ip_str));

	fd = zsock_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	if (fd < 0) {
		print_socket_error("socket");
		return -errno;
	}

	if (set_socket_timeouts(fd, SOCKET_TIMEOUT_SEC) < 0) {
		zsock_close(fd);
		return -errno;
	}

	printk("Probing %s at %s:%u (timeout %ds) ...\n",
	       name, ip_str, ntohs(remote->sin_port), SOCKET_TIMEOUT_SEC);

	if (zsock_connect(fd, (struct sockaddr *)remote, sizeof(*remote)) < 0) {
		print_socket_error("connect");
		zsock_close(fd);
		return -errno;
	}

	printk("Probe OK: %s reachable\n", name);
	zsock_close(fd);
	return 0;
}

static int http_get_test(struct sockaddr_in *remote, const char *ip_str)
{
	int fd, ret;
	char buf[HTTP_RECV_BUF_SIZE];
	ssize_t total = 0;

	fd = zsock_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	if (fd < 0) {
		print_socket_error("socket");
		return -errno;
	}

	if (set_socket_timeouts(fd, SOCKET_TIMEOUT_SEC) < 0) {
		zsock_close(fd);
		return -errno;
	}

	printk("HTTP GET %s:%u (timeout %ds) ...\n",
	       ip_str, ntohs(remote->sin_port), SOCKET_TIMEOUT_SEC);

	if (zsock_connect(fd, (struct sockaddr *)remote, sizeof(*remote)) < 0) {
		print_socket_error("connect");
		zsock_close(fd);
		return -errno;
	}

	ret = zsock_send(fd, HTTP_REQUEST, strlen(HTTP_REQUEST), 0);
	if (ret < 0) {
		print_socket_error("send");
		zsock_close(fd);
		return -errno;
	}

	printk("Sent %d bytes, reading response ...\n", ret);

	while (total < (ssize_t)sizeof(buf) - 1) {
		ret = zsock_recv(fd, buf + total, sizeof(buf) - 1 - total, 0);
		if (ret <= 0) {
			break;
		}
		total += ret;
	}

	zsock_close(fd);

	if (total <= 0) {
		printk("HTTP GET failed: no response data (recv returned %d, errno=%d)\n",
		       ret, errno);
		return -EIO;
	}

	buf[total] = '\0';

	/* Check for HTTP status line */
	if (strncmp(buf, "HTTP/", 5) == 0) {
		/* Print just the status line */
		char *eol = strchr(buf, '\r');
		if (!eol) {
			eol = strchr(buf, '\n');
		}
		if (eol) {
			*eol = '\0';
		}
		printk("HTTP response: %s (%zd bytes total)\n", buf, total);
	} else {
		printk("HTTP response: %zd bytes (unexpected format)\n", total);
	}

	printk("HTTP GET test PASSED\n");
	return 0;
}

static int run_network_test(void)
{
	int ret;
	struct sockaddr_in gateway_addr;
	struct sockaddr_in external_addr;
	char resolved_ip[NET_IPV4_ADDR_LEN];

	/* Build gateway sockaddr */
	memset(&gateway_addr, 0, sizeof(gateway_addr));
	gateway_addr.sin_family = AF_INET;
	gateway_addr.sin_port = htons(RELAY_GATEWAY_PORT);
	net_addr_pton(AF_INET, RELAY_GATEWAY_ADDR, &gateway_addr.sin_addr);

	/* Stage 1: relay gateway reachability */
	ret = probe_tcp_endpoint("relay gateway", &gateway_addr);
	if (ret < 0) {
		printk("STAGE 1 FAILED: relay gateway unreachable.\n");
		printk("  Check: is the network relay running?\n");
		printk("  Check: did udhcpc obtain a lease?\n");
		return ret;
	}

	/* Resolve the external hostname via DNS (exercises the relay's DNS proxy) */
	ret = resolve_external(&external_addr, resolved_ip, sizeof(resolved_ip));
	if (ret < 0) {
		printk("DNS FAILED: cannot resolve %s\n", EXTERNAL_HOST);
		printk("  Check: is relay DNS forwarding working?\n");
		return ret;
	}
	external_addr.sin_port = htons(EXTERNAL_PORT);

	/* Stage 2: external TCP connect */
	ret = probe_tcp_endpoint("external endpoint", &external_addr);
	if (ret < 0) {
		printk("STAGE 2 FAILED: relay reachable but external egress failed.\n");
		printk("  Check: does the relay support outbound NAT?\n");
		return ret;
	}

	/* Stage 3: end-to-end HTTP data flow */
	ret = http_get_test(&external_addr, resolved_ip);
	if (ret < 0) {
		printk("STAGE 3 FAILED: TCP connected but HTTP data transfer failed.\n");
		return ret;
	}

	printk("All network tests PASSED.\n");
	return 0;
}

int main(void)
{
	printk("Zephyr native_sim network test\n");
	printk("Build marker: net-test-v5\n");
	printk("Relay gateway: %s:%d\n", RELAY_GATEWAY_ADDR, RELAY_GATEWAY_PORT);
	printk("External target: %s:%d (DNS resolved at runtime)\n",
	       EXTERNAL_HOST, EXTERNAL_PORT);
	printk("Socket timeout: %ds\n\n", SOCKET_TIMEOUT_SEC);

	return run_network_test();
}
