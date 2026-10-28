# crypt-crawler

<!-- aegean:media:start -->
<p align="center"><img src="assets/logo.png" alt="Crypt-Crawler logo" width="96" height="96"></p>
<p align="center"><img src="assets/social-preview.png" alt="Crypt-Crawler social preview" width="100%"></p>
<!-- aegean:media:end -->

[![Built with AIKit](https://img.shields.io/badge/built%20with-AIKit-6f42c1)](https://github.com/AegeanWorks/AIKit)

Tactical turn-based web dungeon crawler with procedural levels, five-slot equipment, side-by-side loot comparison, filterable inventory, a persistent lore codex, branching soul encounters, sigil-sealed vaults, phased boss fights, and headless browser inspection.

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

### 📱 Mobile Layout
Below 768px the three panels stack into one vertically scrolling column; the action deck and the on-screen movement D-pad stay fully visible above it, and the header wraps instead of overflowing sideways.

### 🛠️ AIKit Commands (run from the AIKit folder)
| Role | Command |
|---|---|
| Status, task and gates | `python aikit.py status crypt-crawler` |
| Phase 4: every gate | `python aikit.py check crypt-crawler` |
| Repair memory and map, then check | `python aikit.py fix crypt-crawler` |
| Resume an interrupted task | `python aikit.py resume crypt-crawler` |

## 📦 What's Inside

```text
crypt-crawler/
├── .gitignore                <- transient state & screenshots excluded
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
│   ├── lore.py               <- codex entries, categories and discovery events
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
│   └── inspect_ui.py         <- Playwright headless Edge UI inspector
├── tests/
│   ├── __init__.py
│   ├── test_combat.py        <- combat rules tests
│   ├── test_dungeon.py       <- procedural generation tests
│   ├── test_inspect.py       <- inspection configuration tests
│   ├── test_lore.py          <- codex data and /api/lore endpoint tests
│   ├── test_rewards.py       <- reward jackpots, near-miss & bounty tests
│   └── test_server.py        <- web server endpoints tests
└── .aikit/                   <- project memory: record, ledger, decisions
```

## 📜 License

Free for personal play under the Aegean Game License 1.1 (AGL-1.1); see [LICENSE](LICENSE). It is DRM-free: Licensor ships no DRM and a distributor may not add it. Streaming, modding and free mods are allowed. Commercial use, paid mods and AI training need the Aegean Commercial License 1.0 (ACL-1.0); see [COMMERCIAL.md](COMMERCIAL.md).

<!-- aegean:screenshots:start -->
## Screenshots

<a href="https://github.com/AegeanWorks/Crypt-Crawler/commit/941f16f"><img src="assets/screenshots/2026-10-28-index.png" alt="Crypt-Crawler interface at 2026-10-28"></a>

*Crypt-Crawler interface captured from C:\Users\Yunus-Emre\Desktop\portable_agent_kit\projects\crypt-crawler\static\index.html* · commit `941f16f` · 2026-10-28
<!-- aegean:screenshots:end -->
