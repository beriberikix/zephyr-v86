#!/usr/bin/env python3
"""
Development HTTP server for Zephyr v86 simulator.

Serves web assets with proper Cross-Origin headers required for:
- WebAssembly execution
- SharedArrayBuffer support
- v86 emulator functionality

Usage:
    python3 serve.py [--port 8000] [--bind 127.0.0.1]

Requirements:
    - Python 3.9+
    - No external dependencies (uses only stdlib)
"""

import http.server
import socketserver
import argparse
import os
from pathlib import Path


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with COOP/COEP headers."""

    def end_headers(self):
        """Add required headers for WebAssembly and v86."""
        # Cross-Origin-Opener-Policy: Allows SharedArrayBuffer
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")

        # Cross-Origin-Embedder-Policy: Required for COOP
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")

        # Cache-Control: For development, disable caching
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

        super().end_headers()

    def log_message(self, format, *args):
        """Customize log output."""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    parser = argparse.ArgumentParser(
        description="Development server for Zephyr v86 simulator"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to listen on (default: 8000)"
    )
    parser.add_argument(
        "--bind",
        default="127.0.0.1",
        help="IP address to bind to (default: 127.0.0.1)"
    )

    args = parser.parse_args()

    # Change to web directory if this script is in the web directory
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)

    # Create server
    handler = CustomHTTPRequestHandler
    server = socketserver.TCPServer((args.bind, args.port), handler)

    # Print startup info
    print(f"Starting Zephyr v86 development server...")
    print(f"Serving from: {script_dir}")
    print(f"Listening on: http://{args.bind}:{args.port}")
    print(f"\nHeaders set:")
    print(f"  - Cross-Origin-Opener-Policy: same-origin")
    print(f"  - Cross-Origin-Embedder-Policy: require-corp")
    print(f"  - Cache-Control: no-cache (dev mode)")
    print(f"\nOpen your browser to: http://{args.bind}:{args.port}/")
    print(f"Press Ctrl+C to stop the server\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        server.shutdown()
        print("Done.")


if __name__ == "__main__":
    main()
