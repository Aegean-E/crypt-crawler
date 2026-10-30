"""
Headless browser visual inspection and UI auditing tool for Crypt-Crawler.

Drives the game in headless Edge through Playwright, captures screenshots across
resolutions and gameplay scenarios, audits DOM integrity and layout, and verifies
zero console errors.

Usage:
    python tools/inspect_ui.py
    python tools/inspect_ui.py --viewports desktop,laptop,mobile --scenario all --out .inspect
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from crawler.server import start_background_server

VIEWPORTS: Dict[str, Dict[str, int]] = {
    "desktop": {"width": 1920, "height": 1080},
    "laptop": {"width": 1366, "height": 768},
    "mobile": {"width": 390, "height": 844},
}


def run_inspection(
    viewports: List[str],
    scenarios: List[str],
    out_dir: Path,
) -> Dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Error: Playwright is not installed. Run `pip install playwright`.")
        sys.exit(1)

    # 1. Start game server on ephemeral port
    server, port = start_background_server(port=0)
    base_url = f"http://127.0.0.1:{port}"
    print(f"[1/4] Game server started on port {port}")

    report: Dict[str, Any] = {
        "timestamp": time.time(),
        "url": base_url,
        "console_errors": [],
        "audit_checks": [],
        "screenshots": [],
    }

    try:
        with sync_playwright() as p:
            print("[2/4] Launching headless browser (Edge channel)...")
            browser = p.chromium.launch(headless=True, channel="msedge")

            for vp_name in viewports:
                vp = VIEWPORTS.get(vp_name, VIEWPORTS["desktop"])
                print(f"[3/4] Inspecting viewport: {vp_name} ({vp['width']}x{vp['height']})...")

                context = browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    device_scale_factor=1,
                )
                page = context.new_page()

                # Collect console errors
                def handle_console(msg: Any) -> None:
                    if msg.type in ("error", "warning"):
                        report["console_errors"].append(
                            {"viewport": vp_name, "type": msg.type, "text": msg.text}
                        )

                page.on("console", handle_console)
                page.on("pageerror", lambda exc: report["console_errors"].append(
                    {"viewport": vp_name, "type": "uncaught", "text": str(exc)}
                ))

                # Navigate to game
                page.goto(base_url, wait_until="networkidle")
                page.wait_for_selector("#gameCanvas", timeout=5000)
                page.wait_for_function("() => Boolean(window.gameEngine)", timeout=5000)
                time.sleep(0.4)

                # Capture baseline screen
                shot_path = out_dir / f"dungeon_{vp_name}.png"
                page.screenshot(path=str(shot_path), full_page=True)
                report["screenshots"].append(
                    {"viewport": vp_name, "scenario": "dungeon", "file": str(shot_path)}
                )
                print(f"      Saved screenshot: {shot_path.name}")

                # Run layout integrity checks
                canvas_box = page.eval_on_selector("#gameCanvas", "el => el.getBoundingClientRect()")
                hero_box = page.eval_on_selector("#characterPanel", "el => el.getBoundingClientRect()")
                deck_box = page.eval_on_selector("#tacticalDeck", "el => el.getBoundingClientRect()")

                layout = page.evaluate(
                    """() => {
                        const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
                        const panel = rect('.panel-viewport');
                        const deckButtons = document.querySelectorAll('.deck-btn');
                        const lastDeck = deckButtons[deckButtons.length - 1].getBoundingClientRect();
                        const dpadEl = document.querySelector('#virtualDpad');
                        const dpad = dpadEl.getBoundingClientRect();
                        const inventory = rect('#inventoryPanel');
                        return {
                            narrow: innerWidth <= 768,
                            horizontalScroll: document.documentElement.scrollWidth - innerWidth,
                            deckInsidePanel: lastDeck.bottom <= panel.bottom + 1,
                            dpadShown: getComputedStyle(dpadEl).display !== 'none',
                            dpadInsidePanel: dpad.bottom <= panel.bottom + 1,
                            inventoryReachable:
                                inventory.bottom <= document.documentElement.scrollHeight + 1,
                        };
                    }"""
                )

                audit_check = {
                    "viewport": vp_name,
                    "canvas_rendered": canvas_box["width"] > 200 and canvas_box["height"] > 150,
                    "hero_panel_visible": hero_box["width"] > 0,
                    "deck_visible": deck_box["width"] > 0,
                    "no_horizontal_scroll": layout["horizontalScroll"] <= 1,
                    "action_deck_inside_panel": layout["deckInsidePanel"],
                    "dpad_only_when_narrow": layout["dpadShown"] == layout["narrow"],
                    "dpad_inside_panel": layout["dpadInsidePanel"] or not layout["dpadShown"],
                    "inventory_reachable": layout["inventoryReachable"],
                    "search_button_visible": page.is_visible("#btnActionSearch"),
                }
                report["audit_checks"].append(audit_check)

                # Only run interactive scenarios on desktop viewport to avoid duplicate clicks
                if vp_name == "desktop":
                    if "inventory" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Inventory Selection...")
                        # Select first inventory slot
                        page.click(".inv-slot:first-child")
                        time.sleep(0.3)
                        inv_shot = out_dir / "inventory_selected.png"
                        page.screenshot(path=str(inv_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "inventory", "file": str(inv_shot)}
                        )
                        print(f"      Saved screenshot: {inv_shot.name}")

                        capacity_text = page.text_content("#inventoryCapacity") or ""
                        page.click('[data-filter="gear"]')
                        time.sleep(0.2)
                        gear_titles = page.eval_on_selector_all(
                            ".inv-slot", "els => els.filter(el => el.title).map(el => el.title)"
                        )
                        gear_types = (" weapon)", " armor)", " ring)", " amulet)", " boots)")
                        page.click('[data-filter="all"]')
                        page.click("#btnSortInventory")
                        time.sleep(0.2)
                        sort_label = page.text_content("#btnSortInventory") or ""
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "inventory_capacity_visible": "/" in capacity_text,
                                "inventory_gear_filter": bool(gear_titles)
                                and all(title.endswith(gear_types) for title in gear_titles),
                                "inventory_rarity_sort": sort_label.strip() == "Sort: Rarity",
                            }
                        )

                        # Sorting reorders slots, so selection must follow the item, not the position.
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.player.inventory.push(
                                    { id: "audit_rare", name: "Audit Zephyr Ring", type: "ring", rarity: "rare", description: "Audit fixture.", stats: { attack: 1 } },
                                    { id: "audit_hammer", name: "Audit Warhammer", type: "weapon", rarity: "epic", description: "Audit fixture.", stats: { attack: 13, stun_chance: 25 } }
                                );
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                            }"""
                        )
                        page.click('.inv-slot[title*="Audit Warhammer"]')
                        time.sleep(0.2)
                        selected_titles = page.eval_on_selector_all(
                            ".inv-slot.selected", "els => els.map(el => el.title)"
                        )
                        selected_name = selected_titles[0].split(" (")[0] if selected_titles else ""
                        card_text = page.text_content("#itemCardName") or ""
                        diff_visible = page.eval_on_selector(
                            "#itemCardDiff", "el => !el.classList.contains('hidden')"
                        )
                        diff_text = page.text_content("#itemCardDiff") or ""
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "inventory_sorted_selection_matches_card": len(selected_titles) == 1
                                and selected_name == "Audit Warhammer"
                                and card_text.startswith(selected_name),
                                "item_comparison_proc_labels": diff_visible
                                and "Stun" in diff_text
                                and "%" in diff_text,
                            }
                        )
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.player.inventory = e.player.inventory.filter(
                                    (item) => !String(item.id || "").startsWith("audit_")
                                );
                                e.ui.clearItemSelection();
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                            }"""
                        )
                        page.click("#btnSortInventory")
                        time.sleep(0.1)

                        hp_before = page.evaluate("() => window.gameEngine.player.hp")
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.player.hp = Math.max(1, Math.floor(e.player.max_hp * 0.2));
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                                e.ui.flashDamage();
                                e.ui.renderStatusTray({ poison: 2 });
                            }"""
                        )
                        low_hp_visible = page.eval_on_selector(
                            "#lowHpVignette", "el => !el.classList.contains('hidden')"
                        )
                        flash_active = page.eval_on_selector(
                            "#damageFlash", "el => el.classList.contains('active')"
                        )
                        status_tooltip = page.eval_on_selector(
                            "#heroStatusTray .status-badge", "el => el.title"
                        )
                        page.evaluate(
                            """(hp) => {
                                const e = window.gameEngine;
                                e.player.hp = hp;
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                            }""",
                            hp_before,
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "low_hp_warning_visible": low_hp_visible,
                                "damage_flash_active": flash_active,
                                "status_tooltip_present": "Poison" in status_tooltip,
                            }
                        )

                        # A +max HP relic must not leave the hero above their cap on unequip.
                        hp_probe = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const hpBefore = e.player.hp;
                                const previousAmulet = e.player.equipped.amulet;
                                const amulet = { id: "audit_amulet", name: "Audit Amulet", type: "amulet", rarity: "rare", description: "Audit fixture.", stats: { max_hp: 18 } };
                                e.player.equipped.amulet = amulet;
                                e._recalculatePlayerStats();
                                e.player.hp = e.player.max_hp;
                                e.unequipSlot("amulet");
                                const clamped = e.player.hp === e.player.max_hp;
                                e.player.inventory = e.player.inventory.filter(
                                    (item) => item.id !== "audit_amulet"
                                );
                                e.player.equipped.amulet = previousAmulet;
                                e.player.hp = hpBefore;
                                e._recalculatePlayerStats();
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                                return clamped;
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "equipment_unequip_clamps_hp": hp_probe is True,
                            }
                        )

                        # Journal: entries load, undiscovered ones stay hidden,
                        # and a discovery updates the header badge.
                        page.click("#btnJournal")
                        time.sleep(0.3)
                        lore_cards = page.eval_on_selector_all(
                            ".lore-card", "els => els.length"
                        )
                        lore_locked = page.eval_on_selector_all(
                            ".lore-card.locked", "els => els.length"
                        )
                        journal_open = page.is_visible("#modalOverlay")
                        page.screenshot(
                            path=str(out_dir / f"journal_{vp_name}.png"), full_page=True
                        )
                        page.click("#btnModalClose")
                        time.sleep(0.2)
                        journal_unlock = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const locked = e.loreEntries.find(
                                    (entry) => !e.loreUnlocked.includes(entry.id)
                                );
                                if (!locked) return { title: null, archive: [] };
                                e.unlockLore(locked.id);
                                let archive = [];
                                try {
                                    archive = JSON.parse(
                                        localStorage.getItem("crypt_crawler_lore_v1") || "[]"
                                    );
                                } catch (_) {}
                                return { title: locked.title, archive };
                            }"""
                        )
                        unlocked_title = journal_unlock["title"]
                        archived_lore = journal_unlock["archive"]
                        journal_badge = page.text_content("#journalBadge") or ""
                        journal_title = page.get_attribute("#btnJournal", "title") or ""
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "journal_opens_with_entries": journal_open
                                and lore_cards > 5,
                                "journal_hides_undiscovered": lore_locked > 0,
                                "journal_unlock_updates_badge": bool(unlocked_title)
                                and "/" in journal_badge
                                and "discovered" in journal_title
                                and bool(archived_lore),
                            }
                        )

                        # Lost Soul dialogue: three real choices, and one applies an effect.
                        soul_state = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const soul = { x: e.player.x, y: e.player.y, resolved: false };
                                e.ui.showSoulDialogueModal(soul, (choice) => e.resolveSoul(soul, choice));
                                const choices = Array.from(document.querySelectorAll(".soul-choice"))
                                    .map((btn) => btn.dataset.choice);
                                const opened = e.ui.isModalOpen();
                                const probe = { x: e.player.x, y: e.player.y, resolved: false };
                                e.resolveSoul(probe, "bogus");
                                const ignored = probe.resolved === false;
                                const before = e.player.hp;
                                e.player.hp = Math.max(1, e.player.hp - 5);
                                e.resolveSoul(soul, "ember");
                                return {
                                    choices,
                                    opened,
                                    ignored,
                                    resolved: soul.resolved,
                                    healed: e.player.hp > Math.max(1, before - 5),
                                };
                            }"""
                        )
                        page.screenshot(
                            path=str(out_dir / f"soul_dialogue_{vp_name}.png"), full_page=True
                        )
                        page.click("#btnModalClose")
                        time.sleep(0.2)

                        # Canvas probe helpers: read through a willReadFrequently copy so
                        # the game canvas does not warn on repeated getImageData.
                        page.evaluate(
                            """() => {
                                const game = window.gameEngine.canvas;
                                const probe = document.createElement("canvas");
                                probe.width = game.width;
                                probe.height = game.height;
                                const pctx = probe.getContext("2d", { willReadFrequently: true });
                                window.__auditSnap = () => {
                                    pctx.clearRect(0, 0, probe.width, probe.height);
                                    pctx.drawImage(game, 0, 0);
                                    return pctx.getImageData(0, 0, probe.width, probe.height).data;
                                };
                                window.__auditDiff = (a, b) => {
                                    let n = 0;
                                    for (let i = 0; i < a.length; i += 4) {
                                        if (a[i] !== b[i] || a[i + 1] !== b[i + 1]
                                            || a[i + 2] !== b[i + 2]) n += 1;
                                    }
                                    return n;
                                };
                            }"""
                        )

                        # Black pact altar: exactly one per floor AND the renderer is
                        # actually invoked for it. A visibility check alone would still
                        # pass if `_drawPact` were deleted.
                        pact_site = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const pacts = e.dungeon.pacts || [];
                                if (pacts.length !== 1) {
                                    return { count: pacts.length, visible: false, rendered: false, origin: { x: e.player.x, y: e.player.y } };
                                }
                                const pact = pacts[0];
                                const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]]
                                    .map(([dx, dy]) => [pact.x + dx, pact.y + dy])
                                    .find(([x, y]) => e.dungeon.isWalkable(x, y));
                                const origin = { x: e.player.x, y: e.player.y };
                                if (spot) { e.player.x = spot[0]; e.player.y = spot[1]; }
                                e.dungeon.updateFOV(e.player.x, e.player.y, 7);
                                let draws = 0;
                                const original = e.renderer._drawPact;
                                e.renderer._drawPact = (...args) => {
                                    draws += 1;
                                    return original.apply(e.renderer, args);
                                };
                                e.renderer.render(e.dungeon, e.player, e.monsters, performance.now());
                                e.renderer._drawPact = original;
                                return {
                                    count: pacts.length,
                                    origin,
                                    visible: e.dungeon.isVisible(pact.x, pact.y),
                                    rendered: draws > 0,
                                };
                            }"""
                        )
                        page.wait_for_timeout(350)
                        page.screenshot(
                            path=str(out_dir / f"pact_site_{vp_name}.png"), full_page=True
                        )
                        page.evaluate(
                            """(origin) => {
                                const e = window.gameEngine;
                                e.player.x = origin.x;
                                e.player.y = origin.y;
                                e.dungeon.updateFOV(e.player.x, e.player.y, 7);
                            }""",
                            pact_site.get("origin") or {"x": 0, "y": 0},
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "pact_altar_renders_on_map": pact_site.get("count") == 1
                                and pact_site.get("visible") is True
                                and pact_site.get("rendered") is True,
                            }
                        )

                        # Hover legibility: the altar and the objective props must explain
                        # themselves without stepping into a bargain.
                        tooltip = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const d = e.dungeon;
                                const altar = (d.pacts || [])[0];
                                const sigil = (d.sigils || [])[0];
                                const empty = (() => {
                                    for (let y = 0; y < d.height; y += 1) {
                                        for (let x = 0; x < d.width; x += 1) {
                                            if (d.isWalkable(x, y) && !e.renderer._propAt(x, y, d)) {
                                                return { x, y };
                                            }
                                        }
                                    }
                                    return null;
                                })();
                                const reads = (x, y) => {
                                    const info = e.renderer._propAt(x, y, d);
                                    return info ? { title: info.title, lines: info.lines } : null;
                                };
                                const altarInfo = altar ? reads(altar.x, altar.y) : null;
                                const sigilInfo = sigil ? reads(sigil.x, sigil.y) : null;
                                const origin = { x: e.player.x, y: e.player.y };
                                let painted = 0;
                                if (altar) {
                                    const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]]
                                        .map(([dx, dy]) => [altar.x + dx, altar.y + dy])
                                        .find(([x, y]) => d.isWalkable(x, y));
                                    if (spot) { e.player.x = spot[0]; e.player.y = spot[1]; }
                                    d.updateFOV(e.player.x, e.player.y, 7);
                                    // Pixel proof: the card must actually paint. Sampling
                                    // inside one evaluate keeps the RAF loop from interleaving.
                                    e.renderer.hoverTile = null;
                                    e.renderer.render(d, e.player, e.monsters, 1000);
                                    const before = window.__auditSnap();
                                    e.renderer.hoverTile = { x: altar.x, y: altar.y };
                                    e.renderer.render(d, e.player, e.monsters, 1000);
                                    painted = window.__auditDiff(before, window.__auditSnap());
                                }
                                return {
                                    origin,
                                    painted,
                                    altar: altarInfo,
                                    sigil: sigilInfo,
                                    emptyClear: empty ? reads(empty.x, empty.y) === null : false,
                                };
                            }"""
                        )
                        page.wait_for_timeout(250)
                        page.screenshot(
                            path=str(out_dir / f"prop_tooltip_{vp_name}.png"), full_page=True
                        )
                        page.evaluate(
                            """(origin) => {
                                const e = window.gameEngine;
                                e.renderer.hoverTile = null;
                                e.player.x = origin.x;
                                e.player.y = origin.y;
                                e.dungeon.updateFOV(e.player.x, e.player.y, 7);
                            }""",
                            tooltip.get("origin") or {"x": 0, "y": 0},
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "prop_tooltip_explains_altar": tooltip["altar"] is not None
                                and "Altar" in tooltip["altar"]["title"]
                                and len(tooltip["altar"]["lines"]) >= 1,
                                "prop_tooltip_explains_objective": tooltip["sigil"] is not None
                                and "Sigil" in tooltip["sigil"]["title"],
                                "prop_tooltip_ignores_plain_floor": tooltip["emptyClear"] is True,
                                "prop_tooltip_paints_on_canvas": tooltip.get("painted", 0) > 200,
                            }
                        )

                        # Avarice wraith: the raised enemy must render, not fall back to
                        # the grey placeholder circle.
                        wraith = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                                    .map(([dx, dy]) => [e.player.x + dx, e.player.y + dy])
                                    .find(([x, y]) => e.dungeon.isWalkable(x, y));
                                if (!spot) return { skip: true };
                                const w = e._spawnPactWraith(spot[0], spot[1]);
                                e.dungeon.updateFOV(e.player.x, e.player.y, 7);
                                let drawn = 0;
                                const original = e.renderer._drawMonster;
                                e.renderer._drawMonster = (c, monster, ts, ts2) => {
                                    if (monster.type === "wraith") drawn += 1;
                                    return original.call(e.renderer, c, monster, ts, ts2);
                                };
                                e.renderer.render(e.dungeon, e.player, e.monsters, 1000);
                                const before = window.__auditSnap();
                                e.monsters.push(w);
                                e.renderer.render(e.dungeon, e.player, e.monsters, 1000);
                                const painted = window.__auditDiff(before, window.__auditSnap());
                                e.renderer._drawMonster = original;
                                window.__auditWraith = w;
                                return { skip: false, drawn, painted, x: spot[0], y: spot[1] };
                            }"""
                        )
                        page.wait_for_timeout(250)
                        page.screenshot(
                            path=str(out_dir / f"wraith_{vp_name}.png"), full_page=True
                        )
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.monsters = e.monsters.filter((m) => m !== window.__auditWraith);
                                window.__auditWraith = null;
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "wraith_renders": wraith.get("skip") is True
                                or (wraith.get("drawn", 0) >= 1 and wraith.get("painted", 0) > 60),
                            }
                        )

                        # The mimic sprite must paint, not fall back to the generic blob.
                        mimic = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                                    .map(([dx, dy]) => [e.player.x + dx, e.player.y + dy])
                                    .find(([x, y]) => e.dungeon.isWalkable(x, y));
                                if (!spot) return { skip: true };
                                const origin = e.monsters;
                                const mimic = {
                                    name: "Gilded Mimic", type: "mimic", x: spot[0], y: spot[1],
                                    hp: 32, max_hp: 32, attack: 8, defense: 2,
                                    xp_reward: 35, gold_reward: 25, loot_drop: null,
                                    is_boss: false, is_champion: false, champion_affix: null,
                                    status_effects: {},
                                };
                                e.monsters = origin.slice();
                                e.renderer.render(e.dungeon, e.player, e.monsters, 1000);
                                const before = window.__auditSnap();
                                e.monsters.push(mimic);
                                e.renderer.render(e.dungeon, e.player, e.monsters, 1000);
                                const painted = window.__auditDiff(before, window.__auditSnap());
                                e.monsters = origin;
                                e.renderer.render(e.dungeon, e.player, e.monsters, 1000);
                                return { skip: false, painted };
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "mimic_renders_distinct_sprite": mimic.get("skip") is True
                                or mimic.get("painted", 0) > 60,
                            }
                        )

                        # New mob sprites must paint, not fall back to a generic shape.
                        new_mobs = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const d = e.dungeon;
                                const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                                    .map(([dx, dy]) => [e.player.x + dx, e.player.y + dy])
                                    .find(([x, y]) => d.isWalkable(x, y));
                                if (!spot) return { skip: true };
                                const origin = e.monsters;
                                const results = {};
                                const placed = [];
                                const base = {
                                    hp: 30, max_hp: 30, attack: 5, defense: 1,
                                    xp_reward: 0, gold_reward: 0, loot_drop: null,
                                    is_boss: false, is_champion: false,
                                    champion_affix: null, status_effects: {},
                                };
                                for (const type of ["archer", "hound"]) {
                                    e.monsters = origin.slice();
                                    e.renderer.render(d, e.player, e.monsters, 1000);
                                    const before = window.__auditSnap();
                                    e.monsters.push({ ...base, name: type, type, x: spot[0], y: spot[1] });
                                    e.renderer.render(d, e.player, e.monsters, 1000);
                                    results[type] = window.__auditDiff(before, window.__auditSnap());
                                }
                                // Keep both on screen for the screenshot. Monsters only draw
                                // while visible, so the capture must use in-FOV tiles.
                                d.updateFOV(e.player.x, e.player.y, 7);
                                const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]
                                    .map(([dx, dy]) => [e.player.x + dx, e.player.y + dy])
                                    .filter(([x, y]) => d.isWalkable(x, y) && d.isVisible(x, y));
                                ["archer", "hound"].forEach((type, i) => {
                                    const at = neighbours[i] || spot;
                                    placed.push({ ...base, name: type, type, x: at[0], y: at[1] });
                                });
                                e.monsters = origin.concat(placed);
                                window.__auditMobs = placed;
                                d.updateFOV(e.player.x, e.player.y, 7);
                                e.renderer.render(d, e.player, e.monsters, 1000);
                                return { skip: false, results };
                            }"""
                        )
                        page.wait_for_timeout(250)
                        page.screenshot(
                            path=str(out_dir / f"new_mobs_{vp_name}.png"), full_page=True
                        )
                        # 4x nearest-neighbour crop around the player: 38px sprites are
                        # unreadable in a full-page shot, which makes visual review noisy.
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const TS = e.renderer.tileSize;
                                const span = 9;
                                const size = TS * span;
                                const zoom = document.createElement("canvas");
                                zoom.id = "auditZoom";
                                zoom.width = size * 4;
                                zoom.height = size * 4;
                                zoom.style.cssText =
                                    "position:fixed;left:8px;top:8px;z-index:99999;"
                                    + "border:2px solid #ecc94b;image-rendering:pixelated;"
                                    + `width:${size * 2}px;height:${size * 2}px;`;
                                const zctx = zoom.getContext("2d");
                                zctx.imageSmoothingEnabled = false;
                                // The renderer centres the player on the canvas
                                // (camX = w/2 - player.x*ts - ts/2), so the lit area is
                                // the canvas centre regardless of map position.
                                const sx = Math.max(0, Math.floor((e.canvas.width - size) / 2));
                                const sy = Math.max(0, Math.floor((e.canvas.height - size) / 2));
                                zctx.drawImage(e.canvas, sx, sy, size, size, 0, 0,
                                               zoom.width, zoom.height);
                                document.body.appendChild(zoom);
                            }"""
                        )
                        page.locator("#auditZoom").screenshot(
                            path=str(out_dir / f"new_mobs_zoom_{vp_name}.png")
                        )
                        page.evaluate(
                            """() => document.getElementById("auditZoom")?.remove()"""
                        )
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.monsters = e.monsters.filter(
                                    (m) => !window.__auditMobs.includes(m)
                                );
                                window.__auditMobs = null;
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "new_mobs_render_distinct_sprites": new_mobs.get("skip") is True
                                or all(
                                    new_mobs.get("results", {}).get(kind, 0) > 60
                                    for kind in ("archer", "hound")
                                ),
                            }
                        )

                        # Omen QoL: the header pill names the floor omen, ? opens the guide,
                        # Escape closes it, and the motion toggle persists.
                        qol = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const pill = document.getElementById("omenPill");
                                const omen = e.omen;
                                const omenOk = Boolean(pill) && Boolean(omen)
                                    && !pill.classList.contains("hidden")
                                    && pill.dataset.omen === omen.id
                                    && (pill.title || "").includes(omen.name);
                                window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
                                const guideOpen = e.ui.isModalOpen()
                                    && document.getElementById("modalTitle").textContent
                                        .includes("Guide");
                                window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
                                const guideClosed = !e.ui.isModalOpen();

                                const btn = document.getElementById("btnMotionToggle");
                                if (!btn) return { omenOk, guideOpen, guideClosed, motion: null };
                                const before = e.reducedMotion;
                                btn.click();
                                const on = {
                                    reduced: e.reducedMotion,
                                    body: document.body.classList.contains("reduced-motion"),
                                    renderer: e.renderer.reducedMotion === true,
                                    stored: localStorage.getItem("crypt_crawler_reduced_motion"),
                                };
                                btn.click();
                                const off = {
                                    reduced: e.reducedMotion,
                                    stored: localStorage.getItem("crypt_crawler_reduced_motion"),
                                };
                                return {
                                    omenOk, guideOpen, guideClosed,
                                    motion: { before, on, off },
                                };
                            }"""
                        )
                        motion = qol.get("motion") or {}
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "omen_pill_matches_floor": qol.get("omenOk") is True,
                                "keyboard_help_and_escape": qol.get("guideOpen") is True
                                and qol.get("guideClosed") is True,
                                "motion_toggle_persists": bool(motion)
                                and motion["on"]["reduced"] != motion["before"]
                                and motion["on"]["body"] is True
                                and motion["on"]["renderer"] is True
                                and motion["on"]["stored"] == "1"
                                and motion["off"]["reduced"] == motion["before"]
                                and motion["off"]["stored"] == "0",
                            }
                        )

                        # Trap search: the deck button must reveal an armed trap, spend a
                        # turn and paint the revealed grille without springing it.
                        search_state = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const p = e.player;
                                const button = document.getElementById("btnActionSearch");
                                if (!button) return { skip: false, button: false };
                                e.monsters = [];
                                const step = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                                    .find(([dx, dy]) => e.dungeon.isWalkable(p.x + dx, p.y + dy));
                                if (!step) return { skip: true };
                                const trap = { x: p.x + step[0], y: p.y + step[1],
                                               triggered: false, discovered: false };
                                e.dungeon.traps = [trap];
                                e.dungeon.updateFOV(p.x, p.y, e.fovRadius || 7);
                                e.renderer.render(e.dungeon, p, e.monsters, 1000);
                                const before = window.__auditSnap();
                                const beforeTurn = e.turn;
                                const beforeHp = p.hp;
                                button.click();
                                const entries = Array.from(document.querySelectorAll("#chronicleLog .log-entry"));
                                const log = entries.length ? entries[entries.length - 1].textContent.trim() : "";
                                e.renderer.render(e.dungeon, p, e.monsters, 1000);
                                const painted = window.__auditDiff(before, window.__auditSnap());
                                const label = button.querySelector(".deck-label")?.textContent || "";
                                const hotkey = button.querySelector(".deck-hotkey")?.textContent || "";
                                const beforeDisarmTurn = e.turn;
                                const beforeDisarmXp = p.xp;
                                const beforeDisarmLevel = p.level;
                                const beforeDisarmHp = p.hp;
                                e.renderer.render(e.dungeon, p, e.monsters, 1000);
                                const beforeDisarm = window.__auditSnap();
                                button.click();
                                const disarmEntries = Array.from(
                                    document.querySelectorAll("#chronicleLog .log-entry")
                                );
                                const disarmLog = disarmEntries.length
                                    ? disarmEntries[disarmEntries.length - 1].textContent.trim()
                                    : "";
                                e.renderer.render(e.dungeon, p, e.monsters, 1000);
                                const paintedDisarm = window.__auditDiff(
                                    beforeDisarm, window.__auditSnap()
                                );
                                return {
                                    skip: false,
                                    button: true,
                                    label,
                                    hotkey,
                                    discovered: trap.discovered,
                                    triggered: trap.triggered,
                                    turnAdvanced: e.turn > beforeTurn,
                                    hpUnchanged: p.hp === beforeHp,
                                    log,
                                    painted,
                                    disarmed: trap.disarmed,
                                    disarmedTriggered: trap.triggered,
                                    disarmTurnAdvanced: e.turn > beforeDisarmTurn,
                                    disarmGained: p.xp > beforeDisarmXp || p.level > beforeDisarmLevel,
                                    disarmHpUnchanged: p.hp === beforeDisarmHp,
                                    disarmLog,
                                    paintedDisarm,
                                };
                            }"""
                        )
                        page.screenshot(
                            path=str(out_dir / f"search_trap_{vp_name}.png"), full_page=True
                        )
                        report["screenshots"].append(
                            {
                                "viewport": vp_name,
                                "scenario": "search",
                                "file": str(out_dir / f"search_trap_{vp_name}.png"),
                            }
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "search_button_reveals_trap": search_state.get("skip") is True
                                or (
                                    search_state.get("button") is True
                                    and search_state.get("label") == "Search"
                                    and search_state.get("hotkey") == "[R]"
                                    and search_state.get("discovered") is True
                                    and search_state.get("triggered") is False
                                    and search_state.get("turnAdvanced") is True
                                    and search_state.get("hpUnchanged") is True
                                    and "reveal 1 trap" in search_state.get("log", "")
                                    and search_state.get("painted", 0) > 60
                                ),
                            }
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "search_button_disarms_a_trap": search_state.get("skip") is True
                                or (
                                    search_state.get("button") is True
                                    and search_state.get("disarmed") is True
                                    and search_state.get("disarmedTriggered") is False
                                    and search_state.get("disarmTurnAdvanced") is True
                                    and search_state.get("disarmGained") is True
                                    and search_state.get("disarmHpUnchanged") is True
                                    and "disarm" in search_state.get("disarmLog", "")
                                    and search_state.get("paintedDisarm", 0) > 60
                                ),
                            }
                        )

                        # Black pact altar: three bargains, a real cost, and lore.
                        pact_state = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const pact = { x: e.player.x, y: e.player.y, used: false };
                                e.ui.showPactModal(pact, (choice) => e.resolvePact(pact, choice));
                                const choices = Array.from(document.querySelectorAll(".pact-choice"))
                                    .map((btn) => btn.dataset.choice);
                                const opened = e.ui.isModalOpen();
                                const probe = { x: e.player.x, y: e.player.y, used: false };
                                e.resolvePact(probe, "bogus");
                                const ignored = probe.used === false;
                                const beforeHp = e.player.max_hp;
                                const beforeMana = e.player.max_mana;
                                e.resolvePact(pact, "ward");
                                return {
                                    choices,
                                    opened,
                                    ignored,
                                    used: pact.used,
                                    hpGain: e.player.max_hp > beforeHp,
                                    manaSealed: e.player.max_mana < beforeMana,
                                    lore: e.loreUnlocked.includes("lore_pact"),
                                };
                            }"""
                        )
                        page.screenshot(
                            path=str(out_dir / f"pact_altar_{vp_name}.png"), full_page=True
                        )
                        page.click("#btnModalClose")
                        time.sleep(0.2)
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "pact_altar_has_three_choices": pact_state["choices"]
                                == ["wrath", "ward", "avarice"],
                                "pact_bargain_applies_cost_and_boon": pact_state["opened"]
                                and pact_state["used"]
                                and pact_state["hpGain"]
                                and pact_state["manaSealed"],
                                "pact_invalid_choice_ignored": pact_state["ignored"] is True,
                                "pact_unlocks_lore": pact_state["lore"] is True,
                            }
                        )

                        # A resumed run must remember which props are already spent.
                        save_state = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.dungeon.chests.forEach((chest) => { chest.opened = true; });
                                e.dungeon.traps.forEach((trap) => { trap.triggered = true; });
                                e.dungeon.urns.forEach((urn) => { urn.broken = true; });
                                e.dungeon.shrines.forEach((shrine) => { shrine.activated = true; });
                                (e.dungeon.souls || []).forEach((soul) => { soul.resolved = true; });
                                (e.dungeon.pacts || []).forEach((pact) => { pact.used = true; });
                                e.saveGameState();
                                const saved = e.loadSavedRun();
                                if (!saved) return { ok: false };
                                const livePacts = e.dungeon.pacts || [];
                                const savedPacts = saved.dungeon.pacts || [];
                                // `[].every(...)` is true, so an empty or missing list must
                                // fail explicitly; coordinates must round-trip too.
                                const pactsSaved = savedPacts.length > 0
                                    && savedPacts.length === livePacts.length
                                    && savedPacts.every((p, i) => p.used === true
                                        && p.x === livePacts[i].x
                                        && p.y === livePacts[i].y);
                                return {
                                    ok: true,
                                    chests: saved.dungeon.chests.every((c) => c.opened === true),
                                    traps: saved.dungeon.traps.every((t) => t.triggered === true),
                                    urns: saved.dungeon.urns.every((u) => u.broken === true),
                                    shrines: saved.dungeon.shrines.every((s) => s.activated === true),
                                    souls: saved.dungeon.souls.every((s) => s.resolved === true),
                                    pacts: pactsSaved,
                                    lore: Array.isArray(saved.loreUnlocked)
                                        && saved.loreUnlocked.length > 0,
                                };
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "soul_dialogue_has_three_choices": soul_state["choices"]
                                == ["ember", "toll", "lore"],
                                "soul_choice_applies_effect": soul_state["opened"]
                                and soul_state["resolved"]
                                and soul_state["healed"],
                                "soul_invalid_choice_ignored": soul_state["ignored"] is True,
                                "save_preserves_prop_and_lore_state": save_state.get("ok")
                                and save_state.get("chests")
                                and save_state.get("traps")
                                and save_state.get("urns")
                                and save_state.get("shrines")
                                and save_state.get("souls")
                                and save_state.get("pacts")
                                and save_state.get("lore"),
                            }
                        )

                        # Sigil objective: three sigils light the vault and it pays out.
                        objective = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                if (!e.dungeon.vault) return { skip: true };
                                e.sigilCount = 3;
                                e.updateSigils();
                                const heldThree = e.dungeon.sigilsHeld === 3
                                    && document.getElementById("sigilCount").textContent === "3";
                                while (e.player.inventory.length >= 12) e.player.inventory.pop();
                                e.sigilCount = 0;
                                e.openSigilVault(e.dungeon.vault);
                                e.updateSigils();
                                return {
                                    skip: false,
                                    heldThree,
                                    opened: e.dungeon.vault.opened === true,
                                    relic: e.player.inventory.some(
                                        (item) => String(item.id || "").startsWith("vault_relic")
                                    ),
                                    lore: e.loreUnlocked.includes("lore_vault"),
                                    pillReset: e.dungeon.sigilsHeld === 0,
                                };
                            }"""
                        )

                        # Boss phases: at half health it raises skeletons, at a quarter it enrages.
                        boss = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const d = e.dungeon;
                                // The summon needs two free neighbours, so place the test
                                // boss on a genuinely open tile instead of a fixed offset
                                // that may be a wall.
                                let spot = null;
                                for (let y = 1; y < d.height - 1 && !spot; y += 1) {
                                    for (let x = 1; x < d.width - 1; x += 1) {
                                        if (!d.isWalkable(x, y) || e._isOccupied(x, y)) continue;
                                        const free = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1]]
                                            .filter(([dx, dy]) =>
                                                d.isWalkable(x + dx, y + dy)
                                                && !e._isOccupied(x + dx, y + dy)).length;
                                        if (free >= 2) { spot = [x, y]; break; }
                                    }
                                }
                                if (!spot) return { phaseTwo: false, summoned: false,
                                                    phaseThree: false, enraged: false };
                                const hpBefore = e.player.hp;
                                const test = {
                                    name: "Phase Test Lich", type: "boss_lich",
                                    x: spot[0], y: spot[1],
                                    hp: 40, max_hp: 100, attack: 10, defense: 2,
                                    xp_reward: 0, gold_reward: 0, loot_drop: null,
                                    is_boss: true, is_champion: false, champion_affix: null,
                                    ai_state: "idle", status_effects: {},
                                };
                                e.monsters.push(test);
                                const beforeCount = e.monsters.length;
                                e.processEnemyTurns();
                                const phaseTwo = test.phase_two === true;
                                const summoned = e.monsters.length > beforeCount;
                                test.hp = 20;
                                e.processEnemyTurns();
                                const phaseThree = test.phase_three === true;
                                const enraged = test.attack > 12;
                                e.monsters = e.monsters.filter(
                                    (m) => m !== test && m.name !== "Risen Skeleton"
                                );
                                e.player.hp = hpBefore;
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                                return { phaseTwo, summoned, phaseThree, enraged };
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "sigil_vault_objective": not objective.get("skip")
                                and objective.get("heldThree")
                                and objective.get("opened")
                                and objective.get("relic")
                                and objective.get("lore")
                                and objective.get("pillReset"),
                                "boss_phase_two_summons": boss.get("phaseTwo")
                                and boss.get("summoned"),
                                "boss_phase_three_enrages": boss.get("phaseThree")
                                and boss.get("enraged"),
                            }
                        )

                        # The offline fallback must carry the floor objective too.
                        offline = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const saved = {
                                    dungeon: e.dungeon,
                                    monsters: e.monsters,
                                    player: e.player,
                                    turn: e.turn,
                                };
                                e._generateOfflineState(7, 2, "rogue");
                                const props = [
                                    ...e.dungeon.chests,
                                    ...e.dungeon.shrines,
                                    ...e.dungeon.urns,
                                    ...e.dungeon.souls,
                                    ...e.dungeon.sigils,
                                    ...e.dungeon.pacts,
                                ];
                                const result = {
                                    souls: e.dungeon.souls.length,
                                    sigils: e.dungeon.sigils.length,
                                    vault: Boolean(e.dungeon.vault),
                                    pacts: e.dungeon.pacts.length,
                                    traps: e.dungeon.traps.length,
                                    blockedSigil: e._isOccupied(
                                        e.dungeon.sigils[0].x, e.dungeon.sigils[0].y
                                    ),
                                    monstersOnProps: e.monsters.some((monster) =>
                                        props.some(
                                            (prop) => prop.x === monster.x && prop.y === monster.y
                                        )
                                    ),
                                };
                                e.dungeon = saved.dungeon;
                                e.monsters = saved.monsters;
                                e.player = saved.player;
                                e.turn = saved.turn;
                                e.dungeon.updateFOV(e.player.x, e.player.y, 7);
                                e.ui.updateHero(e.player, e.turn, e.depth, e.kills);
                                return result;
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "offline_fallback_has_objective": offline["souls"] == 1
                                and offline["sigils"] == 3
                                and offline["vault"]
                                and offline["pacts"] == 1
                                and offline["traps"] >= 1,
                                "monsters_never_cover_props": offline["blockedSigil"]
                                and not offline["monstersOnProps"],
                            }
                        )

                        # Bounty XP must resolve level-ups immediately.
                        bounty_xp = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                const bounty = e.bounties[0];
                                if (!bounty) return { skip: true };
                                const before = e.player.level;
                                bounty.progress = bounty.target - 1;
                                bounty.completed = false;
                                e.player.xp = Math.max(0, e.player.next_xp - 1);
                                e.updateBountyProgress(bounty.id, 1);
                                return { skip: false, leveled: e.player.level > before };
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "bounty_xp_levels_immediately": not bounty_xp.get("skip")
                                and bounty_xp.get("leveled") is True,
                            }
                        )

                    if "combat" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Combat & Magic...")
                        # Test music toggle
                        page.click("#btnMusicToggle")
                        time.sleep(0.2)
                        # Cast shield wall (barrier)
                        page.click("#btnActionShieldWall")
                        time.sleep(0.2)
                        # Shield bash / strike
                        page.click("#btnActionBash")
                        time.sleep(0.2)
                        # Cast heal spell to test particle & floating text
                        page.click("#btnActionHeal")
                        time.sleep(0.3)
                        combat_shot = out_dir / "combat_action.png"
                        page.screenshot(path=str(combat_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "combat", "file": str(combat_shot)}
                        )
                        print(f"      Saved screenshot: {combat_shot.name}")

                    if "shop" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Merchant Shop Modal...")
                        page.evaluate("() => window.gameEngine.openMerchantShop()")
                        time.sleep(0.3)
                        shop_shot = out_dir / "merchant_shop_modal.png"
                        page.screenshot(path=str(shop_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "shop", "file": str(shop_shot)}
                        )
                        print(f"      Saved screenshot: {shop_shot.name}")

                        expanded_relics = {
                            "potion_invulnerability",
                            "hammer_thunder",
                            "cloak_ethereal",
                            "amulet_bloodstone",
                            "boots_shadowstep",
                            "tome_pyromancy",
                        }
                        server_stock = page.eval_on_selector_all(
                            ".btn-buy", "els => els.map(el => el.dataset.itemId)"
                        )
                        epic_pills = page.eval_on_selector_all(
                            ".shop-item-row .pill-epic", "els => els.length"
                        )
                        # Force the offline fallback path and confirm it lists the same relics.
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.__auditStock = e.merchantStock;
                                e.merchantStock = [];
                                e.openMerchantShop();
                            }"""
                        )
                        time.sleep(0.2)
                        fallback_stock = page.eval_on_selector_all(
                            ".btn-buy", "els => els.map(el => el.dataset.itemId)"
                        )
                        page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.merchantStock = e.__auditStock;
                                delete e.__auditStock;
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "merchant_lists_expanded_relics": expanded_relics
                                <= set(server_stock),
                                "merchant_offline_fallback_parity": expanded_relics
                                <= set(fallback_stock),
                                "merchant_shows_epic_rarity": epic_pills >= 3,
                            }
                        )

                        # The Sell tab must convert one backpack item into gold and keep
                        # the shop open, not merely render a button.
                        sale = page.evaluate(
                            """() => {
                                const e = window.gameEngine;
                                e.ui.closeModal();
                                e.player.inventory.push({
                                    id: "crown_eternity", name: "Crown of Eternity", type: "ring",
                                    rarity: "legendary", description: "", stats: {},
                                });
                                e.openMerchantShop();
                                const tabs = Array.from(document.querySelectorAll(".shop-tab"));
                                const panes = Array.from(document.querySelectorAll(".shop-pane"));
                                const sellRows = Array.from(
                                    document.querySelectorAll('[data-shop-pane="sell"] .shop-item-row')
                                );
                                const before = {
                                    gold: e.player.gold,
                                    count: e.player.inventory.length,
                                    sellButtons: document.querySelectorAll(".btn-sell").length,
                                    crownInSellRows: sellRows.some(
                                        (row) => row.textContent.includes("Crown of Eternity")
                                    ),
                                    tabRoles: tabs.map((tab) => tab.getAttribute("role")),
                                    tabSelected: tabs.map((tab) => tab.getAttribute("aria-selected")),
                                    paneRoles: panes.map((pane) => pane.getAttribute("role")),
                                    paneLabelledBy: panes.map((pane) => pane.getAttribute("aria-labelledby")),
                                };
                                const tab = document.querySelector('[data-shop-tab="sell"]');
                                if (!tab) return { skip: false, hasTab: false, before };
                                tab.click();
                                const afterTab = {
                                    selected: tabs.map((tab) => tab.getAttribute("aria-selected")),
                                    active: tabs.map((tab) => tab.classList.contains("active")),
                                };
                                const btn = document.querySelector(".btn-sell");
                                if (!btn) return { skip: true, hasTab: true, before, afterTab, tab: e.ui.shopTab };
                                btn.click();
                                const crownHeld = e.player.inventory.some((item) => item.id === "crown_eternity");
                                const afterCount = e.player.inventory.length;
                                const crownIndex = e.player.inventory.findIndex(
                                    (item) => item.id === "crown_eternity"
                                );
                                if (crownIndex >= 0) e.player.inventory.splice(crownIndex, 1);
                                return {
                                    skip: false,
                                    hasTab: true,
                                    before,
                                    afterTab,
                                    crownHeld,
                                    gold: e.player.gold,
                                    count: afterCount,
                                    shopOpen: e.ui.shopOpen,
                                    tab: e.ui.shopTab,
                                    sellPaneHidden: document.querySelector('[data-shop-pane="sell"]').classList.contains("hidden"),
                                    sellButtons: document.querySelectorAll(".btn-sell").length,
                                };
                            }"""
                        )
                        page.screenshot(
                            path=str(out_dir / f"merchant_sell_tab_{vp_name}.png"), full_page=True
                        )
                        report["screenshots"].append(
                            {
                                "viewport": vp_name,
                                "scenario": "shop-sell",
                                "file": str(out_dir / f"merchant_sell_tab_{vp_name}.png"),
                            }
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "merchant_sells_backpack_loot": sale.get("skip") is True
                                or (
                                    sale.get("hasTab") is True
                                    and sale.get("gold", 0) > sale.get("before", {}).get("gold", 0)
                                    and sale.get("count") == sale.get("before", {}).get("count", 0) - 1
                                    and sale.get("sellButtons") == sale.get("before", {}).get("sellButtons", 0) - 1
                                    and sale.get("shopOpen") is True
                                    and sale.get("tab") == "sell"
                                    and sale.get("sellPaneHidden") is False
                                ),
                            }
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "merchant_tabs_and_crown_exclusion": sale.get("skip") is True
                                or (
                                    sale.get("hasTab") is True
                                    and sale.get("before", {}).get("crownInSellRows") is False
                                    and sale.get("before", {}).get("sellButtons")
                                    == sale.get("before", {}).get("count", 0) - 1
                                    and sale.get("crownHeld") is True
                                    and sale.get("before", {}).get("tabRoles") == ["tab", "tab"]
                                    and sale.get("before", {}).get("tabSelected") == ["true", "false"]
                                    and sale.get("before", {}).get("paneRoles") == ["tabpanel", "tabpanel"]
                                    and sale.get("before", {}).get("paneLabelledBy")
                                    == ["shopTabBuy", "shopTabSell"]
                                    and sale.get("afterTab", {}).get("selected") == ["false", "true"]
                                    and sale.get("afterTab", {}).get("active") == [False, True]
                                ),
                            }
                        )
                        page.click("#btnModalClose")
                        time.sleep(0.2)

                    if "records" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Records & Bestiary Modal...")
                        page.click("#btnRecords")
                        time.sleep(0.3)
                        records_shot = out_dir / "records_bestiary_modal.png"
                        page.screenshot(path=str(records_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "records", "file": str(records_shot)}
                        )
                        print(f"      Saved screenshot: {records_shot.name}")
                        records_seed = page.evaluate(
                            """() => {
                                const seed = window.gameEngine.dungeon?.seed;
                                const row = document.querySelector(".records-seed-row");
                                const btn = document.getElementById("btnCopySeed");
                                return {
                                    seed,
                                    row: row ? row.textContent.trim() : "",
                                    hasCopy: Boolean(btn),
                                    disabled: btn ? btn.disabled : null,
                                };
                            }"""
                        )
                        page.evaluate("() => document.getElementById('btnCopySeed')?.click()")
                        time.sleep(0.3)
                        copied = page.evaluate(
                            "() => document.getElementById('btnCopySeed')?.textContent.trim() || ''"
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "records_shows_and_copies_seed": records_seed["hasCopy"] is True
                                and str(records_seed["seed"]) in records_seed["row"]
                                and records_seed["disabled"] is False
                                and copied == "Copied",
                            }
                        )
                        page.click("#btnModalClose")
                        time.sleep(0.2)

                    if "bounties" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Bounties Modal & Adrenaline Surge...")
                        page.click("#btnBounties")
                        time.sleep(0.3)
                        bounties_shot = out_dir / "bounties_modal.png"
                        page.screenshot(path=str(bounties_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "bounties", "file": str(bounties_shot)}
                        )
                        print(f"      Saved screenshot: {bounties_shot.name}")
                        page.click("#btnModalClose")
                        time.sleep(0.2)

                        # Test jackpot banner and adrenaline vignette visually
                        page.evaluate("() => { window.gameEngine.ui.showJackpotBanner('CHEST JACKPOT', '+145 Gold (2.5x Critical Loot!)'); window.gameEngine._triggerNearMissSurge(); }")
                        time.sleep(0.4)
                        jackpot_shot = out_dir / "jackpot_and_surge.png"
                        page.screenshot(path=str(jackpot_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "jackpot", "file": str(jackpot_shot)}
                        )
                        print(f"      Saved screenshot: {jackpot_shot.name}")

                    if "crt" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: CRT Scanlines & Visual Polish...")
                        page.click("#btnCrtToggle")
                        time.sleep(0.3)
                        crt_shot = out_dir / "crt_scanlines.png"
                        page.screenshot(path=str(crt_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "crt", "file": str(crt_shot)}
                        )
                        print(f"      Saved screenshot: {crt_shot.name}")

                    if "classes" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Class Selection Modal...")
                        page.click("#btnRestart")
                        time.sleep(0.3)
                        class_shot = out_dir / "class_select_modal.png"
                        page.screenshot(path=str(class_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "classes", "file": str(class_shot)}
                        )
                        print(f"      Saved screenshot: {class_shot.name}")
                        # Pick Rogue with an explicit seed and Hard difficulty, then
                        # descend to B2F Caverns.
                        page.click(".difficulty-btn[data-difficulty='hard']")
                        page.fill("#seedInput", "424242")
                        page.click(".class-card[data-class='rogue']")
                        page.wait_for_function(
                            "window.gameEngine?.dungeon?.seed === 424242", timeout=15000
                        )
                        seeded = page.evaluate("() => window.gameEngine.dungeon.seed")
                        hard_state = page.evaluate(
                            """() => {
                                const badge = document.getElementById("difficultyBadge");
                                return {
                                    difficulty: window.gameEngine.difficulty,
                                    badge: badge ? badge.textContent.trim() : "",
                                    hidden: badge ? badge.classList.contains("hidden") : true,
                                };
                            }"""
                        )
                        report["audit_checks"].append(
                            {
                                "viewport": vp_name,
                                "class_select_seed_is_applied": seeded == 424242,
                                "class_select_difficulty_is_applied": hard_state["difficulty"] == "hard"
                                and hard_state["badge"] == "HARD"
                                and hard_state["hidden"] is False,
                            }
                        )
                        time.sleep(0.4)
                        page.evaluate("() => window.gameEngine.start(42, 2, 'rogue')")
                        time.sleep(0.4)
                        cavern_shot = out_dir / "cavern_rogue_desktop.png"
                        page.screenshot(path=str(cavern_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "cavern", "file": str(cavern_shot)}
                        )
                        print(f"      Saved screenshot: {cavern_shot.name}")

                        # Switch to Mage on Depth 3 Inferno
                        page.evaluate("() => window.gameEngine.start(42, 3, 'mage')")
                        time.sleep(0.4)
                        inferno_shot = out_dir / "inferno_mage_desktop.png"
                        page.screenshot(path=str(inferno_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "inferno", "file": str(inferno_shot)}
                        )
                        print(f"      Saved screenshot: {inferno_shot.name}")

                        # Test canvas hover reticle & pathfinding click
                        page.hover("#gameCanvas", position={"x": 380, "y": 270})
                        time.sleep(0.1)
                        page.click("#gameCanvas", position={"x": 418, "y": 270})
                        time.sleep(0.2)

                    if "gameover" in scenarios or "all" in scenarios:
                        print("      Driving Scenario: Death Modal...")
                        page.evaluate("() => window.gameEngine.handlePlayerDeath('a crypt wraith')")
                        time.sleep(0.3)
                        death_shot = out_dir / "gameover_modal.png"
                        page.screenshot(path=str(death_shot), full_page=True)
                        report["screenshots"].append(
                            {"viewport": vp_name, "scenario": "gameover", "file": str(death_shot)}
                        )
                        print(f"      Saved screenshot: {death_shot.name}")

                context.close()

            browser.close()

    finally:
        print("[4/4] Shutting down game server...")
        server.shutdown()
        server.server_close()

    failed_checks = [
        {"viewport": check.get("viewport", "unknown"), "check": name}
        for check in report["audit_checks"]
        for name, value in check.items()
        if name != "viewport" and value is not True
    ]
    report["failed_checks"] = failed_checks
    report["total_checks"] = sum(
        1 for check in report["audit_checks"] for name in check if name != "viewport"
    )

    report_path = out_dir / "audit_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Crypt-Crawler Headless UI Inspector")
    parser.add_argument(
        "--viewports",
        type=str,
        default="desktop,laptop,mobile",
        help="Comma-separated viewports: desktop,laptop,mobile",
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default="all",
        help="Scenarios to run: dungeon,inventory,combat,gameover,all",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=".inspect",
        help="Output folder for inspection artifacts",
    )
    args = parser.parse_args()

    vps = [v.strip() for v in args.viewports.split(",") if v.strip()]
    scens = [s.strip() for s in args.scenario.split(",") if s.strip()]
    out_dir = PROJECT_ROOT / args.out

    print("=" * 60)
    print(" [INSPECT] CRYPT-CRAWLER: Headless Browser Visual Audit")
    print("=" * 60)
    print(f" Target Viewports: {vps}")
    print(f" Scenarios:        {scens}")
    print(f" Output Directory: {out_dir}")
    print("=" * 60)

    report = run_inspection(vps, scens, out_dir)

    print("\n" + "=" * 60)
    print(" VISUAL INSPECTION SUMMARY")
    print("=" * 60)
    failed_checks = report.get("failed_checks", [])
    total_checks = report.get("total_checks", 0)
    print(f" Screenshots Captured: {len(report['screenshots'])}")
    print(f" Audit Checks Passed:  {total_checks - len(failed_checks)} / {total_checks}")
    print(f" Console Errors:       {len(report['console_errors'])}")

    if report["console_errors"]:
        print("\n [WARNING] Detected Browser Errors:")
        for err in report["console_errors"]:
            print(f"   - [{err['viewport']}] {err['type']}: {err['text']}")
    else:
        print("\n [OK] Zero browser console errors or uncaught exceptions detected!")

    if failed_checks:
        print("\n [FAIL] Failing audit checks:")
        for failed in failed_checks:
            print(f"   - [{failed['viewport']}] {failed['check']}")
    else:
        print(" [OK] Every audit check passed.")

    print("=" * 60)
    return 0 if not report["console_errors"] and not failed_checks else 1


if __name__ == "__main__":
    sys.exit(main())
