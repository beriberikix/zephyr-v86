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
3. Start the Zephyr networking app:

```bash
exec /zephyr.exe
```

If you also uploaded a file through the Files panel, avoid running `/mnt/zephyr.exe` unless you intentionally want that uploaded copy. `/mnt/zephyr.exe` may be stale from an earlier build.

The app runs a TCP connect test on port `4242` and exits immediately after the first successful client connection.

Quick test inside the guest shell:

```bash
./zephyr.exe
```

On startup, the app prints:

```text
Build marker: tcp-test-v1
TCP test listening on 0.0.0.0:4242
Waiting for first client connection...
```

When a client connects, the app reports success and exits. This makes `time ./zephyr.exe` directly measure time-to-first-successful TCP connection.

Use `udhcpc` first if needed so guest routing is configured through the relay path.

From another network endpoint, connect to the guest at port `4242`. If your rootfs includes a netcat applet, one local check is:

```bash
busybox nc 127.0.0.1 4242
```

## Networking Configuration

- The web runtime enables v86 networking with `wsproxy` when the **Networking proxy** field is non-empty.
- Default relay URL: `wss://relay.widgetry.org/`.
- You can override this in the Controls tab and click **Apply + Reload**.
- Click **Disable Network** to boot without a relay.
- The Zephyr `native_sim` app uses offloaded sockets in this flow.

Why `wsproxy` for phase 1:

- It is the best fit for Zephyr socket-style app behavior in this runtime.
- v86 `wisp` and `fetch` backends are useful for specific scenarios but more limited for this target flow.

Note: the public relay is a convenience endpoint and may be bandwidth-limited. Plan to switch this URL to your own relay infrastructure for production.

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

## UI Layout (Terminal-First)

The web UI is organized around the serial terminal as the primary workspace.

- Center stage:
  - VGA/screen frame (`#screen_container`) and the main serial terminal (`#terminal`)
- Right utility rail (tabs):
  - **Controls**: networking relay settings, Run, Reset, Exit
  - **Files**: Upload/download controls + 9p stats/status
  - **Metrics**: Running time, current speed, average speed
  - **Session**: Save State / Load State
- Top status bar:
  - Current runtime state (initializing, running, paused, errors)

Keyboard tips for utility tabs:

- Move focus between tab buttons: Left/Right arrows
- Jump to first/last tab: Home/End
- Activate focused tab: Enter or Space

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

### Networking does not work

- Confirm the **Networking proxy** field points to a reachable `ws://` or `wss://` relay endpoint.
- If using the public relay, retry later if service is saturated.
- To run with your own relay later, replace the URL in the Controls tab and reload.

## References

- Zephyr docs: https://docs.zephyrproject.org/
- v86 project: https://github.com/copy/v86
- xterm.js docs: https://xtermjs.org/

## License

See `LICENSE`.

---

Last Updated: March 24, 2026
