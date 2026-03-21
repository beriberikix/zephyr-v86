# Zephyr RTOS + v86 + xterm.js Simulator

A monorepo that combines a custom Zephyr RTOS application with a web-based x86 emulator simulator. Run a Zephyr shell directly in your browser via v86 (WebAssembly x86 emulator) and interact with it using xterm.js terminal.

## Architecture & Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **RTOS** | Zephyr v4.3.0 | Real-time OS, compiled for `qemu_x86` with Multiboot |
| **Emulator** | v86 | x86 WebAssembly emulator, loads Multiboot ELF kernels |
| **Terminal UI** | xterm.js | Web-based terminal for interactive shell access |
| **Backend** | Python `http.server` | Development web server with CORS/COEP headers |

## Project Structure

```
zephyr-v86/
├── .gitignore                      # Exclude build artifacts and node_modules
├── README.md                       # This file
│
├── firmware/                       # Zephyr RTOS application (out-of-tree)
│   ├── CMakeLists.txt              # Zephyr app build configuration
│   ├── prj.conf                    # Kconfig options (console, shell, multiboot)
│   ├── west.yml                    # Manifest to pull Zephyr OS (v4.3.0)
│   ├── src/
│   │   └── main.c                  # Minimal Zephyr app with shell + custom command
│   └── .west/                      # (gitignore'd) West workspace
│        ├── config
│        └── zephyr/                # Zephyr OS cloned here
│
└── web/                            # Web frontend (vanilla HTML/JS)
    ├── index.html                  # Ultra-minimal page
    ├── app.js                      # v86 init + xterm.js + serial bridge
    ├── style.css                   # Terminal styling
    ├── serve.py                    # Dev server with COOP/COEP headers
    ├── lib/                        # (gitignore'd) v86 & xterm.js libraries
    └── zephyr.elf                  # (gitignore'd) Compiled firmware, copied here
```

## Quick Start (5 minutes)

### Prerequisites

- **Linux/macOS** (Windows: Use WSL2)
- **Python 3.9+** (`python3` in PATH)
- **Git** (for cloning Zephyr dependencies)
- **C/C++ build tools:**
  - GCC & cmake
  - On Ubuntu: `sudo apt install build-essential cmake git`
  - On macOS: `xcode-select --install`

### Step 1: Initialize Zephyr Workspace

```bash
cd firmware/

# Initialize west workspace at current location
west init -l .

# Download Zephyr OS and dependencies (takes ~5-10 minutes on first run)
west update
```

**What this does:**
- Creates `.west/` directory with Zephyr OS repo
- Downloads Zephyr v4.3.0 and its dependencies
- Sets up environment for out-of-tree builds

### Step 2: Compile Zephyr for qemu_x86

```bash
cd firmware/

# Build Zephyr for qemu_x86 board
west build -b qemu_x86 --pristine=auto

# Expected output:
# - If successful: "zephyr" binary generated
# - Look for: firmware/build/zephyr/zephyr.elf (the Multiboot kernel)
```

**Build time:** ~2-5 minutes on first build, <1 min for rebuilds (incremental).

**Troubleshooting:**
- `ZEPHYR_BASE not set`: Run `west init -l .` first
- `Board not found`: Ensure Zephyr v4.3.0 is downloaded (`west update`)
- `Build failed`: Check `prj.conf` syntax

### Step 3: Copy Compiled ELF to Web Directory

```bash
cp firmware/build/zephyr/zephyr.elf web/
```

This places the Multiboot kernel where the web frontend can load it.

### Step 4: Serve Web Frontend

```bash
cd web/

# Option A: Use the custom Python dev server (sets COOP/COEP headers automatically)
python3 serve.py --port 8000 --bind 127.0.0.1

# Option B: Use Python's built-in http.server with manual headers
# python3 -m http.server 8000 \
#   --bind 127.0.0.1 \
#   --header Cross-Origin-Opener-Policy=same-origin \
#   --header Cross-Origin-Embedder-Policy=require-corp

# Output should show:
# Starting Zephyr v86 development server...
# Serving from: /path/to/web
# Listening on: http://127.0.0.1:8000
```

### Step 5: Open in Browser

Navigate to:

```
http://127.0.0.1:8000/
```

**Expected behavior:**
1. Page loads, terminal appears (dark background, light text)
2. v86 initializes and boots Zephyr ELF
3. Zephyr kernel messages appear in terminal
4. Shell prompt appears (something like `uart:~$`)
5. You can type commands: `help`, `version`, `echo hello`, etc.

**Example session:**
```
Zephyr QEMU x86 Simulator via v86 + xterm.js
Booting Zephyr OS...

*** Booting Zephyr OS build ... ***
Zephyr QEMU x86 Application Initialized
Type 'help' for available commands, 'version' for app info
uart:~$ help
help - Display help.
  AVAILABLE COMMANDS:
  ...
  version          - Display version information

uart:~$ version
Zephyr v86 Simulator - Version 1.0
RTOS: Zephyr 4.3.0
Board: qemu_x86
Compiled: Mar 20 2026 14:35:22
uart:~$ echo Hello from Zephyr!
Hello from Zephyr!
uart:~$
```

## Detailed Setup Instructions

### Zephyr Workspace Initialization

**One-time setup:**

```bash
cd firmware/

# Initialize west at current directory (not as a subdirectory)
west init -l .

# This creates .west/ with config pointing to current location

# Update all projects (downloads Zephyr OS, dependencies)
west update

# Typically takes 5-10 minutes depending on network/disk speed
```

After this, the directory structure will be:
```
firmware/
├── .west/
│   ├── config                      (points to repo dir)
│   ├── zephyr/                     (Zephyr v4.3.0 source)
│   └── ...
├── src/main.c
├── CMakeLists.txt
├── prj.conf
└── west.yml
```

### Building the Zephyr Application

**Standard build:**

```bash
cd firmware/
west build -b qemu_x86 --pristine=auto
```

**Flags explained:**
- `-b qemu_x86`: Target board (x86 QEMU target with Multiboot support)
- `--pristine=auto`: Clean build on first run, incremental on subsequent runs

**Build artifacts generated:**
- `firmware/build/zephyr/zephyr.elf` — The Multiboot kernel (copy this to `web/`)
- `firmware/build/zephyr/kernel.elf` — Unstripped ELF with debugging symbols
- `firmware/build/zephyr/zephyr.bin` — Raw binary
- `firmware/build/CMakeFiles/` — CMake caches

**Troubleshooting builds:**

| Error | Solution |
|-------|----------|
| `west: command not found` | Install Zephyr SDK: `pip install west` |
| `ZEPHYR_BASE not set` | Ensure `west init -l .` completed successfully |
| `qemu_x86 board not found` | Run `west update` to download Zephyr boards |
| `toolchain not found` | Install gcc-arm-none-eabi or use Docker |
| `cmake errors` | Delete `firmware/build/` and try again (`west build -b qemu_x86 --pristine=always`) |

### Configuration Details (prj.conf)

The `firmware/prj.conf` file controls Zephyr's build options:

```kconfig
# UART 0 (serial port for console output)
CONFIG_UART_0=y
CONFIG_UART_CONSOLE=y

# Console handler (routes printk to UART)
CONFIG_CONSOLE=y
CONFIG_CONSOLE_HANDLER=y

# Standard I/O streams
CONFIG_STDIN=y
CONFIG_STDOUT=y
CONFIG_STDERR=y

# Shell subsystem on serial backend
CONFIG_SHELL=y
CONFIG_SHELL_BACKEND_SERIAL=y
CONFIG_SYSTEM_SHELL=y

# Multiboot support for x86
CONFIG_MULTIBOOT=y

# Output binary name
CONFIG_KERNEL_BIN_NAME=zephyr.elf
```

**To add more shell commands**, edit `firmware/src/main.c` and use `SHELL_CMD_REGISTER()` macro. Zephyr provides many built-in shell commands; see [Zephyr shell samples](https://github.com/zephyrproject-rtos/zephyr/tree/main/samples/shell).

### Web Frontend Setup

#### Required Files

| File | Purpose |
|------|---------|
| `web/index.html` | Minimal page structure; loads scripts |
| `web/app.js` | v86 emulator init + xterm.js integration + serial bridge |
| `web/style.css` | Terminal styling |
| `web/serve.py` | Development HTTP server with COOP/COEP headers |
| `web/lib/libv86.js` | v86 JavaScript library (must be downloaded) |
| `web/lib/libv86.wasm` | v86 WebAssembly module (optional, improves performance) |
| `web/zephyr.elf` | Compiled Zephyr kernel (copied from firmware/build/) |

#### Downloading v86 Library

**Option 1: Use v86 from GitHub releases (recommended)**

```bash
cd web/lib/

# Download the latest v86 build
wget -O libv86.js https://github.com/copy/v86/releases/download/latest/libv86.js
wget -O libv86.wasm https://github.com/copy/v86/releases/download/latest/libv86.wasm

# Or use curl:
# curl -Lo libv86.js https://github.com/copy/v86/releases/download/latest/libv86.js
# curl -Lo libv86.wasm https://github.com/copy/v86/releases/download/latest/libv86.wasm
```

**Option 2: Build v86 from source**

```bash
git clone https://github.com/copy/v86.git
cd v86/
make
# Copy build/libv86.js and build/libv86.wasm to zephyr-v86/web/lib/
```

**Option 3: Use CDN (not recommended for offline use)**

The `index.html` already includes xterm.js from CDN. You could similarly load v86 from a CDN, but local files are more reliable.

#### Serving the Web App

**Using the custom Python server (easiest, includes proper headers):**

```bash
cd web/
python3 serve.py
# Opens at http://127.0.0.1:8000/
```

**Using Python's built-in http.server (manual headers):**

```bash
cd web/
python3 -m http.server 8000 \
  --bind 127.0.0.1 \
  --header Cross-Origin-Opener-Policy=same-origin \
  --header Cross-Origin-Embedder-Policy=require-corp
```

**Why these headers?**
- `Cross-Origin-Opener-Policy: same-origin` — Enables SharedArrayBuffer support (used by v86 for performance)
- `Cross-Origin-Embedder-Policy: require-corp` — Required with COOP; isolates cross-origin resources
- Without these, browsers may refuse to run WebAssembly or block SharedArrayBuffer

**Using Node.js (if installed):**

```bash
npm install -g http-server
cd web/
http-server -c-1 \
  --header="Cross-Origin-Opener-Policy: same-origin" \
  --header="Cross-Origin-Embedder-Policy: require-corp"
```

#### Serial I/O Bridge (app.js)

The serial bridge in `app.js` performs:

1. **v86 → xterm.js (output):**
   - Listens to v86's `serial0-output-byte` events
   - Accumulates bytes in a buffer (batched writes improve performance)
   - Writes batches to xterm.js terminal

2. **xterm.js → v86 (input):**
   - Listens to xterm.js `onData` events (keyboard input)
   - Encodes UTF-8 strings to bytes
   - Sends bytes to v86 UART 0 via `serial_send_bytes(0, data)`

**Key functions:**
- `initializeV86()` — Creates V86 instance, loads multiboot ELF
- `initializeTerminal()` — Initializes xterm.js Terminal and FitAddon
- `setupSerialInputLoop()` — Registers v86 serial output listener
- `setupSerialOutputLoop()` — Registers xterm.js keyboard listener

### Development Workflow

**Iterate on firmware:**

```bash
# Edit firmware/src/main.c or prj.conf
nano firmware/src/main.c

# Rebuild
cd firmware/
west build -b qemu_x86

# Copy new ELF to web/
cp build/zephyr/zephyr.elf ../web/

# Reload web app in browser (Ctrl+R)
```

**Iterate on web frontend:**

```bash
# Edit web/app.js, index.html, or style.css
nano web/app.js

# Reload browser (Ctrl+R)
# No server restart needed for JS/HTML changes
```

### Troubleshooting

#### Build Issues

**Problem:** `west init -l . ` fails
- **Solution:** Ensure you're in the `firmware/` directory and `west` is installed (`pip install west`)

**Problem:** `Board qemu_x86 not found`
- **Solution:** Run `west update` to download Zephyr boards; ensure `.west/zephyr/boards/` exists

**Problem:** `CMake not found`
- **Solution:** Install cmake: `sudo apt install cmake` (Ubuntu) or `brew install cmake` (macOS)

#### Web Issues

**Problem:** v86 doesn't start, browser console shows errors
- **Solution:**
  1. Check that `web/zephyr.elf` exists and is not empty
  2. Ensure `web/lib/libv86.js` exists (symlink or download it)
  3. Check browser console (F12) for specific errors
  4. Verify COOP/COEP headers are being sent: open DevTools → Network tab → filter `index.html` → check Response Headers

**Problem:** Terminal appears but no boot messages
- **Solution:**
  1. Check that v86 is running (emulator object exists in browser console: `console.log(emulator)`)
  2. Wait 2-3 seconds for emulator to boot
  3. Try clicking in terminal and pressing Enter
  4. Check browser console for errors in serial bridge

**Problem:** Keyboard input doesn't work
- **Solution:**
  1. Click in terminal to focus it
  2. Check browser console for errors from `setupSerialOutputLoop()`
  3. Verify xterm.js loaded correctly (search "xterm" in DevTools → Sources)
  4. Try typing slowly (v86 may need time to accept input)

**Problem:** COOP/COEP headers missing
- **Solution:**
  - Verify you're using `serve.py` or Python `http.server` with `--header` flags
  - If using a different server, manually add headers:
    - `Cross-Origin-Opener-Policy: same-origin`
    - `Cross-Origin-Embedder-Policy: require-corp`

#### General Debugging

**Enable v86 verbose logging:**

In `web/app.js`, change:
```javascript
emulator = new V86({
    // ...
    log_level: 2  // Change from 0 to 2
});
```

**Check serial communication:**

In browser console:
```javascript
// Test sending a command
emulator.serial_send_bytes(0, new TextEncoder().encode("help\n"));
```

## Advanced Topics

### Customizing the Zephyr Shell

Add custom shell commands in `firmware/src/main.c`:

```c
static int cmd_hello(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "Hello, %s!", argc > 1 ? argv[1] : "World");
    return 0;
}

SHELL_CMD_REGISTER(hello, NULL, "Greet someone", cmd_hello);
```

Rebuild and redeploy:
```bash
cd firmware/
west build -b qemu_x86
cp build/zephyr/zephyr.elf ../web/
# Reload browser
```

### Enabling More Zephyr Subsystems

Add to `firmware/prj.conf`:

```kconfig
CONFIG_UART_INTERRUPT_DRIVEN=y  # Use interrupts for serial
CONFIG_LOG=y                     # Logging framework
CONFIG_LOG_DEFAULT_LEVEL=3       # Log level
CONFIG_SHELL_HISTORY=y           # Command history
CONFIG_SHELL_TAB=y               # Tab completion
```

### Building for Different Architectures

To target ARM (e.g., for STM32):
```bash
cd firmware/
west build -b nucleo_l476rg  # Or any ARM board
```

Note: v86 only emulates x86, so the web simulator would need modification for ARM. For development, stick with `qemu_x86`.

### Using Docker (Optional)

If you don't want to install Zephyr toolchain locally:

```bash
docker run -it -v $(pwd):/workspace zephyrprojectrtos/ci-base:latest
cd /workspace/firmware
west init -l .
west update
west build -b qemu_x86
```

## Performance Considerations

- **First build:** ~5 minutes (downloads Zephyr, compiles)
- **Incremental builds:** <1 minute
- **Web simulator load:** 2-3 seconds (v86 initialization + boot)
- **Serial I/O:** Buffered in app.js for performance (batches of ~100 bytes)

**To speed up builds:**
- Use `-DDTC_QUIET_WARNINGS=n` to reduce warning verbosity
- Pre-compile dependencies with ccache: `export CC=ccache gcc`
- Use parallel builds: `west build -b qemu_x86 -- -j8`

## Project Maintenance

### Updating Zephyr

```bash
cd firmware/
west update  # Fetch latest versions from known remotes
```

To upgrade to a new Zephyr release, edit `firmware/west.yml`:
```yaml
revision: zephyr-v4.4.0  # Change version tag
```

Then run `west update`.

### Dependencies & Licenses

- **Zephyr RTOS:** Apache 2.0 License
- **v86:** BSD 2-Clause License
- **xterm.js:** MIT License

All included in repository under `LICENSE`.

## References

- [Zephyr Documentation](https://docs.zephyrproject.org/)
- [Zephyr Shell Sample](https://github.com/zephyrproject-rtos/zephyr/tree/main/samples/shell)
- [v86 GitHub Repository](https://github.com/copy/v86)
- [v86 Documentation & API](https://github.com/copy/v86/blob/main/v86.d.ts)
- [xterm.js Documentation](https://xtermjs.org/)
- [Multiboot Specification](https://www.gnu.org/software/grub/manual/multiboot/multiboot.html)

## Contributing

Suggestions and improvements are welcome! Common next steps:

- [ ] Add persistent terminal history
- [ ] Implement file upload/download via 9p filesystem
- [ ] Add debugging support (GDB integration)
- [ ] Support multiple serial ports / USB devices
- [ ] Build + auto-reload automation (GitHub Actions)
- [ ] Docker image for easy setup

## License

This project is licensed under the same licenses as its components:
- Zephyr application code: Apache 2.0 License
- Web frontend: MIT License (compatible with xterm.js)

See `LICENSE` file for details.

---

**Last Updated:** March 20, 2026
**Zephyr Version:** v4.3.0
**v86 Version:** Latest (from releases)
**xterm.js Version:** 5.3.0+ (via CDN)
