"""Entities, items, inventory and stats for Crypt-Crawler."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Item:
    item_id: str
    name: str
    item_type: str  # 'weapon', 'armor', 'ring', 'potion', 'scroll'
    value: int
    description: str
    stats: Dict[str, int] = field(default_factory=dict)
    rarity: str = "common"  # 'common', 'rare', 'legendary'

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.item_id,
            "name": self.name,
            "type": self.item_type,
            "value": self.value,
            "description": self.description,
            "stats": self.stats,
            "rarity": self.rarity,
        }


ITEM_CATALOG: Dict[str, Dict[str, Any]] = {
    "potion_health": {
        "name": "Health Elixir",
        "type": "potion",
        "value": 15,
        "description": "Restores 35 Hit Points instantly.",
        "stats": {"heal_hp": 35},
        "rarity": "common",
    },
    "potion_mana": {
        "name": "Aether Potion",
        "type": "potion",
        "value": 15,
        "description": "Restores 25 Mana points instantly.",
        "stats": {"restore_mana": 25},
        "rarity": "common",
    },
    "potion_rejuvenation": {
        "name": "Draught of Rejuvenation",
        "type": "potion",
        "value": 35,
        "description": "Restores 30 HP and 20 Mana, cleansing negative afflictions.",
        "stats": {"heal_hp": 30, "restore_mana": 20},
        "rarity": "rare",
    },
    "scroll_fireball": {
        "name": "Scroll of Inferno",
        "type": "scroll",
        "value": 30,
        "description": "Unleashes a burst of flame dealing 30 damage.",
        "stats": {"spell_damage": 30, "spell_type": "fire"},
        "rarity": "common",
    },
    "scroll_nova": {
        "name": "Scroll of Arcane Nova",
        "type": "scroll",
        "value": 55,
        "description": "Pulses arcane shockwaves across the chamber.",
        "stats": {"spell_damage": 22, "spell_type": "arcane"},
        "rarity": "rare",
    },
    "sword_iron": {
        "name": "Forged Iron Sword",
        "type": "weapon",
        "value": 25,
        "description": "Sturdy blade crafted by crypt smiths (+4 ATK).",
        "stats": {"attack": 4},
        "rarity": "common",
    },
    "sword_runic": {
        "name": "Runic Claymore",
        "type": "weapon",
        "value": 75,
        "description": "Glows with ancient runes (+10 ATK).",
        "stats": {"attack": 10},
        "rarity": "rare",
    },
    "dagger_poison": {
        "name": "Serpent's Fang Dagger",
        "type": "weapon",
        "value": 60,
        "description": "Coated in deadly spider venom (+5 ATK, poisons on strike).",
        "stats": {"attack": 5, "poison_chance": 40},
        "rarity": "rare",
    },
    "armor_leather": {
        "name": "Hardened Leather Armor",
        "type": "armor",
        "value": 20,
        "description": "Light, flexible armor offering basic protection (+2 DEF).",
        "stats": {"defense": 2},
        "rarity": "common",
    },
    "armor_plate": {
        "name": "Knightly Plate Mail",
        "type": "armor",
        "value": 65,
        "description": "Heavy steel plates deflecting lethal blows (+6 DEF).",
        "stats": {"defense": 6},
        "rarity": "rare",
    },
    "shield_tower": {
        "name": "Aegis Tower Shield",
        "type": "armor",
        "value": 80,
        "description": "Massive dwarven bulwark (+8 DEF).",
        "stats": {"defense": 8},
        "rarity": "rare",
    },
    "ring_vitality": {
        "name": "Ring of Vitality",
        "type": "ring",
        "value": 50,
        "description": "Imbues the wearer with constitution (+20 Max HP).",
        "stats": {"max_hp": 20},
        "rarity": "common",
    },
    "ring_power": {
        "name": "Ring of Arcane Might",
        "type": "ring",
        "value": 70,
        "description": "Amplifies physical and magical force (+3 ATK, +10 Max Mana).",
        "stats": {"attack": 3, "max_mana": 10},
        "rarity": "rare",
    },
    "ring_shadow": {
        "name": "Band of the Shadowstalker",
        "type": "ring",
        "value": 85,
        "description": "Hones reflexes for lethal precision (+15% Crit Rate, +3 ATK).",
        "stats": {"attack": 3, "crit_bonus": 15},
        "rarity": "rare",
    },
    "staff_arcane": {
        "name": "Staff of Arcane Focus",
        "type": "weapon",
        "value": 45,
        "description": "Ancient ash wood staff channeling raw arcane energy (+5 ATK, +15 Max Mana).",
        "stats": {"attack": 5, "max_mana": 15},
        "rarity": "common",
    },
    "robe_mystic": {
        "name": "Runed Silk Robe",
        "type": "armor",
        "value": 35,
        "description": "Woven with protective ley-threads (+2 DEF, +10 Max Mana).",
        "stats": {"defense": 2, "max_mana": 10},
        "rarity": "common",
    },
    "potion_elixir_str": {
        "name": "Elixir of the Titan",
        "type": "potion",
        "value": 60,
        "description": "Permanently increases base Attack by +2.",
        "stats": {"perm_attack": 2},
        "rarity": "rare",
    },
    "potion_elixir_def": {
        "name": "Elixir of Ironhide",
        "type": "potion",
        "value": 60,
        "description": "Permanently increases base Defense by +2.",
        "stats": {"perm_defense": 2},
        "rarity": "rare",
    },
    "crown_eternity": {
        "name": "Crown of Eternity",
        "type": "ring",
        "value": 250,
        "description": "Ancient imperial relic of the Lich King (+25 Max HP, +15 Max MP, +5 ATK, +3 DEF).",
        "stats": {"max_hp": 25, "max_mana": 15, "attack": 5, "defense": 3},
        "rarity": "legendary",
    },
    "amulet_bloodstone": {
        "name": "Bloodstone Talisman",
        "type": "amulet",
        "value": 65,
        "description": "Crimson gem pulsing with sanguine vitality (+18 Max HP, +2 ATK).",
        "stats": {"max_hp": 18, "attack": 2},
        "rarity": "rare",
    },
    "boots_shadowstep": {
        "name": "Shadowstep Treads",
        "type": "boots",
        "value": 55,
        "description": "Whisper-quiet spider-silk boots (+2 DEF, +10% Crit Rate).",
        "stats": {"defense": 2, "crit_bonus": 10},
        "rarity": "rare",
    },
    "tome_pyromancy": {
        "name": "Tome of Blazing Embers",
        "type": "amulet",
        "value": 95,
        "description": "Grimoire radiating primeval heat (+4 ATK, +20 Max MP).",
        "stats": {"attack": 4, "max_mana": 20},
        "rarity": "epic",
    },
    "hammer_thunder": {
        "name": "Stormforged Warhammer",
        "type": "weapon",
        "value": 115,
        "description": "Dwarven warhammer humming with arcs of thunder (+13 ATK, stun chance).",
        "stats": {"attack": 13, "stun_chance": 25},
        "rarity": "epic",
    },
    "cloak_ethereal": {
        "name": "Spectral Shroud",
        "type": "armor",
        "value": 105,
        "description": "Gossamer cloak partially phased into the astral realm (+7 DEF, +15 Max MP).",
        "stats": {"defense": 7, "max_mana": 15},
        "rarity": "epic",
    },
    "potion_invulnerability": {
        "name": "Divine Aegis Draught",
        "type": "potion",
        "value": 50,
        "description": "Blessed liquid bestowing an impervious energy barrier (+6 DEF for 4 turns).",
        "stats": {"shield_wall_turns": 4},
        "rarity": "rare",
    },
}


def create_item(item_id: str) -> Optional[Item]:
    data = ITEM_CATALOG.get(item_id)
    if not data:
        return None
    return Item(
        item_id=item_id,
        name=data["name"],
        item_type=data["type"],
        value=data["value"],
        description=data["description"],
        stats=dict(data.get("stats", {})),
        rarity=data.get("rarity", "common"),
    )


HERO_CLASSES: Dict[str, Dict[str, Any]] = {
    "paladin": {
        "name": "Valerius",
        "title": "Crusader Paladin",
        "hp": 65,
        "mana": 30,
        "attack": 8,
        "defense": 4,
        "crit_chance": 0.15,
        "starter_items": ["potion_health", "sword_iron", "armor_leather"],
        "description": "Devout defender with superior armor, crushing shield bash, and divine healing.",
    },
    "rogue": {
        "name": "Lyra",
        "title": "Shadow Rogue",
        "hp": 48,
        "mana": 25,
        "attack": 9,
        "defense": 2,
        "crit_chance": 0.30,
        "starter_items": ["potion_health", "dagger_poison", "armor_leather"],
        "description": "Lethal blade dancer with 30% base critical strikes, poison daggers, and blinding smoke bombs.",
    },
    "mage": {
        "name": "Ignis",
        "title": "Arcane Mage",
        "hp": 42,
        "mana": 55,
        "attack": 6,
        "defense": 1,
        "crit_chance": 0.10,
        "starter_items": ["potion_mana", "staff_arcane", "robe_mystic", "scroll_fireball"],
        "description": "Scholar of the forbidden arts commanding blazing fireballs, arcane novas, and frost stuns.",
    },
}

MERCHANT_STOCK: List[Dict[str, Any]] = [
    {"item_id": "potion_health", "price": 18},
    {"item_id": "potion_mana", "price": 18},
    {"item_id": "potion_rejuvenation", "price": 40},
    {"item_id": "potion_invulnerability", "price": 45},
    {"item_id": "scroll_fireball", "price": 35},
    {"item_id": "scroll_nova", "price": 55},
    {"item_id": "sword_runic", "price": 85},
    {"item_id": "hammer_thunder", "price": 130},
    {"item_id": "armor_plate", "price": 75},
    {"item_id": "cloak_ethereal", "price": 120},
    {"item_id": "shield_tower", "price": 90},
    {"item_id": "ring_shadow", "price": 95},
    {"item_id": "amulet_bloodstone", "price": 75},
    {"item_id": "boots_shadowstep", "price": 65},
    {"item_id": "tome_pyromancy", "price": 105},
    {"item_id": "potion_elixir_str", "price": 70},
    {"item_id": "potion_elixir_def", "price": 70},
]


class Entity:
    def __init__(self, name: str, x: int, y: int, hp: int, max_hp: int, attack: int, defense: int):
        self.name = name
        self.x = x
        self.y = y
        self.hp = hp
        self.max_hp = max_hp
        self.attack = attack
        self.defense = defense
        self.status_effects: Dict[str, int] = {}  # effect_name -> turns remaining

    @property
    def is_alive(self) -> bool:
        return self.hp > 0

    @property
    def is_stunned(self) -> bool:
        return self.status_effects.get("stun", 0) > 0

    def apply_status(self, effect: str, duration: int) -> None:
        self.status_effects[effect] = max(self.status_effects.get(effect, 0), duration)

    def tick_status_effects(self) -> List[str]:
        messages: List[str] = []
        to_remove = []

        for effect, turns in list(self.status_effects.items()):
            if effect == "poison":
                dmg = self.take_damage(4)
                messages.append(f"{self.name} suffered {dmg} poison damage.")
            elif effect == "burn":
                dmg = self.take_damage(5)
                messages.append(f"{self.name} suffered {dmg} fire burn damage.")

            new_turns = turns - 1
            if new_turns <= 0:
                to_remove.append(effect)
            else:
                self.status_effects[effect] = new_turns

        for rem in to_remove:
            del self.status_effects[rem]
            messages.append(f"{self.name}'s {rem} wore off.")

        return messages

    def take_damage(self, amount: int) -> int:
        actual = max(1, amount)
        self.hp = max(0, self.hp - actual)
        return actual

    def heal(self, amount: int) -> int:
        prev = self.hp
        self.hp = min(self.max_hp, self.hp + max(0, amount))
        return self.hp - prev


class Monster(Entity):
    def __init__(
        self,
        name: str,
        monster_type: str,
        x: int,
        y: int,
        hp: int,
        attack: int,
        defense: int,
        xp_reward: int,
        gold_reward: int,
        loot_drop: Optional[str] = None,
        is_boss: bool = False,
        is_champion: bool = False,
        champion_affix: Optional[str] = None,
    ):
        super().__init__(name, x, y, hp, hp, attack, defense)
        self.monster_type = monster_type
        self.xp_reward = xp_reward
        self.gold_reward = gold_reward
        self.loot_drop = loot_drop
        self.is_boss = is_boss
        self.is_champion = is_champion
        self.champion_affix = champion_affix
        self.ai_state = "idle"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.monster_type,
            "x": self.x,
            "y": self.y,
            "hp": self.hp,
            "max_hp": self.max_hp,
            "attack": self.attack,
            "defense": self.defense,
            "xp_reward": self.xp_reward,
            "gold_reward": self.gold_reward,
            "loot_drop": self.loot_drop,
            "is_boss": self.is_boss,
            "is_champion": self.is_champion,
            "champion_affix": self.champion_affix,
            "ai_state": self.ai_state,
            "status_effects": dict(self.status_effects),
        }


def spawn_monster(
    monster_type: str,
    x: int,
    y: int,
    depth: int = 1,
    is_champion: bool = False,
    champion_affix: Optional[str] = None,
) -> Monster:
    scale = 1.0 + (depth - 1) * 0.25
    if monster_type == "boss_lich":
        return Monster(
            name="Arch-Lich Malakor",
            monster_type="boss_lich",
            x=x,
            y=y,
            hp=95,
            attack=13,
            defense=5,
            xp_reward=200,
            gold_reward=150,
            loot_drop="crown_eternity",
            is_boss=True,
        )

    # Base templates
    if monster_type == "skeleton":
        base_name = "Crypt Skeleton"
        base_hp = int(20 * scale)
        base_atk = int(6 * scale)
        base_def = int(2 * scale)
        xp = 20
        gold = 10
        drop = "sword_iron" if depth >= 2 else "potion_health"
    elif monster_type == "goblin":
        base_name = "Sneaky Goblin"
        base_hp = int(14 * scale)
        base_atk = int(5 * scale)
        base_def = int(1 * scale)
        xp = 16
        gold = 18
        drop = "potion_health"
    elif monster_type == "spider":
        base_name = "Venomous Brood-Spider"
        base_hp = int(12 * scale)
        base_atk = int(6 * scale)
        base_def = int(1 * scale)
        xp = 18
        gold = 12
        drop = "dagger_poison"
    elif monster_type == "necromancer":
        base_name = "Dread Necromancer"
        base_hp = int(30 * scale)
        base_atk = int(9 * scale)
        base_def = int(3 * scale)
        xp = 45
        gold = 40
        drop = "scroll_fireball"
    else:  # default minion
        base_name = "Cave Bat"
        base_hp = int(9 * scale)
        base_atk = int(4 * scale)
        base_def = 0
        xp = 10
        gold = 6
        drop = None

    if is_champion:
        affix = champion_affix or "Molten"
        name = f"{affix} {base_name}"
        hp = int(base_hp * 1.4)
        atk = base_atk + (2 if affix == "Swift" else 0)
        defense = base_def + (3 if affix == "Fortified" else 0)
        xp = int(xp * 2.0)
        gold = int(gold * 2.5)
        # Champion drops are elevated
        champion_drop = drop or "potion_rejuvenation"
        return Monster(
            name=name,
            monster_type=monster_type,
            x=x,
            y=y,
            hp=hp,
            attack=atk,
            defense=defense,
            xp_reward=xp,
            gold_reward=gold,
            loot_drop=champion_drop,
            is_champion=True,
            champion_affix=affix,
        )

    return Monster(
        name=base_name,
        monster_type=monster_type,
        x=x,
        y=y,
        hp=base_hp,
        attack=base_atk,
        defense=base_def,
        xp_reward=xp,
        gold_reward=gold,
        loot_drop=drop,
    )


class Player(Entity):
    def __init__(
        self,
        name: Optional[str] = None,
        x: int = 0,
        y: int = 0,
        hero_class: str = "paladin",
    ):
        class_key = hero_class.lower() if hero_class else "paladin"
        class_info = HERO_CLASSES.get(class_key, HERO_CLASSES["paladin"])
        player_name = name if name is not None else class_info["name"]
        super().__init__(
            player_name,
            x,
            y,
            hp=class_info["hp"],
            max_hp=class_info["hp"],
            attack=class_info["attack"],
            defense=class_info["defense"],
        )
        self.hero_class = class_key
        self.class_title = class_info["title"]
        self.base_crit_chance = class_info["crit_chance"]
        self.mana = class_info["mana"]
        self.max_mana = class_info["mana"]
        self.level = 1
        self.xp = 0
        self.next_xp = 50
        self.gold = 35 if class_key == "rogue" else 25
        self.perm_attack = 0
        self.perm_defense = 0
        self.max_slots = 12
        self.inventory: List[Item] = []
        self.equipped: Dict[str, Optional[Item]] = {
            "weapon": None,
            "armor": None,
            "ring": None,
            "amulet": None,
            "boots": None,
        }

        # Starter kit in inventory
        for item_id in class_info.get("starter_items", []):
            item = create_item(item_id)
            if item:
                self.inventory.append(item)

    @property
    def effective_crit_chance(self) -> float:
        bonus = sum(
            (eq.stats.get("crit_bonus", 0) / 100.0)
            for eq in self.equipped.values()
            if eq is not None
        )
        return min(0.75, self.base_crit_chance + bonus)

    @property
    def effective_attack(self) -> int:
        bonus = sum(
            eq.stats.get("attack", 0)
            for eq in self.equipped.values()
            if eq is not None
        )
        if self.status_effects.get("might", 0) > 0:
            bonus += 4
        return self.attack + bonus

    @property
    def effective_defense(self) -> int:
        bonus = sum(
            eq.stats.get("defense", 0)
            for eq in self.equipped.values()
            if eq is not None
        )
        if self.status_effects.get("shield_wall", 0) > 0:
            bonus += 6
        return self.defense + bonus

    @property
    def effective_max_hp(self) -> int:
        bonus = sum(
            eq.stats.get("max_hp", 0)
            for eq in self.equipped.values()
            if eq is not None
        )
        return self.max_hp + bonus

    @property
    def effective_max_mana(self) -> int:
        bonus = sum(
            eq.stats.get("max_mana", 0)
            for eq in self.equipped.values()
            if eq is not None
        )
        return self.max_mana + bonus

    def add_xp(self, amount: int) -> bool:
        """Add experience points, return True if leveled up."""
        self.xp += amount
        leveled = False
        while self.xp >= self.next_xp:
            self.xp -= self.next_xp
            self.level += 1
            self.next_xp = int(self.next_xp * 1.5)
            self.max_hp += 12
            self.hp = min(self.hp + 12, self.effective_max_hp)
            self.max_mana += 6
            self.mana = min(self.mana + 6, self.effective_max_mana)
            self.attack += 2
            self.defense += 1
            leveled = True
        return leveled

    def equip(self, item: Item) -> bool:
        slot = item.item_type
        if slot not in self.equipped:
            return False
        if item in self.inventory:
            self.inventory.remove(item)
        if self.equipped[slot] is not None:
            self.inventory.append(self.equipped[slot])  # type: ignore[arg-type]
        self.equipped[slot] = item
        return True

    def unequip(self, slot: str) -> bool:
        if slot not in self.equipped or self.equipped[slot] is None:
            return False
        if len(self.inventory) >= self.max_slots:
            return False
        old = self.equipped[slot]
        self.equipped[slot] = None
        self.inventory.append(old)  # type: ignore[arg-type]
        return True

    def use_item(self, item_index: int) -> Tuple[bool, str]:
        if item_index < 0 or item_index >= len(self.inventory):
            return False, "Invalid item index."
        item = self.inventory[item_index]

        if item.item_type in ("weapon", "armor", "ring", "amulet", "boots"):
            self.equip(item)
            return True, f"Equipped {item.name}."

        if item.item_type == "potion":
            heal_amount = item.stats.get("heal_hp", 0)
            mana_amount = item.stats.get("restore_mana", 0)
            perm_atk = item.stats.get("perm_attack", 0)
            perm_def = item.stats.get("perm_defense", 0)
            barrier_turns = item.stats.get("shield_wall_turns", 0)
            msg_parts = []
            if heal_amount > 0:
                restored = self.heal(heal_amount)
                msg_parts.append(f"restored {restored} HP")
            if mana_amount > 0:
                self.mana = min(self.effective_max_mana, self.mana + mana_amount)
                msg_parts.append(f"restored {mana_amount} Mana")
            if perm_atk > 0:
                self.attack += perm_atk
                self.perm_attack += perm_atk
                msg_parts.append(f"permanently gained +{perm_atk} Attack")
            if perm_def > 0:
                self.defense += perm_def
                self.perm_defense += perm_def
                msg_parts.append(f"permanently gained +{perm_def} Defense")
            if barrier_turns > 0:
                self.apply_status("shield_wall", barrier_turns)
                msg_parts.append(f"gained Barrier (+6 DEF for {barrier_turns} turns)")
            # If rejuvenation, cleanse negative statuses
            if item.item_id == "potion_rejuvenation":
                self.status_effects.pop("poison", None)
                self.status_effects.pop("burn", None)
                msg_parts.append("cleansed all afflictions")
            self.inventory.pop(item_index)
            return True, f"Drank {item.name}: {', '.join(msg_parts)}."

        return False, "Cannot use item."

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "hero_class": self.hero_class,
            "class_title": self.class_title,
            "crit_chance": round(self.effective_crit_chance, 2),
            "x": self.x,
            "y": self.y,
            "hp": self.hp,
            "max_hp": self.effective_max_hp,
            "mana": self.mana,
            "max_mana": self.effective_max_mana,
            "level": self.level,
            "xp": self.xp,
            "next_xp": self.next_xp,
            "gold": self.gold,
            "attack": self.effective_attack,
            "defense": self.effective_defense,
            "perm_attack": self.perm_attack,
            "perm_defense": self.perm_defense,
            "inventory": [item.to_dict() for item in self.inventory],
            "equipped": {
                k: (v.to_dict() if v is not None else None)
                for k, v in self.equipped.items()
            },
            "status_effects": dict(self.status_effects),
        }
