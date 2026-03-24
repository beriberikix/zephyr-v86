# Phase 2: v86-Buildroot Linux Image Build

**Objective:** Build a production-ready v86-compatible Linux image with 9p filesystem support for injecting native_sim binary in Phase 4.

**Reference Implementation:** [chschnell/v86-buildroot](https://github.com/chschnell/v86-buildroot) — proven Buildroot configuration optimized for v86 emulation.

## Architecture

| Component | Source | Purpose |
|-----------|--------|---------|
| **Kernel** | Buildroot Linux (6.x) | x86 kernel with 9p, Virtio, serial support |
| **Rootfs** | Buildroot + Busybox | Minimal userspace (~2-3 MB) |
| **Build System** | Buildroot + make | Reproducible, out-of-tree builds |
| **Container** | Docker | Isolated build environment (optional) |

## Quick Build

### Option 1: Docker Build (Recommended)

**Prerequisites:** Docker installed

```bash
# Build v86-buildroot image and extract artifacts
./tools/build-v86-image.sh --docker --output web/

# Output:
# - web/v86-bzimage.bin (3-5 MB)
# - web/v86-rootfs.cpio.xz (2-3 MB)
# - web/v86-bzimage.bin.sha256
# - web/v86-rootfs.cpio.xz.sha256

# Time: ~10-15 minutes (includes Buildroot download + kernel build)
```

### Option 2: Native Build

**Prerequisites:**
- Linux/macOS with build tools
- `make`, `gcc`, `git`, `wget`
- 2+ GB free disk space
- ~10 minutes

```bash
# Build locally without Docker
./tools/build-v86-image.sh --native --output web/
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile.v86-buildroot` | Docker build image using chschnell/v86-buildroot as base |
| `build-v86-image.sh` | Orchestrates Docker or native build, extracts artifacts |
| `update-v86-config.sh` | Updates web/main.js to use new image (profile-aware) |

## Integration Step

After build completes, update web/main.js to use the new kernel and rootfs:

```bash
# Automatic (recommended)
./tools/update-v86-config.sh --profile v86

# Manual (if preferred)
# Edit web/main.js and change:
#   bzimage: { url: 'buildroot-bzimage.bin' }
# To:
#   bzimage: { url: 'v86-bzimage.bin' }
#   initrd: { url: 'v86-rootfs.cpio.xz' }
```

## Testing

```bash
cd web/
python3 serve.py --port 8000
# Open http://127.0.0.1:8000/ in browser
# Expected: Busybox shell prompt
```

## Customization

To modify kernel or rootfs (e.g., add packages):

### Using Docker (Recommended)

1. Extract and modify v86-buildroot source:
   ```bash
   git clone https://github.com/chschnell/v86-buildroot.git /tmp/v86-buildroot
   cd /tmp/v86-buildroot
   
   # Configure Buildroot (menuconfig interface)
   make buildroot-menuconfig
   make linux-menuconfig
   make busybox-menuconfig
   
   # Build
   make buildroot-defconfig
   make all
   ```

2. Copy updated image back:
   ```bash
   cp /tmp/v86-buildroot/build/v86/images/bzImage web/v86-bzimage.bin
   cp /tmp/v86-buildroot/build/v86/images/rootfs.cpio.xz web/v86-rootfs.cpio.xz
   ```

### Common Customizations

**Add busybox applets:**
- Edit `board/v86/busybox.config` and run `make busybox-saveconfig`

**Add packages (pkg-config, curl, etc.):**
- Run `make buildroot-menuconfig` and enable in Target packages → […]

**Modify kernel options:**
- Run `make linux-menuconfig` and save with `make linux-saveconfig`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker build fails to pull v86-buildroot | Check network; retry with `docker build […] --no-cache` |
| Native build hangs on Buildroot download | Interrupt (Ctrl+C) and manually clone: `git clone git@github.com:buildroot/buildroot.git /tmp/buildroot-6.x` |
| Kernel too large | Run `make linux-menuconfig` and disable unnecessary drivers |
| Rootfs too large | Remove unnecessary packages: `make buildroot-menuconfig` → Target packages |

## Next Steps

1. **Phase 3:** Build Zephyr native_sim for 32-bit x86 → creates `zephyr.exe`
2. **Phase 4:** Inject `zephyr.exe` into v86 via 9p and execute
3. **Phase 5:** Capture boot snapshot (instant boot on reload)
4. **Phase 6:** Documentation & polish

## References

- [chschnell/v86-buildroot](https://github.com/chschnell/v86-buildroot) — Reference implementation
- [Buildroot manual](https://buildroot.org/downloads/manual/manual.html)
- [v86 documentation](https://github.com/copy/v86/blob/master/v86.d.ts)
- [9p protocol](https://en.wikipedia.org/wiki/9P_(protocol))
