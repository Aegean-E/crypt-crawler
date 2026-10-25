"""Unit tests for combat, leveling and inventory management."""

import random
import unittest

from crawler.combat import (
    arcane_nova,
    cast_fireball,
    cast_heal,
    frost_nova,
    resolve_melee_attack,
    shadow_strike,
    shield_bash,
    shield_wall,
    smoke_bomb,
)
from crawler.entities import ITEM_CATALOG, MERCHANT_STOCK, Monster, Player, create_item, spawn_monster


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

    def test_heal_spell_and_cleansing(self):
        self.player.hp = 25
        self.player.apply_status("poison", 3)
        init_mana = self.player.mana
        success, msg = cast_heal(self.player, self.rng)

        self.assertTrue(success)
        self.assertGreater(self.player.hp, 25)
        self.assertEqual(self.player.mana, init_mana - 8)
        self.assertNotIn("poison", self.player.status_effects)

    def test_shield_bash_stuns_target(self):
        init_mana = self.player.mana
        res = shield_bash(self.player, self.skeleton, self.rng)
        self.assertGreater(res.damage_dealt, 0)
        self.assertEqual(self.player.mana, init_mana - 4)
        self.assertTrue(self.skeleton.is_stunned)

    def test_shield_wall_buff(self):
        init_def = self.player.effective_defense
        success, msg = shield_wall(self.player)
        self.assertTrue(success)
        self.assertEqual(self.player.effective_defense, init_def + 6)

    def test_status_effects_tick(self):
        self.player.hp = 50
        self.player.apply_status("poison", 2)
        msgs = self.player.tick_status_effects()
        self.assertEqual(self.player.hp, 46)
        self.assertEqual(self.player.status_effects["poison"], 1)

    def test_hero_classes_and_crit_chance(self):
        rogue = Player(name="Lyra", hero_class="rogue")
        self.assertEqual(rogue.hero_class, "rogue")
        self.assertEqual(rogue.base_crit_chance, 0.30)
        self.assertGreaterEqual(rogue.effective_crit_chance, 0.30)

        mage = Player(name="Ignis", hero_class="mage")
        self.assertEqual(mage.hero_class, "mage")
        self.assertEqual(mage.max_mana, 55)

    def test_permanent_stat_elixirs(self):
        init_atk = self.player.attack
        init_def = self.player.defense
        str_potion = create_item("potion_elixir_str")
        def_potion = create_item("potion_elixir_def")
        self.assertIsNotNone(str_potion)
        self.assertIsNotNone(def_potion)

        self.player.inventory.append(str_potion)  # type: ignore[arg-type]
        used_str, msg_str = self.player.use_item(len(self.player.inventory) - 1)
        self.assertTrue(used_str)
        self.assertEqual(self.player.attack, init_atk + 2)

        self.player.inventory.append(def_potion)  # type: ignore[arg-type]
        used_def, msg_def = self.player.use_item(len(self.player.inventory) - 1)
        self.assertTrue(used_def)
        self.assertEqual(self.player.defense, init_def + 2)

        self.assertEqual(self.player.perm_attack, 2)
        self.assertEqual(self.player.perm_defense, 2)
        p_dict = self.player.to_dict()
        self.assertEqual(p_dict["perm_attack"], 2)
        self.assertEqual(p_dict["perm_defense"], 2)

    def test_shadow_strike_and_smoke_bomb(self):
        rogue = Player(name="Lyra", hero_class="rogue")
        res = shadow_strike(rogue, self.skeleton, self.rng)
        self.assertGreater(res.damage_dealt, 0)
        self.assertEqual(rogue.mana, 25 - 4)

        # Smoke bomb
        m1 = Monster("M1", "goblin", 1, 1, 10, 3, 1, 10, 5)
        m2 = Monster("M2", "bat", 10, 10, 5, 2, 0, 5, 2)
        rogue.x, rogue.y = 0, 0
        success, msg, affected = smoke_bomb(rogue, [m1, m2], radius=2)
        self.assertTrue(success)
        self.assertIn(m1, affected)
        self.assertNotIn(m2, affected)
        self.assertTrue(m1.is_stunned)

    def test_arcane_nova_and_frost_nova(self):
        mage = Player(name="Ignis", hero_class="mage")
        # Frost Nova
        res_frost = frost_nova(mage, self.skeleton, self.rng)
        self.assertGreater(res_frost.damage_dealt, 0)
        self.assertTrue(self.skeleton.is_stunned)
        self.assertEqual(mage.mana, 55 - 6)

        # Arcane Nova
        m1 = Monster("M1", "goblin", 1, 0, 20, 3, 1, 10, 5)
        m2 = Monster("M2", "skeleton", 0, 1, 20, 4, 1, 10, 5)
        mage.x, mage.y = 0, 0
        success, results, summary = arcane_nova(mage, [m1, m2], radius=3, rng=self.rng)
        self.assertTrue(success)
        self.assertEqual(len(results), 2)
        self.assertLess(m1.hp, 20)
        self.assertLess(m2.hp, 20)

    def test_champion_monsters_and_affixes(self):
        champ = spawn_monster("skeleton", 3, 3, depth=1, is_champion=True, champion_affix="Molten")
        self.assertTrue(champ.is_champion)
        self.assertEqual(champ.champion_affix, "Molten")
        self.assertIn("Molten", champ.name)
        self.assertGreater(champ.max_hp, 20)
        self.assertGreater(champ.gold_reward, 10)

        # Molten recoil test
        init_player_hp = self.player.hp
        res = resolve_melee_attack(self.player, champ, self.rng)
        self.assertGreater(res.damage_dealt, 0)
        # Player took 2 burn damage from Molten aura
        self.assertEqual(self.player.hp, init_player_hp - 2)

        # Vampiric leech test
        vamp = spawn_monster("goblin", 3, 3, depth=1, is_champion=True, champion_affix="Vampiric")
        vamp.hp = 10
        res_vamp = resolve_melee_attack(vamp, self.player, self.rng)
        self.assertEqual(vamp.hp, 13)

    def test_expanded_equipment_slots_and_unequip(self):
        amulet = create_item("amulet_bloodstone")
        boots = create_item("boots_shadowstep")
        hammer = create_item("hammer_thunder")
        self.assertIsNotNone(amulet)
        self.assertIsNotNone(boots)
        self.assertIsNotNone(hammer)

        base_atk = self.player.effective_attack
        base_def = self.player.effective_defense
        base_hp = self.player.effective_max_hp
        base_crit = self.player.effective_crit_chance

        # Equip amulet and boots
        self.player.equip(amulet)
        self.player.equip(boots)
        self.assertEqual(self.player.equipped["amulet"], amulet)
        self.assertEqual(self.player.equipped["boots"], boots)
        self.assertEqual(self.player.effective_attack, base_atk + 2)
        self.assertEqual(self.player.effective_defense, base_def + 2)
        self.assertEqual(self.player.effective_max_hp, base_hp + 18)
        self.assertAlmostEqual(self.player.effective_crit_chance, base_crit + 0.10)

        # Equip weapon
        self.player.equip(hammer)
        self.assertEqual(self.player.equipped["weapon"], hammer)
        self.assertEqual(self.player.effective_attack, base_atk + 2 + 13)

        # Unequip boots
        un_ok = self.player.unequip("boots")
        self.assertTrue(un_ok)
        self.assertIsNone(self.player.equipped["boots"])
        self.assertIn(boots, self.player.inventory)
        self.assertEqual(self.player.effective_defense, base_def)

        # Fill inventory to max_slots and test unequip failure
        while len(self.player.inventory) < self.player.max_slots:
            self.player.inventory.append(create_item("potion_health"))
        self.assertFalse(self.player.unequip("amulet"))
        self.assertIsNotNone(self.player.equipped["amulet"])

    def test_weapon_stun_proc_stuns_target(self):
        hammer = create_item("hammer_thunder")
        self.assertIsNotNone(hammer)
        hammer.stats["stun_chance"] = 100
        self.player.equip(hammer)  # type: ignore[arg-type]
        self.skeleton.hp = 1000

        res = resolve_melee_attack(self.player, self.skeleton, self.rng)

        self.assertTrue(self.skeleton.is_stunned)
        self.assertTrue(any("stunned" in msg for msg in res.messages))

    def test_weapon_poison_proc_uses_weapon_stats_and_name(self):
        dagger = create_item("dagger_poison")
        self.assertIsNotNone(dagger)
        dagger.stats["poison_chance"] = 100
        dagger.name = "Custom Fang"
        self.player.equip(dagger)  # type: ignore[arg-type]
        self.skeleton.hp = 1000

        res = resolve_melee_attack(self.player, self.skeleton, self.rng)

        self.assertEqual(self.skeleton.status_effects.get("poison"), 3)
        self.assertTrue(any("Custom Fang" in msg for msg in res.messages))

    def test_expanded_catalog_merchant_stock_and_save_slots(self):
        expanded_ids = [
            "amulet_bloodstone",
            "boots_shadowstep",
            "tome_pyromancy",
            "hammer_thunder",
            "cloak_ethereal",
            "potion_invulnerability",
        ]
        for item_id in expanded_ids:
            with self.subTest(item_id=item_id):
                self.assertIn(item_id, ITEM_CATALOG)
                item = create_item(item_id)
                self.assertIsNotNone(item)
                self.assertEqual(item.item_id, item_id)
                self.assertIn(item.item_type, ("weapon", "armor", "amulet", "boots", "potion"))

        stocked_ids = {entry["item_id"] for entry in MERCHANT_STOCK}
        self.assertTrue(set(expanded_ids) <= stocked_ids)

        saved = self.player.to_dict()
        self.assertIsNone(saved["equipped"]["amulet"])
        self.assertIsNone(saved["equipped"]["boots"])

    def test_divine_aegis_draught_potion(self):
        pot = create_item("potion_invulnerability")
        self.player.inventory.append(pot)
        idx = self.player.inventory.index(pot)
        base_def = self.player.effective_defense
        ok, msg = self.player.use_item(idx)
        self.assertTrue(ok)
        self.assertIn("Barrier", msg)
        self.assertEqual(self.player.status_effects.get("shield_wall"), 4)
        self.assertEqual(self.player.effective_defense, base_def + 6)


if __name__ == "__main__":
    unittest.main()
