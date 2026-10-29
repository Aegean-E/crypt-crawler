"""Lore codex: the readable history of the crypt, its relics and its dead.

Entries are data only. The browser fetches them once from `/api/lore` and records
which ones a run has discovered, so a player's journal survives in the save.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

CATEGORIES: Tuple[str, ...] = ("Places", "The Fallen", "Relics", "Whispers")

LORE_ENTRIES: List[Dict[str, str]] = [
    {
        "id": "lore_verge",
        "title": "The Verge",
        "category": "Places",
        "text": (
            "Every road in the valley ends at the same iron door. The villagers "
            "call it the Verge because it is where the map stops being useful. "
            "Your father's lantern still smells of the oil he burned here, and "
            "the hinges remember his hand."
        ),
    },
    {
        "id": "lore_cavern",
        "title": "The Weeping Cavern",
        "category": "Places",
        "text": (
            "The second floor is not carved; it is dissolved. Water has been "
            "eating the limestone for a thousand years, and it still drips in "
            "the dark like a slow, patient clock. The pale lichen glows only "
            "where something died."
        ),
    },
    {
        "id": "lore_inferno",
        "title": "The Ember Throat",
        "category": "Places",
        "text": (
            "Below the water the stone turns to slag. The old miners called this "
            "the Ember Throat and swore the heat came from a furnace, not from "
            "the earth. Malakor did not build his vault here by accident. He "
            "built it where the world was already burning."
        ),
    },
    {
        "id": "lore_soul",
        "title": "The Unburied",
        "category": "The Fallen",
        "text": (
            "They are not ghosts. Ghosts want something. The Unburied simply "
            "refuse to be finished. Offer one an ember and it remembers warmth; "
            "offer it coin and it remembers greed; ask it a question and it "
            "remembers, for a moment, how to speak."
        ),
    },
    {
        "id": "lore_merchant",
        "title": "Grimbold's Ledger",
        "category": "The Fallen",
        "text": (
            "Grimbold came down to bury his brother and stayed to sell rope. His "
            "ledger lists three hundred and eleven debts, every one marked "
            "'paid in full' in a different, unsteady hand. He never explains "
            "where the stock comes from, and no one has ever caught him lying."
        ),
    },
    {
        "id": "lore_lich",
        "title": "Malakor, the Arch-Lich",
        "category": "The Fallen",
        "text": (
            "He was a king's physician who promised his court a cure for death "
            "and delivered it, one courtier at a time. The crown he wears is not "
            "gold but bone grown into gold. He does not hate the living. He "
            "simply cannot understand why they insist on leaving."
        ),
    },
    {
        "id": "lore_crown",
        "title": "The Crown of Eternity",
        "category": "Relics",
        "text": (
            "A circlet of nine interlocking vertebra, plated in grave-gold. It "
            "grants no true immortality; it only refuses to let its wearer "
            "stop. The last person to wear it is still down here, still "
            "walking, still certain the war is not over."
        ),
    },
    {
        "id": "lore_vault",
        "title": "Sigil-Sealed Vaults",
        "category": "Relics",
        "text": (
            "The vault smiths distrusted keys. Keys can be copied, stolen or "
            "lost, so they cut each vault with three sockets and scattered the "
            "sigils among the dead. A door that requires three witnesses cannot "
            "be opened by one traitor."
        ),
    },
    {
        "id": "lore_sigil",
        "title": "The Three Sigils",
        "category": "Relics",
        "text": (
            "Iron, salt and ash: the three sigils of the deep vaults. They are "
            "cold to the touch even in the Ember Throat, and they hum with the "
            "same note when brought close together. Everyone who has carried "
            "three of them says the same thing: the door knows your name."
        ),
    },
    {
        "id": "lore_shrine",
        "title": "Altars That Remember",
        "category": "Whispers",
        "text": (
            "The shrines were not built for gods. They were built as witnesses. "
            "Prayers spoken here are recorded in the stone and repeated back to "
            "the next pilgrim in a voice that is almost your own. The blessing "
            "is real. So is the debt."
        ),
    },
    {
        "id": "lore_watchers",
        "title": "The Watchers in the Wall",
        "category": "Whispers",
        "text": (
            "Shatter a burial urn and you may hear a small, dry sigh. The "
            "catacombs keep every fragment of every person who was ever laid to "
            "rest here, and some of those fragments are still keeping watch. "
            "They do not mind being broken. They mind being forgotten."
        ),
    },
    {
        "id": "lore_pact",
        "title": "The Black Altars",
        "category": "Whispers",
        "text": (
            "The black altars were not built to be worshipped. They were " "built to settle accounts. A soldier who wanted to survive a siege " "gave them his fear; a queen who wanted a son gave them her voice. " "The stone keeps what it is given and returns it with interest, which " "is why the wise count the cost before they touch the candles."
        ),
    },
    {
        "id": "lore_death",
        "title": "The Catacombs Keep Their Own",
        "category": "Whispers",
        "text": (
            "No one is buried in the crypt. The crypt is what happens to those "
            "who are not buried. Your name is already in the ledger; only the "
            "date is wet ink. Close your eyes, and the dark will read it back "
            "to you in your father's voice."
        ),
    },
]

LORE_BY_ID: Dict[str, Dict[str, str]] = {entry["id"]: entry for entry in LORE_ENTRIES}

STARTING_LORE: Tuple[str, ...] = ("lore_verge",)

# Event keys the client uses when a discovery happens.
LORE_EVENTS: Dict[str, str] = {
    "start": "lore_verge",
    "depth2": "lore_cavern",
    "depth3": "lore_inferno",
    "shrine": "lore_shrine",
    "merchant": "lore_merchant",
    "soul": "lore_soul",
    "vault": "lore_vault",
    "sigil": "lore_sigil",
    "boss": "lore_lich",
    "crown": "lore_crown",
    "death": "lore_death",
    "watchers": "lore_watchers",
    "pact": "lore_pact",
}


def public_entries() -> List[Dict[str, str]]:
    """Every entry as a fresh dict, safe to serialise to the client."""
    return [dict(entry) for entry in LORE_ENTRIES]


def entry_for_event(event: str) -> str:
    """The lore id tied to a discovery event, or an empty string."""
    return LORE_EVENTS.get(event, "")


def starting_lore() -> List[str]:
    """The entries a brand-new run begins with."""
    return list(STARTING_LORE)


def is_valid_entry(entry_id: str) -> bool:
    """Whether an id names a real entry (guards saves against drift)."""
    return entry_id in LORE_BY_ID
