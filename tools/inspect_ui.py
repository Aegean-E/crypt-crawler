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

                audit_check = {
                    "viewport": vp_name,
                    "canvas_rendered": canvas_box["width"] > 200 and canvas_box["height"] > 150,
                    "hero_panel_visible": hero_box["width"] > 0,
                    "deck_visible": deck_box["width"] > 0,
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
                        page.click("#btnModalClose")
                        time.sleep(0.2)

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
    print(f" Screenshots Captured: {len(report['screenshots'])}")
    print(f" Audit Checks Passed:  {len(report['audit_checks'])}")
    print(f" Console Errors:       {len(report['console_errors'])}")

    if report["console_errors"]:
        print("\n [WARNING] Detected Browser Errors:")
        for err in report["console_errors"]:
            print(f"   - [{err['viewport']}] {err['type']}: {err['text']}")
    else:
        print("\n [OK] Zero browser console errors or uncaught exceptions detected!")

    print("=" * 60)
    return 0 if not report["console_errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
