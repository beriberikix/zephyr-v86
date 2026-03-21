# Technical Architecture & Design Notes

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Browser                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    index.html                            │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │              xterm.js Terminal                   │    │   │
│  │  │         (xterm.Terminal instance)                │    │   │
│  │  │                                                  │    │   │
│  │  │  uart:~$ help                                   │    │   │
│  │  │  uart:~$ version                                │    │   │
│  │  │  Zephyr v86 Simulator - Version 1.0             │    │   │
│  │  │                                                  │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  │                      │ ↕                                   │   │
│  │  ┌───────────────────┴──────────────────┐                │   │
│  │  │    Serial I/O Bridge (app.js)        │                │   │
│  │  ├────────────────────────────────────────┤               │   │
│  │  │ xterm.onData() → encoder → serial0    │               │   │
│  │  │ serial0 → buffer → term.write()       │               │   │
│  │  └──────────────────────────────────────┘                │   │
│  │                      │ ↕                                   │   │
│  │  ┌───────────────────┴───────────────────┐               │   │
│  │  │     v86 WebAssembly Emulator          │               │   │
│  │  │   (JavaScript library + WASM)         │               │   │
│  │  │                                       │               │   │
│  │  │  ┌────────────────────────────────┐   │               │   │
│  │  │  │  UART 0 (serial port)          │   │               │   │
│  │  │  │                                │   │               │   │
│  │  │  │  serial0_send()                │   │               │   │
│  │  │  │  serial0-output-byte (event)   │   │               │   │
│  │  │  └────────────────────────────────┘   │               │   │
│  │  │          │ ↕                           │               │   │
│  │  │  ┌────────────────────────────────┐   │               │   │
│  │  │  │  CPU / Memory / Devices        │   │               │   │
│  │  │  │  (x86 emulated)                │   │               │   │
│  │  │  └────────────────────────────────┘   │               │   │
│  │  └───────────────────────────────────────┘               │   │
│  │                                                            │   │
│  │  ┌──────────────────────────────────┐                    │   │
│  │  │  Multiboot ELF: zephyr.elf       │                    │   │
│  │  │  (loaded from /web/zephyr.elf)   │                    │   │
│  │  └──────────────────────────────────┘                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [HTTP Server with COOP/COEP headers]                          │
└─────────────────────────────────────────────────────────────────┘
           ↕ HTTP GET/POST (localhost:8000)
           
┌─────────────────────────────────────────────────────────────────┐
│                   Local File System                             │
│                                                                 │
│  /web/                                                          │
│  ├── index.html              (serves page + assets)            │
│  ├── app.js                  (v86 + serial bridge init)        │
│  ├── style.css               (terminal styling)                │
│  ├── lib/                                                       │
│  │   ├── libv86.js           (v86 JavaScript library)          │
│  │   └── libv86.wasm         (v86 WebAssembly module)          │
│  └── zephyr.elf              (Multiboot kernel, copied)        │
│                                                                 │
│  /firmware/                                                     │
│  ├── .west/                                                     │
│  │   └── zephyr/             (Zephyr RTOS source)              │
│  ├── build/                                                     │
│  │   └── zephyr/zephyr.elf   (compiled Multiboot kernel)       │
│  ├── src/main.c              (Zephyr app: shell + commands)    │
│  ├── CMakeLists.txt          (build configuration)             │
│  ├── prj.conf                (Kconfig options)                 │
│  └── west.yml                (manifest for Zephyr deps)        │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Boot → Runtime

### 1. **Initialization Phase**

```
Browser loads index.html
         ↓
app.js runs on DOMContentLoaded
         ↓
initializeTerminal()
  └─→ new Terminal() + open in container
      └─→ Welcome message: "Booting Zephyr OS..."
         ↓
initializeV86()
  └─→ new V86({multiboot: "./zephyr.elf", ...})
      └─→ emulator.wait_for_init()
          └─→ v86 loads zephyr.elf
              └─→ Multiboot header parsed
                  └─→ x86 CPU begins execution at entry point
```

### 2. **Boot Phase**

```
v86 CPU executes Zephyr boot code
         ↓
Zephyr kernel initializes drivers
         ↓
UART 0 driver initialized
         ↓
Console handler / printk routes to UART 0
         ↓
Shell subsystem starts as background task
         ↓
Boot messages written to UART 0:
  "*** Booting Zephyr OS ..."
  "Zephyr QEMU x86 Application Initialized"
```

### 3. **Runtime Phase (Interactive)**

```
User types in xterm.js terminal
         ↓
term.onData(data) fires
         ↓
TextEncoder encodes UTF-8 → bytes
         ↓
emulator.serial_send_bytes(0, bytes) sends to UART 0
         ↓
Zephyr shell receives stdin
         ↓
Shell parses command and executes
         ↓
Output written to UART 0 / stdout
         ↓
v86 fires serial0-output-byte event for each byte
         ↓
setupSerialInputLoop() buffer accumulates bytes
         ↓
term.write(buffer) displays in xterm.js
         ↓
User sees response in terminal
```

## Serial I/O Buffering & Performance

### Problem
- v86 fires `serial0-output-byte` event **per single character**
- Calling `term.write()` for every byte would be slow (~100+ DOM updates/sec)

### Solution
- Buffer bytes in an array
- Flush on two conditions:
  1. **Buffer reaches ~100 bytes** (BUFFER_FLUSH_SIZE)
  2. **10ms timeout with no new bytes** (BUFFER_FLUSH_MS)
- Reduces DOM updates to ~10x/sec (acceptable)

### Code

```javascript
let outputBuffer = [];
const BUFFER_FLUSH_SIZE = 100;
const BUFFER_FLUSH_MS = 10;

emulator.add_listener("serial0-output-byte", (byte) => {
    outputBuffer.push(byte);
    
    if (outputBuffer.length >= BUFFER_FLUSH_SIZE) {
        flushBuffer();  // Immediate flush
    } else if (flushTimer === null) {
        flushTimer = setTimeout(() => {
            flushBuffer();  // Delayed flush
            flushTimer = null;
        }, BUFFER_FLUSH_MS);
    }
});
```

## Character Encoding & Special Keys

### UTF-8 Encoding
- xterm.js provides `onData(data)` where `data` is a **decoded UTF-8 string**
- Must encode back to bytes before sending to Zephyr:
  ```javascript
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);  // String → Uint8Array (UTF-8)
  emulator.serial_send_bytes(0, bytes);
  ```

### Special Characters
| Input | byte(s) | Zephyr Interpretation |
|-------|---------|----------------------|
| Backspace | `0x7F` (DEL) | Erase last character |
| Enter | `0x0D` (CR) | Execute command |
| Ctrl+C | `0x03` (ETX) | Interrupt (if enabled) |
| Tab | `0x09` | Completion or spacing |
| Arrow Up | `0x1B 0x5B 0x41` (ANSI ESC sequence) | History (if enabled) |

**Note:** Zephyr shell handles ANSI escape sequences correctly; no special handling needed in app.js.

## Multiboot Loading in v86

### Multiboot Header
- Zephyr compiled for `qemu_x86` includes Multiboot header in ELF
- Multiboot magic: `0x7B6B5B4B` (encoded in ELF header)
- v86 detects this and loads accordingly (no manual configuration needed)

### v86 Multiboot Constructor
```javascript
emulator = new V86({
    multiboot: {
        url: "./zephyr.elf"  // Relative path to ELF file
    },
    memory_size: 64 * 1024 * 1024,  // 64 MB for emulated system
    autostart: true                  // Auto-boot after init
});
```

### Multiboot Loading Steps
1. v86 fetches `zephyr.elf` via HTTP GET
2. Parses ELF header for Multiboot magic
3. Extracts entry point, memory requirements, modules
4. Sets up x86 page tables for protected mode
5. Jumps to Zephyr entry point
6. Zephyr kernel takes over (prints boot messages, initializes subsystems)

## HTTP Headers & Browser Security

### Why COOP/COEP?

| Header | Reason |
|--------|--------|
| `Cross-Origin-Opener-Policy: same-origin` | Enables SharedArrayBuffer; isolates window context |
| `Cross-Origin-Embedder-Policy: require-corp` | Requires `Cross-Origin-Resource-Policy` on cross-origin resources; prevents data leaks |

### Browser Enforcement
- Without these headers, modern browsers **block**:
  - SharedArrayBuffer (needed for v86 WASM performance)
  - Certain cross-origin resource loads
  
- v86 can run in pure JavaScript mode (no WASM), but performance degrades significantly
- Headers are **safe** for localhost development

### Testing Headers
```bash
# Check if headers are present
curl -i http://127.0.0.1:8000/index.html | grep -i "Cross-Origin"

# Expected output:
# Cross-Origin-Opener-Policy: same-origin
# Cross-Origin-Embedder-Policy: require-corp
```

## Configuration & Tuning

### Zephyr Shell Options (prj.conf)

```kconfig
CONFIG_SHELL=y                  # Enable shell subsystem
CONFIG_SHELL_BACKEND_SERIAL=y   # Use serial backend (UART)
CONFIG_SYSTEM_SHELL=y           # Auto-start shell

# Optional enhancements
CONFIG_SHELL_HISTORY=y          # Command history (arrow keys)
CONFIG_SHELL_TAB=y              # Tab completion
CONFIG_SHELL_ARGC_MAX=20        # Max command arguments
CONFIG_LOG=n                    # Disable logging (smaller binary)
```

### v86 Performance Tuning (app.js)

```javascript
const emulator = new V86({
    // ...
    log_level: 0,           // 0=no logs, 1=errors, 2=verbose
    wasm: true,             // Enable WASM if available
    wasm_path: "./lib/",    // Path to libv86.wasm
    memory_size: 64 * 1024 * 1024,  // Tune based on workload
    screen_dummy: true      // Disable rendering (serial-only)
});
```

### Terminal Responsiveness (style.css)

```javascript
const term = new Terminal({
    cols: 80,
    rows: 24,
    fontSize: 14,
    cursorBlink: true,
    scrollback: 1000,  // Terminal history buffer
    // Higher cols/rows = more DOM elements
});
```

## Debugging & Troubleshooting

### Browser DevTools

**Console Tab:**
```javascript
// Check emulator state
emulator  // V86 instance
emulator.get_registers()  // CPU registers
emulator.get_memory_stats()  // Memory usage
emulator.memory  // Emulated RAM (Uint8Array)

// Check terminal
term  // xterm.Terminal instance
term.buffer  // Terminal buffer
term.write("test")  // Manually write
```

**Network Tab:**
- Filter by `zephyr.elf` to check ELF file size/load time
- Check response headers for COOP/COEP
- Check `libv86.js` and `libv86.wasm` downloads

**Console Errors:**
- Look for CORS errors (missing COOP/COEP headers)
- Look for `fetch` errors (missing `zephyr.elf`, wrong path)
- Look for JavaScript exceptions in `app.js` serial bridge

### Zephyr Serial Monitor (External)

To verify Zephyr compiles correctly, test with native QEMU:

```bash
cd firmware/
west build -b qemu_x86

# Run in QEMU directly (requires QEMU installed)
# qemu-system-x86_64 -m 64 -kernel build/zephyr/zephyr.elf \
#   -serial stdio -display none
```

Expected output:
```
*** Booting Zephyr OS ...
Zephyr QEMU x86 Application Initialized
Type 'help' for available commands, 'version' for app info
uart:~$
```

If this works, Zephyr is correct; if web simulator fails, issue is in browser/v86 integration.

## Build Optimization

### Incremental Builds
```bash
west build -b qemu_x86  # Uses CMake cache, ~seconds
```

### Clean Build
```bash
west build -b qemu_x86 --pristine=always  # Full rebuild, ~minutes
```

### Disable Unnecessary Features
```kconfig
CONFIG_LOG=n
CONFIG_DEBUG=n
CONFIG_ASSERT=n
CONFIG_SHELL_STATS=n
CONFIG_MEMFAULT=n
```

## Advanced: Extending the Project

### Adding More Custom Commands
Edit `firmware/src/main.c`:
```c
static int cmd_uptime(const struct shell *sh, size_t argc, char **argv) {
    uint32_t uptime_ms = k_uptime_get_32();
    shell_print(sh, "Uptime: %u ms", uptime_ms);
    return 0;
}

SHELL_CMD_REGISTER(uptime, NULL, "Show system uptime", cmd_uptime);
```

### Adding More Subsystems
Same process—update `prj.conf` and `src/main.c`:
```kconfig
CONFIG_TIMER=y
CONFIG_GPIO=y
CONFIG_LED=y
```

### Integrating CI/CD (GitHub Actions)
Create `.github/workflows/build.yml`:
```yaml
name: Build Zephyr
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Zephyr
        run: |
          cd firmware
          west init -l .
          west update
      - name: Build
        run: |
          cd firmware
          west build -b qemu_x86
      - name: Upload artifact
        uses: actions/upload-artifact@v2
        with:
          name: zephyr.elf
          path: firmware/build/zephyr/zephyr.elf
```

---

**References:**
- Multiboot: https://www.gnu.org/software/grub/manual/multiboot/multiboot.html
- Zephyr Shell: https://docs.zephyrproject.org/latest/services/shell/index.html
- v86 API: https://github.com/copy/v86/blob/main/v86.d.ts
- xterm.js API: https://xtermjs.org/docs/api/
