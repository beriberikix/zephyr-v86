#!/bin/bash
# tools/update-v86-config.sh
# Updates web/main.js to use v86 Buildroot image instead of Buildroot baseline
#
# Phase 2 Integration: Switches from Phase 1 Buildroot (reference) to Phase 2 
# v86-buildroot (with 9p + native_sim injection support)
#
# Usage:
#   ./tools/update-v86-config.sh [--profile alpine|buildroot|v86]
#
# What this does:
#   1. Backs up current web/main.js
#   2. Updates bzimage URL to v86-buildroot kernel
#   3. Adds initrd URL to v86-buildroot rootfs
#   4. Verifies syntax
#

set -e

PROFILE="${1:-v86}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
MAIN_JS="$REPO_ROOT/web/main.js"
BACKUP="$MAIN_JS.phase1.bak"

echo "[*] Updating v86 configuration for Phase 2..."
echo "    Profile: $PROFILE"
echo "    Target: $MAIN_JS"

# Backup Phase 1 config
if [ ! -f "$BACKUP" ]; then
    cp "$MAIN_JS" "$BACKUP"
    echo "[✓] Backed up Phase 1 config: $BACKUP"
fi

# Determine URLs based on profile
case "$PROFILE" in
    v86)
        KERNEL_URL="v86-bzimage.bin"
        INITRD_URL="v86-rootfs.cpio.xz"
        DESC="v86-buildroot (Buildroot + Busybox + 9p)"
        ;;
    alpine)
        KERNEL_URL="alpine-bzimage.bin"
        INITRD_URL="alpine-initrd.xz"
        DESC="Alpine Linux (minimal, 9p)"
        ;;
    buildroot)
        KERNEL_URL="buildroot-bzimage.bin"
        INITRD_URL=""
        DESC="Buildroot baseline (Phase 1 reference)"
        ;;
    *)
        echo "[!] Unknown profile: $PROFILE"
        echo "    Available: v86, alpine, buildroot"
        exit 1
        ;;
esac

echo "[*] Profile: $DESC"

# Update main.js with new image URLs
if grep -q "bzimage: { url: 'buildroot-bzimage.bin'" "$MAIN_JS"; then
    echo "[*] Updating bzimage URL..."
    sed -i "s|bzimage: { url: 'buildroot-bzimage.bin'|bzimage: { url: '$KERNEL_URL'|g" "$MAIN_JS"
fi

# Add initrd if needed
if [ -n "$INITRD_URL" ]; then
    echo "[*] Adding initrd URL ($INITRD_URL)..."
    # Check if initrd already exists in config
    if !grep -q "initrd:" "$MAIN_JS"; then
        # Insert initrd after bzimage config
        sed -i "/bzimage: { url: '$KERNEL_URL',/a\\            initrd: { url: '$INITRD_URL' }," "$MAIN_JS"
    else
        # Update existing initrd
        sed -i "s|initrd: { url: '[^']*'|initrd: { url: '$INITRD_URL'|g" "$MAIN_JS"
    fi
fi

echo "[*] Verifying JavaScript syntax..."
if command -v node &> /dev/null; then
    if node -c "$MAIN_JS" 2>/dev/null; then
        echo "[✓] JavaScript syntax valid"
    else
        echo "[!] Syntax error - reverting"
        cp "$BACKUP" "$MAIN_JS"
        exit 1
    fi
fi

echo "[✓] Configuration updated!"
echo ""
echo "    Kernel: $KERNEL_URL"
[ -n "$INITRD_URL" ] && echo "    Initrd: $INITRD_URL"
echo ""
echo "Next step: Test in browser"
echo "  cd web/ && python3 serve.py --port 8000"
echo "  Open: http://127.0.0.1:8000/"

