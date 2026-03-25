# Architecture: Buildroot + v86 + Zephyr native_sim

This document describes the current implementation in the `buildroot-native-sim` flow.

## Runtime Overview

The browser does **not** boot Zephyr directly as an ELF kernel.
Instead, it boots a Linux guest (Buildroot) inside v86, then injects and runs a Zephyr `native_sim` executable (`zephyr.exe`) inside that guest.

## Active Entry Points

- `web/index.html`
  - Loads CSS: `v86.css`, `lib/xterm.css`
  - Loads scripts: `lib/libv86.js`, `lib/xterm.js`, `main.js`
- `web/main.js`
  - Creates the v86 VM config
  - Applies network relay config (`net_device.relay_url`) from the Controls tab
  - Initializes xterm serial console
  - Enables 9p file upload/download panel
  - Auto-injects `/zephyr.exe` into the guest filesystem
- `firmware/prj.conf`
  - Configures Zephyr `native_sim` runtime behavior
  - Uses stdin/stdout UART routing via:
    - `CONFIG_UART_NATIVE_PTY_0_ON_STDINOUT=y`

## VM Boot Chain

1. Browser loads `web/index.html`
2. `web/main.js` creates `new V86(create_buildroot_settings(relay_url))`
3. v86 loads:
   - kernel: `web/v86-bzimage.bin`
   - initrd: `web/v86-rootfs.cpio.xz`
   - firmware: `web/lib/seabios.bin`, `web/lib/vgabios.bin`
4. v86 emits `emulator-ready`
5. `set_serial_container_xtermjs(...)` connects guest serial to xterm
6. Filesystem panel is enabled and `/zephyr.exe` is injected automatically

## Networking Path

v86 supports multiple network backends. The backend is selected by the relay URL
configured in the Controls tab of the web UI.

### Network Backends

| Backend | Relay URL | Needs Server | Protocols | Use Case |
|---------|-----------|:---:|-----------|----------|
| **fetch** | `fetch` | No | HTTP only | Development / offline testing |
| **wsproxy** | `ws://…` or `wss://…` | Yes | TCP, UDP, ICMP | Full networking via relay server |

The **fetch** backend is the default — it works without any external server by
using the browser's `fetch()` API to handle outbound HTTP from the guest.  For
full TCP/UDP networking (CoAP, MQTT, arbitrary sockets), use a **wsproxy** relay.

### Recommended Relay: RootlessRelay

[RootlessRelay](https://github.com/obegron/rootlessRelay) is a pure Node.js
wsproxy-compatible relay that requires no root, TUN/TAP, or dnsmasq:

```bash
# Start a local relay (WS mode on port 8086):
./tools/run-relay.sh

# Then set the relay URL in the web UI to: ws://localhost:8086/
```

RootlessRelay provides:
- Built-in DHCP server (assigns IPs in the `10.0.2.x` range, gateway `10.0.2.2`)
- DNS forwarding (default: `8.8.8.8`)
- TCP and UDP NAT to the Internet
- VM-to-VM routing
- Admin UI on port 8001
- WSS support (with `--wss` flag)

### Data Path (wsproxy)

When a wsproxy relay URL is configured:

- `net_device.type = ne2k`
- `net_device.relay_url = <ws:// or wss:// URL>`

1. Zephyr app socket traffic in `zephyr.exe`
2. native_sim offloaded sockets → Linux POSIX `connect()`/`send()`/`recv()`
3. Buildroot Linux guest networking stack
4. v86 emulated NIC (`ne2k`)
5. v86 wsproxy backend over WebSocket
6. Relay server → Internet

### Data Path (fetch)

When the relay URL is `fetch`:

- `net_device.type = virtio`
- `net_device.relay_url = "fetch"`

1. Zephyr app socket traffic in `zephyr.exe`
2. native_sim offloaded sockets → Linux POSIX calls
3. Buildroot guest networking stack
4. v86 virtual NIC
5. v86 fetch backend → browser `fetch()` API → HTTP servers

### NAT Constraint

Both backends are **outbound-only NAT**: the guest can make outbound connections
to the Internet but there is no mechanism for external clients to reach services
listening inside the guest.  Zephyr firmware should act as a **client**
(connecting outward) rather than a server when testing network connectivity.

### Troubleshooting Networking

From the Buildroot guest shell, before running `zephyr.exe`:

```bash
# 1. Obtain an IP address
udhcpc

# 2. Check routing table (should show a default gateway)
route -n

# 3. Test connectivity from Linux level
wget -O /dev/null http://example.com

# 4. If wget works, run the Zephyr test
./zephyr.exe
```

If step 3 fails but step 1 succeeded, the relay server is not forwarding
traffic.  If step 1 fails, the relay URL may be wrong or the relay is down.

## Zephyr Binary Path

- Zephyr app source lives under `firmware/`
- Built output used for injection is `web/zephyr.exe`
- Inside guest, it appears as `/zephyr.exe`
- Typical manual invocation in guest terminal:
  - `exec zephyr.exe`

Current app behavior:

- Stage 1: probes relay reachability with TCP connect to `10.0.2.2:53` (gateway DNS port)
- Stage 2: probes external egress with TCP connect to `93.184.216.34:80` (example.com)
- Stage 3: sends HTTP GET to example.com and verifies response data
- All stages have a 10-second socket timeout to prevent hangs
- Prints which stage failed so relay-vs-egress issues are distinguishable
- Exits with 0 on success, non-zero on any socket error

## 9p Filesystem Integration

`web/main.js` wires two-way 9p operations:

- Host -> guest:
  - File picker uploads files via `emulator.create_file()`
- Guest -> host:
  - Path input fetches files via `emulator.read_file()` and downloads them

Runtime stats tracked in UI:

- bytes read/written
- last accessed path
- status transitions (Loading, Uploaded, Idle)

## Control Surface

UI controls in `web/index.html` and handlers in `web/main.js`:

- Run/Pause (`emulator.run()`, `emulator.stop()`)
- Reset (`emulator.restart()`)
- Exit (`emulator.destroy()` + page reload)
- Save/Load state (`save_state`, `restore_state`)

## What Is Legacy

The old direct-ELF web flow (`web/app.js`, `web/style.css`, `web/zephyr.elf`) is not part of the current runtime path.

## Notes for Developers

- If UART PTY creation fails in `native_sim`, keep stdin/stdout mode enabled in `firmware/prj.conf`.
- Keep `web/index.html` and `web/main.js` in sync; those are the canonical web entrypoints.
- Keep boot artifacts (`v86-bzimage.bin`, `v86-rootfs.cpio.xz`, `zephyr.exe`) available under `web/`.
- Network backend defaults to `fetch` (HTTP-only, no server needed).
- For full TCP/UDP networking, start a local relay with `./tools/run-relay.sh`
  and set the relay URL to `ws://localhost:8086/` in the web UI.
- The Zephyr test app (`firmware/src/main.c`) uses `10.0.2.2` as the relay
  gateway address — this matches RootlessRelay defaults.
