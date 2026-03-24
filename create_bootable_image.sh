#!/bin/bash
# Build a GRUB bootable ISO that loads Zephyr via Multiboot.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="$SCRIPT_DIR/firmware/build/zephyr"
OUTPUT_DIR="$SCRIPT_DIR/web"
ISO_PATH="$OUTPUT_DIR/zephyr-multiboot.iso"
TEMP_DIR="$(mktemp -d)"
ISO_STAGING="$TEMP_DIR/iso"
GRUB_DIR="$ISO_STAGING/boot/grub"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if [ ! -f "$BUILD_DIR/zephyr.elf" ]; then
    echo "Error: missing $BUILD_DIR/zephyr.elf"
    echo "Build firmware first: cd firmware && west build"
    exit 1
fi

if ! command -v grub-mkrescue >/dev/null 2>&1; then
    echo "Error: grub-mkrescue not found"
    echo "Install with: sudo apt-get install -y grub-pc-bin"
    exit 1
fi

if ! command -v xorriso >/dev/null 2>&1; then
    echo "Error: xorriso not found (required by grub-mkrescue)"
    echo "Install with: sudo apt-get install -y xorriso"
    exit 1
fi

if ! command -v mformat >/dev/null 2>&1; then
    echo "Error: mformat not found (provided by mtools, required by grub-mkrescue)"
    echo "Install with: sudo apt-get install -y mtools"
    exit 1
fi

# SeaBIOS in copy.sh/v86 needs i386-pc GRUB modules to create a BIOS-bootable ISO.
if [ ! -d "/usr/lib/grub/i386-pc" ]; then
    echo "Error: BIOS GRUB modules missing (/usr/lib/grub/i386-pc)"
    echo "Install with: sudo apt-get install -y grub-pc-bin"
    echo "Then rerun this script to build a SeaBIOS-bootable ISO"
    exit 1
fi

echo "Creating GRUB Multiboot ISO..."

mkdir -p "$GRUB_DIR"
mkdir -p "$ISO_STAGING/boot"
cp "$BUILD_DIR/zephyr.elf" "$ISO_STAGING/boot/zephyr.elf"

cat > "$GRUB_DIR/grub.cfg" <<'EOF'
set default=0
set timeout=0

menuentry "Zephyr (Multiboot)" {
    multiboot /boot/zephyr.elf
    boot
}
EOF

if ! grub-mkrescue -o "$ISO_PATH" "$ISO_STAGING"; then
    echo "Error: grub-mkrescue failed"
    exit 1
fi

if [ ! -f "$ISO_PATH" ]; then
    echo "Error: failed to create $ISO_PATH"
    exit 1
fi

ISO_SIZE="$(du -h "$ISO_PATH" | cut -f1)"
echo "Created: $ISO_PATH ($ISO_SIZE)"
echo
echo "Use in v86 setup:"
echo "1. Open https://copy.sh/v86/#setup"
echo "2. In 'CD image', upload: $ISO_PATH"
echo "3. Keep boot order Auto (or CD first), then Start Emulation"
