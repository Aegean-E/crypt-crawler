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
                        # Pick Rogue and descend to B2F Caverns
                        page.click(".class-card[data-class='rogue']")
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
