"""
Deterministic UI inventory for the AIKit UI guard (`.aikit/ui.json`).

Prints one stable line per control, handler group, dynamic choice and theme token in
the shipped interface. `aikit ui begin` records the sorted inventory; `aikit ui verify`
reports any entry that disappeared, so a control or handler cannot be silently lost
while the unit suite stays green.

Stdlib only, no browser, no build step.

Usage:
    python tools/ui_inventory.py
    python tools/ui_inventory.py --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Sequence, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC = PROJECT_ROOT / "static"

CONTROL_TAGS = {"button", "canvas", "input", "select", "textarea"}
ATTR_CHOICES = ("data-slot", "data-filter", "data-class", "data-choice")
GET_BY_ID = re.compile(r"getElementById\(\s*[\"']([^\"']+)[\"']\s*\)")
QUERY_ALL = re.compile(r"querySelectorAll\(\s*[\"']([^\"']+)[\"']\s*\)")
LISTENER = re.compile(r"addEventListener\(\s*[\"']([a-z]+)[\"']")
TEMPLATE_CHOICE = re.compile(r"data-choice=\\?[\"']([a-z-]+)\\?[\"']")
THEME_VAR = re.compile(r"^\s*(--[a-z0-9-]+)\s*:", re.IGNORECASE | re.MULTILINE)


class _ControlParser(HTMLParser):
    """Collects controls, id-bearing containers and data-attribute choices."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entries: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str | None]]) -> None:
        values = {name: value or "" for name, value in attrs}
        element_id = values.get("id", "").strip()
        if element_id and (tag in CONTROL_TAGS or tag in {"div", "section", "aside", "main"}):
            label = (values.get("title") or values.get("aria-label") or "").strip()
            suffix = f' "{label}"' if label else ""
            self.entries.append(f"control {tag}#{element_id}{suffix}")
        for attribute in ATTR_CHOICES:
            value = values.get(attribute, "").strip()
            if value:
                self.entries.append(f"choice {attribute}={value}")


def _html_entries(path: Path) -> List[str]:
    if not path.is_file():
        return []
    parser = _ControlParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser.entries


def _script_entries(paths: Sequence[Path]) -> List[str]:
    entries: List[str] = []
    for path in paths:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        entries.extend(f"ref {path.name} #{match}" for match in GET_BY_ID.findall(text))
        entries.extend(f"ref {path.name} {match}" for match in QUERY_ALL.findall(text))
        entries.extend(f"handler {path.name} {event}" for event in LISTENER.findall(text))
        entries.extend(
            f"choice data-choice={value}" for value in TEMPLATE_CHOICE.findall(text)
        )
    return entries


def _theme_entries(path: Path) -> List[str]:
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    return [f"theme {name.lower()}" for name in THEME_VAR.findall(text)]


def inventory(root: Path = PROJECT_ROOT) -> List[str]:
    """Sorted, deduplicated inventory lines for every shipped UI surface."""
    static = root / "static"
    entries: List[str] = []
    entries.extend(_html_entries(static / "index.html"))
    entries.extend(_script_entries(sorted((static / "js").glob("*.js"))))
    entries.extend(_theme_entries(static / "css" / "style.css"))
    return sorted({entry for entry in entries if entry.strip()})


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Print the Crypt-Crawler UI inventory.")
    parser.add_argument("--json", action="store_true", help="print one JSON object")
    parser.add_argument("--project", type=Path, default=PROJECT_ROOT, help="project root")
    args = parser.parse_args(argv)

    entries = inventory(args.project)
    if args.json:
        print(json.dumps({"schema": 1, "count": len(entries), "entries": entries}, indent=2))
    else:
        print("\n".join(entries))
    return 0 if entries else 1


if __name__ == "__main__":
    sys.exit(main())
