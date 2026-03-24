# Zephyr + v86 (Buildroot native_sim flow)

[![Build and Deploy to GitHub Pages](https://github.com/beriberikix/zephyr-v86/actions/workflows/build-and-deploy.yml/badge.svg)](https://github.com/beriberikix/zephyr-v86/actions/workflows/build-and-deploy.yml)

This repository runs a Linux guest in v86 and injects a Zephyr `native_sim` executable into that guest.

## 🚀 Try the Demo

**Live demo:** https://beriberikix.github.io/zephyr-v86/

The demo is hosted on GitHub Pages and automatically updated when you trigger a build.

### To trigger a build:

1. Go to the [**Actions** tab](https://github.com/beriberikix/zephyr-v86/actions)
2. Select **Build and Deploy to GitHub Pages** workflow
3. Click **Run workflow**
4. Wait ~20 minutes for the build to complete
5. Once complete, refresh the demo link above

**Build time breakdown:**
- v86 image build (Docker): ~15 min
- Zephyr native_sim build: ~5 min
- GitHub Pages deployment: ~1 min

**For more details:** See [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md) for setup, troubleshooting, and advanced usage.

---

Current runtime path:

1. Browser boots Buildroot (`v86-bzimage.bin` + `v86-rootfs.cpio.xz`)
2. Web runtime auto-injects `zephyr.exe` into guest filesystem (`/zephyr.exe`)
3. You run the binary from the guest terminal

## Current Architecture

- Web entrypoints:
  - `web/index.html`
  - `web/main.js`
  - `web/v86.css`
- VM assets:
  - `web/v86-bzimage.bin`
  - `web/v86-rootfs.cpio.xz`
  - `web/lib/libv86.js`
  - `web/lib/xterm.js`
  - `web/lib/xterm.css`
- Zephyr artifact injected into guest:
  - `web/zephyr.exe`

Detailed flow is documented in `ARCHITECTURE.md`.

## Quick Start

### Prerequisites

- Linux/macOS
- Python 3.9+
- Git
- CMake and build tools
- west

### 1) Initialize Zephyr workspace

From repository root:

```bash
west init -l firmware
west update
```

### 2) Build Zephyr native_sim executable

From repository root:

```bash
west build -d build -b native_sim/native firmware --pristine=auto
cp build/zephyr/zephyr.exe web/zephyr.exe
```

### 3) Build or refresh Buildroot VM image

From repository root:

```bash
./tools/build-v86-image.sh --docker --output web
```

This produces `web/v86-bzimage.bin` and `web/v86-rootfs.cpio.xz`.

### 4) Run web server

```bash
cd web
python3 serve.py --port 8000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8000/
```

## Guest Workflow

Once booted:

1. Wait for Buildroot shell prompt
2. `zephyr.exe` is auto-injected by `web/main.js`
3. Execute from terminal, for example:

```bash
exec zephyr.exe /proc/sysinfo
```

## Important Zephyr Configuration

`firmware/prj.conf` enables stdin/stdout UART routing for native_sim:

```kconfig
CONFIG_UART_NATIVE_PTY_0_ON_STDINOUT=y
```

This avoids PTY allocation failures in constrained/containerized environments.

## Web Runtime Notes

- The runtime uses `main.js`, not `app.js`.
- Legacy direct ELF boot flow (`web/zephyr.elf`) is removed from active docs and runtime.
- 9p file panel supports:
  - host -> guest upload (`create_file`)
  - guest -> host fetch (`read_file`)

## Troubleshooting

### `could not open a new pty for the uart`

Ensure `CONFIG_UART_NATIVE_PTY_0_ON_STDINOUT=y` remains enabled in `firmware/prj.conf`, then rebuild:

```bash
west build -d build -b native_sim/native firmware --pristine=auto
cp build/zephyr/zephyr.exe web/zephyr.exe
```

### Web page loads but VM does not boot

- Confirm these files exist:
  - `web/v86-bzimage.bin`
  - `web/v86-rootfs.cpio.xz`
  - `web/lib/libv86.js`
  - `web/lib/v86.wasm`
- Check browser console/network for missing asset fetches.

### `zephyr.exe` does not appear in guest

- Confirm `web/zephyr.exe` exists.
- Reload the page and watch browser console for auto-injection logs from `main.js`.

## References

- Zephyr docs: https://docs.zephyrproject.org/
- v86 project: https://github.com/copy/v86
- xterm.js docs: https://xtermjs.org/

## License

See `LICENSE`.

---

Last Updated: March 24, 2026
