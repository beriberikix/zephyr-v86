# GitHub Pages Deployment Guide

This repository uses GitHub Actions to automatically build and deploy the Zephyr + v86 demo to GitHub Pages.

## Setup (One-time)

1. **Enable GitHub Pages in repository settings:**
   - Go to Settings → Pages
   - Under "Build and deployment", select:
     - **Source**: "GitHub Actions"
   - Click Save

2. **Verify workflow file exists:**
   - `.github/workflows/build-and-deploy.yml` should be present

## Triggering a Build

### Option 1: Via GitHub UI (Recommended)

1. Go to the **Actions** tab on GitHub
2. In the left sidebar, select **"Build and Deploy to GitHub Pages"**
3. Click the blue **"Run workflow"** button
4. Confirm the trigger
5. Wait for the build to complete (~20 minutes)

### Option 2: Via GitHub CLI

```bash
gh workflow run build-and-deploy.yml --repo beriberikix/zephyr-v86
```

## Build Process

The workflow has 4 parallel/sequential jobs:

### 1. Build v86 Image (Docker) - ~15 minutes
- Builds Buildroot Linux kernel and root filesystem
- Uses `tools/Dockerfile.v86-buildroot` for reproducible builds
- Outputs:
  - `v86-bzimage.bin` (~4 MB)
  - `v86-rootfs.cpio.xz` (~2.5 MB)
  - Checksums (SHA256)

### 2. Build Zephyr native_sim - ~5 minutes
- Builds the Zephyr OS executable for native_sim platform
- Uses the Zephyr SDK (installed on runner)
- Outputs:
  - `zephyr.exe` (~few MB)

### 3. Generate Metadata - instant
- Creates `BUILD_INFO.json` with build timestamp and commit hash
- Useful for verifying freshness

### 4. Deploy to GitHub Pages - ~1 minute
- Combines all artifacts with existing web files
- Validates all required files are present
- Uploads to GitHub Pages
- Demo becomes live at: `https://beriberikix.github.io/zephyr-v86/`

## Monitoring the Build

1. Go to **Actions** tab
2. Click the latest workflow run
3. View logs for each job:
   - `build-v86` — v86/Buildroot compilation
   - `build-zephyr` — Zephyr compile output
   - `deploy` — Final deployment status

## Troubleshooting

### Build Fails: v86 Docker Build

**Symptom:** `build-v86` job fails with Docker build error

**Solution:**
1. Check `tools/Dockerfile.v86-buildroot` exists and is valid
2. Verify the base image exists: `docker build --help` should work on runner (it's pre-installed on ubuntu-latest)
3. Check logs for network/dependency errors
4. Retry the workflow

### Build Fails: Zephyr Compilation

**Symptom:** `build-zephyr` job fails with "west not found" or "Zephyr not found"

**Solution:**
1. Verify `zephyr/` directory exists (checked out via submodules)
2. Verify `firmware/west.yml` exists and is correct
3. Try running locally first:
   ```bash
   python3 -m venv /tmp/test-venv
   source /tmp/test-venv/bin/activate
   pip install -q -r zephyr/scripts/requirements.txt
   cd firmware && west init -l . && west update && west build -d build -b native_sim/native . --pristine=auto
   ```
4. If local build fails, fix it before retrying the workflow

### Build Fails: Deployment

**Symptom:** `deploy` job fails with "required artifacts not found"

**Solution:**
1. Check that both `build-v86` and `build-zephyr` jobs passed
2. Verify the artifact upload steps completed successfully
3. Check the "Prepare GitHub Pages deployment" step logs for missing files

### Demo Doesn't Load After Deployment

**Symptom:** GitHub Pages shows 404 or blank page

**Solution:**
1. Wait 30-60 seconds after workflow completes (GitHub CDN sync)
2. Hard refresh the page (`Ctrl+Shift+R` or `Cmd+Shift+R`)
3. Verify the demo URL is correct (check repository Settings → Pages)
4. Check browser DevTools console for network errors
5. Verify all required files were deployed:
   - `v86-bzimage.bin`
   - `v86-rootfs.cpio.xz`
   - `zephyr.exe`
   - `index.html`, `main.js`, `v86.css`
   - `lib/libv86.js`, `lib/v86.wasm`, `lib/xterm.js`, etc.

## Artifact Storage

- **Built via CI:** v86 image, Zephyr binary, metadata
- **Checked into git:** v86 library files (`lib/`), HTML/CSS/JS runtime
- **Served by GitHub Pages:** Everything in `web/` directory
- **Git history:** NOT bloated (binaries generated fresh each build)

## Advanced: Local Testing Before Publishing

To test the build output locally before pushing:

```bash
# Build v86 image
./tools/build-v86-image.sh --docker --output web

# Build Zephyr
cd firmware
west build -d build -b native_sim/native . --pristine=auto
cp build/zephyr/zephyr.exe ../web/zephyr.exe
cd ..

# Test locally
cd web
python3 serve.py --port 8000
# Visit http://localhost:8000/
```

## References

- GitHub Pages documentation: https://docs.github.com/en/pages
- GitHub Actions documentation: https://docs.github.com/en/actions
- Zephyr Project: https://www.zephyrproject.org/
- v86 Emulator: https://github.com/copy/v86
