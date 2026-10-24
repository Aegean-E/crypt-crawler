#!/usr/bin/env python3
"""Run script for Crypt-Crawler web game server."""

from __future__ import annotations

import argparse
import sys
from http.server import ThreadingHTTPServer

from crawler.server import CryptCrawlerHandler


def main() -> int:
    parser = argparse.ArgumentParser(description="Crypt-Crawler Game Server")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), CryptCrawlerHandler)
    url = f"http://{args.host}:{args.port}"
    print("=" * 60)
    print(" [GAME] CRYPT-CRAWLER: Tactical Turn-Based Web Dungeon")
    print("=" * 60)
    print(f" Serving live at: {url}")
    print(" Press Ctrl+C to stop.")
    print("=" * 60)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Crypt-Crawler server. Farewell, adventurer!")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
