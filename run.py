#!/usr/bin/env python3
"""Run script for Crypt-Crawler web game server."""

from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer

from crawler.server import CryptCrawlerHandler


def find_available_server(host: str, start_port: int, max_attempts: int = 10) -> tuple[ThreadingHTTPServer, int]:
    if start_port == 0:
        server = ThreadingHTTPServer((host, 0), CryptCrawlerHandler)
        return server, server.server_address[1]
    for port in range(start_port, start_port + max_attempts):
        try:
            server = ThreadingHTTPServer((host, port), CryptCrawlerHandler)
            return server, server.server_address[1]
        except OSError:
            continue
    server = ThreadingHTTPServer((host, 0), CryptCrawlerHandler)
    return server, server.server_address[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Crypt-Crawler Game Server")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--open", action="store_true", help="Automatically open default browser to the game")
    args = parser.parse_args()

    server, port = find_available_server(args.host, args.port)
    url = f"http://{args.host}:{port}"

    print("=" * 60)
    print(" [GAME] CRYPT-CRAWLER: Tactical Turn-Based Web Dungeon")
    print("=" * 60)
    print(f" Serving live at: {url}")
    print(" Press Ctrl+C to stop.")
    print("=" * 60)

    if args.open:
        launch_browser = getattr(webbrowser, "open")
        threading.Timer(0.4, lambda: launch_browser(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Crypt-Crawler server. Farewell, adventurer!")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
