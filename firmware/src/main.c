/*
 * Zephyr QEMU x86 Application with Interactive Shell
 *
 * This minimal application demonstrates:
 * - Shell subsystem running on serial port (UART 0)
 * - Custom shell command (version)
 * - Interactive terminal over multiboot-loaded ELF in v86
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/device.h>
#include <zephyr/version.h>

/* Custom shell command: version */
static int cmd_version(const struct shell *sh, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	shell_print(sh, "Zephyr v86 Simulator - Version 1.0");
	shell_print(sh, "RTOS: Zephyr %s", KERNEL_VERSION_STRING);
	shell_print(sh, "Board: qemu_x86");
	shell_print(sh, "Compiled: " __DATE__ " " __TIME__);

	return 0;
}

/* Register the custom command */
SHELL_CMD_REGISTER(version, NULL,
	"Display version information",
	cmd_version);

/* Main entry point */
int main(void)
{
	/* Shell subsystem runs as a background thread; main() returns immediately.
	 * Shell commands are processed on the serial port (UART 0) connected to v86.
	 */

	printk("Zephyr QEMU x86 Application Initialized\n");
	printk("Type 'help' for available commands, 'version' for app info\n");

	return 0;
}
