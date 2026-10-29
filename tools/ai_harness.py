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
    "wait": (),
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
        "pact_choices": list(PACT_CHOICES),
        "props": [
            "chest", "trap", "shrine", "urn", "merchant", "soul", "sigil", "vault", "pact",
        ],
        "state_keys": [
            "turn", "depth", "kills", "player", "monsters", "dungeon", "sigilCount",
            "bounties", "loreUnlocked", "log",
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
            if _is_int(action.get(field)) and abs(action[field]) > 1:
                problems.append("move dx/dy must be -1, 0 or 1")
        if action.get("dx") == 0 and action.get("dy") == 0:
            problems.append("move needs dx or dy")
    elif name == "ability":
        slot = action.get("slot")
        if not _is_int(slot) or slot not in (1, 2, 3, 4, 5):
            problems.append("ability slot must be 1-5")
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
                    case "wait": e.waitTurn(); break;
                    case "teleport":
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
    return checks


def _write_output(payload: Dict[str, Any], out: Optional[Path]) -> None:
    text = json.dumps(payload, indent=2)
    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    print(text)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Deterministic AI harness for Crypt-Crawler.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("catalog", help="print the mechanics and action contract")

    play = subparsers.add_parser("play", help="run a scripted, seeded session")
    play.add_argument("--script", type=Path, help="JSON script file")
    play.add_argument("--actions", help="inline JSON list of actions")
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
                    "actions": json.loads(args.actions) if args.actions else [],
                }
            script = parse_script(raw)
        except (OSError, ValueError) as exc:
            _write_output({"ok": False, "error": f"invalid script: {exc}"}, args.out)
            return 2
        with Harness(headless=not args.headed) as harness:
            page = harness.open_page(script["seed"], script["depth"], script["class"])
            steps: List[Dict[str, Any]] = []
            for index, action in enumerate(script["actions"]):
                state = harness.apply(page, action)
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
                "ok": not errors,
                "seed": script["seed"],
                "class": script["class"],
                "steps": steps,
                "layout_hash": layout_hash(final),
                "errors": errors,
                "final": final,
            },
            args.out,
        )
        return 0 if not errors else 1

    with Harness(headless=not args.headed) as harness:
        checks = selftest(harness)
    passed = all(check["passed"] for check in checks)
    _write_output({"ok": passed, "checks": checks}, args.out)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
