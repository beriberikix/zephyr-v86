#!/usr/bin/env bash
# run-relay.sh — Start a local RootlessRelay instance for v86 networking.
#
# RootlessRelay is a pure Node.js wsproxy-compatible relay server.
# It requires no TUN/TAP devices, root access, or dnsmasq.
# Source: https://github.com/obegron/rootlessRelay
#
# Usage:
#   ./tools/run-relay.sh          # clone + install + start (WS on port 8086)
#   ./tools/run-relay.sh --wss    # start with WSS (generates self-signed cert)
#
# Once running, set the v86 relay URL to:
#   ws://localhost:8086/   (WS mode, default)
#   wss://localhost:8443/  (WSS mode)

set -euo pipefail

RELAY_DIR="${RELAY_DIR:-$(dirname "$0")/../.relay}"
REPO_URL="https://github.com/obegron/rootlessRelay.git"
ENABLE_WSS="false"

for arg in "$@"; do
    case "$arg" in
        --wss) ENABLE_WSS="true" ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Clone if not present
if [ ! -d "$RELAY_DIR" ]; then
    echo "Cloning RootlessRelay..."
    git clone --depth 1 "$REPO_URL" "$RELAY_DIR"
fi

cd "$RELAY_DIR"

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Generate self-signed cert for WSS mode
if [ "$ENABLE_WSS" = "true" ] && [ ! -f "cert.pem" ]; then
    echo "Generating self-signed TLS certificate..."
    openssl req -x509 -newkey rsa:2048 \
        -keyout key.pem -out cert.pem \
        -days 365 -nodes \
        -subj "/CN=localhost"
fi

echo ""
echo "Starting RootlessRelay..."
echo "  Gateway IP:   10.0.2.2"
echo "  DNS:          8.8.8.8"
echo "  VM-to-VM:     enabled"
if [ "$ENABLE_WSS" = "true" ]; then
    echo "  Mode:         WSS (port 8443)"
    echo "  Relay URL:    wss://localhost:8443/"
    echo ""
    echo "NOTE: For WSS with self-signed certs, visit https://localhost:8443"
    echo "      in your browser and accept the certificate first."
else
    echo "  Mode:         WS (port 8086)"
    echo "  Relay URL:    ws://localhost:8086/"
fi
echo ""

exec env \
    ENABLE_WSS="$ENABLE_WSS" \
    GATEWAY_IP="10.0.2.2" \
    DNS_SERVER_IP="8.8.8.8" \
    ENABLE_VM_TO_VM="true" \
    LOG_LEVEL="1" \
    node relay.js
