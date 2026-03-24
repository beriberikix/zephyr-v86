#!/bin/bash
# tools/build-v86-image.sh
# Builds v86-compatible Linux image with 9p filesystem support using proven Buildroot config
# 
# This script uses chschnell/v86-buildroot as the build base, which provides:
#   - Tested kernel configuration optimized for v86 emulator
#   - Minimal busybox rootfs
#   - 9p filesystem support
#   - Virtio device support (console, net, block)
#
# Usage:
#   ./tools/build-v86-image.sh [--tag TAG] [--output DIR] [--docker]
#
# Options:
#   --tag TAG           Docker image tag (default: zephyr-v86-buildroot:latest)
#   --output DIR        Output directory for artifacts (default: web/)
#   --docker            Use Docker to build (recommended if docker available)
#   --native            Build locally without Docker (requires Buildroot + dependencies)
#
# Output:
#   - v86-bzimage.bin (kernel)
#   - v86-rootfs.cpio.xz (compressed rootfs)
#   - checksums (.sha256 files)
#

set -euo pipefail

TAG="zephyr-v86-buildroot:latest"
OUTPUT_DIR="web"
USE_DOCKER=true
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            TAG="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --docker) USE_DOCKER=true; shift ;;
        --native) USE_DOCKER=false; shift ;;
        *)
            echo "[!] Unknown argument: $1"
            echo "    Usage: $0 [--tag TAG] [--output DIR] [--docker|--native]"
            exit 1
            ;;
    esac
done

if [ -z "$OUTPUT_DIR" ]; then
    echo "[!] --output requires a non-empty directory path"
    exit 1
fi

if [[ "$OUTPUT_DIR" = /* ]]; then
    OUTPUT_PATH="$OUTPUT_DIR"
else
    OUTPUT_PATH="$REPO_ROOT/$OUTPUT_DIR"
fi

echo "[*] Building v86 Linux image with 9p support"
echo "    Method: $([ "$USE_DOCKER" = true ] && echo "Docker" || echo "Native build")"
echo "    Tag: $TAG"
echo "    Output: $OUTPUT_PATH/"
echo ""

if [ "$USE_DOCKER" = true ]; then
    if ! command -v docker &> /dev/null; then
        echo "[!] Docker not found. Install Docker or use --native flag"
        exit 1
    fi
    
    echo "[*] Building Docker image from Dockerfile.v86-buildroot..."
    docker build \
        -f tools/Dockerfile.v86-buildroot \
        -t "$TAG" \
        "$REPO_ROOT"
    
    echo "[*] Extracting artifacts..."
    mkdir -p "$OUTPUT_PATH"
    
    # Create temporary container to extract files (docker cp requires a container, not an image)
    # Pass /bzImage as a dummy command since the scratch image has no CMD/ENTRYPOINT.
    # The container is never started, so the command doesn't need to be executable.
    TEMP_CONTAINER=$(docker create "$TAG" /bzImage)
    trap "docker rm -f $TEMP_CONTAINER" EXIT
    
    # Extract bzImage
    docker cp "$TEMP_CONTAINER":/bzImage "$OUTPUT_PATH/v86-bzimage.bin"
    echo "[✓] Extracted: $OUTPUT_PATH/v86-bzimage.bin ($(du -h "$OUTPUT_PATH/v86-bzimage.bin" | cut -f1))"
    
    # Extract rootfs
    docker cp "$TEMP_CONTAINER":/rootfs.cpio.xz "$OUTPUT_PATH/v86-rootfs.cpio.xz"
    echo "[✓] Extracted: $OUTPUT_PATH/v86-rootfs.cpio.xz ($(du -h "$OUTPUT_PATH/v86-rootfs.cpio.xz" | cut -f1))"
    
else
    # Native build path (requires Buildroot dependencies)
    echo "[*] Native build: cloning and building v86-buildroot..."
    
    if ! command -v make &> /dev/null; then
        echo "[!] Error: 'make' not found. Install: sudo apt install build-essential"
        exit 1
    fi
    
    TEMP_BUILD=$(mktemp -d)
    trap "rm -rf $TEMP_BUILD" EXIT
    
    echo "    Build dir: $TEMP_BUILD"
    cd "$TEMP_BUILD"
    
    git clone --depth 1 https://github.com/chschnell/v86-buildroot.git .
    
    echo "[*] Bootstrapping Buildroot (downloading source)..."
    make bootstrap
    
    echo "[*] Building bzImage with v86 config..."
    make buildroot-defconfig >/dev/null 2>&1
    make all
    
    echo "[*] Installing artifacts..."
    mkdir -p "$OUTPUT_PATH"
    cp build/v86/images/bzImage "$OUTPUT_PATH/v86-bzimage.bin"
    cp build/v86/images/rootfs.cpio.xz "$OUTPUT_PATH/v86-rootfs.cpio.xz"
    
    echo "[✓] Built: $OUTPUT_PATH/v86-bzimage.bin"
    echo "[✓] Built: $OUTPUT_PATH/v86-rootfs.cpio.xz"
fi

# Generate checksums
echo "[*] Generating checksums..."
cd "$OUTPUT_PATH"
sha256sum v86-bzimage.bin > v86-bzimage.bin.sha256
sha256sum v86-rootfs.cpio.xz > v86-rootfs.cpio.xz.sha256

echo "[*] File summary:"
ls -lh v86-bzimage.bin v86-rootfs.cpio.xz
echo ""
echo "[*] Checksums:"
cat v86-bzimage.bin.sha256
cat v86-rootfs.cpio.xz.sha256

echo ""
echo "[✓] Phase 2 build complete!"
echo ""
echo "Next step: Update web/main.js to use v86 image"
echo "  Replace: bzimage: { url: 'buildroot-bzimage.bin' }"
echo "  With:    bzimage: { url: 'v86-bzimage.bin' }"
echo "  Add:     initrd: { url: 'v86-rootfs.cpio.xz' }"

