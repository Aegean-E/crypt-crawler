"""
AI gameplay harness for Crypt-Crawler: a stable, deterministic way for an agent (or a
test) to read the live game state, play actions, and verify mechanics without guessing
at canvas pixels.

The rules live in `static/js/engine.js`; this tool drives that engine in headless Edge
through Playwright, so it tests the shipped mechanics rather than a Python copy. Every
action is one JSON object, every reply is one JSON object, and `--seed` installs a
deterministic `Math.random`, so a scripted run reproduces exactly.

Usage:
    python tools/ai_harness.py catalog
    python tools/ai_harness.py play --seed 42 --class paladin --actions '[{"action":"wait"}]'
    python tools/ai_harness.py play --script script.json --out run.json
    python tools/ai_harness.py selftest

Script shape:
    {"seed": 42, "depth": 1, "class": "paladin",
     "actions": [{"action": "move", "dx": 1, "dy": 0}, {"action": "ability", "slot": 2}]}
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from crawler.entities import HERO_CLASSES
from crawler.server import start_background_server

MAX_ACTIONS = 200
ABILITIES: Dict[str, Dict[int, str]] = {
    "paladin": {1: "Strike", 2: "Fireball", 3: "Bash", 4: "Heal", 5: "Barrier"},
    "rogue": {1: "Strike", 2: "Shadow", 3: "Smoke", 4: "Fireball", 5: "Heal"},
    "mage": {1: "Strike", 2: "Fireball", 3: "Frost", 4: "Nova", 5: "Barrier"},
}
PACT_CHOICES = ("wrath", "ward", "avarice")
ACTION_KEYS: Dict[str, tuple] = {
    "move": ("dx", "dy"),
    "ability": ("slot",),
    "potion": (),
    "use_item": ("index",),
    "wait": (),
    "search": (),
    "teleport": ("x", "y"),
    "pact": ("choice",),
    "descend": (),
    "save": (),
}

DETERMINISTIC_RNG = """
(() => {
  let state = %d >>> 0;
  Math.random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
"""

STATE_JS = """
() => {
  const e = window.gameEngine;
  const point = (p) => ({ x: p.x, y: p.y });
  const log = Array.from(document.querySelectorAll("#chronicleLog .log-entry"))
    .slice(-6)
    .map((entry) => entry.textContent.trim());
  const p = e.player;
  return {
    turn: e.turn,
    depth: e.depth,
    kills: e.kills,
    heroClass: e.heroClass,
    gameOver: e.gameOver,
    victory: e.victory,
    transitioning: Boolean(e.transitioning),
    modalOpen: e.ui.isModalOpen(),
    player: {
      name: p.name, level: p.level, hp: p.hp, max_hp: p.max_hp,
      mana: p.mana, max_mana: p.max_mana, attack: p.attack, defense: p.defense,
      gold: p.gold, xp: p.xp, next_xp: p.next_xp,
      perm_attack: p.perm_attack || 0, perm_defense: p.perm_defense || 0,
      bonus_max_hp: p.bonus_max_hp || 0, bonus_max_mana: p.bonus_max_mana || 0,
      crit_chance: p.crit_chance, x: p.x, y: p.y,
      status_effects: p.status_effects || {},
      inventory: (p.inventory || []).map((item) => item.name),
      equipped: Object.fromEntries(
        Object.entries(p.equipped || {}).map(([slot, item]) => [slot, item ? item.name : null])
      ),
    },
    monsters: e.monsters
      .filter((m) => m.hp > 0)
      .map((m) => ({
        name: m.name, type: m.type, x: m.x, y: m.y, hp: m.hp, max_hp: m.max_hp,
        attack: m.attack, defense: m.defense, is_boss: Boolean(m.is_boss),
        is_champion: Boolean(m.is_champion),
        status_effects: m.status_effects || {},
      })),
    dungeon: {
      seed: e.dungeon.seed,
      depth: e.dungeon.depth,
      biome: e.dungeon.biome,
      width: e.dungeon.width,
      height: e.dungeon.height,
      spawn: { x: e.dungeon.playerSpawn[0], y: e.dungeon.playerSpawn[1] },
      stairs: { x: e.dungeon.stairsPos[0], y: e.dungeon.stairsPos[1] },
      visible_tiles: e.dungeon.visible.size,
      chests: e.dungeon.chests.map((c) => ({ ...point(c), opened: c.opened })),
      shrines: e.dungeon.shrines.map((s) => ({ ...point(s), activated: s.activated })),
      urns: e.dungeon.urns.map((u) => ({ ...point(u), broken: u.broken })),
      souls: (e.dungeon.souls || []).map((s) => ({ ...point(s), resolved: s.resolved })),
      sigils: (e.dungeon.sigils || []).map((s) => ({ ...point(s), collected: s.collected })),
      vault: e.dungeon.vault
        ? { x: e.dungeon.vault.x, y: e.dungeon.vault.y, opened: e.dungeon.vault.opened }
        : null,
      pacts: (e.dungeon.pacts || []).map((a) => ({ ...point(a), used: a.used })),
      merchants: (e.dungeon.merchants || []).map(point),
      traps: (e.dungeon.traps || []).map((t) => ({
        ...point(t), triggered: t.triggered, discovered: Boolean(t.discovered),
      })),
      sconces: (e.dungeon.sconces || []).map(point),
      rooms: (e.dungeon.rooms || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
    },
    sigilCount: e.sigilCount,
    bounties: (e.bounties || []).map((b) => ({
      id: b.id, title: b.title, progress: b.progress, target: b.target, completed: b.completed,
    })),
    loreUnlocked: (e.loreUnlocked || []).length,
    log,
  };
}
"""


def catalog() -> Dict[str, Any]:
    """Everything an agent needs to plan a run without reading the source."""
    return {
        "schema": 1,
        "seedable": True,
        "deterministic_rng": "mulberry32 seeded from --seed",
        "classes": {
            key: {
                "title": value["title"],
                "hp": value["hp"],
                "mana": value["mana"],
                "attack": value["attack"],
                "defense": value["defense"],
                "crit_chance": value["crit_chance"],
                "abilities": {str(slot): name for slot, name in ABILITIES.get(key, {}).items()},
            }
            for key, value in HERO_CLASSES.items()
        },
        "actions": {
            name: {"fields": list(fields)} for name, fields in ACTION_KEYS.items()
        },
        "inputs": {
            "script": "--script run.json: {seed, depth, class, actions}",
            "actions": "--actions '<json>' or --actions @actions.json (shell-safe)",
            "output": "one JSON object: ok, steps, layout_hash, errors, failure, final",
        },
        "pact_choices": list(PACT_CHOICES),
        "props": [
            "chest", "trap", "shrine", "urn", "merchant", "soul", "sigil", "vault", "pact",
        ],
        "state_keys": [
            "turn", "depth", "kills", "heroClass", "gameOver", "victory",
            "transitioning", "modalOpen", "player", "monsters", "dungeon",
            "sigilCount", "bounties", "loreUnlocked", "log",
        ],
    }


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_action(action: Any) -> List[str]:
    """Field-level problems in one action object; empty means valid."""
    if not isinstance(action, dict):
        return ["action must be an object"]
    name = action.get("action")
    if name not in ACTION_KEYS:
        return [f"unknown action {name!r}; expected one of {sorted(ACTION_KEYS)}"]
    problems: List[str] = []
    for field in ACTION_KEYS[name]:
        if field not in action:
            problems.append(f"{name} needs '{field}'")
    if name == "move":
        for field in ("dx", "dy"):
            if not _is_int(action.get(field)) or abs(action.get(field)) > 1:
                problems.append("move dx/dy must be -1, 0 or 1")
        if action.get("dx") == 0 and action.get("dy") == 0:
            problems.append("move needs dx or dy")
    elif name == "ability":
        slot = action.get("slot")
        if not _is_int(slot) or slot not in (1, 2, 3, 4, 5):
            problems.append("ability slot must be 1-5")
    elif name == "use_item":
        index = action.get("index")
        if not _is_int(index) or index < 0:
            problems.append("use_item index must be a non-negative integer")
    elif name == "teleport":
        for field in ("x", "y"):
            if not _is_int(action.get(field)):
                problems.append(f"teleport {field} must be an integer")
    elif name == "pact":
        if action.get("choice") not in PACT_CHOICES:
            problems.append(f"pact choice must be one of {list(PACT_CHOICES)}")
    return problems


def parse_script(raw: Any) -> Dict[str, Any]:
    """Validated run script; raises ValueError listing every problem."""
    if not isinstance(raw, dict):
        raise ValueError("script must be a JSON object")
    problems: List[str] = []
    seed = raw.get("seed")
    if not _is_int(seed):
        problems.append("seed must be an integer (determinism needs it)")
    depth = raw.get("depth", 1)
    if not _is_int(depth) or depth < 1:
        problems.append("depth must be an integer >= 1")
    hero_class = raw.get("class", "paladin")
    if hero_class not in HERO_CLASSES:
        problems.append(f"class must be one of {sorted(HERO_CLASSES)}")
    actions = raw.get("actions", [])
    if not isinstance(actions, list):
        problems.append("actions must be a list")
        actions = []
    if len(actions) > MAX_ACTIONS:
        problems.append(f"at most {MAX_ACTIONS} actions per script")
    for index, action in enumerate(actions):
        problems.extend(f"actions[{index}]: {problem}" for problem in validate_action(action))
    if problems:
        raise ValueError("; ".join(problems))
    return {
        "seed": seed,
        "depth": depth,
        "class": hero_class,
        "actions": actions,
    }


def layout_hash(state: Dict[str, Any]) -> str:
    """Stable fingerprint of everything the seeded generator decides."""
    dungeon = state["dungeon"]
    monsters = sorted((m["type"], m["x"], m["y"]) for m in state["monsters"])
    material = {
        "seed": dungeon["seed"],
        "depth": dungeon["depth"],
        "biome": dungeon["biome"],
        "rooms": [(r["x"], r["y"], r["w"], r["h"]) for r in dungeon["rooms"]],
        "spawn": dungeon["spawn"],
        "stairs": dungeon["stairs"],
        "monsters": monsters,
        "chests": [(c["x"], c["y"]) for c in dungeon["chests"]],
        "shrines": [(s["x"], s["y"]) for s in dungeon["shrines"]],
        "urns": [(u["x"], u["y"]) for u in dungeon["urns"]],
        "souls": [(s["x"], s["y"]) for s in dungeon["souls"]],
        "sigils": [(s["x"], s["y"]) for s in dungeon["sigils"]],
        "vault": dungeon["vault"],
        "pacts": [(p["x"], p["y"]) for p in dungeon["pacts"]],
        "merchants": [(m["x"], m["y"]) for m in dungeon["merchants"]],
        "traps": [(t["x"], t["y"]) for t in dungeon["traps"]],
        "sconces": [(s["x"], s["y"]) for s in dungeon["sconces"]],
    }
    encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


class Harness:
    """One server and one headless browser shared by every page the harness opens."""

    def __init__(self, headless: bool = True) -> None:
        self.headless = headless
        self._server: Any = None
        self._playwright: Any = None
        self._browser: Any = None
        self.port = 0
        # Uncaught page errors and console errors on the current page. A run that
        # throws is not a valid observation, so `play` reports and fails on these.
        self.errors: List[str] = []

    def __enter__(self) -> "Harness":
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:  # pragma: no cover - environment guard
            raise SystemExit(
                "Playwright is required for the AI harness. Why: the harness drives the "
                "shipped JavaScript engine. Fix: pip install playwright && playwright install msedge"
            ) from exc
        self._server, self.port = start_background_server(port=0)
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=self.headless, channel="msedge"
        )
        return self

    def __exit__(self, *exc_info: Any) -> None:
        if self._browser is not None:
            self._browser.close()
        if self._playwright is not None:
            self._playwright.stop()
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()

    def open_page(
        self, seed: int, depth: int = 1, hero_class: str = "paladin", rng_seed: Optional[int] = None
    ) -> Any:
        """A page whose engine has started from the given seed, class and depth."""
        self.errors = []
        context = self._browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("pageerror", lambda exc: self.errors.append(f"pageerror: {exc}"))
        page.on(
            "console",
            lambda msg: self.errors.append(f"console.{msg.type}: {msg.text}")
            if msg.type == "error"
            else None,
        )
        page.add_init_script(DETERMINISTIC_RNG % (rng_seed if rng_seed is not None else seed))
        page.goto(f"http://127.0.0.1:{self.port}/", wait_until="domcontentloaded")
        page.wait_for_function("window.gameEngine && window.gameEngine.player", timeout=15000)
        page.evaluate(
            """async ({ seed, depth, heroClass }) => {
                const e = window.gameEngine;
                e.clearSavedRun();
                await e.start(seed, depth, heroClass, false);
            }""",
            {"seed": seed, "depth": depth, "heroClass": hero_class},
        )
        page.evaluate("() => window.gameEngine._startRenderLoop()")
        return page

    @staticmethod
    def state(page: Any) -> Dict[str, Any]:
        return page.evaluate(STATE_JS)

    @staticmethod
    def apply(page: Any, action: Dict[str, Any]) -> Dict[str, Any]:
        """Run one validated action and return the state after it."""
        page.evaluate(
            """async (action) => {
                const e = window.gameEngine;
                switch (action.action) {
                    case "move": e.stepPlayer(action.dx, action.dy); break;
                    case "ability": e.triggerSlotAction(action.slot); break;
                    case "potion": e.quickPotion(); break;
                    case "use_item":
                        if (action.index >= e.player.inventory.length) {
                            throw new Error(`use_item index ${action.index} is outside the ${e.player.inventory.length}-item backpack`);
                        }
                        e.useInventoryItem(action.index);
                        break;
                    case "wait": e.waitTurn(); break;
                    case "search": e.searchForTraps(); break;
                    case "teleport":
                        // A debug pose, not a teleport spell: refuse to stand in rock, or
                        // every later state reads as a player outside the map.
                        if (!e.dungeon.isWalkable(action.x, action.y)) {
                            throw new Error(`teleport target ${action.x},${action.y} is not walkable`);
                        }
                        e.player.x = action.x; e.player.y = action.y;
                        e.dungeon.updateFOV(e.player.x, e.player.y, 7);
                        break;
                    case "pact": {
                        const pact = (e.dungeon.pacts || []).find((p) => !p.used);
                        if (!pact) throw new Error("no unused pact altar on this floor");
                        e.resolvePact(pact, action.choice);
                        break;
                    }
                    case "descend": await e.descendFloor(); break;
                    case "save": e.saveGameState(); break;
                    default: throw new Error(`unhandled action ${action.action}`);
                }
            }""",
            action,
        )
        page.wait_for_timeout(30)
        return Harness.state(page)


def _deck_labels(page: Any) -> List[str]:
    """The five ability labels, excluding the always-present Potion and Wait buttons."""
    return page.evaluate(
        "() => Array.from(document.querySelectorAll('#tacticalDeck .deck-label'))"
        ".map((node) => node.textContent.trim()).slice(0, 5)"
    )


def _check(name: str, passed: bool, detail: Any = None) -> Dict[str, Any]:
    entry: Dict[str, Any] = {"check": name, "passed": bool(passed)}
    if detail is not None:
        entry["detail"] = detail
    return entry


def selftest(harness: Harness) -> List[Dict[str, Any]]:
    """Prove the mechanics the harness claims to expose actually work."""
    checks: List[Dict[str, Any]] = []
    seed = 4242

    page = harness.open_page(seed)
    first = harness.state(page)
    same = harness.open_page(seed)
    checks.append(_check(
        "seeded_layout_is_reproducible",
        layout_hash(first) == layout_hash(harness.state(same)),
        layout_hash(first),
    ))
    page.context.close()
    same.context.close()

    for hero_class, abilities in ABILITIES.items():
        page = harness.open_page(seed, hero_class=hero_class)
        labels = _deck_labels(page)
        expected = [abilities[slot] for slot in sorted(abilities)]
        checks.append(_check(
            f"deck_labels_match_catalog_{hero_class}",
            labels == expected,
            {"expected": expected, "actual": labels},
        ))
        page.context.close()

    page = harness.open_page(seed)
    before = harness.state(page)
    after = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const pact = e.dungeon.pacts[0];
            e.resolvePact(pact, "wrath");
            return {
                attack: e.player.attack, maxHp: e.player.max_hp,
                bonusHp: e.player.bonus_max_hp || 0, permAttack: e.player.perm_attack || 0,
            };
        }"""
    )
    page.evaluate("() => { const e = window.gameEngine; e.finishPlayerTurn(); e.finishPlayerTurn(); }")
    persisted = harness.state(page)["player"]
    checks.append(_check(
        "pact_wrath_applies_and_survives_turns",
        after["permAttack"] == before["player"]["perm_attack"] + 4
        and after["maxHp"] == before["player"]["max_hp"] - max(5, before["player"]["max_hp"] // 5)
        and persisted["attack"] >= after["attack"]
        and persisted["max_hp"] == after["maxHp"],
        {"after": after, "persisted_attack": persisted["attack"], "persisted_max_hp": persisted["max_hp"]},
    ))
    page.context.close()

    page = harness.open_page(seed)
    ward = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const before = { hp: e.player.max_hp, mana: e.player.max_mana };
            e.resolvePact(e.dungeon.pacts[0], "ward");
            return { before, hp: e.player.max_hp, mana: e.player.max_mana };
        }"""
    )
    checks.append(_check(
        "pact_ward_trades_mana_for_health",
        ward["hp"] == ward["before"]["hp"] + 18 and ward["mana"] == ward["before"]["mana"] - 3,
        ward,
    ))
    page.context.close()

    page = harness.open_page(seed)
    avarice = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e.monsters = [];
            const gold = e.player.gold;
            e.resolvePact(e.dungeon.pacts[0], "avarice");
            return {
                goldGain: e.player.gold - gold,
                wraiths: e.monsters.filter((m) => m.type === "wraith").length,
            };
        }"""
    )
    checks.append(_check(
        "pact_avarice_pays_and_raises_wraiths",
        avarice["goldGain"] >= 150 and avarice["wraiths"] == 2,
        avarice,
    ))
    page.context.close()

    # The wraiths Avarice raises must be real enemies: killable, rewarding, removable.
    page = harness.open_page(seed)
    fight = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e.monsters = [];
            e.resolvePact(e.dungeon.pacts[0], "avarice");
            const wraiths = e.monsters.filter((m) => m.type === "wraith");
            if (!wraiths.length) return { found: false };
            const target = wraiths[0];
            const xpBefore = e.player.xp;
            const levelBefore = e.player.level;
            let guard = 0;
            while (target.hp > 0 && guard < 80) {
                e.attackMonster(target);
                guard += 1;
            }
            return {
                found: true,
                killed: target.hp <= 0,
                alive: e.monsters.filter((m) => m.type === "wraith" && m.hp > 0).length,
                killCount: e.kills,
                gained: e.player.xp !== xpBefore || e.player.level > levelBefore,
            };
        }"""
    )
    checks.append(_check(
        "avarice_wraiths_are_killable_enemies",
        fight.get("found") is True
        and fight["killed"] is True
        and fight["alive"] == 1
        and fight["killCount"] == 1
        and fight["gained"] is True,
        fight,
    ))
    page.context.close()

    page = harness.open_page(seed, depth=3)
    combat = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const boss = e.monsters.find((m) => m.is_boss);
            if (!boss) return { found: false };
            const hp = boss.hp;
            e.attackMonster(boss);
            return { found: true, before: hp, after: boss.hp };
        }"""
    )
    checks.append(_check(
        "melee_damages_the_boss",
        combat.get("found") is True and combat["after"] < combat["before"],
        combat,
    ))
    page.context.close()

    page = harness.open_page(seed)
    saved = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e.resolvePact(e.dungeon.pacts[0], "wrath");
            e.saveGameState();
            const raw = JSON.parse(localStorage.getItem("crypt_crawler_save_v2"));
            return {
                pacts: raw.dungeon.pacts,
                used: (raw.dungeon.pacts || []).every((p) => p.used === true),
                permAttack: raw.player.perm_attack || 0,
                bonusHp: raw.player.bonus_max_hp || 0,
            };
        }"""
    )
    checks.append(_check(
        "save_round_trips_pact_state",
        bool(saved["pacts"]) and saved["used"] and saved["permAttack"] == 4 and saved["bonusHp"] < 0,
        saved,
    ))
    page.context.close()

    # Regression: the number-row deck hotkeys must cast, not move. Movement used the
    # same digits until `e.code` separated the numpad.
    page = harness.open_page(seed)
    keys = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e.monsters.length = 0;
            const origin = { x: e.player.x, y: e.player.y };
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", code: "Digit2" }));
            const entries = Array.from(document.querySelectorAll("#chronicleLog .log-entry"));
            const afterDigit = {
                x: e.player.x,
                y: e.player.y,
                log: entries.length ? entries[entries.length - 1].textContent.trim() : "",
            };
            const dirs = [["Numpad8", 0, -1], ["Numpad2", 0, 1], ["Numpad4", -1, 0], ["Numpad6", 1, 0]];
            const move = dirs.find(([, dx, dy]) =>
                e.dungeon.isWalkable(origin.x + dx, origin.y + dy));
            if (!move) return { skipped: true, origin, afterDigit };
            window.dispatchEvent(new KeyboardEvent("keydown",
                { key: move[0].replace("Numpad", ""), code: move[0] }));
            return {
                skipped: false, origin, afterDigit,
                to: { x: e.player.x, y: e.player.y },
                code: move[0],
            };
        }"""
    )
    checks.append(_check(
        "deck_digit_hotkey_casts_instead_of_moving",
        keys.get("skipped") is not True
        and keys["afterDigit"]["x"] == keys["origin"]["x"]
        and keys["afterDigit"]["y"] == keys["origin"]["y"]
        and "Fireball" in keys["afterDigit"]["log"],
        keys,
    ))
    checks.append(_check(
        "numpad_code_moves_one_tile",
        keys.get("skipped") is not True
        and abs(keys["to"]["x"] - keys["origin"]["x"]) + abs(keys["to"]["y"] - keys["origin"]["y"]) == 1,
        keys,
    ))
    page.context.close()

    # Regression: a pending descent must be single-flight and must always clear its flag.
    page = harness.open_page(seed)
    guard = page.evaluate(
        """async () => {
            const e = window.gameEngine;
            const original = window.fetch;
            let release;
            window.fetch = (url, options) => {
                if (String(url).includes("/api/new-game")) {
                    return new Promise((resolve) => {
                        release = () => resolve({ ok: false, status: 500 });
                    });
                }
                return original(url, options);
            };
            const startDepth = e.depth;
            const first = e.descendFloor();
            const during = e.transitioning;
            const second = e.descendFloor();
            release();
            await Promise.all([first, second]);
            window.fetch = original;
            return {
                during,
                startDepth,
                depth: e.depth,
                transitioning: e.transitioning,
            };
        }"""
    )
    checks.append(_check(
        "descent_is_single_flight_and_clears_its_flag",
        guard["during"] is True
        and guard["depth"] == guard["startDepth"] + 1
        and guard["transitioning"] is False,
        guard,
    ))
    page.context.close()

    # Regression: starting a new run while a descent is in flight must win.
    page = harness.open_page(seed)
    restart = page.evaluate(
        """async () => {
            const e = window.gameEngine;
            const original = window.fetch;
            let release;
            let newGameCalls = 0;
            window.fetch = (url, options) => {
                if (String(url).includes("/api/new-game")) {
                    newGameCalls += 1;
                    // Park only the descent's request; the new run must reach the server.
                    if (newGameCalls === 1) {
                        return new Promise((resolve) => {
                            release = () => resolve({ ok: false, status: 500 });
                        });
                    }
                }
                return original(url, options);
            };
            const pending = e.descendFloor();
            await e.start(777, 1, "mage", false);
            const depthAfterStart = e.depth;
            release();
            await pending;
            window.fetch = original;
            return {
                depth: e.depth,
                depthAfterStart,
                heroClass: e.heroClass,
                transitioning: e.transitioning,
                seed: e.dungeon.seed,
            };
        }"""
    )
    checks.append(_check(
        "new_run_is_not_overwritten_by_an_old_descent",
        restart["depth"] == 1
        and restart["depthAfterStart"] == 1
        and restart["heroClass"] == "mage"
        and restart["transitioning"] is False
        and restart["seed"] == 777,
        restart,
    ))
    page.context.close()

    # Pact power must survive a level-up and an equip round-trip, not just a turn.
    page = harness.open_page(seed)
    growth = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e.monsters.length = 0;
            e.resolvePact(e.dungeon.pacts[0], "wrath");
            const afterPact = { attack: e.player.attack, maxHp: e.player.max_hp };
            e._grantXp(e.player.next_xp);
            const afterLevel = { attack: e.player.attack, maxHp: e.player.max_hp,
                                 level: e.player.level };
            const weapon = { id: "audit_blade", name: "Audit Blade", type: "weapon",
                             rarity: "common", description: "", stats: { attack: 5 } };
            e.player.inventory.push(weapon);
            e.useInventoryItem(e.player.inventory.length - 1);
            const afterEquip = { attack: e.player.attack, maxHp: e.player.max_hp };
            e.unequipSlot("weapon");
            const afterUnequip = { attack: e.player.attack, maxHp: e.player.max_hp };
            return { afterPact, afterLevel, afterEquip, afterUnequip };
        }"""
    )
    checks.append(_check(
        "pact_bonus_survives_level_and_equip",
        growth["afterLevel"]["level"] == 2
        and growth["afterLevel"]["attack"] == growth["afterPact"]["attack"] + 2
        and growth["afterEquip"]["attack"] == growth["afterLevel"]["attack"] + 5
        and growth["afterUnequip"]["attack"] == growth["afterLevel"]["attack"]
        and growth["afterLevel"]["maxHp"] == growth["afterPact"]["maxHp"] + 12,
        growth,
    ))
    checks.append(_check("no_page_errors_after_pact_growth", not harness.errors, harness.errors))
    page.context.close()

    # The Scroll of Inferno is a one-shot consumable: through the public use_item
    # action it must damage a visible enemy, disappear from the pack and spend the turn.
    page = harness.open_page(seed)
    setup = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const p = e.player;
            const step = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                .find(([dx, dy]) => e.dungeon.isWalkable(p.x + dx, p.y + dy));
            if (!step) return { skipped: true };
            e.monsters = [{
                name: "Scroll Dummy", type: "skeleton", x: p.x + step[0], y: p.y + step[1],
                hp: 100, max_hp: 100, attack: 0, defense: 0, xp_reward: 0, gold_reward: 0,
                loot_drop: null, is_boss: false, is_champion: false, champion_affix: null,
                status_effects: {},
            }];
            e.dungeon.updateFOV(p.x, p.y, e.fovRadius || 7);
            p.inventory.push({
                id: "scroll_fireball", name: "Scroll of Inferno", type: "scroll",
                rarity: "common", description: "", stats: { spell_damage: 30 },
            });
            return { skipped: false, index: p.inventory.length - 1 };
        }"""
    )
    if setup.get("skipped") is True:
        scroll = setup
    else:
        before = harness.state(page)
        after = harness.apply(page, {"action": "use_item", "index": setup["index"]})
        scroll = {
            "index": setup["index"],
            "beforeHp": before["monsters"][0]["hp"] if before["monsters"] else None,
            "afterHp": after["monsters"][0]["hp"] if after["monsters"] else None,
            "beforeCount": len(before["player"]["inventory"]),
            "afterCount": len(after["player"]["inventory"]),
            "beforeTurn": before["turn"],
            "afterTurn": after["turn"],
        }
    checks.append(_check(
        "scroll_of_inferno_damages_and_consumes",
        setup.get("skipped") is not True
        and scroll["beforeHp"] == 100
        and scroll["afterHp"] == 70
        and scroll["afterCount"] == scroll["beforeCount"] - 1
        and scroll["afterTurn"] == scroll["beforeTurn"] + 1,
        scroll,
    ))
    checks.append(_check("no_page_errors_after_scroll", not harness.errors, harness.errors))
    page.context.close()

    # Search is a turn-cost reveal: it must mark an armed trap without springing it.
    page = harness.open_page(seed)
    search_setup = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const p = e.player;
            e.monsters = [];
            const step = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                .find(([dx, dy]) => e.dungeon.isWalkable(p.x + dx, p.y + dy));
            if (!step) return { skipped: true };
            const trap = { x: p.x + step[0], y: p.y + step[1], triggered: false, discovered: false };
            e.dungeon.traps = [trap];
            e.dungeon.updateFOV(p.x, p.y, e.fovRadius || 7);
            return { skipped: false, x: trap.x, y: trap.y };
        }"""
    )
    if search_setup.get("skipped") is True:
        search = search_setup
    else:
        before = harness.state(page)
        after = harness.apply(page, {"action": "search"})
        trap = next(
            (
                entry for entry in after["dungeon"]["traps"]
                if entry["x"] == search_setup["x"] and entry["y"] == search_setup["y"]
            ),
            {},
        )
        search = {
            "discovered": trap.get("discovered"),
            "triggered": trap.get("triggered"),
            "beforeTurn": before["turn"],
            "afterTurn": after["turn"],
            "beforeHp": before["player"]["hp"],
            "afterHp": after["player"]["hp"],
            "log": after["log"],
        }
    checks.append(_check(
        "search_reveals_a_trap_without_triggering_it",
        search_setup.get("skipped") is not True
        and search["discovered"] is True
        and search["triggered"] is False
        and search["afterTurn"] == search["beforeTurn"] + 1
        and search["afterHp"] == search["beforeHp"]
        and any("reveal 1 trap" in line for line in search["log"]),
        search,
    ))
    checks.append(_check("no_page_errors_after_search", not harness.errors, harness.errors))
    page.context.close()

    # The offline fallback must carry the trap the new Search action looks for.
    page = harness.open_page(seed)
    offline_trap = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e._generateOfflineState(7, 2, "rogue");
            const trap = (e.dungeon.traps || [])[0] || null;
            return {
                count: (e.dungeon.traps || []).length,
                hidden: trap ? !trap.discovered && !trap.triggered : false,
            };
        }"""
    )
    checks.append(_check(
        "offline_fallback_has_a_searchable_trap",
        offline_trap["count"] >= 1 and offline_trap["hidden"] is True,
        offline_trap,
    ))
    checks.append(_check("no_page_errors_after_offline_trap", not harness.errors, harness.errors))
    page.context.close()

    # The merchant's Sell tab must convert one backpack item into gold and keep
    # the shop open for the next sale; a closed shop must refuse the same call.
    page = harness.open_page(seed, depth=2)
    sale = page.evaluate(
        """() => {
            const e = window.gameEngine;
            e.monsters = [];
            e.openMerchantShop();
            const before = {
                gold: e.player.gold,
                count: e.player.inventory.length,
                shopOpen: e.ui.shopOpen,
                sellButtons: document.querySelectorAll(".btn-sell").length,
            };
            const tab = document.querySelector('[data-shop-tab="sell"]');
            if (!tab) return { skipped: true, before };
            tab.click();
            const btn = document.querySelector(".btn-sell");
            if (!btn) return { skipped: true, before, tab: e.ui.shopTab };
            btn.click();
            const entries = Array.from(document.querySelectorAll("#chronicleLog .log-entry"));
            const after = {
                gold: e.player.gold,
                count: e.player.inventory.length,
                shopOpen: e.ui.shopOpen,
                tab: e.ui.shopTab,
                sellPaneHidden: document.querySelector('[data-shop-pane="sell"]').classList.contains("hidden"),
                sellButtons: document.querySelectorAll(".btn-sell").length,
                log: entries.length ? entries[entries.length - 1].textContent.trim() : "",
            };
            e.ui.closeModal();
            const closed = { shopOpen: e.ui.shopOpen, modalOpen: e.ui.isModalOpen() };
            const guardGold = e.player.gold;
            const guardCount = e.player.inventory.length;
            e.sellInventoryItem(0);
            const guarded = {
                unchanged: e.player.gold === guardGold
                    && e.player.inventory.length === guardCount,
            };
            return { skipped: false, before, after, closed, guarded };
        }"""
    )
    checks.append(_check(
        "merchant_sells_a_backpack_item",
        sale.get("skipped") is not True
        and sale["before"]["shopOpen"] is True
        and sale["after"]["gold"] > sale["before"]["gold"]
        and sale["after"]["count"] == sale["before"]["count"] - 1
        and sale["after"]["sellButtons"] == sale["before"]["sellButtons"] - 1
        and sale["after"]["shopOpen"] is True
        and sale["after"]["tab"] == "sell"
        and sale["after"]["sellPaneHidden"] is False
        and "Sold" in sale["after"]["log"]
        and sale["closed"]["shopOpen"] is False
        and sale["closed"]["modalOpen"] is False
        and sale["guarded"]["unchanged"] is True,
        sale,
    ))
    checks.append(_check("no_page_errors_after_sell", not harness.errors, harness.errors))
    page.context.close()

    # A short scripted run must not throw: the harness is only useful if a green
    # result means the engine actually ran.
    page = harness.open_page(seed)
    for action in (
        {"action": "move", "dx": 1, "dy": 0},
        {"action": "ability", "slot": 1},
        {"action": "wait"},
        {"action": "potion"},
        {"action": "save"},
    ):
        harness.apply(page, action)
    checks.append(_check("scripted_run_has_no_page_errors", not harness.errors, harness.errors))
    page.context.close()

    # Resume is a separate code path from a fresh start: it must restore pact power and
    # which altars were already spent, not just the raw save fields.
    page = harness.open_page(seed)
    resumed = page.evaluate(
        """async () => {
            const e = window.gameEngine;
            e.monsters.length = 0;
            e.resolvePact(e.dungeon.pacts[0], "wrath");
            const before = { attack: e.player.attack, maxHp: e.player.max_hp,
                             bonusHp: e.player.bonus_max_hp || 0 };
            e.saveGameState();
            await e.start(null, 1, "paladin", true);
            return {
                before,
                after: { attack: e.player.attack, maxHp: e.player.max_hp,
                         bonusHp: e.player.bonus_max_hp || 0 },
                used: (e.dungeon.pacts || []).filter((p) => p.used).length,
                transitioning: e.transitioning,
            };
        }"""
    )
    checks.append(_check(
        "resume_restores_pact_power_and_spent_altars",
        resumed["after"]["attack"] == resumed["before"]["attack"]
        and resumed["after"]["maxHp"] == resumed["before"]["maxHp"]
        and resumed["after"]["bonusHp"] == resumed["before"]["bonusHp"]
        and resumed["used"] == 1
        and resumed["transitioning"] is False,
        resumed,
    ))
    checks.append(_check("no_page_errors_after_resume", not harness.errors, harness.errors))
    page.context.close()

    # Floor omens: deterministic per seed+depth, all reachable, and actually applied.
    page = harness.open_page(seed)
    omen = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const ids = new Set();
            for (let s = 1; s <= 60; s += 1) ids.add(e._omenFor(s, 1).id);
            const applied = e.omen
                ? { id: e.omen.id, fov: e.fovRadius, omenFov: e.omen.fov } : null;
            const fogSeed = (() => {
                for (let s = 1; s <= 300; s += 1) {
                    if (e._omenFor(s, 1).id === "deep_fog") return s;
                }
                return null;
            })();
            let fogFov = null;
            if (fogSeed !== null) {
                e.dungeon.seed = fogSeed;
                e.depth = 1;
                e.omenKey = "";
                e._applyOmen({ announce: false, extraFoe: false });
                fogFov = e.fovRadius;
            }
            return {
                ids: Array.from(ids).sort(),
                deterministic: e._omenFor(7, 1).id === e._omenFor(7, 1).id,
                applied,
                fogSeed,
                fogFov,
            };
        }"""
    )
    checks.append(_check("omens_are_deterministic", omen["deterministic"] is True, omen))
    checks.append(_check(
        "every_omen_is_reachable",
        omen["ids"] == ["blood_moon", "deep_fog", "gilded_crypt", "restless_dead"],
        omen["ids"],
    ))
    checks.append(_check(
        "omen_pill_matches_floor_omen",
        omen["applied"] is not None and omen["applied"]["fov"] == omen["applied"]["omenFov"],
        omen["applied"],
    ))
    checks.append(_check(
        "deep_fog_shortens_the_lantern",
        omen["fogSeed"] is not None and omen["fogFov"] == 5,
        {"seed": omen["fogSeed"], "fov": omen["fogFov"]},
    ))
    page.context.close()

    # The omen modifiers must change the shipped rules, not just decorate the HUD.
    page = harness.open_page(seed)
    effects = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const d = e.dungeon;
            const p = e.player;
            const originalRandom = Math.random;
            Math.random = () => 0.5;

            // Blood Moon: enemy damage.
            const keep = { hp: p.hp, max: p.max_hp, def: p.defense, omen: e.omen, monsters: e.monsters };
            p.max_hp = 100;
            p.defense = 0;
            const dummy = () => ({
                name: "Dummy", type: "skeleton", x: p.x + 1, y: p.y, hp: 50, max_hp: 50,
                attack: 10, defense: 0, xp_reward: 0, gold_reward: 0, loot_drop: null,
                is_boss: false, is_champion: false, champion_affix: null, status_effects: {},
            });
            const hit = (mult) => {
                e.omen = { id: "test", name: "test", desc: "", atkMult: mult, fov: 7,
                           goldMult: 1, extraFoe: 0 };
                e.monsters = [dummy()];
                const before = p.hp;
                e.processEnemyTurns();
                const damage = before - p.hp;
                p.hp = before;
                return damage;
            };
            const plain = hit(1);
            const blood = hit(1.25);
            p.hp = Math.min(keep.hp, p.max_hp);
            p.max_hp = keep.max;
            p.defense = keep.def;
            e.omen = keep.omen;
            e.monsters = keep.monsters;

            // Gilded Crypt: chest gold.
            const gilded = (() => {
                for (let s = 1; s <= 300; s += 1) {
                    const cand = e._omenFor(s, 1);
                    if (cand.id === "gilded_crypt") return cand;
                }
                return null;
            })();
            const chest = d.chests.find((c) => !c.opened
                && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) =>
                    d.isWalkable(c.x + dx, c.y + dy)));
            let chestGold = null;
            if (gilded && chest) {
                e.monsters = [];
                e.omen = gilded;
                const step = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                    .find(([dx, dy]) => d.isWalkable(chest.x + dx, chest.y + dy));
                p.x = chest.x + step[0];
                p.y = chest.y + step[1];
                const before = p.gold;
                e.stepPlayer(-step[0], -step[1]);
                chestGold = p.gold - before;
            }
            Math.random = originalRandom;
            return { plain, blood, chestGold, chestOpened: Boolean(chest && chest.opened) };
        }"""
    )
    checks.append(_check(
        "blood_moon_raises_enemy_damage",
        effects["plain"] == 10 and effects["blood"] == 12,
        effects,
    ))
    checks.append(_check(
        "gilded_crypt_multiplies_chest_gold",
        effects["chestOpened"] is True and effects["chestGold"] == 43,
        effects,
    ))
    page.context.close()

    # New mob AI: archers fire without closing, hounds cover two tiles a turn.
    page = harness.open_page(seed)
    mobs = page.evaluate(
        """() => {
            const e = window.gameEngine;
            const d = e.dungeon;
            let run = null;
            for (let y = 1; y < d.height - 1 && !run; y += 1) {
                for (let x = 1; x < d.width - 5; x += 1) {
                    let clear = true;
                    for (let i = 0; i < 5; i += 1) {
                        if (!d.isWalkable(x + i, y)) { clear = false; break; }
                    }
                    if (clear) { run = [x, y]; break; }
                }
            }
            if (!run) return { found: false };
            const [rx, ry] = run;
            const p = e.player;
            p.x = rx + 4;
            p.y = ry;
            p.hp = p.max_hp;
            d.updateFOV(p.x, p.y, 7);
            e.omen = { id: "calm", name: "calm", desc: "", atkMult: 1, fov: 7,
                       goldMult: 1, extraFoe: 0 };
            const mk = (type, x) => ({
                name: type, type, x, y: ry, hp: 40, max_hp: 40, attack: 10, defense: 0,
                xp_reward: 0, gold_reward: 0, loot_drop: null,
                is_boss: false, is_champion: false, champion_affix: null, status_effects: {},
            });
            e.monsters = [mk("archer", rx)];
            const before = p.hp;
            e.processEnemyTurns();
            const archerHit = before - p.hp;
            const archerStayed = e.monsters[0].x === rx;

            p.hp = p.max_hp;
            e.monsters = [mk("hound", rx + 1)];
            e.processEnemyTurns();
            return {
                found: true,
                archerHit,
                archerStayed,
                houndX: e.monsters[0].x,
                expectedHoundX: rx + 3,
            };
        }"""
    )
    checks.append(_check(
        "skeletal_archer_fires_from_range",
        mobs.get("found") is True and mobs["archerHit"] > 0 and mobs["archerStayed"] is True,
        mobs,
    ))
    checks.append(_check(
        "crypt_hound_covers_two_tiles",
        mobs.get("found") is True and mobs["houndX"] == mobs["expectedHoundX"],
        mobs,
    ))
    checks.append(_check("no_page_errors_after_mob_turns", not harness.errors, harness.errors))
    page.context.close()
    return checks


def _write_output(payload: Dict[str, Any], out: Optional[Path]) -> None:
    text = json.dumps(payload, indent=2)
    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    print(text)


def load_actions(argument: str) -> List[Any]:
    """An action list from inline JSON, or from a file when the value starts with `@`.

    PowerShell and `cmd` strip the inner double quotes of an inline JSON argument, which
    produced a bare `[{action:wait}]` parse error with no hint. The `@path` form and the
    explicit error message keep the documented command usable on every shell.
    """
    if argument.strip().startswith("@"):
        path = Path(argument.strip()[1:])
        return json.loads(path.read_text(encoding="utf-8-sig"))
    try:
        return json.loads(argument)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"--actions is not valid JSON ({exc.msg} at column {exc.colno}). "
            + "Why: PowerShell and cmd strip the inner double quotes of a native argument. "
            + "Fix: write the list to a file and pass --actions @actions.json, or pass the "
            + "whole run as --script run.json."
        ) from exc



def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Deterministic AI harness for Crypt-Crawler.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("catalog", help="print the mechanics and action contract")

    play = subparsers.add_parser("play", help="run a scripted, seeded session")
    play.add_argument("--script", type=Path, help="JSON script file")
    play.add_argument(
        "--actions",
        help="inline JSON action list, or @path to a JSON file (shell-safe)",
    )
    play.add_argument("--seed", type=int, default=20261029)
    play.add_argument("--depth", type=int, default=1)
    play.add_argument("--class", dest="hero_class", default="paladin")
    play.add_argument("--out", type=Path, help="write the JSON reply to this file")
    play.add_argument("--headed", action="store_true", help="show the browser window")

    selftest_cmd = subparsers.add_parser("selftest", help="prove the harness and mechanics")
    selftest_cmd.add_argument("--out", type=Path, help="write the JSON reply to this file")
    selftest_cmd.add_argument("--headed", action="store_true", help="show the browser window")

    args = parser.parse_args(argv)

    if args.command == "catalog":
        print(json.dumps(catalog(), indent=2))
        return 0

    if args.command == "play":
        try:
            if args.script is not None:
                raw = json.loads(args.script.read_text(encoding="utf-8-sig"))
            else:
                raw = {
                    "seed": args.seed,
                    "depth": args.depth,
                    "class": args.hero_class,
                    "actions": load_actions(args.actions) if args.actions else [],
                }
            script = parse_script(raw)
        except (OSError, ValueError) as exc:
            _write_output({"ok": False, "error": f"invalid script: {exc}"}, args.out)
            return 2
        with Harness(headless=not args.headed) as harness:
            page = harness.open_page(script["seed"], script["depth"], script["class"])
            steps: List[Dict[str, Any]] = []
            failure = ""
            for index, action in enumerate(script["actions"]):
                try:
                    state = harness.apply(page, action)
                except Exception as exc:  # a rejected action is a result, not a traceback
                    failure = f"actions[{index}] {action['action']} failed: {exc}"
                    steps.append({"index": index, "action": action, "error": str(exc)})
                    break
                steps.append({
                    "index": index,
                    "action": action,
                    "turn": state["turn"],
                    "depth": state["depth"],
                    "hp": state["player"]["hp"],
                    "max_hp": state["player"]["max_hp"],
                    "attack": state["player"]["attack"],
                    "gold": state["player"]["gold"],
                    "monsters_alive": len(state["monsters"]),
                    "log_tail": state["log"][-1:],
                })
                if state["gameOver"] or state["victory"]:
                    break
            final = harness.state(page)
            errors = list(harness.errors)
            page.context.close()
        _write_output(
            {
                "ok": not errors and not failure,
                "seed": script["seed"],
                "class": script["class"],
                "steps": steps,
                "layout_hash": layout_hash(final),
                "errors": errors,
                "failure": failure,
                "final": final,
            },
            args.out,
        )
        return 0 if not errors and not failure else 1

    with Harness(headless=not args.headed) as harness:
        checks = selftest(harness)
    passed = all(check["passed"] for check in checks)
    _write_output({"ok": passed, "checks": checks}, args.out)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
