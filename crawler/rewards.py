"""Variable-ratio reward engine, dopamine loot schedules, and near-miss mechanics for Crypt-Crawler.

Adapted from behavioral game design principles (Skinner box variable-ratio schedules,
Clark et al. near-miss striatal activation, and Zeigarnik effect incomplete task tension).
"""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Tuple


class RewardType:
    STANDARD = "STANDARD"
    CRITICAL_JACKPOT = "CRITICAL_JACKPOT"
    RARE_RELIC_DROP = "RARE_RELIC_DROP"


EXPLOIT_RELIC_DROPS = [
    "potion_rejuvenation",
    "ring_shadow",
    "potion_elixir_str",
    "potion_elixir_def",
    "shield_tower",
]


def roll_chest_reward(depth: int = 1, rng: Optional[random.Random] = None) -> Tuple[int, str, Optional[str], str]:
    """Calculate variable-ratio reward payout and drops for opening chests (Skinner box reinforcement schedule).

    Returns: (gold_awarded, reward_description, optional_item_id, reward_type)
    """
    if rng is None:
        rng = random.Random()

    base_gold = 18 + rng.randint(0, 14) + (depth - 1) * 10

    roll = rng.random()

    # 15% Chance: Rare Relic Artifact Drop
    if roll < 0.15:
        drop_id = rng.choice(EXPLOIT_RELIC_DROPS)
        desc = "★ ANCIENT RELIC CACHE UNLOCKED! Discovered hidden artifact!"
        return base_gold, desc, drop_id, RewardType.RARE_RELIC_DROP

    # 20% Chance: Critical Gold Jackpot (2.5x payout)
    if roll < 0.35:
        jackpot_gold = int(base_gold * 2.5)
        desc = f"★★★ CRITICAL TREASURE JACKPOT! 2.5X PAYOUT (+{jackpot_gold} Gold) ★★★"
        return jackpot_gold, desc, None, RewardType.CRITICAL_JACKPOT

    # 65% Chance: Standard Payout
    return base_gold, f"Recovered dungeon chest coins (+{base_gold} Gold).", None, RewardType.STANDARD


def roll_urn_reward(depth: int = 1, rng: Optional[random.Random] = None) -> Tuple[int, str, bool]:
    """Variable-ratio coin and surprise relic payout when shattering burial urns."""
    if rng is None:
        rng = random.Random()

    base_gold = 6 + rng.randint(0, 10) + (depth - 1) * 4
    roll = rng.random()

    # 15% Chance: Critical Urn Jackpot (2.5x)
    if roll < 0.15:
        jackpot = int(base_gold * 2.5)
        return jackpot, f"✨ CRITICAL URN JACKPOT! (+{jackpot} Gold)!", True

    return base_gold, f"Shattered burial urn (+{base_gold} Gold).", False


def check_near_miss_survival(current_hp: int, max_hp: int, damage_taken: int) -> Optional[Dict[str, Any]]:
    """Near-miss feedback engine (Clark et al. 2009).

    Surviving a near-fatal blow (remaining HP <= 25% of max HP after taking heavy damage)
    triggers an adrenaline surge, converting near-death loss aversion into an intense dopamine rush.
    """
    if current_hp <= 0:
        return None

    hp_ratio = current_hp / max(1, max_hp)
    if hp_ratio <= 0.28 and damage_taken >= 6:
        # Near-miss triggered
        return {
            "type": "NEAR_MISS_SURGE",
            "hp_remaining": current_hp,
            "message": "⚡ NEAR-MISS ADRENALINE SURGE! Stared death in the eyes and stood firm (+2 MP, +4 DEF barrier)!",
            "bonus_mana": 2,
            "bonus_def": 4,
            "duration": 3,
        }
    return None


def generate_dungeon_bounties(depth: int = 1, seed: Optional[int] = None) -> List[Dict[str, Any]]:
    """Generate 3 active contract bounties per floor (Zeigarnik Effect).

    Incomplete objectives create persistent engagement tension that drives exploration.
    """
    actual_seed = 42 if seed is None else seed
    rng = random.Random(actual_seed + depth * 31337)
    all_bounties = [
        {
            "id": "bounty_urns",
            "title": "Catacomb Purifier",
            "desc": "Shatter 3 Burial Urns in the depths",
            "target": 3,
            "progress": 0,
            "completed": False,
            "reward_gold": 25 + depth * 10,
            "reward_xp": 20 + depth * 5,
        },
        {
            "id": "bounty_streak",
            "title": "Frenzy of Blades",
            "desc": "Achieve a x3 Kill Streak in rapid combat",
            "target": 3,
            "progress": 0,
            "completed": False,
            "reward_gold": 35 + depth * 10,
            "reward_xp": 30 + depth * 5,
        },
        {
            "id": "bounty_champions",
            "title": "Champion Slayer",
            "desc": "Defeat an Elite Champion monster",
            "target": 1,
            "progress": 0,
            "completed": False,
            "reward_gold": 45 + depth * 15,
            "reward_xp": 40 + depth * 10,
        },
        {
            "id": "bounty_chests",
            "title": "Vault Plunderer",
            "desc": "Unlock 2 Hidden Treasure Chests",
            "target": 2,
            "progress": 0,
            "completed": False,
            "reward_gold": 30 + depth * 10,
            "reward_xp": 25 + depth * 5,
        },
        {
            "id": "bounty_shrine",
            "title": "Divine Reverence",
            "desc": "Pray at an Ancient Shrine for blessing",
            "target": 1,
            "progress": 0,
            "completed": False,
            "reward_gold": 20 + depth * 5,
            "reward_xp": 20 + depth * 5,
        },
    ]

    selected = rng.sample(all_bounties, 3)
    return selected
