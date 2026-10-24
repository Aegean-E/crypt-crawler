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

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.item_id,
            "name": self.name,
            "type": self.item_type,
            "value": self.value,
            "description": self.description,
            "stats": self.stats,
        }


ITEM_CATALOG: Dict[str, Dict[str, Any]] = {
    "potion_health": {
        "name": "Health Elixir",
        "type": "potion",
        "value": 15,
        "description": "Restores 35 Hit Points instantly.",
        "stats": {"heal_hp": 35},
    },
    "potion_mana": {
        "name": "Aether Potion",
        "type": "potion",
        "value": 15,
        "description": "Restores 25 Mana points instantly.",
        "stats": {"restore_mana": 25},
    },
    "scroll_fireball": {
        "name": "Scroll of Inferno",
        "type": "scroll",
        "value": 30,
        "description": "Unleashes a burst of flame dealing 30 damage.",
        "stats": {"spell_damage": 30, "spell_type": "fire"},
    },
    "sword_iron": {
        "name": "Forged Iron Sword",
        "type": "weapon",
        "value": 25,
        "description": "Sturdy blade crafted by crypt smiths (+4 ATK).",
        "stats": {"attack": 4},
    },
    "sword_runic": {
        "name": "Runic Claymore",
        "type": "weapon",
        "value": 75,
        "description": "Glows with ancient runes (+10 ATK).",
        "stats": {"attack": 10},
    },
    "armor_leather": {
        "name": "Hardened Leather Armor",
        "type": "armor",
        "value": 20,
        "description": "Light, flexible armor offering basic protection (+2 DEF).",
        "stats": {"defense": 2},
    },
    "armor_plate": {
        "name": "Knightly Plate Mail",
        "type": "armor",
        "value": 65,
        "description": "Heavy steel plates deflecting lethal blows (+6 DEF).",
        "stats": {"defense": 6},
    },
    "ring_vitality": {
        "name": "Ring of Vitality",
        "type": "ring",
        "value": 50,
        "description": "Imbues the wearer with constitution (+20 Max HP).",
        "stats": {"max_hp": 20},
    },
    "ring_power": {
        "name": "Ring of Arcane Might",
        "type": "ring",
        "value": 50,
        "description": "Amplifies physical and magical force (+3 ATK, +10 Max Mana).",
        "stats": {"attack": 3, "max_mana": 10},
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
    )


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
    ):
        super().__init__(name, x, y, hp, hp, attack, defense)
        self.monster_type = monster_type
        self.xp_reward = xp_reward
        self.gold_reward = gold_reward
        self.loot_drop = loot_drop
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
            "ai_state": self.ai_state,
        }


def spawn_monster(monster_type: str, x: int, y: int, depth: int = 1) -> Monster:
    scale = 1.0 + (depth - 1) * 0.25
    if monster_type == "skeleton":
        return Monster(
            name="Crypt Skeleton",
            monster_type="skeleton",
            x=x,
            y=y,
            hp=int(18 * scale),
            attack=int(6 * scale),
            defense=int(2 * scale),
            xp_reward=20,
            gold_reward=10,
            loot_drop="sword_iron" if depth >= 2 else "potion_health",
        )
    elif monster_type == "goblin":
        return Monster(
            name="Sneaky Goblin",
            monster_type="goblin",
            x=x,
            y=y,
            hp=int(12 * scale),
            attack=int(5 * scale),
            defense=int(1 * scale),
            xp_reward=15,
            gold_reward=15,
            loot_drop="potion_health",
        )
    elif monster_type == "necromancer":
        return Monster(
            name="Dread Necromancer",
            monster_type="necromancer",
            x=x,
            y=y,
            hp=int(28 * scale),
            attack=int(9 * scale),
            defense=int(3 * scale),
            xp_reward=45,
            gold_reward=35,
            loot_drop="scroll_fireball",
        )
    else:  # default minion
        return Monster(
            name="Cave Bat",
            monster_type="bat",
            x=x,
            y=y,
            hp=int(8 * scale),
            attack=int(4 * scale),
            defense=0,
            xp_reward=10,
            gold_reward=5,
            loot_drop=None,
        )


class Player(Entity):
    def __init__(self, name: str = "Adventurer", x: int = 0, y: int = 0):
        super().__init__(name, x, y, hp=60, max_hp=60, attack=8, defense=3)
        self.mana = 30
        self.max_mana = 30
        self.level = 1
        self.xp = 0
        self.next_xp = 50
        self.gold = 20
        self.max_slots = 12
        self.inventory: List[Item] = []
        self.equipped: Dict[str, Optional[Item]] = {
            "weapon": None,
            "armor": None,
            "ring": None,
        }

        # Starter kit
        potion = create_item("potion_health")
        if potion:
            self.inventory.append(potion)
        sword = create_item("sword_iron")
        if sword:
            self.inventory.append(sword)

    @property
    def effective_attack(self) -> int:
        bonus = sum(
            eq.stats.get("attack", 0)
            for eq in self.equipped.values()
            if eq is not None
        )
        return self.attack + bonus

    @property
    def effective_defense(self) -> int:
        bonus = sum(
            eq.stats.get("defense", 0)
            for eq in self.equipped.values()
            if eq is not None
        )
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
            self.max_hp += 10
            self.hp = min(self.hp + 10, self.effective_max_hp)
            self.max_mana += 5
            self.mana = min(self.mana + 5, self.effective_max_mana)
            self.attack += 2
            self.defense += 1
            leveled = True
        return leveled

    def equip(self, item: Item) -> bool:
        slot = item.item_type
        if slot not in self.equipped:
            return False
        # Remove from inventory
        if item in self.inventory:
            self.inventory.remove(item)
        # If slot was occupied, return old item to inventory
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

        if item.item_type in ("weapon", "armor", "ring"):
            self.equip(item)
            return True, f"Equipped {item.name}."

        if item.item_type == "potion":
            heal_amount = item.stats.get("heal_hp", 0)
            mana_amount = item.stats.get("restore_mana", 0)
            msg_parts = []
            if heal_amount > 0:
                restored = self.heal(heal_amount)
                msg_parts.append(f"restored {restored} HP")
            if mana_amount > 0:
                self.mana = min(self.effective_max_mana, self.mana + mana_amount)
                msg_parts.append(f"restored {mana_amount} Mana")
            self.inventory.pop(item_index)
            return True, f"Drank {item.name}: {', '.join(msg_parts)}."

        return False, "Cannot use item."

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
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
            "inventory": [item.to_dict() for item in self.inventory],
            "equipped": {
                k: (v.to_dict() if v is not None else None)
                for k, v in self.equipped.items()
            },
        }
