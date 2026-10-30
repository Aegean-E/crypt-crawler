"""Unit tests for the AI gameplay harness and the UI inventory contract."""

import copy
import json
import tempfile
import unittest
from pathlib import Path

from crawler.entities import HERO_CLASSES
from tools.ai_harness import (
    ABILITIES,
    PACT_CHOICES,
    catalog,
    layout_hash,
    load_actions,
    parse_script,
    validate_action,
)
from tools.ui_inventory import inventory

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class TestHarnessCatalog(unittest.TestCase):
    def test_catalog_matches_shipped_classes(self):
        data = catalog()
        self.assertEqual(set(data["classes"]), set(HERO_CLASSES))
        for key, hero in data["classes"].items():
            self.assertEqual(hero["hp"], HERO_CLASSES[key]["hp"])
            self.assertEqual(hero["mana"], HERO_CLASSES[key]["mana"])
            self.assertEqual(hero["defense"], HERO_CLASSES[key]["defense"])
            self.assertEqual(len(hero["abilities"]), 5)

    def test_catalog_actions_and_pacts(self):
        data = catalog()
        for action in (
            "move", "ability", "potion", "use_item", "wait", "teleport", "pact",
            "descend", "save",
        ):
            self.assertIn(action, data["actions"])
        self.assertEqual(data["actions"]["use_item"]["fields"], ["index"])
        self.assertEqual(data["pact_choices"], list(PACT_CHOICES))
        self.assertTrue(set(PACT_CHOICES) <= {"wrath", "ward", "avarice"})
        self.assertIn("@actions.json", data["inputs"]["actions"])

    def test_every_class_deck_has_five_named_abilities(self):
        for key, slots in ABILITIES.items():
            with self.subTest(hero_class=key):
                self.assertEqual(sorted(slots), [1, 2, 3, 4, 5])
                self.assertTrue(all(name.strip() for name in slots.values()))


class TestActionValidation(unittest.TestCase):
    def test_valid_actions(self):
        for action in (
            {"action": "move", "dx": 1, "dy": 0},
            {"action": "ability", "slot": 3},
            {"action": "use_item", "index": 0},
            {"action": "teleport", "x": 4, "y": 9},
            {"action": "pact", "choice": "ward"},
            {"action": "wait"},
            {"action": "save"},
        ):
            with self.subTest(action=action):
                self.assertEqual(validate_action(action), [])

    def test_invalid_actions_are_reported(self):
        self.assertTrue(validate_action("wait"))
        self.assertTrue(validate_action({"action": "fly"}))
        self.assertTrue(validate_action({"action": "move", "dx": 0, "dy": 0}))
        self.assertTrue(validate_action({"action": "move", "dx": 2, "dy": 0}))
        self.assertTrue(validate_action({"action": "ability", "slot": 9}))
        self.assertTrue(validate_action({"action": "use_item"}))
        self.assertTrue(validate_action({"action": "use_item", "index": -1}))
        self.assertTrue(validate_action({"action": "use_item", "index": "0"}))
        self.assertTrue(validate_action({"action": "pact", "choice": "bogus"}))
        self.assertTrue(validate_action({"action": "teleport", "x": "a", "y": 1}))


class TestScriptParsing(unittest.TestCase):
    def test_accepts_a_minimal_script(self):
        script = parse_script({"seed": 42, "actions": [{"action": "wait"}]})
        self.assertEqual(script["seed"], 42)
        self.assertEqual(script["depth"], 1)
        self.assertEqual(script["class"], "paladin")
        self.assertEqual(len(script["actions"]), 1)

    def test_rejects_bad_scripts(self):
        for raw in (
            [],
            {"actions": []},
            {"seed": 1, "class": "bard"},
            {"seed": 1, "depth": 0},
            {"seed": 1, "actions": {}},
            {"seed": 1, "actions": [{"action": "fly"}]},
        ):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    parse_script(raw)

    def test_script_limit_is_enforced(self):
        actions = [{"action": "wait"} for _ in range(201)]
        with self.assertRaises(ValueError):
            parse_script({"seed": 1, "actions": actions})


class TestLoadActions(unittest.TestCase):
    def test_reads_inline_json(self):
        self.assertEqual(
            load_actions('[{"action": "wait"}]'),
            [{"action": "wait"}],
        )

    def test_reads_a_file_through_the_at_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "actions.json"
            path.write_text('[{"action":"save"}]', encoding="utf-8")
            self.assertEqual(load_actions(f"@{path}"), [{"action": "save"}])

    def test_shell_stripped_quotes_get_an_actionable_error(self):
        with self.assertRaises(ValueError) as caught:
            load_actions("[{action:wait}]")
        message = str(caught.exception)
        self.assertIn("@actions.json", message)
        self.assertIn("--script", message)

    def test_missing_file_is_an_error_not_an_empty_list(self):
        with self.assertRaises(OSError):
            load_actions("@definitely_missing_actions_file.json")


class TestLayoutHash(unittest.TestCase):
    def _state(self, seed=7, staircase=(3, 4)):
        return {
            "dungeon": {
                "seed": seed,
                "depth": 1,
                "biome": "catacombs",
                "rooms": [{"x": 1, "y": 1, "w": 5, "h": 4}],
                "spawn": {"x": 1, "y": 1},
                "stairs": {"x": staircase[0], "y": staircase[1]},
                "chests": [{"x": 5, "y": 6}],
                "shrines": [],
                "urns": [],
                "souls": [],
                "sigils": [],
                "vault": None,
                "pacts": [],
                "merchants": [],
                "traps": [{"x": 6, "y": 7}],
                "sconces": [{"x": 2, "y": 0}],
            },
            "monsters": [{"type": "skeleton", "x": 2, "y": 2}],
        }

    def _with(self, key, value):
        state = copy.deepcopy(self._state())
        if key == "monsters":
            state["monsters"] = value
        else:
            state["dungeon"][key] = value
        return state

    def test_hash_is_stable_and_sensitive(self):
        self.assertEqual(layout_hash(self._state()), layout_hash(self._state()))
        self.assertNotEqual(layout_hash(self._state()), layout_hash(self._state(seed=8)))
        self.assertNotEqual(
            layout_hash(self._state()), layout_hash(self._state(staircase=(9, 9)))
        )

    def test_hash_tracks_every_seeded_layout_element(self):
        base = layout_hash(self._state())
        variants = [
            ("biome", "ossuary"),
            ("rooms", [{"x": 1, "y": 1, "w": 4, "h": 4}]),
            ("spawn", {"x": 2, "y": 2}),
            ("stairs", {"x": 9, "y": 9}),
            ("monsters", [{"type": "bat", "x": 2, "y": 2}]),
            ("chests", [{"x": 5, "y": 7}]),
            ("shrines", [{"x": 6, "y": 6}]),
            ("urns", [{"x": 4, "y": 4}]),
            ("souls", [{"x": 3, "y": 5}]),
            ("sigils", [{"x": 2, "y": 6}]),
            ("vault", {"x": 8, "y": 2, "opened": False}),
            ("pacts", [{"x": 7, "y": 7, "used": False}]),
            ("merchants", [{"x": 9, "y": 1}]),
            ("traps", [{"x": 4, "y": 8}]),
            ("sconces", [{"x": 3, "y": 0}]),
        ]
        for key, value in variants:
            with self.subTest(key=key):
                self.assertNotEqual(base, layout_hash(self._with(key, value)))


class TestUiInventory(unittest.TestCase):
    def setUp(self):
        self.entries = inventory(PROJECT_ROOT)

    def test_inventory_names_real_controls_choices_and_handlers(self):
        joined = "\n".join(self.entries)
        for expected in (
            "control button#btnJournal",
            "control canvas#gameCanvas",
            "choice data-slot=weapon",
            "choice data-choice=wrath",
            "handler engine.js keydown",
            "theme --color-gold",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, joined)

    def test_inventory_is_deterministic_and_deduplicated(self):
        self.assertEqual(self.entries, inventory(PROJECT_ROOT))
        self.assertEqual(len(self.entries), len(set(self.entries)))

    def test_ui_contract_points_at_the_inventory_and_tests(self):
        contract = json.loads(
            (PROJECT_ROOT / ".aikit" / "ui.json").read_text(encoding="utf-8-sig")
        )
        self.assertEqual(contract["schema"], 1)
        self.assertIn("game-ui", contract["surfaces"])
        self.assertIn("python tools/ui_inventory.py", contract["commands"]["snapshot"])
        self.assertIn("unittest", contract["commands"]["fast"])
        self.assertTrue((PROJECT_ROOT / "tools" / "ui_inventory.py").is_file())


if __name__ == "__main__":
    unittest.main()
