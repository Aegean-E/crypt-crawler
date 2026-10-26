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

### ADR-008: Single-Scroll Mobile Layout Below 768px
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: A visual review of the shipped build showed the phone layout was unusable. Below 768px the shell and `.game-main` stayed viewport-bound, so `.panel-viewport` compressed to 288px while its canvas, 7-button action deck and D-pad needed about 554px; because that panel also had `overflow: hidden`, only the top 12px of the deck was painted and the D-pad was entirely invisible. Panel flex-shrinking pushed the character panel over the clipped deck, the header's Guide and New Game buttons overran the right edge by 154px (document scrollWidth 544 at a 390px viewport), and the backpack was sealed inside a second nested scroll context.
- **Decision**: Below 768px treat the page as one scrolling document: the shell loses its height clamp and `overflow`, `.game-main` becomes a non-shrinking flex column with visible overflow, and every `.panel` keeps its content height (`flex: 0 0 auto`) while `.panel-viewport` stops clipping. The header action group wraps and its buttons shrink slightly. `tools/inspect_ui.py` now asserts, per viewport, that no horizontal scroll exists, the last action-deck button stays inside the viewport panel, the D-pad is shown only at narrow widths and stays inside that panel, and the inventory panel is reachable within the document height.
- **Consequences**: Mobile players can reach every action, the D-pad and the full backpack through one vertical scroll; desktop and laptop layouts are untouched because every change is scoped to the 768px breakpoint; the layout audit fails the build if any of these regressions return.

### ADR-009: Lore Codex, Lost Souls, Sigil Vaults and Boss Phases
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: Combat and loot were solid but the run had no narrative payoff and little non-combat interaction: story existed only as one-line log text, discoveries were not recorded anywhere, every floor played the same way, and the final boss was a single stat check. Reviewing the save path also showed prop state was not persisted, so resuming a run resurrected opened chests, untriggered traps and unbroken urns.
- **Decision**: Add a data-only lore codex in `crawler/lore.py` served by `/api/lore`, with a Journal panel that shows discovered entries and hides the rest; discoveries are recorded in `localStorage` (`crypt_crawler_lore_v1`) so they survive death. Add one Lost Soul per floor, a dialogue with three meaningfully different choices (ember healing, penitent gold/relic, story plus XP). Add three floor sigils and a sealed vault that pays a legendary relic, gold, XP and lore, tracked by a header pill and a bounty. Give Malakor two phases (50% summons two skeletons and raises attack; 25% enrages) and show champion affixes and status durations in the hover tooltip. Persist every prop's spent state in the save and parse both legacy coordinate arrays and the new objects. Block keyboard and canvas input while a modal is open.
- **Consequences**: Exploration and lore now carry across runs, floors have an optional goal with a real reward, the final fight changes shape, hover inspection is informative, and a resumed run cannot farm the same chests again. All new save fields default safely for older saves, `/api/lore` is additive, and the headless audit asserts journal, dialogue, prop round-trip, vault payout and both boss phases.
- Cross-principle check: no principle section changed. Serves PRINCIPLE-001 (one data path), PRINCIPLE-003 (additive contract, tested), PRINCIPLE-005 (README updated), PRINCIPLE-014 (failing-first tests for lore and generation) and PRINCIPLE-015 (live browser dogfooding).

### ADR-010: Props Are Reserved Tiles; Offline Parity and Immediate Level-Ups
- **Date**: 2026-10-25
- **Status**: Accepted
- **Context**: Reviewing CC-009 found monsters could cover interactive props. Random spawns ignored chests, shrines and urns, and the depth-3 boss escorts ignored every prop: seed 999 placed an escort skeleton on a sigil. The browser-side movement and summon checks had the same gap, so a Risen Skeleton could be raised onto a sigil or the vault. The offline fallback dungeon also had no Lost Soul, sigils or vault, so the new objective vanished whenever `/api/new-game` was unavailable. Separately, bounty and kill-streak bonuses added XP directly instead of through `_grantXp`, deferring level-ups that should fire immediately, and `resolveSoul` consumed a soul even for an unknown choice.
- **Decision**: Build one `reserved` set of every interactive prop plus spawn and stairs on the server, and use it for both random spawns and the two boss escorts. Mirror the rule in the client `_isOccupied` so monsters never move or get summoned onto merchants, chests, shrines, urns, souls, sigils or the vault. Give the offline fallback one soul, three sigils and a vault on walkable room tiles, and move its fixed spider off the shrine. Validate the soul choice before marking the soul resolved. Route bounty, double-slay and rampage XP through `_grantXp` so a level-up is immediate and identical in every source.
- **Consequences**: Every interactive prop stays visible and reachable, and the floor objective and boss phases work identically online, offline and in the browser. Level-ups no longer lag behind bounty payouts. Spawn placement now reserves more cells, which can reduce monster count by at most the number of props in a room. The headless audit asserts offline souls/sigils/vault, prop occupancy, and the server test sweeps seeds and depths for prop coverage.
- Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (platform parity between server and client), PRINCIPLE-014 (regression test for spawn coverage) and PRINCIPLE-015 (live offline-path dogfooding).

## Licensing migration (agpl-final)

- New versions use the Aegean Game License 1.1 (AGL-1.1); versions up to and including `agpl-final` remain under GNU AGPL-3.0.
- Rights holder: AegeanWorks; commercial use under ACL-1.0.
- Counsel review of the 1.1 texts remains pending.
