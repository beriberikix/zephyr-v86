#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/version.h>
#include <zephyr/sys/printk.h>
#include <string.h>

static void print_prompt(void)
{
	printk("uart:~$ ");
}

static void handle_command(const char *cmd)
{
	if(strcmp(cmd, "help") == 0)
	{
		printk("Available commands:\n");
		printk("  help     - show this help\n");
		printk("  version  - show version info\n");
		printk("  exec     - execute 9p binary (e.g., exec zephyr.exe /proc/sysinfo)\n");
	}
	else if(strcmp(cmd, "version") == 0)
	{
		printk("Zephyr v86 Simulator - Version 1.0\n");
		printk("RTOS: Zephyr %s\n", KERNEL_VERSION_STRING);
		printk("Board: native_sim\n");
		printk("Compiled: " __DATE__ " " __TIME__ "\n");
	}
	else if(strncmp(cmd, "exec ", 5) == 0)
	{
		const char *binary = cmd + 5;
		printk("Would execute: %s\n", binary);
		printk("(9p execution not yet implemented)\n");
	}
	else if(cmd[0] != '\0')
	{
		printk("Unknown command: %s\n", cmd);
	}
}

int main(void)
{
	const struct device *uart0 = DEVICE_DT_GET(DT_NODELABEL(uart0));
	char line[96];
	size_t pos = 0;
	unsigned char c0;

	if (!device_is_ready(uart0)) {
		printk("uart0 not ready\n");
		return 0;
	}

	printk("Zephyr QEMU x86 Application Initialized\n");
	printk("Input mode: uart_poll_in(uart0)\n");
	printk("Type 'help' for available commands, 'version' for app info\n");
	print_prompt();

	while (1)
	{
		if (uart_poll_in(uart0, &c0) == 0)
		{
			if (c0 == '\r' || c0 == '\n')
			{
				line[pos] = '\0';
				printk("\n");
				handle_command(line);
				pos = 0;
				print_prompt();
			}
			else if ((c0 == '\b' || c0 == 0x7f) && pos > 0)
			{
				pos--;
				printk("\b \b");
			}
			else if (c0 >= 32 && c0 < 127)
			{
				if (pos < sizeof(line) - 1)
				{
					line[pos++] = (char)c0;
					printk("%c", c0);
				}
			}
		}
		else
		{
			k_msleep(2);
		}
	}

	return 0;
}
