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


if __name__ == "__main__":
    unittest.main()
