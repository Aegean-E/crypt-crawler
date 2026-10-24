"""Unit tests for combat, leveling and inventory management."""

import random
import unittest

from crawler.combat import cast_fireball, cast_heal, resolve_melee_attack
from crawler.entities import Player, create_item, spawn_monster


class TestCombat(unittest.TestCase):
    def setUp(self):
        self.rng = random.Random(42)
        self.player = Player(name="TestHero", x=5, y=5)
        self.skeleton = spawn_monster("skeleton", x=5, y=6, depth=1)

    def test_player_stats_and_equipment(self):
        base_atk = self.player.effective_attack
        sword = create_item("sword_iron")
        self.assertIsNotNone(sword)
        self.player.equip(sword)  # type: ignore[arg-type]

        # Equipped sword gives +4 ATK
        self.assertEqual(self.player.effective_attack, base_atk + 4)
        self.assertEqual(self.player.equipped["weapon"], sword)

    def test_melee_attack_damages_target(self):
        init_hp = self.skeleton.hp
        res = resolve_melee_attack(self.player, self.skeleton, self.rng)
        self.assertGreater(res.damage_dealt, 0)
        self.assertEqual(self.skeleton.hp, init_hp - res.damage_dealt)

    def test_killing_monster_awards_xp_and_gold(self):
        self.skeleton.hp = 1
        init_gold = self.player.gold
        init_xp = self.player.xp

        res = resolve_melee_attack(self.player, self.skeleton, self.rng)
        self.assertTrue(res.target_killed)
        self.assertGreater(res.xp_gained, 0)
        self.assertEqual(self.player.gold, init_gold + res.gold_gained)
        self.assertEqual(self.player.xp, init_xp + res.xp_gained)

    def test_level_up(self):
        init_lvl = self.player.level
        init_max_hp = self.player.max_hp
        leveled = self.player.add_xp(60)

        self.assertTrue(leveled)
        self.assertEqual(self.player.level, init_lvl + 1)
        self.assertGreater(self.player.max_hp, init_max_hp)

    def test_potion_healing(self):
        self.player.hp = 20
        potion = create_item("potion_health")
        self.assertIsNotNone(potion)
        self.player.inventory.append(potion)  # type: ignore[arg-type]

        idx = len(self.player.inventory) - 1
        success, msg = self.player.use_item(idx)
        self.assertTrue(success)
        self.assertGreater(self.player.hp, 20)

    def test_fireball_spell_consumes_mana(self):
        init_mana = self.player.mana
        res = cast_fireball(self.player, self.skeleton, self.rng)

        self.assertGreater(res.damage_dealt, 0)
        self.assertEqual(self.player.mana, init_mana - 10)

    def test_heal_spell(self):
        self.player.hp = 25
        init_mana = self.player.mana
        success, msg = cast_heal(self.player, self.rng)

        self.assertTrue(success)
        self.assertGreater(self.player.hp, 25)
        self.assertEqual(self.player.mana, init_mana - 8)


if __name__ == "__main__":
    unittest.main()
