# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

### ADR-001: Architecture of Crypt-Crawler Web Game and Visual Inspection Suite
- **Date**: 2026-10-24
- **Status**: Accepted
- **Context**: Need a responsive, tactical web-based dungeon crawler with high UI fidelity and automated visual verification capability using headless browser technology.
- **Decision**: Adopt a zero-external-dependency Python runtime (`http.server` with custom JSON dispatch) paired with a modern Vanilla ES6 Canvas + CSS3 frontend. For automated visual verification and UI auditing, provide a Playwright-driven headless Edge inspection harness (`tools/inspect_ui.py`) and standard unittest suite (`tests/`).
- **Consequences**: Zero frontend compile/bundle step enables instant live-reloading and cold starts; headless Edge runs natively on Windows without requiring separate browser binary downloads; unit tests and visual screenshots provide comprehensive coverage.

### ADR-002: One-Click Launchers and Seamless Floor Descent State Persistence
- **Date**: 2026-10-24
- **Status**: Accepted
- **Context**: Users need immediate zero-friction launching with automated browser opening; furthermore, descending dungeon stairs must preserve character level, equipment, and backpack inventory.
- **Decision**: Provide `PLAY.bat` and `play.sh` with automatic Python detection and `--open` browser integration. In `engine.js`, implement `descendFloor()` to regenerate the deeper dungeon while preserving all player progression attributes.
- **Consequences**: Players can start playing with a single click, and RPG progression smoothly persists across dungeon depths.

### ADR-003: Tactical Combat Expansion, Procedural Atmosphere and Web Audio Soundscape
- **Date**: 2026-10-24
- **Status**: Accepted
- **Context**: Elevate gameplay mechanics with status effects, boss encounters, shrines, minimap HUD, dynamic lighting sconces, and procedural ambient music while retaining zero-external-asset footprint.
- **Decision**: Implement status effects (Poison, Stun, Shield Wall, Burn), an Arch-Lich boss at depth 3, interactive ancient shrines and urns, a radar minimap, and a procedural multi-oscillator Web Audio ambient synthesizer with drone and arpeggio generators.
- **Consequences**: Enriches immersion, tactical depth, and audio atmosphere with zero external audio assets or npm packages.

### ADR-004: Hero Class Archetypes, Biome Visuals, Wandering Merchant, and Local Storage Save System
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: Players require diverse playstyles and tactical variety, varied dungeon visuals per floor, in-dungeon economic progression (spending gold), and run state persistence against accidental browser refreshes.
- **Decision**: Introduce three hero classes (Crusader Paladin, Shadow Rogue, Arcane Mage) with distinct base stats, starter equipment, and tactical deck abilities (Shadow Strike, Smoke Bomb, Frost Nova, Arcane Nova). Implement floor biomes with unique tile palettes and dynamic lighting (B1F Damp Crypt, B2F Sunken Caverns with water ripples, B3F Infernal Sanctum with lava fissures and ember particles). Spawn an in-dungeon Hermit Merchant (Grimbold) on B2F with an interactive shop UI for gold expenditure on potions, permanent stat elixirs, and rare relics. Add localStorage serialization (crypt_crawler_save_v2) for seamless run resumption on reload.
- **Consequences**: Significantly expands replayability, strategic depth, and audiovisual variety while preserving the zero external npm/pip dependency architectural invariant.

### ADR-005: Variable-Ratio Reward Engine, Near-Miss Adrenaline Surges, Floor Bounties, and CRT Scanlines
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: Drawing upon CyberPulse behavioral psychology and addictivity mechanics, the game requires variable reinforcement schedules, near-miss survival incentives, Zeigarnik effect micro-goals, and heightened retro arcade visual feel.
- **Decision**: In `crawler/rewards.py`, implement `roll_chest_reward` (20% Critical 2.5x Gold Jackpot, 15% Rare Relics), `roll_urn_reward` (18% Critical Jackpot), `check_near_miss_survival` (triggering +2 MP, +4 DEF barrier, crimson adrenaline screen vignette, and sub-bass audio surge when surviving with <= 28% HP), and `generate_dungeon_bounties` (3 rotating floor contract bounties per floor). In the canvas renderer and UI, introduce toggleable retro CRT phosphor scanlines, expanding spell shockwave rings, and 36-particle golden coin fountain explosions.
- **Consequences**: Significantly amplifies dopamine payoff, tension-release cycles, and session retention with zero runtime external dependencies.

### ADR-006: Relic Slots, Equipment Comparison Diffs and Procedural Visual Feedback
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: Inventory decisions lacked depth: no amulet or boots slots, no side-by-side comparison, limited relic variety, and combat rewards gave little visual confirmation.
- **Decision**: Add backward-compatible `amulet` and `boots` equipment slots to the Python and client models, with save loading defaulting missing keys to `null`. Add six relics (Bloodstone Talisman, Shadowstep Treads, Tome of Blazing Embers, Stormforged Warhammer, Spectral Shroud, Divine Aegis Draught), expose them through merchant stock and loot pools, and render per-stat positive/negative comparison badges for the selected item. Expand procedural canvas detail for entities and props, and add a two-shockwave level-up celebration plus rarity-tinted floating loot badges.
- **Consequences**: The save schema gains optional slot keys but remains readable by older saves; existing item IDs and slot semantics are unchanged; all rendering stays procedural with no external assets or dependencies.

### ADR-007: Correct Inventory Selection, Equipment Caps and Trustworthy Inspection Gate
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: Reviewing the CC-006 commits found the sorted inventory highlighted a slot by grid position instead of the item's true inventory index, stat comparisons labelled proc chances without a percent sign, and the offline merchant fallback omitted the new relics. The headless inspector also reported every recorded check as passed and exited 0 even when a boolean check was false, hiding exactly this class of regression. Separately, +Max HP/MP relics could leave current HP or mana above their cap after unequip, and Python healing capped at the unequipped maximum.
- **Decision**: Track each rendered slot's original inventory index in `data-index` and highlight by that index. Show percentage suffixes and an explicit no-change state in the comparison card. Mirror the six new relics in the offline merchant fallback. Make `tools/inspect_ui.py` count only true audit checks, list failures, and exit 1 when any check fails. Clamp HP and mana to the equipment-granted caps on equip/unequip in both engines, and make Python healing and mana restoration use the effective maxima.
- **Consequences**: Selection feedback stays correct under filtering and rarity sorting; the inspector now blocks silent regressions; current pools can never exceed the caps of the gear actually worn; all behavior remains backwards compatible with existing saves.
