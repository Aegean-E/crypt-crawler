# crypt-crawler

[![Built with AIKit](https://img.shields.io/badge/built%20with-AIKit-6f42c1)](https://github.com/Aegean-E/AIKit)

Tactical turn-based web dungeon crawler with procedural levels, inventory, combat, and headless browser inspection.

## ⚡ 30-Second Cold-Start Quick Reference

- **Runtime Prerequisites**: Python 3.10+ (Standard Library only for runtime; Playwright with Edge for visual UI inspection)
- **Canonical Regression Shield Gate**:
  ```bash
  python -m unittest discover -s tests
  ```

### 🎮 Running the Game
```bash
python run.py
```
Then navigate to `http://localhost:8080` in your web browser.

### 📸 Headless Browser UI Review & Inspection
```bash
python tools/inspect_ui.py --viewports desktop,laptop,mobile --scenario dungeon --out .inspect
```

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
├── LICENSE                   <- GNU AGPL-3.0
├── README.md                 <- documentation and quickstart
├── run.py                    <- lightweight HTTP server entrypoint
├── crawler/                  <- Python engine package
│   ├── __init__.py
│   ├── dungeon.py            <- procedural dungeon generator
│   ├── entities.py           <- player and monster simulation
│   ├── combat.py             <- combat calculations and status effects
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
│   └── test_server.py        <- web server endpoints tests
└── .aikit/                   <- project memory: record, ledger, decisions
```

## 📜 License

GNU Affero General Public License v3.0; see [LICENSE](LICENSE).
