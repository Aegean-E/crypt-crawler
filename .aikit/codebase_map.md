# Codebase Map & Symbol Catalog 🗺️

> **AUTO-GENERATED & VERIFIED BY `scripts/update_knowledge_base.py`**
> This document provides an automated, up-to-date registry of all modules, classes, and exported functions across this repository.

---

## 📊 Codebase Metrics
- **Total Python Modules**: `12`
- **Total Classes**: `14`
- **Total Top-Level Functions**: `10`
- **Total Class Methods**: `60`
- **Total Source Lines**: `1474`

---

## 📦 Modules & Exported Symbols

### [`crawler/__init__.py`](crawler/__init__.py)
> *Crypt-Crawler: Tactical turn-based web dungeon crawler package.*

**Size**: `3` lines (`93` bytes)

---

### [`crawler/combat.py`](crawler/combat.py)
> *Turn-based tactical combat resolution for Crypt-Crawler.*

**Size**: `163` lines (`5110` bytes)

**Classes:**
- `class CombatResult`

**Functions:**
- `def resolve_melee_attack(attacker, defender, rng)` - *Resolve a turn-based melee attack between two entities.*
- `def cast_fireball(player, target, rng)` - *Cast Fireball spell costing 10 Mana.*
- `def cast_heal(player, rng)` - *Cast Divine Healing spell costing 8 Mana.*

---

### [`crawler/dungeon.py`](crawler/dungeon.py)
> *Procedural dungeon generation and grid management for Crypt-Crawler.*

**Size**: `301` lines (`9872` bytes)

**Classes:**
- `class TileType`
- `class Room`
  - Property `.x1`
  - Property `.y1`
  - Property `.x2`
  - Property `.y2`
  - Property `.center`
  - Method `.intersects(other, padding)`
- `class Dungeon`
  - Method `.__init__(width, height, seed)`
  - Method `.in_bounds(x, y)`
  - Method `.is_walkable(x, y)`
  - Method `.is_transparent(x, y)`
  - Method `.compute_fov(px, py, radius)` - *Calculate field of view using symmetric raycasting with distance attenuation.*
  - Method `.find_path(start, goal)` - *Breadth-first search shortest path on the walkable grid.*
  - Method `.to_dict()` - *Serialize dungeon layout to JSON-friendly dictionary.*
- `class DungeonGenerator`
  - Method `.__init__(width, height, min_room_size, max_room_size, max_rooms, depth)`
  - Method `.generate(seed)`
  - Method `._carve_corridor(dungeon, start, end, rng)`
  - Method `._carve_h(dungeon, x1, x2, y)`
  - Method `._carve_v(dungeon, y1, y2, x)`

---

### [`crawler/entities.py`](crawler/entities.py)
> *Entities, items, inventory and stats for Crypt-Crawler.*

**Size**: `375` lines (`11375` bytes)

**Classes:**
- `class Item`
  - Method `.to_dict()`
- `class Entity`
  - Method `.__init__(name, x, y, hp, max_hp, attack, defense)`
  - Property `.is_alive`
  - Method `.take_damage(amount)`
  - Method `.heal(amount)`
- `class Monster`
  - Method `.__init__(name, monster_type, x, y, hp, attack, defense, xp_reward, gold_reward, loot_drop)`
  - Method `.to_dict()`
- `class Player`
  - Method `.__init__(name, x, y)`
  - Property `.effective_attack`
  - Property `.effective_defense`
  - Property `.effective_max_hp`
  - Property `.effective_max_mana`
  - Method `.add_xp(amount)` - *Add experience points, return True if leveled up.*
  - Method `.equip(item)`
  - Method `.unequip(slot)`
  - Method `.use_item(item_index)`
  - Method `.to_dict()`

**Functions:**
- `def create_item(item_id)`
- `def spawn_monster(monster_type, x, y, depth)`

---

### [`crawler/server.py`](crawler/server.py)
> *Lightweight HTTP server and REST dispatch for Crypt-Crawler.*

**Size**: `107` lines (`4115` bytes)

**Classes:**
- `class CryptCrawlerHandler`
  - Method `.__init__(*args, **kwargs)`
  - Method `.log_message(format, *args)`
  - Method `.do_GET()`
  - Method `._handle_api_get(parsed)`
  - Method `._send_json(payload, status)`

**Functions:**
- `def start_background_server(port, host)` - *Start the HTTP server on a daemon thread, returning the server and the bound port.*

---

### [`run.py`](run.py)
> *Run script for Crypt-Crawler web game server.*

**Size**: `60` lines (`2022` bytes)

**Functions:**
- `def find_available_server(host, start_port, max_attempts)`
- `def main()`

---

### [`tests/__init__.py`](tests/__init__.py)
> *Unit tests for Crypt-Crawler.*

**Size**: `1` lines (`36` bytes)

---

### [`tests/test_combat.py`](tests/test_combat.py)
> *Unit tests for combat, leveling and inventory management.*

**Size**: `81` lines (`2888` bytes)

**Classes:**
- `class TestCombat`
  - Method `.setUp()`
  - Method `.test_player_stats_and_equipment()`
  - Method `.test_melee_attack_damages_target()`
  - Method `.test_killing_monster_awards_xp_and_gold()`
  - Method `.test_level_up()`
  - Method `.test_potion_healing()`
  - Method `.test_fireball_spell_consumes_mana()`
  - Method `.test_heal_spell()`

---

### [`tests/test_dungeon.py`](tests/test_dungeon.py)
> *Unit tests for procedural dungeon generation and pathfinding.*

**Size**: `68` lines (`2535` bytes)

**Classes:**
- `class TestDungeon`
  - Method `.test_generator_bounds_and_rooms()`
  - Method `.test_all_rooms_connected()` - *Verify that every room center can be reached from player spawn.*
  - Method `.test_seed_reproducibility()`
  - Method `.test_fov_computation()`

---

### [`tests/test_inspect.py`](tests/test_inspect.py)
> *Unit tests for headless inspection configuration and viewports.*

**Size**: `20` lines (`637` bytes)

**Classes:**
- `class TestInspectConfig`
  - Method `.test_viewports_declared()`

---

### [`tests/test_server.py`](tests/test_server.py)
> *Unit tests for the Crypt-Crawler HTTP server and API endpoints.*

**Size**: `69` lines (`2407` bytes)

**Classes:**
- `class TestServer`
  - Method `.setUpClass()`
  - Method `.tearDownClass()`
  - Method `.test_api_status()`
  - Method `.test_api_new_game()`
  - Method `.test_api_new_game_invalid_params_fallback()`
  - Method `.test_favicon_no_content()`
  - Method `.test_find_available_server()`

---

### [`tools/inspect_ui.py`](tools/inspect_ui.py)
> *Headless browser visual inspection and UI auditing tool for Crypt-Crawler.*

**Size**: `226` lines (`8791` bytes)

**Functions:**
- `def run_inspection(viewports, scenarios, out_dir)`
- `def main()`

---
