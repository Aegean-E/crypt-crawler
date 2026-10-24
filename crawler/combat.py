"""Turn-based tactical combat resolution for Crypt-Crawler."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from crawler.entities import Entity, Item, Monster, Player, create_item


@dataclass
class CombatResult:
    damage_dealt: int
    is_critical: bool
    target_killed: bool
    xp_gained: int = 0
    gold_gained: int = 0
    loot_gained: Optional[Item] = None
    messages: List[str] = field(default_factory=list)


def resolve_melee_attack(
    attacker: Entity,
    defender: Entity,
    rng: Optional[random.Random] = None,
) -> CombatResult:
    """Resolve a turn-based melee attack between two entities."""
    if rng is None:
        rng = random.Random()

    is_player_atk = isinstance(attacker, Player)
    atk_val = attacker.effective_attack if is_player_atk else attacker.attack  # type: ignore[attr-defined]

    is_player_def = isinstance(defender, Player)
    def_val = defender.effective_defense if is_player_def else defender.defense  # type: ignore[attr-defined]

    base_damage = max(1, atk_val - def_val)
    # Variance ±20%
    variance = rng.uniform(0.8, 1.2)
    damage = max(1, int(base_damage * variance))

    # Critical hit check (15% for player, 5% for monster)
    crit_chance = 0.15 if is_player_atk else 0.05
    is_crit = rng.random() < crit_chance
    if is_crit:
        damage = int(damage * 1.5)

    actual_dmg = defender.take_damage(damage)
    killed = not defender.is_alive

    msgs: List[str] = []
    crit_txt = "CRITICAL HIT! " if is_crit else ""
    msgs.append(f"{attacker.name} strikes {defender.name} for {crit_txt}{actual_dmg} damage.")

    xp = 0
    gold = 0
    loot: Optional[Item] = None

    if killed:
        msgs.append(f"{defender.name} has fallen!")
        if isinstance(defender, Monster) and is_player_atk:
            xp = defender.xp_reward
            gold = defender.gold_reward
            player: Player = attacker  # type: ignore[assignment]
            player.gold += gold
            leveled = player.add_xp(xp)
            msgs.append(f"Gained {xp} XP and {gold} Gold.")
            if leveled:
                msgs.append(f"🌟 LEVEL UP! You reached Level {player.level}! Stats increased!")

            if defender.loot_drop and rng.random() < 0.6:
                dropped_item = create_item(defender.loot_drop)
                if dropped_item:
                    loot = dropped_item
                    if len(player.inventory) < player.max_slots:
                        player.inventory.append(dropped_item)
                        msgs.append(f"Found loot: {dropped_item.name}!")
                    else:
                        msgs.append(f"{dropped_item.name} dropped, but your inventory is full!")

    return CombatResult(
        damage_dealt=actual_dmg,
        is_critical=is_crit,
        target_killed=killed,
        xp_gained=xp,
        gold_gained=gold,
        loot_gained=loot,
        messages=msgs,
    )


def cast_fireball(
    player: Player,
    target: Monster,
    rng: Optional[random.Random] = None,
) -> CombatResult:
    """Cast Fireball spell costing 10 Mana."""
    if rng is None:
        rng = random.Random()

    mana_cost = 10
    if player.mana < mana_cost:
        return CombatResult(
            damage_dealt=0,
            is_critical=False,
            target_killed=False,
            messages=["Not enough mana to cast Fireball!"],
        )

    player.mana -= mana_cost
    base_dmg = rng.randint(22, 34)
    dmg = target.take_damage(base_dmg)
    killed = not target.is_alive

    msgs = [f"🔥 You cast Fireball at {target.name} for {dmg} fire damage!"]
    xp = 0
    gold = 0
    loot: Optional[Item] = None

    if killed:
        msgs.append(f"{target.name} was incinerated!")
        xp = target.xp_reward
        gold = target.gold_reward
        player.gold += gold
        leveled = player.add_xp(xp)
        msgs.append(f"Gained {xp} XP and {gold} Gold.")
        if leveled:
            msgs.append(f"🌟 LEVEL UP! You reached Level {player.level}!")
        if target.loot_drop and rng.random() < 0.6:
            dropped = create_item(target.loot_drop)
            if dropped and len(player.inventory) < player.max_slots:
                player.inventory.append(dropped)
                loot = dropped
                msgs.append(f"Found loot: {dropped.name}!")

    return CombatResult(
        damage_dealt=dmg,
        is_critical=False,
        target_killed=killed,
        xp_gained=xp,
        gold_gained=gold,
        loot_gained=loot,
        messages=msgs,
    )


def cast_heal(
    player: Player,
    rng: Optional[random.Random] = None,
) -> Tuple[bool, str]:
    """Cast Divine Healing spell costing 8 Mana."""
    if rng is None:
        rng = random.Random()

    mana_cost = 8
    if player.mana < mana_cost:
        return False, "Not enough mana to cast Divine Healing!"

    player.mana -= mana_cost
    heal_amt = rng.randint(20, 30)
    restored = player.heal(heal_amt)
    return True, f"✨ Chanted sacred words: restored {restored} HP!"
