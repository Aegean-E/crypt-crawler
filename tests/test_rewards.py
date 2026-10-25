"""Unit tests for the variable-ratio reward engine and dopamine loot schedules."""

import random
import unittest

from crawler.rewards import (
    RewardType,
    check_near_miss_survival,
    generate_dungeon_bounties,
    roll_chest_reward,
    roll_urn_reward,
)


class TestRewards(unittest.TestCase):
    def test_roll_chest_reward_determinism(self):
        rng = random.Random(42)
        gold, desc, item, reward_type = roll_chest_reward(depth=1, rng=rng)
        self.assertGreater(gold, 0)
        self.assertIn(reward_type, [RewardType.STANDARD, RewardType.CRITICAL_JACKPOT, RewardType.RARE_RELIC_DROP])

    def test_roll_chest_reward_jackpot(self):
        # Find a seed that produces jackpot
        found_jackpot = False
        for s in range(50):
            rng = random.Random(s)
            gold, desc, item, rtype = roll_chest_reward(depth=1, rng=rng)
            if rtype == RewardType.CRITICAL_JACKPOT:
                found_jackpot = True
                self.assertIn("JACKPOT", desc)
                self.assertGreater(gold, 35)
                break
        self.assertTrue(found_jackpot)

    def test_roll_urn_reward(self):
        rng = random.Random(10)
        gold, desc, is_crit = roll_urn_reward(depth=1, rng=rng)
        self.assertGreater(gold, 0)
        self.assertIsInstance(is_crit, bool)

    def test_near_miss_survival(self):
        # Current HP <= 25% of Max HP with heavy damage
        res = check_near_miss_survival(current_hp=10, max_hp=50, damage_taken=12)
        self.assertIsNotNone(res)
        self.assertEqual(res["type"], "NEAR_MISS_SURGE")
        self.assertGreater(res["bonus_mana"], 0)

        # High HP: no near miss
        res_safe = check_near_miss_survival(current_hp=45, max_hp=50, damage_taken=5)
        self.assertIsNone(res_safe)

        # Zero HP: player is dead, no surge
        res_dead = check_near_miss_survival(current_hp=0, max_hp=50, damage_taken=20)
        self.assertIsNone(res_dead)

    def test_generate_dungeon_bounties(self):
        bounties = generate_dungeon_bounties(depth=1, seed=123)
        self.assertEqual(len(bounties), 3)
        for b in bounties:
            self.assertIn("id", b)
            self.assertIn("title", b)
            self.assertIn("reward_gold", b)
            self.assertGreater(b["target"], 0)
            self.assertEqual(b["progress"], 0)
            self.assertFalse(b["completed"])


if __name__ == "__main__":
    unittest.main()
