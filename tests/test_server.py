"""Unit tests for the Crypt-Crawler HTTP server and API endpoints."""

import json
import unittest
from urllib.request import urlopen

from crawler.server import start_background_server
from run import find_available_server


class TestServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server, cls.port = start_background_server(port=0)
        cls.base_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_api_status(self):
        url = f"{self.base_url}/api/status"
        with urlopen(url, timeout=3) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertEqual(data.get("status"), "ok")
            self.assertEqual(data.get("project"), "crypt-crawler")

    def test_api_new_game(self):
        url = f"{self.base_url}/api/new-game?seed=42&depth=1"
        with urlopen(url, timeout=3) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("dungeon", data)
            self.assertIn("player", data)
            self.assertIn("monsters", data)
            self.assertIn("bounties", data)
            self.assertEqual(len(data["bounties"]), 3)

            dungeon = data["dungeon"]
            self.assertEqual(dungeon["seed"], 42)
            self.assertGreater(len(dungeon["rooms"]), 0)

            player = data["player"]
            self.assertEqual(player["name"], "Champion")
            self.assertGreater(player["hp"], 0)

    def test_api_new_game_invalid_params_fallback(self):
        url = f"{self.base_url}/api/new-game?seed=invalid_seed&depth=abc"
        with urlopen(url, timeout=3) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("dungeon", data)
            self.assertIn("player", data)

    def test_favicon_no_content(self):
        url = f"{self.base_url}/favicon.ico"
        with urlopen(url, timeout=3) as response:
            self.assertEqual(response.status, 204)

    def test_find_available_server(self):
        server, bound_port = find_available_server("127.0.0.1", 0)
        try:
            self.assertGreater(bound_port, 0)
        finally:
            server.server_close()

    def test_floor_objective_and_soul_are_clear_of_monsters(self):
        url = f"{self.base_url}/api/new-game?seed=55&depth=2"
        with urlopen(url, timeout=3) as response:
            data = json.loads(response.read().decode("utf-8"))

        dungeon = data["dungeon"]
        self.assertEqual(len(dungeon["sigils"]), 3)
        self.assertIsNotNone(dungeon["vault"])
        self.assertEqual(len(dungeon["souls"]), 1)
        self.assertEqual(len(dungeon["pacts"]), 1)

        monster_coords = {(m["x"], m["y"]) for m in data["monsters"]}
        for x, y in dungeon["sigils"] + [dungeon["vault"]] + dungeon["souls"] + dungeon["pacts"]:
            self.assertNotIn((x, y), monster_coords)

    def test_monsters_never_cover_an_interactive_prop(self):
        for seed in (1, 42, 777, 999):
            for depth in (1, 3):
                with self.subTest(seed=seed, depth=depth):
                    url = f"{self.base_url}/api/new-game?seed={seed}&depth={depth}"
                    with urlopen(url, timeout=3) as response:
                        data = json.loads(response.read().decode("utf-8"))
                    dungeon = data["dungeon"]
                    props = set()
                    for key in ("merchants", "chests", "shrines", "urns", "souls", "sigils", "pacts"):
                        props.update(tuple(entry) for entry in dungeon[key])
                    if dungeon.get("vault"):
                        props.add(tuple(dungeon["vault"]))
                    occupied = {(m["x"], m["y"]) for m in data["monsters"]}
                    self.assertFalse(
                        occupied & props,
                        f"monsters spawned on interactive props: {sorted(occupied & props)}",
                    )

    def test_no_two_monsters_share_a_tile(self):
        for seed in (1, 2, 5, 7, 8, 42, 777, 1234):
            for depth in (1, 2, 3):
                with self.subTest(seed=seed, depth=depth):
                    url = f"{self.base_url}/api/new-game?seed={seed}&depth={depth}"
                    with urlopen(url, timeout=3) as response:
                        data = json.loads(response.read().decode("utf-8"))
                    tiles = [(m["x"], m["y"]) for m in data["monsters"]]
                    self.assertEqual(
                        len(tiles), len(set(tiles)),
                        f"monsters stacked on one tile: {sorted(tiles)}",
                    )

    def test_depth_three_boss_guards_the_stairs(self):
        for seed in (1, 2, 5, 7, 8, 42, 777, 1234):
            with self.subTest(seed=seed):
                url = f"{self.base_url}/api/new-game?seed={seed}&depth=3"
                with urlopen(url, timeout=3) as response:
                    data = json.loads(response.read().decode("utf-8"))
                dungeon = data["dungeon"]
                bosses = [m for m in data["monsters"] if m["is_boss"]]
                self.assertEqual(len(bosses), 1)
                self.assertEqual(
                    (bosses[0]["x"], bosses[0]["y"]), tuple(dungeon["stairs_pos"]),
                    "the boss must guard the stairs, not an arbitrary room",
                )
                others = [
                    (m["x"], m["y"]) for m in data["monsters"] if not m["is_boss"]
                ]
                self.assertNotIn(tuple(dungeon["stairs_pos"]), others)

    def test_api_new_game_with_class_and_merchant(self):
        url = f"{self.base_url}/api/new-game?seed=101&depth=2&class=rogue"
        with urlopen(url, timeout=3) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertEqual(data["player"]["hero_class"], "rogue")
            self.assertIn("classes", data)
            self.assertIn("merchant_stock", data)
            self.assertGreater(len(data["merchant_stock"]), 0)

            # Ensure merchants have safe sanctuary (no overlapping monsters)
            merchant_coords = set(tuple(m) for m in data["dungeon"]["merchants"])
            monster_coords = set((m["x"], m["y"]) for m in data["monsters"])
            self.assertGreater(len(merchant_coords), 0)
            self.assertTrue(merchant_coords.isdisjoint(monster_coords))


if __name__ == "__main__":
    unittest.main()
