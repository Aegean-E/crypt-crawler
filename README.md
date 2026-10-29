# crypt-crawler

<!-- aegean:media:start -->
<p align="center"><img src="assets/social-preview.png" alt="Crypt-Crawler social preview" width="100%"></p>
<p align="center"><a href="LICENSE"><img src="https://img.shields.io/badge/license-AGL--1.1-7048e8" alt="License"></a> <a href="https://github.com/AegeanWorks/AIKit"><img src="https://img.shields.io/badge/AIKit-integrated-6f42c1" alt="AIKit Integrated"></a></p>
<!-- aegean:media:end -->


Tactical turn-based web dungeon crawler with procedural levels, five-slot equipment, side-by-side loot comparison, filterable inventory, a persistent lore codex, branching soul encounters, risk-for-power black pact altars, sigil-sealed vaults, hover-annotated props, phased boss fights, and headless browser inspection.

## ⚡ 30-Second Cold-Start Quick Reference

- **Runtime Prerequisites**: Python 3.10+ (Standard Library only for runtime; Playwright with Edge for visual UI inspection)
- **Canonical Regression Shield Gate**:
  ```bash
  python -m unittest discover -s tests
  ```

### 🎮 One-Click Launch
- **Windows**: Double-click `PLAY.bat` (automatically detects Python, starts server, and launches default browser)
- **Linux/macOS**: Run `./play.sh`
- **Manual Command**:
  ```bash
  python run.py --open
  ```

### 📸 Headless Browser UI Review & Inspection
```bash
python tools/inspect_ui.py --viewports desktop,laptop,mobile --scenario dungeon --out .inspect
```
The inspector reports every audit check and exits non-zero when any check or console error fails, so it can gate a commit.

### 🤖 AI Mechanics Harness (deterministic, JSON in / JSON out)
```bash
python tools/ai_harness.py catalog
python tools/ai_harness.py play --seed 42 --class paladin --actions '[{"action":"wait"}]'
python tools/ai_harness.py selftest
```
`catalog` prints the classes, the five deck abilities, every action field, the pact choices and the state keys. `play` drives the shipped JavaScript engine in headless Edge, installs a seeded `Math.random`, and prints one JSON object per run: each step plus the final state (player, monsters, props, log tail, `layout_hash`). Because the RNG is seeded, the same seed and action list reproduce the same dungeon, so an agent can test a mechanic, change the code, and diff the result. `selftest` proves the harness and the mechanics it exposes (layout determinism, deck labels per class, all three pact bargains surviving turns, boss damage, save round-trip, number-row hotkeys casting instead of moving, numpad movement, single-flight floor descent and new-run precedence) and exits non-zero on any failure. Script file shape:
```json
{"seed": 42, "depth": 1, "class": "rogue",
 "actions": [{"action": "move", "dx": 1, "dy": 0}, {"action": "ability", "slot": 2}]}
```
Every action object is validated before a browser starts. Playwright with Edge is only needed for `play` and `selftest`; `catalog` and the unit tests run on the standard library.

### 🧱 UI Guard (AIKit `aikit ui`)
`.aikit/ui.json` declares the `game-ui` surface (`static/**`), the protected paths, the fast proof (`python -m unittest discover -s tests`) and the inventory command (`python tools/ui_inventory.py`), which prints one stable line per control, choice, handler group and theme token.
```bash
cd ..            # AIKit root
python aikit.py ui begin crypt-crawler --surface game-ui
python aikit.py ui verify crypt-crawler      # add --json for stable finding codes
python aikit.py ui finish crypt-crawler --reviewed
python aikit.py ui abort crypt-crawler
```
`begin` needs a clean, green baseline; `verify` rejects edits outside the surface, protected-path changes, diff-budget overruns, a lost inventory entry, hardcoded colours outside the theme paths, and a failed proof; `finish` also records the human review. Delivery guards (`check --strict`, `publish`) refuse an open UI task, and `ui_required` can be turned on in `.aikit/project.json` once the first UI task has finished.

### 📱 Mobile Layout
Below 768px the three panels stack into one vertically scrolling column; the action deck and the on-screen movement D-pad stay fully visible above it, and the header wraps instead of overflowing sideways.

### 🛠️ AIKit Commands (run from the AIKit folder)
| Role | Command |
|---|---|
| Status, task and gates | `python aikit.py status crypt-crawler` |
| Phase 4: every gate | `python aikit.py check crypt-crawler` |
| Repair memory and map, then check | `python aikit.py fix crypt-crawler` |
| Resume an interrupted task | `python aikit.py resume crypt-crawler` |

The `mechanics` gate runs `python tools/ai_harness.py selftest`, declared in `.aikit/project.json` as `mechanics.core` (the headless rules: `crawler`, `static/js`, `tools/ai_harness.py`) and `mechanics.test`, so a mechanics regression fails the same gate set as the unit suite.

## 📦 What's Inside

```text
crypt-crawler/
├── .gitignore                <- transient state & screenshots excluded
├── assets/                   <- reviewed logo, social preview and screenshots
├── LICENSE                   <- Aegean Game License 1.1 (AGL-1.1): DRM-free personal play
├── LICENSES/                 <- REUSE license texts
├── REUSE.toml                <- Machine-readable SPDX metadata
├── ASSETS.md                 <- Asset/data manifest: what the license covers
├── PLAY.bat                  <- Windows one-click launcher
├── play.sh                   <- POSIX one-click launcher
├── README.md                 <- documentation and quickstart
├── COMMERCIAL.md
├── run.py                    <- lightweight HTTP server entrypoint
├── crawler/                  <- Python engine package
│   ├── __init__.py
│   ├── dungeon.py            <- procedural dungeon generator
│   ├── entities.py           <- player and monster simulation
│   ├── combat.py             <- combat calculations and status effects
│   ├── lore.py               <- codex entries, pact altars and discovery events
│   ├── rewards.py            <- variable-ratio jackpots, near-miss & bounties
│   └── server.py             <- HTTP request handler & REST endpoints
├── static/                   <- Web UI assets (zero build step)
│   ├── index.html            <- modern responsive HTML5 shell
│   ├── css/
│   │   └── style.css         <- dark fantasy UI, glowing HUD, layout
│   └── js/
│       ├── engine.js         <- game loop, turn management, state
│       ├── dungeon.js        <- client dungeon state & fog of war
│       ├── renderer.js       <- procedural canvas tiles & lighting
│       ├── ui.js             <- HUD, inventory panel, combat log
│       └── audio.js          <- Web Audio API synthetic SFX synthesizer
├── tools/
│   ├── inspect_ui.py         <- Playwright headless Edge UI inspector
│   ├── ai_harness.py         <- seeded JSON gameplay harness for agents
│   └── ui_inventory.py       <- deterministic control/handler inventory
├── tests/
│   ├── __init__.py
│   ├── test_ai_harness.py    <- harness validation and UI inventory tests
│   ├── test_combat.py        <- combat rules tests
│   ├── test_dungeon.py       <- procedural generation tests
│   ├── test_inspect.py       <- inspection configuration tests
│   ├── test_lore.py          <- codex data and /api/lore endpoint tests
│   ├── test_rewards.py       <- reward jackpots, near-miss & bounty tests
│   └── test_server.py        <- web server endpoints tests
└── .aikit/                   <- project memory: record, ledger, decisions, ui.json guard
```

<!-- aegean:brand-assets:start -->
## 🎨 Brand Assets

> **AI-Generated Brand Artwork.** The banner and logo are **AI-generated brand assets**. They are illustrative and may not literally depict every feature or the full project scope.
<!-- aegean:brand-assets:end -->

## 📜 License

Free for personal play under the Aegean Game License 1.1 (AGL-1.1); see [LICENSE](LICENSE). It is DRM-free: Licensor ships no DRM and a distributor may not add it. Streaming, modding and free mods are allowed. Commercial use, paid mods and AI training need the Aegean Commercial License 1.0 (ACL-1.0); see [COMMERCIAL.md](COMMERCIAL.md).

<!-- aegean:screenshots:start -->
## Screenshots

<a href="https://github.com/AegeanWorks/Crypt-Crawler/commit/941f16f"><img src="assets/screenshots/2026-10-28-index.png" alt="Crypt-Crawler interface at 2026-10-28"></a>

*commit `941f16f` · 2026-10-28*
<!-- aegean:screenshots:end -->
