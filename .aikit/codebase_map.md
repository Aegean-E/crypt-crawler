# Codebase Map & Symbol Catalog 🗺️

> **AUTO-GENERATED & VERIFIED BY `scripts/update_knowledge_base.py`**
> This document provides an automated, up-to-date registry of all modules, classes, and exported functions across this repository.

---

## 📊 Codebase Metrics
- **Total Python Modules**: `19`
- **Total Classes**: `26`
- **Total Top-Level Functions**: `40`
- **Total Class Methods**: `134`
- **Total Source Lines**: `6373`

---

## 📦 Modules & Exported Symbols

### [`crawler/__init__.py`](crawler/__init__.py)
> *Crypt-Crawler: Tactical turn-based web dungeon crawler package.*

**Size**: `3` lines (`93` bytes)

---

### [`crawler/combat.py`](crawler/combat.py)
> *Turn-based tactical combat resolution for Crypt-Crawler.*

**Size**: `489` lines (`17046` bytes)

**Classes:**
- `class CombatResult`

**Functions:**
- `def resolve_melee_attack(attacker, defender, rng)` - *Resolve a turn-based melee attack between two entities.*
- `def shield_bash(player, target, rng)` - *Perform a crushing shield bash costing 4 Mana, dealing physical damage and stunning for 1 turn.*
- `def shield_wall(player)` - *Raise defensive guard (+6 DEF for 4 turns), costing 6 Mana.*
- `def cast_fireball(player, target, rng)` - *Cast Fireball spell costing 10 Mana, dealing direct damage and applying Burn.*
- `def cast_heal(player, rng)` - *Cast Divine Healing spell costing 8 Mana, restoring HP and cleansing negative statuses.*
- `def shadow_strike(player, target, rng)` - *Execute a precision sneak attack costing 4 Mana with +40% Crit Chance and venom.*
- `def smoke_bomb(player, monsters, radius)` - *Toss a blinding smoke canister costing 6 Mana, stunning all nearby foes for 2 turns.*
- `def frost_nova(player, target, rng)` - *Blast an enemy with sub-zero frost costing 6 Mana, dealing cold damage and freezing (stun) for 2 turns.*
- `def arcane_nova(player, monsters, radius, rng)` - *Pulse cataclysmic arcane waves in a 3-tile radius costing 10 Mana, dealing heavy magic damage to all foes.*

---

### [`crawler/dungeon.py`](crawler/dungeon.py)
> *Procedural dungeon generation and grid management for Crypt-Crawler.*

**Size**: `485` lines (`17751` bytes)

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
  - Property `.biome`
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

**Size**: `750` lines (`24590` bytes)

**Classes:**
- `class Item`
  - Method `.to_dict()`
- `class Entity`
  - Method `.__init__(name, x, y, hp, max_hp, attack, defense)`
  - Property `.is_alive`
  - Property `.is_stunned`
  - Method `.apply_status(effect, duration)`
  - Method `.tick_status_effects()`
  - Method `.take_damage(amount)`
  - Method `.heal(amount)`
- `class Monster`
  - Method `.__init__(name, monster_type, x, y, hp, attack, defense, xp_reward, gold_reward, loot_drop, is_boss, is_champion, champion_affix)`
  - Method `.to_dict()`
- `class Player`
  - Method `.__init__(name, x, y, hero_class)`
  - Property `.effective_crit_chance`
  - Property `.effective_attack`
  - Property `.effective_defense`
  - Property `.effective_max_hp`
  - Property `.effective_max_mana`
  - Method `.add_xp(amount)` - *Add experience points, return True if leveled up.*
  - Method `.heal(amount)` - *Restore HP up to the cap granted by the current equipment.*
  - Method `.equip(item)`
  - Method `.unequip(slot)`
  - Method `._clamp_vitals()` - *Keep current pools within the caps granted by the equipment now worn.*
  - Method `.use_item(item_index)`
  - Method `.to_dict()`

**Functions:**
- `def create_item(item_id)`
- `def spawn_monster(monster_type, x, y, depth, is_champion, champion_affix)`

---

### [`crawler/lore.py`](crawler/lore.py)
> *Lore codex: the readable history of the crypt, its relics and its dead.*

**Size**: `234` lines (`8903` bytes)

**Functions:**
- `def public_entries()` - *Every entry as a fresh dict, safe to serialise to the client.*
- `def entry_for_event(event)` - *The lore id tied to a discovery event, or an empty string.*
- `def starting_lore()` - *The entries a brand-new run begins with.*
- `def is_valid_entry(entry_id)` - *Whether an id names a real entry (guards saves against drift).*

---

### [`crawler/rewards.py`](crawler/rewards.py)
> *Variable-ratio reward engine, dopamine loot schedules, and near-miss mechanics for Crypt-Crawler.*

**Size**: `166` lines (`5644` bytes)

**Classes:**
- `class RewardType`

**Functions:**
- `def roll_chest_reward(depth, rng)` - *Calculate variable-ratio reward payout and drops for opening chests (Skinner box reinforcement schedule).*
- `def roll_urn_reward(depth, rng)` - *Variable-ratio coin and surprise relic payout when shattering burial urns.*
- `def check_near_miss_survival(current_hp, max_hp, damage_taken)` - *Near-miss feedback engine (Clark et al. 2009).*
- `def generate_dungeon_bounties(depth, seed)` - *Generate 3 active contract bounties per floor (Zeigarnik Effect).*

---

### [`crawler/server.py`](crawler/server.py)
> *Lightweight HTTP server and REST dispatch for Crypt-Crawler.*

**Size**: `194` lines (`8039` bytes)

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

### [`tests/test_ai_harness.py`](tests/test_ai_harness.py)
> *Unit tests for the AI gameplay harness and the UI inventory contract.*

**Size**: `229` lines (`8894` bytes)

**Classes:**
- `class TestHarnessCatalog`
  - Method `.test_catalog_matches_shipped_classes()`
  - Method `.test_catalog_actions_and_pacts()`
  - Method `.test_every_class_deck_has_five_named_abilities()`
- `class TestActionValidation`
  - Method `.test_valid_actions()`
  - Method `.test_invalid_actions_are_reported()`
- `class TestScriptParsing`
  - Method `.test_accepts_a_minimal_script()`
  - Method `.test_rejects_bad_scripts()`
  - Method `.test_script_limit_is_enforced()`
- `class TestLoadActions`
  - Method `.test_reads_inline_json()`
  - Method `.test_reads_a_file_through_the_at_prefix()`
  - Method `.test_shell_stripped_quotes_get_an_actionable_error()`
  - Method `.test_missing_file_is_an_error_not_an_empty_list()`
- `class TestLayoutHash`
  - Method `._state(seed, staircase)`
  - Method `._with(key, value)`
  - Method `.test_hash_is_stable_and_sensitive()`
  - Method `.test_hash_tracks_every_seeded_layout_element()`
- `class TestUiInventory`
  - Method `.setUp()`
  - Method `.test_inventory_names_real_controls_choices_and_handlers()`
  - Method `.test_inventory_is_deterministic_and_deduplicated()`
  - Method `.test_ui_contract_points_at_the_inventory_and_tests()`

---

### [`tests/test_combat.py`](tests/test_combat.py)
> *Unit tests for combat, leveling and inventory management.*

**Size**: `328` lines (`13272` bytes)

**Classes:**
- `class TestCombat`
  - Method `.setUp()`
  - Method `.test_player_stats_and_equipment()`
  - Method `.test_melee_attack_damages_target()`
  - Method `.test_killing_monster_awards_xp_and_gold()`
  - Method `.test_level_up()`
  - Method `.test_potion_healing()`
  - Method `.test_fireball_spell_consumes_mana()`
  - Method `.test_heal_spell_and_cleansing()`
  - Method `.test_shield_bash_stuns_target()`
  - Method `.test_shield_wall_buff()`
  - Method `.test_status_effects_tick()`
  - Method `.test_hero_classes_and_crit_chance()`
  - Method `.test_permanent_stat_elixirs()`
  - Method `.test_shadow_strike_and_smoke_bomb()`
  - Method `.test_arcane_nova_and_frost_nova()`
  - Method `.test_champion_monsters_and_affixes()`
  - Method `.test_expanded_equipment_slots_and_unequip()`
  - Method `.test_weapon_stun_proc_stuns_target()`
  - Method `.test_weapon_poison_proc_uses_weapon_stats_and_name()`
  - Method `.test_max_pool_equipment_caps_healing_and_clamps_on_unequip()`
  - Method `.test_expanded_catalog_merchant_stock_and_save_slots()`
  - Method `.test_divine_aegis_draught_potion()`

---

### [`tests/test_dungeon.py`](tests/test_dungeon.py)
> *Unit tests for procedural dungeon generation and pathfinding.*

**Size**: `162` lines (`7431` bytes)

**Classes:**
- `class TestDungeon`
  - Method `.test_generator_bounds_and_rooms()`
  - Method `.test_all_rooms_connected()` - *Verify that every room center can be reached from player spawn.*
  - Method `.test_seed_reproducibility()`
  - Method `.test_fov_computation()`
  - Method `.test_biomes_and_depth_scaling()`
  - Method `.test_one_lost_soul_per_floor_in_a_walkable_spot()`
  - Method `.test_sigils_and_vault_form_a_floor_objective()`
  - Method `.test_one_pact_altar_per_floor_in_a_walkable_spot()`
  - Method `.test_pact_altar_still_spawns_on_a_degenerate_two_room_map()`
  - Method `.test_lost_soul_still_spawns_on_a_degenerate_two_room_map()`
  - Method `.test_merchant_spawns_on_depth_2()`

---

### [`tests/test_inspect.py`](tests/test_inspect.py)
> *Unit tests for headless inspection configuration and viewports.*

**Size**: `20` lines (`637` bytes)

**Classes:**
- `class TestInspectConfig`
  - Method `.test_viewports_declared()`

---

### [`tests/test_lore.py`](tests/test_lore.py)
> *Unit tests for the lore codex data and its HTTP endpoint.*

**Size**: `74` lines (`2659` bytes)

**Classes:**
- `class TestLoreData`
  - Method `.test_entries_are_unique_and_well_formed()`
  - Method `.test_starting_entries_exist()`
  - Method `.test_every_event_points_at_a_real_entry()`
  - Method `.test_public_entries_are_copies()`
- `class TestLoreEndpoint`
  - Method `.setUpClass()`
  - Method `.tearDownClass()`
  - Method `.test_api_lore_returns_entries_and_starting_set()`

---

### [`tests/test_rewards.py`](tests/test_rewards.py)
> *Unit tests for the variable-ratio reward engine and dopamine loot schedules.*

**Size**: `69` lines (`2458` bytes)

**Classes:**
- `class TestRewards`
  - Method `.test_roll_chest_reward_determinism()`
  - Method `.test_roll_chest_reward_jackpot()`
  - Method `.test_roll_urn_reward()`
  - Method `.test_near_miss_survival()`
  - Method `.test_generate_dungeon_bounties()`

---

### [`tests/test_server.py`](tests/test_server.py)
> *Unit tests for the Crypt-Crawler HTTP server and API endpoints.*

**Size**: `166` lines (`7450` bytes)

**Classes:**
- `class TestServer`
  - Method `.setUpClass()`
  - Method `.tearDownClass()`
  - Method `.test_api_status()`
  - Method `.test_api_new_game()`
  - Method `.test_api_new_game_invalid_params_fallback()`
  - Method `.test_favicon_no_content()`
  - Method `.test_find_available_server()`
  - Method `.test_floor_objective_and_soul_are_clear_of_monsters()`
  - Method `.test_monsters_never_cover_an_interactive_prop()`
  - Method `.test_no_two_monsters_share_a_tile()`
  - Method `.test_new_mobs_start_at_depth_two()`
  - Method `.test_depth_three_boss_guards_the_stairs()`
  - Method `.test_api_new_game_with_class_and_merchant()`

---

### [`tools/ai_harness.py`](tools/ai_harness.py)
> *AI gameplay harness for Crypt-Crawler: a stable, deterministic way for an agent (or a*

**Size**: `1357` lines (`55621` bytes)

**Classes:**
- `class Harness` - *One server and one headless browser shared by every page the harness opens.*
  - Method `.__init__(headless)`
  - Method `.__enter__()`
  - Method `.__exit__(*exc_info)`
  - Method `.open_page(seed, depth, hero_class, rng_seed)` - *A page whose engine has started from the given seed, class and depth.*
  - Method `.state(page)`
  - Method `.apply(page, action)` - *Run one validated action and return the state after it.*

**Functions:**
- `def catalog()` - *Everything an agent needs to plan a run without reading the source.*
- `def _is_int(value)`
- `def validate_action(action)` - *Field-level problems in one action object; empty means valid.*
- `def parse_script(raw)` - *Validated run script; raises ValueError listing every problem.*
- `def layout_hash(state)` - *Stable fingerprint of everything the seeded generator decides.*
- `def _deck_labels(page)` - *The five ability labels, excluding the always-present Potion and Wait buttons.*
- `def _check(name, passed, detail)`
- `def selftest(harness)` - *Prove the mechanics the harness claims to expose actually work.*
- `def _write_output(payload, out)`
- `def load_actions(argument)` - *An action list from inline JSON, or from a file when the value starts with `@`.*
- `def main(argv)`

---

### [`tools/inspect_ui.py`](tools/inspect_ui.py)
> *Headless browser visual inspection and UI auditing tool for Crypt-Crawler.*

**Size**: `1473` lines (`83999` bytes)

**Functions:**
- `def run_inspection(viewports, scenarios, out_dir)`
- `def main()`

---

### [`tools/ui_inventory.py`](tools/ui_inventory.py)
> *Deterministic UI inventory for the AIKit UI guard (`.aikit/ui.json`).*

**Size**: `113` lines (`4344` bytes)

**Classes:**
- `class _ControlParser` - *Collects controls, id-bearing containers and data-attribute choices.*
  - Method `.__init__()`
  - Method `.handle_starttag(tag, attrs)`

**Functions:**
- `def _html_entries(path)`
- `def _script_entries(paths)`
- `def _theme_entries(path)`
- `def inventory(root)` - *Sorted, deduplicated inventory lines for every shipped UI surface.*
- `def main(argv)`

---
