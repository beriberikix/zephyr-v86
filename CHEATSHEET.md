# Cheat Sheet: Common Commands & Workflows

## Quick Reference

### Initial Setup (One-time)

```bash
# 1. Initialize Zephyr workspace
cd firmware/
west init -l .
west update

# 2. Download v86 library
cd ../web/lib/
wget https://github.com/copy/v86/releases/download/latest/libv86.js
wget https://github.com/copy/v86/releases/download/latest/libv86.wasm

# 3. Verify setup
cd ../..
ls -la firmware/src/main.c
ls -la web/index.html
```

### Build & Deploy

```bash
# Build firmware
cd firmware/
west build -b qemu_x86 --pristine=auto

# Copy to web
cp build/zephyr/zephyr.elf ../web/

# Verify
ls -lh web/zephyr.elf
```

### Run Web Simulator

```bash
# Start server (from project root or web/ directory)
cd web/
python3 serve.py

# Or manual headers
python3 -m http.server 8000 \
  --bind 127.0.0.1 \
  --header Cross-Origin-Opener-Policy=same-origin \
  --header Cross-Origin-Embedder-Policy=require-corp

# Open browser
open http://127.0.0.1:8000/  # macOS
xdg-open http://127.0.0.1:8000/  # Linux
```

### Edit & Rebuild

```bash
# Edit Zephyr source
nano firmware/src/main.c

# Rebuild (fast, incremental)
cd firmware/
west build -b qemu_x86

# Deploy new ELF
cp build/zephyr/zephyr.elf ../web/

# Reload browser (Ctrl+R or Cmd+R)
```

### Zephyr Shell Commands (when connected)

```bash
# In web terminal, after boot prompt appears:

help              # List all shell commands
version           # Show custom app version
clear             # Clear screen
exit              # Exit shell (usually hangs on v86)
history           # Show command history (if enabled in prj.conf)

# File operations (if filesystem enabled)
cd /               # Change directory
ls                 # List files
mkdir test         # Create directory
```

---

## Troubleshooting Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| `west: command not found` | `pip install west` |
| `ZEPHYR_BASE not set` | `cd firmware && west init -l .` |
| `qemu_x86 board not found` | `west update` (takes 5-10 min) |
| Build fails, no ELF | `west build -b qemu_x86 --pristine=always` (clean build) |
| Web page loads but no terminal | Check `web/zephyr.elf` exists: `ls -lh web/zephyr.elf` |
| CORS/COEP header errors in console | Verify using `serve.py` NOT plain `http-server` or Apache |
| v86 emulator doesn't start | Check browser console (F12), look for libv86.js errors |
| Terminal shows but no boot messages | Wait 3 seconds, then reload page (Ctrl+R) |
| Keyboard input doesn't work | Click in terminal to focus, check browser console |

---

## Development Cycle

### Firmware Changes

```bash
# 1. Edit source
vim firmware/src/main.c

# 2. Fast rebuild
cd firmware && west build -b qemu_x86

# 3. Deploy
cp build/zephyr/zephyr.elf ../web/

# 4. Reload browser
# Web terminal auto-resets on new ELF
```

**Time:** ~10-30 seconds

### Web Frontend Changes

```bash
# 1. Edit JS/HTML/CSS
vim web/app.js
vim web/index.html
vim web/style.css

# 2. Save (no build needed)

# 3. Reload browser (Ctrl+R)
```

**Time:** ~2 seconds

---

## Common Configuration Changes

### Enable Command History in Shell

**File:** `firmware/prj.conf`

Add:
```kconfig
CONFIG_SHELL_HISTORY=y
CONFIG_SHELL_HISTORY_BUFFER=512
```

Rebuild and redeploy.

### Increase Memory Allocated to v86

**File:** `web/app.js`

Change:
```javascript
memory_size: 64 * 1024 * 1024,    // 64 MB
// to:
memory_size: 128 * 1024 * 1024,   // 128 MB
```

Reload page.

### Increase Terminal Size

**File:** `web/app.js`

Change:
```javascript
const term = new Terminal({
    cols: 80,   // Columns (width)
    rows: 24,   // Rows (height)
    // ...
});
```

Reload page.

### Add Custom Zephyr Shell Command

**File:** `firmware/src/main.c`

Add function and registration:
```c
static int cmd_custom(const struct shell *sh, size_t argc, char **argv) {
    shell_print(sh, "Custom command works!");
    return 0;
}

SHELL_CMD_REGISTER(custom, NULL, "My custom command", cmd_custom);
```

Rebuild and redeploy.

---

## Debugging Techniques

### Check Zephyr Build Output

```bash
cd firmware/
west build -b qemu_x86 2>&1 | tee build.log
cat build.log | grep -i error
cat build.log | grep -i warning
```

### Verify ELF File

```bash
# Check file type and size
file web/zephyr.elf
ls -lh web/zephyr.elf
objdump -f web/zephyr.elf | head -20
```

### Test with Native QEMU (if installed)

```bash
cd firmware/
# Run in native QEMU to verify Zephyr is correct
qemu-system-x86_64 -m 64 -kernel build/zephyr/zephyr.elf \
    -serial stdio -display none -no-reboot
```

If this works but web doesn't, the issue is in browser/v86 setup.

### Enable v86 Verbose Logging

**File:** `web/app.js`

Change:
```javascript
const emulator = new V86({
    // ...
    log_level: 2,  // 0=none, 1=errors, 2=verbose
});
```

Reload page, check browser console for v86 logs.

### Check Browser Network

1. Open DevTools (F12)
2. Go to Network tab
3. Reload page
4. Check for:
   - `zephyr.elf` — should download successfully
   - `libv86.js` — should download successfully
   - `app.js` — should load and run
   - HTTP status codes — should all be 200 OK
5. Click on `index.html` response header, verify COOP/COEP headers present

---

## File Locations Reference

| Path | Purpose | Gitignored? |
|------|---------|-------------|
| `firmware/.west/` | West workspace | Yes |
| `firmware/build/` | Build artifacts | Yes |
| `firmware/src/main.c` | Zephyr app source | No |
| `firmware/prj.conf` | Zephyr config | No |
| `firmware/west.yml` | Dependency manifest | No |
| `web/lib/` | v86 + xterm libs | Yes |
| `web/zephyr.elf` | Compiled kernel | Yes |
| `web/index.html` | Web page | No |
| `web/app.js` | Serial bridge logic | No |
| `web/serve.py` | Dev HTTP server | No |

---

## Performance Metrics

| Operation | Time | Notes |
|-----------|------|-------|
| `west init` | ~5 seconds | One-time setup |
| `west update` | ~5-10 min | First run (downloads Zephyr source) |
| First build | ~2-5 min | Compiles Zephyr app |
| Incremental build | <1 min | CMake caches most work |
| ELF to web copy | <1 sec | Simple file copy |
| Server startup | <1 sec | Python http.server |
| v86 init + boot | 2-3 sec | From page load to shell prompt |
| Serial byte throughput | ~100+ bytes/sec | Buffered in app.js |

---

## Common Errors & Solutions

### `west: command not found`
**Cause:** `west` not installed
**Fix:**
```bash
pip install west
```

### `ZEPHYR_BASE: command not found` or linker errors
**Cause:** Not in proper way West workspace
**Fix:**
```bash
cd firmware/
west init -l .
west update
```

### `error: unrecognized option '-DBOARD=x86'` (or similar)
**Cause:** CMake options conflict
**Fix:**
```bash
cd firmware/
rm -rf build/
west build -b qemu_x86
```

### `403 Forbidden` when accessing web page
**Cause:** Using wrong directory or permissions
**Fix:**
```bash
cd web/
python3 serve.py  # Serves current directory
```

### `Uncaught (in promise) Error: Cannot read property 'set' of undefined`
**Cause:** v86 WASM module not loading
**Fix:**
```bash
# Verify libv86.wasm exists
ls -l web/lib/libv86.wasm
# Or disable WASM (slower but works)
# Edit web/app.js: remove wasm_path option
```

### `Cross-Origin errors` in DevTools console
**Cause:** Missing COOP/COEP headers
**Fix:**
```bash
# Use serve.py which adds headers automatically
cd web/ && python3 serve.py
# NOT: python3 -m http.server  (missing headers)
```

### Terminal appears but no output
**Cause:** Zephyr hasn't booted yet, or v86 isn't running
**Fix:**
1. Wait 10 seconds (give v86 time to boot)
2. Press Enter in terminal (trigger shell output)
3. Check browser console for errors (F12)
4. Reload page and check for "✓ xterm.js terminal initialized"

### Keyboard input ignored
**Cause:** Terminal not focused, or serial bridge issue
**Fix:**
1. Click in terminal area to focus
2. Check `app.js` console logs for serial bridge registration
3. Test in browser console:
   ```javascript
   term.write("Test input\r\n");  // Should appear in terminal
   ```

---

## Tips & Tricks

### Faster Builds with Ccache

```bash
export CC=ccache gcc
export CXX=ccache g++
cd firmware/
west build -b qemu_x86  # Much faster on rebuilds
```

### Parallel Build Jobs

```bash
cd firmware/
west build -b qemu_x86 -- -j8  # Use 8 CPU cores
```

### Keeping Zephyr Up-to-Date

```bash
cd firmware/
west update --multi  # Update all repos
```

### Saving Terminal Output

In xterm.js, terminal buffer is available via:
```javascript
const buffer = term.buffer.normal;  // Current buffer
const content = buffer.getNullPaddedString(0, 0, buffer.length * 80, 24);
console.log(content);
```

### Scripting Repeated Commands

Create `firmware/build.sh`:
```bash
#!/bin/bash
cd firmware/
west build -b qemu_x86 --pristine=auto
cp build/zephyr/zephyr.elf ../web/
echo "Build complete. Reload browser."
```

Then:
```bash
bash firmware/build.sh
```

---

**Last Updated:** March 20, 2026
