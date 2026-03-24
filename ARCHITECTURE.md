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
  - Initializes xterm serial console
  - Enables 9p file upload/download panel
  - Auto-injects `/zephyr.exe` into the guest filesystem
- `firmware/prj.conf`
  - Configures Zephyr `native_sim` runtime behavior
  - Uses stdin/stdout UART routing via:
    - `CONFIG_UART_NATIVE_PTY_0_ON_STDINOUT=y`

## VM Boot Chain

1. Browser loads `web/index.html`
2. `web/main.js` creates `new V86(create_buildroot_settings())`
3. v86 loads:
   - kernel: `web/v86-bzimage.bin`
   - initrd: `web/v86-rootfs.cpio.xz`
   - firmware: `web/lib/seabios.bin`, `web/lib/vgabios.bin`
4. v86 emits `emulator-ready`
5. `set_serial_container_xtermjs(...)` connects guest serial to xterm
6. Filesystem panel is enabled and `/zephyr.exe` is injected automatically

## Zephyr Binary Path

- Zephyr app source lives under `firmware/`
- Built output used for injection is `web/zephyr.exe`
- Inside guest, it appears as `/zephyr.exe`
- Typical manual invocation in guest terminal:
  - `exec zephyr.exe /proc/sysinfo`

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
