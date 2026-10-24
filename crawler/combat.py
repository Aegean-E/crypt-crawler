"""Turn-based tactical combat resolution for Crypt-Crawler."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

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
    variance = rng.uniform(0.85, 1.15)
    damage = max(1, int(base_damage * variance))

    # Critical hit check (uses player's class & gear crit chance, 5% for monsters)
    if is_player_atk:
        crit_chance = getattr(attacker, "effective_crit_chance", 0.15)
    else:
        crit_chance = 0.05
    is_crit = rng.random() < crit_chance
    if is_crit:
        damage = int(damage * 1.5)

    actual_dmg = defender.take_damage(damage)
    killed = not defender.is_alive

    msgs: List[str] = []
    crit_txt = "CRITICAL HIT! " if is_crit else ""
    msgs.append(f"{attacker.name} strikes {defender.name} for {crit_txt}{actual_dmg} damage.")

    # Status effect on hit
    if not killed and isinstance(attacker, Monster) and attacker.monster_type == "spider":
        if rng.random() < 0.5:
            defender.apply_status("poison", 3)
            msgs.append(f"⚠️ Venom coursed into {defender.name}! Afflicted with Poison!")

    # Champion monster traits
    if isinstance(attacker, Monster) and attacker.champion_affix == "Vampiric":
        healed = attacker.heal(3)
        if healed > 0:
            msgs.append(f"🩸 {attacker.name} drained vital essence (+{healed} HP)!")

    if not killed and isinstance(defender, Monster) and defender.champion_affix == "Molten" and is_player_atk:
        recoil = attacker.take_damage(2)
        msgs.append(f"🔥 Molten aura scorched {attacker.name} for {recoil} burn damage!")

    if not killed and is_player_atk:
        player: Player = attacker  # type: ignore[assignment]
        eq_weapon = player.equipped.get("weapon")
        if eq_weapon and eq_weapon.stats.get("poison_chance", 0) > 0:
            if rng.random() < (eq_weapon.stats["poison_chance"] / 100.0):
                defender.apply_status("poison", 3)
                msgs.append(f"Serpent venom infected {defender.name}!")

    xp = 0
    gold = 0
    loot: Optional[Item] = None

    if killed:
        if isinstance(defender, Monster) and defender.is_champion:
            msgs.append(f"🏆 CHAMPION SLAIN! Slew {defender.name}!")
        msgs.append(f"{defender.name} has fallen!")
        if isinstance(defender, Monster) and is_player_atk:
            xp = defender.xp_reward
            gold = defender.gold_reward
            player_hero: Player = attacker  # type: ignore[assignment]
            player_hero.gold += gold
            leveled = player_hero.add_xp(xp)
            msgs.append(f"Gained {xp} XP and {gold} Gold.")
            if leveled:
                msgs.append(f"🌟 LEVEL UP! You reached Level {player_hero.level}! Stats increased!")

            if defender.loot_drop and (defender.is_boss or rng.random() < 0.65):
                dropped_item = create_item(defender.loot_drop)
                if dropped_item:
                    loot = dropped_item
                    if len(player_hero.inventory) < player_hero.max_slots:
                        player_hero.inventory.append(dropped_item)
                        msgs.append(f"Found loot: {dropped_item.name} ({dropped_item.rarity.upper()})!")
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


def shield_bash(
    player: Player,
    target: Monster,
    rng: Optional[random.Random] = None,
) -> CombatResult:
    """Perform a crushing shield bash costing 4 Mana, dealing physical damage and stunning for 1 turn."""
    if rng is None:
        rng = random.Random()

    mana_cost = 4
    if player.mana < mana_cost:
        return CombatResult(
            damage_dealt=0,
            is_critical=False,
            target_killed=False,
            messages=["Not enough mana to Shield Bash! (Needs 4 MP)"],
        )

    player.mana -= mana_cost
    base_dmg = max(2, int(player.effective_attack * 0.75) - target.defense)
    dmg = target.take_damage(base_dmg)
    killed = not target.is_alive

    msgs = [f"🛡️ You slammed {target.name} with your shield for {dmg} damage!"]
    if not killed:
        target.apply_status("stun", 1)
        msgs.append(f"💫 {target.name} was stunned by the impact!")

    xp = 0
    gold = 0
    loot: Optional[Item] = None

    if killed:
        msgs.append(f"{target.name} was crushed!")
        xp = target.xp_reward
        gold = target.gold_reward
        player.gold += gold
        leveled = player.add_xp(xp)
        msgs.append(f"Gained {xp} XP and {gold} Gold.")
        if leveled:
            msgs.append(f"🌟 LEVEL UP! You reached Level {player.level}!")
        if target.loot_drop and (target.is_boss or rng.random() < 0.65):
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


def shield_wall(player: Player) -> Tuple[bool, str]:
    """Raise defensive guard (+6 DEF for 4 turns), costing 6 Mana."""
    mana_cost = 6
    if player.mana < mana_cost:
        return False, "Not enough mana to raise Shield Wall! (Needs 6 MP)"

    player.mana -= mana_cost
    player.apply_status("shield_wall", 4)
    return True, "🛡️ Raised Shield Wall! Defense boosted by +6 for 4 turns."


def cast_fireball(
    player: Player,
    target: Monster,
    rng: Optional[random.Random] = None,
) -> CombatResult:
    """Cast Fireball spell costing 10 Mana, dealing direct damage and applying Burn."""
    if rng is None:
        rng = random.Random()

    mana_cost = 10
    if player.mana < mana_cost:
        return CombatResult(
            damage_dealt=0,
            is_critical=False,
            target_killed=False,
            messages=["Not enough mana to cast Fireball! (Needs 10 MP)"],
        )

    player.mana -= mana_cost
    base_dmg = rng.randint(24, 36)
    dmg = target.take_damage(base_dmg)
    killed = not target.is_alive

    msgs = [f"🔥 You cast Fireball at {target.name} for {dmg} fire damage!"]
    if not killed and rng.random() < 0.7:
        target.apply_status("burn", 3)
        msgs.append(f"🔥 {target.name} caught fire and is burning!")

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
        if target.loot_drop and (target.is_boss or rng.random() < 0.65):
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
    """Cast Divine Healing spell costing 8 Mana, restoring HP and cleansing negative statuses."""
    if rng is None:
        rng = random.Random()

    mana_cost = 8
    if player.mana < mana_cost:
        return False, "Not enough mana to cast Divine Healing! (Needs 8 MP)"

    player.mana -= mana_cost
    heal_amt = rng.randint(24, 34)
    restored = player.heal(heal_amt)

    # Cleanse poison and burn
    cleansed = []
    if player.status_effects.pop("poison", None) is not None:
        cleansed.append("Poison")
    if player.status_effects.pop("burn", None) is not None:
        cleansed.append("Burn")

    cl_msg = f" (Cleansed {', '.join(cleansed)})" if cleansed else ""
    return True, f"✨ Sacred light restored {restored} HP{cl_msg}!"


def shadow_strike(
    player: Player,
    target: Monster,
    rng: Optional[random.Random] = None,
) -> CombatResult:
    """Execute a precision sneak attack costing 4 Mana with +40% Crit Chance and venom."""
    if rng is None:
        rng = random.Random()

    mana_cost = 4
    if player.mana < mana_cost:
        return CombatResult(
            damage_dealt=0,
            is_critical=False,
            target_killed=False,
            messages=["Not enough mana to Shadow Strike! (Needs 4 MP)"],
        )

    player.mana -= mana_cost
    crit_chance = min(0.95, player.effective_crit_chance + 0.40)
    is_crit = rng.random() < crit_chance

    base_dmg = max(3, player.effective_attack - target.defense)
    damage = int(base_dmg * (1.8 if is_crit else 1.2))
    dmg = target.take_damage(damage)
    killed = not target.is_alive

    msgs = []
    crit_label = "CRITICAL LETHAL STRIKE! " if is_crit else ""
    msgs.append(f"🗡️ You plunged your shadow blade into {target.name} for {crit_label}{dmg} damage!")

    if not killed and rng.random() < 0.6:
        target.apply_status("poison", 3)
        msgs.append(f"☠️ {target.name} was afflicted with deadly shadow venom!")

    xp = 0
    gold = 0
    loot: Optional[Item] = None
    if killed:
        msgs.append(f"{target.name} collapsed into shadows!")
        xp = target.xp_reward
        gold = target.gold_reward
        player.gold += gold
        leveled = player.add_xp(xp)
        msgs.append(f"Gained {xp} XP and {gold} Gold.")
        if leveled:
            msgs.append(f"🌟 LEVEL UP! You reached Level {player.level}!")
        if target.loot_drop and (target.is_boss or rng.random() < 0.65):
            dropped = create_item(target.loot_drop)
            if dropped and len(player.inventory) < player.max_slots:
                player.inventory.append(dropped)
                loot = dropped
                msgs.append(f"Found loot: {dropped.name}!")

    return CombatResult(
        damage_dealt=dmg,
        is_critical=is_crit,
        target_killed=killed,
        xp_gained=xp,
        gold_gained=gold,
        loot_gained=loot,
        messages=msgs,
    )


def smoke_bomb(
    player: Player,
    monsters: List[Monster],
    radius: int = 2,
) -> Tuple[bool, str, List[Monster]]:
    """Toss a blinding smoke canister costing 6 Mana, stunning all nearby foes for 2 turns."""
    mana_cost = 6
    if player.mana < mana_cost:
        return False, "Not enough mana to toss Smoke Bomb! (Needs 6 MP)", []

    player.mana -= mana_cost
    affected: List[Monster] = []
    for m in monsters:
        if m.hp > 0:
            dist = max(abs(m.x - player.x), abs(m.y - player.y))
            if dist <= radius:
                m.apply_status("stun", 2)
                affected.append(m)

    if affected:
        names = ", ".join(m.name for m in affected)
        return True, f"💨 Dense smoke enveloped the area! {names} stunned for 2 turns!", affected
    return True, "💨 Smoke billowed out, but no foes were caught in the blast.", []


def frost_nova(
    player: Player,
    target: Monster,
    rng: Optional[random.Random] = None,
) -> CombatResult:
    """Blast an enemy with sub-zero frost costing 6 Mana, dealing cold damage and freezing (stun) for 2 turns."""
    if rng is None:
        rng = random.Random()

    mana_cost = 6
    if player.mana < mana_cost:
        return CombatResult(
            damage_dealt=0,
            is_critical=False,
            target_killed=False,
            messages=["Not enough mana to cast Frost Nova! (Needs 6 MP)"],
        )

    player.mana -= mana_cost
    base_dmg = rng.randint(16, 24)
    dmg = target.take_damage(base_dmg)
    killed = not target.is_alive

    msgs = [f"❄️ Glacial frost blasted {target.name} for {dmg} cold damage!"]
    if not killed:
        target.apply_status("stun", 2)
        msgs.append(f"🧊 {target.name} is frozen solid for 2 turns!")

    xp = 0
    gold = 0
    loot: Optional[Item] = None
    if killed:
        msgs.append(f"{target.name} shattered into ice shards!")
        xp = target.xp_reward
        gold = target.gold_reward
        player.gold += gold
        leveled = player.add_xp(xp)
        msgs.append(f"Gained {xp} XP and {gold} Gold.")
        if leveled:
            msgs.append(f"🌟 LEVEL UP! You reached Level {player.level}!")
        if target.loot_drop and (target.is_boss or rng.random() < 0.65):
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


def arcane_nova(
    player: Player,
    monsters: List[Monster],
    radius: int = 3,
    rng: Optional[random.Random] = None,
) -> Tuple[bool, List[CombatResult], str]:
    """Pulse cataclysmic arcane waves in a 3-tile radius costing 10 Mana, dealing heavy magic damage to all foes."""
    if rng is None:
        rng = random.Random()

    mana_cost = 10
    if player.mana < mana_cost:
        return False, [], "Not enough mana to cast Arcane Nova! (Needs 10 MP)"

    player.mana -= mana_cost
    results: List[CombatResult] = []
    hit_names: List[str] = []

    for m in monsters:
        if m.hp > 0:
            dist = max(abs(m.x - player.x), abs(m.y - player.y))
            if dist <= radius:
                dmg = m.take_damage(rng.randint(20, 32))
                killed = not m.is_alive
                hit_names.append(m.name)
                xp = 0
                gold = 0
                loot = None
                msgs = [f"🔮 Arcane wave pulsed through {m.name} for {dmg} arcane damage!"]
                if killed:
                    msgs.append(f"{m.name} was obliterated!")
                    xp = m.xp_reward
                    gold = m.gold_reward
                    player.gold += gold
                    leveled = player.add_xp(xp)
                    if leveled:
                        msgs.append(f"🌟 LEVEL UP! You reached Level {player.level}!")
                    if m.loot_drop and (m.is_boss or rng.random() < 0.65):
                        dropped = create_item(m.loot_drop)
                        if dropped and len(player.inventory) < player.max_slots:
                            player.inventory.append(dropped)
                            loot = dropped
                results.append(
                    CombatResult(
                        damage_dealt=dmg,
                        is_critical=False,
                        target_killed=killed,
                        xp_gained=xp,
                        gold_gained=gold,
                        loot_gained=loot,
                        messages=msgs,
                    )
                )

    summary = (
        f"🔮 Arcane Nova pulsed! Hit {len(results)} enemies: {', '.join(hit_names)}."
        if results
        else "🔮 Arcane Nova pulsed into empty corridors."
    )
    return True, results, summary
