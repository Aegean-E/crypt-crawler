"""Unit tests for the lore codex data and its HTTP endpoint."""

import json
import unittest
from urllib.request import urlopen

from crawler.lore import (
    CATEGORIES,
    LORE_BY_ID,
    LORE_ENTRIES,
    entry_for_event,
    is_valid_entry,
    public_entries,
    starting_lore,
)
from crawler.server import start_background_server


class TestLoreData(unittest.TestCase):
    def test_entries_are_unique_and_well_formed(self):
        ids = [entry["id"] for entry in LORE_ENTRIES]
        self.assertEqual(len(ids), len(set(ids)), "lore ids must be unique")
        for entry in LORE_ENTRIES:
            with self.subTest(entry=entry["id"]):
                self.assertTrue(entry["title"].strip())
                self.assertIn(entry["category"], CATEGORIES)
                self.assertGreaterEqual(len(entry["text"]), 80)

    def test_starting_entries_exist(self):
        for entry_id in starting_lore():
            with self.subTest(entry=entry_id):
                self.assertTrue(is_valid_entry(entry_id))
                self.assertEqual(LORE_BY_ID[entry_id]["id"], entry_id)

    def test_every_event_points_at_a_real_entry(self):
        for event in (
            "start", "depth2", "depth3", "shrine", "merchant", "soul",
            "vault", "sigil", "boss", "crown", "death", "watchers", "pact",
        ):
            with self.subTest(event=event):
                self.assertTrue(is_valid_entry(entry_for_event(event)))
        self.assertEqual(entry_for_event("unknown-event"), "")

    def test_public_entries_are_copies(self):
        entries = public_entries()
        entries[0]["title"] = "Corrupted"
        self.assertNotEqual(LORE_ENTRIES[0]["title"], "Corrupted")


class TestLoreEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server, cls.port = start_background_server(port=0)
        cls.base_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_api_lore_returns_entries_and_starting_set(self):
        with urlopen(f"{self.base_url}/api/lore", timeout=3) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
        self.assertEqual(len(data["entries"]), len(LORE_ENTRIES))
        self.assertEqual(data["starting"], starting_lore())
        self.assertIn("text", data["entries"][0])
        self.assertEqual(data["events"]["depth2"], "lore_cavern")
        self.assertEqual(data["events"]["vault"], "lore_vault")


if __name__ == "__main__":
    unittest.main()
