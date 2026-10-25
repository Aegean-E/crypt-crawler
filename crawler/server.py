"""Lightweight HTTP server and REST dispatch for Crypt-Crawler."""

from __future__ import annotations

import json
import os
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, urlparse

from crawler.dungeon import DungeonGenerator
from crawler.entities import HERO_CLASSES, MERCHANT_STOCK, Player, create_item, spawn_monster
from crawler.rewards import generate_dungeon_bounties

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = PROJECT_ROOT / "static"


class CryptCrawlerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        # Keep test runs clean; suppress default access logs
        if os.environ.get("CRAWLER_VERBOSE"):
            super().log_message(format, *args)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
        elif parsed.path.startswith("/api/"):
            self._handle_api_get(parsed)
        else:
            # Fall back to static files
            super().do_GET()

    def _handle_api_get(self, parsed: Any) -> None:
        if parsed.path == "/api/status":
            self._send_json(
                {
                    "status": "ok",
                    "project": "crypt-crawler",
                    "version": "1.0.0",
                }
            )
        elif parsed.path == "/api/new-game":
            params = parse_qs(parsed.query)
            try:
                raw_seed = int(params.get("seed", ["0"])[0])
                seed = raw_seed if raw_seed != 0 else None
            except (ValueError, TypeError):
                seed = None

            try:
                depth = max(1, int(params.get("depth", ["1"])[0]))
            except (ValueError, TypeError):
                depth = 1

            raw_class = params.get("class", params.get("hero_class", ["paladin"]))[0].lower()
            hero_class = raw_class if raw_class in HERO_CLASSES else "paladin"

            gen = DungeonGenerator(width=45, height=30, depth=depth)
            dungeon = gen.generate(seed=seed)
            player = Player(
                name="Champion",
                x=dungeon.player_spawn[0],
                y=dungeon.player_spawn[1],
                hero_class=hero_class,
            )

            # Spawn monsters per room outside spawn room
            monsters = []
            monster_types = ["skeleton", "goblin", "bat", "spider"]
            if depth >= 2:
                monster_types.append("necromancer")

            # Boss Chamber on Depth 3
            farthest_room = dungeon.rooms[-1] if dungeon.rooms else None
            if depth >= 3 and farthest_room:
                bx, by = farthest_room.center
                monsters.append(spawn_monster("boss_lich", bx, by, depth=depth))
                if farthest_room.w >= 4 and farthest_room.h >= 4:
                    monsters.append(spawn_monster("skeleton", bx - 1, by, depth=depth))
                    monsters.append(spawn_monster("skeleton", bx + 1, by, depth=depth))

            for room in dungeon.rooms[1:]:
                if depth >= 3 and room == farthest_room:
                    continue
                # Keep the Merchant's sanctuary room free of aggressive monsters
                if any(room.center == m for m in dungeon.merchants):
                    continue
                m_count = dungeon.rng.randint(1, 2)
                for _ in range(m_count):
                    mx = dungeon.rng.randint(room.x1 + 1, room.x2 - 2)
                    my = dungeon.rng.randint(room.y1 + 1, room.y2 - 2)
                    if (
                        (mx, my) in dungeon.merchants
                        or (mx, my) in (dungeon.player_spawn, dungeon.stairs_pos)
                    ):
                        continue
                    m_type = dungeon.rng.choice(monster_types)
                    is_champ = dungeon.rng.random() < 0.16
                    affix = (
                        dungeon.rng.choice(["Molten", "Vampiric", "Swift", "Fortified"])
                        if is_champ
                        else None
                    )
                    monsters.append(
                        spawn_monster(
                            m_type,
                            mx,
                            my,
                            depth=depth,
                            is_champion=is_champ,
                            champion_affix=affix,
                        )
                    )

            stock = []
            for entry in MERCHANT_STOCK:
                item_obj = create_item(entry["item_id"])
                if item_obj:
                    stock.append({
                        "item": item_obj.to_dict(),
                        "price": entry["price"],
                    })

            self._send_json(
                {
                    "dungeon": dungeon.to_dict(),
                    "player": player.to_dict(),
                    "monsters": [m.to_dict() for m in monsters],
                    "classes": HERO_CLASSES,
                    "merchant_stock": stock,
                    "bounties": generate_dungeon_bounties(depth=depth, seed=seed),
                }
            )
        else:
            self.send_error(HTTPStatus.NOT_FOUND, f"API endpoint not found: {parsed.path}")

    def _send_json(self, payload: Dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def start_background_server(port: int = 0, host: str = "127.0.0.1") -> Tuple[ThreadingHTTPServer, int]:
    """Start the HTTP server on a daemon thread, returning the server and the bound port."""
    server = ThreadingHTTPServer((host, port), CryptCrawlerHandler)
    bound_port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, bound_port
