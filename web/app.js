/**
 * Zephyr v86 Web Simulator
 *
 * Integrates:
 * - v86 (x86 WebAssembly emulator) to boot multiboot Zephyr ELF
 * - xterm.js terminal for serial I/O
 * - Serial bridge: v86 UART0 ↔ xterm.js terminal
 */

// Global references
let emulator = null;
let term = null;
let fitAddon = null;

/**
 * Initialize v86 emulator with Zephyr ELF via multiboot
 */
async function initializeV86() {
	console.log("Initializing v86 emulator...");

	try {
		// Create V86 instance with multiboot ELF loading
		emulator = new V86({
			multiboot: {
				url: "./zephyr.elf"
			},
			memory_size: 64 * 1024 * 1024, // 64 MB
			autostart: true,
			log_level: 0 // Set to 0 for minimal logs; increase for debug (0=no logs, 2=verbose)
		});

		console.log("✓ v86 emulator created");

		// Wait for emulator to be ready
		emulator.wait_for_init();
		console.log("✓ v86 emulator initialized and running");

	} catch (error) {
		console.error("✗ Failed to initialize v86:", error);
		term.write("\r\n✗ Emulator initialization failed: " + error.message + "\r\n");
	}
}

/**
 * Initialize xterm.js terminal
 */
function initializeTerminal() {
	console.log("Initializing xterm.js terminal...");

	// Create terminal instance
	term = new Terminal({
		cols: 80,
		rows: 24,
		fontFamily: "'Courier New', monospace",
		fontSize: 14,
		cursorBlink: true,
		cursorStyle: "block",
		theme: {
			background: "#1e1e1e",
			foreground: "#d4d4d4",
			cursor: "#aeafad",
			selectionBackground: "#264f78"
		}
	});

	// Load FitAddon for responsive sizing
	fitAddon = new FitAddon.FitAddon();
	term.loadAddon(fitAddon);

	// Open terminal in container
	term.open(document.getElementById("terminal"));

	// Fit terminal to container
	fitAddon.fit();
	console.log("✓ xterm.js terminal initialized");

	// Resize terminal on window resize
	window.addEventListener("resize", () => {
		try {
			fitAddon.fit();
		} catch (e) {
			console.warn("Terminal resize failed:", e);
		}
	});

	// Display welcome message
	term.write("\r\nZephyr QEMU x86 Simulator via v86 + xterm.js\r\n");
	term.write("Booting Zephyr OS...\r\n\r\n");
}

/**
 * Serial I/O Bridge: v86 UART 0 → xterm.js
 *
 * Accumulates bytes from v86's serial output and batches them for efficient
 * terminal rendering. This avoids the performance issue of firing
 * terminal.write() for every single byte.
 */
function setupSerialInputLoop() {
	console.log("Setting up v86 → xterm.js serial bridge...");

	let outputBuffer = [];
	const BUFFER_FLUSH_SIZE = 100; // Flush after 100 bytes
	const BUFFER_FLUSH_MS = 10; // Or after 10ms

	let flushTimer = null;

	function flushBuffer() {
		if (outputBuffer.length > 0) {
			const data = new Uint8Array(outputBuffer);
			term.write(data);
			outputBuffer = [];
		}
		if (flushTimer !== null) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
	}

	// Listen for serial output from v86
	emulator.add_listener("serial0-output-byte", (byte) => {
		outputBuffer.push(byte);

		// Flush if buffer reaches threshold
		if (outputBuffer.length >= BUFFER_FLUSH_SIZE) {
			flushBuffer();
		} else if (flushTimer === null) {
			// Set timer to flush if no more bytes arrive within timeout
			flushTimer = setTimeout(flushBuffer, BUFFER_FLUSH_MS);
		}
	});

	console.log("✓ v86 serial output listener registered");
}

/**
 * Serial I/O Bridge: xterm.js → v86 UART 0
 *
 * Captures keyboard input from xterm.js and sends it to v86's serial port 0.
 * Handles UTF-8 encoding and special characters.
 */
function setupSerialOutputLoop() {
	console.log("Setting up xterm.js → v86 serial bridge...");

	// UTF-8 encoder for terminal input
	const encoder = new TextEncoder();

	// Listen for terminal input (keyboard)
	term.onData((data) => {
		try {
			// Convert string input to UTF-8 bytes
			const bytes = encoder.encode(data);

			// Send bytes to v86 serial port 0
			emulator.serial_send_bytes(0, bytes);

		} catch (error) {
			console.error("Error sending to serial:", error);
		}
	});

	console.log("✓ xterm.js input listener registered");
}

/**
 * Main initialization sequence
 */
async function main() {
	try {
		console.log("=== Zephyr v86 Simulator Startup ===\n");

		// Step 1: Initialize terminal first (for error messages)
		initializeTerminal();

		// Step 2: Initialize v86 emulator
		await initializeV86();

		// Step 3: Setup serial bridges
		setupSerialInputLoop();
		setupSerialOutputLoop();

		console.log("\n=== Simulator Ready ===");
		console.log("v86 is emulating Zephyr QEMU x86 application");
		console.log("Serial console is connected to the terminal above");

	} catch (error) {
		console.error("Fatal initialization error:", error);
		term.write("\r\n✗ Initialization failed: " + error.message + "\r\n");
	}
}

// Start initialization when DOM is ready
document.addEventListener("DOMContentLoaded", main);
