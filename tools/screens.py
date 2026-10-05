"""Lays the ad out on many screen sizes and reports anything off-screen, overlapping or too small to tap.

    python tools/screens.py            # the table
    python tools/screens.py --shots    # and a picture of each screen in docs/screens/

Three states are checked on each screen: the player mid-word, the tray's multiplier tab at
every word length from three to nine, and the opponent's word with its score badge. The
boxes come from the ad itself (`__playable.boxes()`), in CSS pixels.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from browser import Browser  # noqa: E402

OUT = ROOT / "docs" / "screens"
SCREENS = [
    ("iPhone SE (1st)", 320, 568), ("small Android", 360, 640), ("Android 18:9", 360, 720), ("Android 20:9", 360, 800),
    ("iPhone 8", 375, 667), ("iPhone X/11 Pro", 375, 812), ("iPhone 14", 390, 844), ("Pixel 7", 412, 915),
    ("iPhone 11", 414, 896), ("iPhone 15 Pro Max", 430, 932), ("tall foldable cover", 344, 882),
    ("webview with bars", 360, 560), ("old 3:2 phone", 320, 480),
    ("iPad portrait", 768, 1024), ("iPad Air portrait", 820, 1180), ("small tablet", 600, 960),
    ("iPhone SE landscape", 568, 320), ("iPhone 8 landscape", 667, 375), ("iPhone X landscape", 812, 375),
    ("iPhone 15 PM landscape", 932, 430), ("iPad landscape", 1024, 768), ("square", 540, 540), ("nearly square", 600, 540),
]
ORDER = ["header", "scorebar", "opponentRow", "plate", "deck", "tray", "button", "footer"]
SLACK = 1.0             # a pixel of rounding
MIN_BOARD_TILE = 40     # CSS pixels: what a thumb can hit
MIN_TRAY_TILE = 25      # tapped only to take a letter back


def overlap(a: dict, b: dict) -> float:
    """How far two boxes cut into each other (0 if they do not)."""
    dx = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
    dy = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
    return min(dx, dy) if dx > SLACK and dy > SLACK else 0


def problems(b: dict) -> list[str]:
    """Everything wrong with one set of boxes, in words."""
    out = []
    w, h = b["screen"]["w"], b["screen"]["h"]
    for name in ORDER + ["tab", "badge"]:
        r = b.get(name)
        if r and (r["x"] < -SLACK or r["y"] < -SLACK or r["x"] + r["w"] > w + SLACK or r["y"] + r["h"] > h + SLACK):
            out.append(f"{name} runs off the screen")
    names = ORDER if not b["landscape"] else [n for n in ORDER if n != "plate"]
    for i, first in enumerate(names):
        for second in names[i + 1:]:
            cut = overlap(b[first], b[second])
            if cut:
                out.append(f"{second} overlaps {first} by {cut:.0f}px")
    if b["landscape"]:
        for name in ("header", "scorebar", "opponentRow", "deck", "tray", "button", "footer"):
            cut = overlap(b["plate"], b[name])
            if cut:
                out.append(f"the board overlaps {name} by {cut:.0f}px")
    if b["tab"]:
        cuts = [overlap(b["tab"], tile) for tile in b["deckTiles"]]
        if any(cuts):
            out.append(f"the multiplier tab overlaps a deck tile by {max(cuts):.0f}px")
        out += [f"the multiplier tab overlaps {name}" for name in ("plate", "button", "scorebar", "footer")
                if overlap(b["tab"], b[name])]
    if b["badge"]:
        for name in ("header", "scorebar", "plate", "deck", "tray"):
            cut = overlap(b["badge"], b[name])
            if cut:
                out.append(f"the score badge overlaps {name} by {cut:.0f}px")
    for tile in b["rowTiles"]:
        out += [f"the opponent's word overlaps {name}" for name in ("header", "scorebar", "plate") if overlap(tile, b[name])]
    if b["boardTile"] < MIN_BOARD_TILE:
        out.append(f"board tiles are {b['boardTile']:.0f}px")
    if b["trayTile"] < MIN_TRAY_TILE:
        out.append(f"tray tiles are {b['trayTile']:.0f}px")
    if b["headlineScale"] * 46 < 13:
        out.append(f"the headline is {b['headlineScale'] * 46:.0f}px tall")
    return sorted(set(out))


def check_screen(browser: Browser, variant: str, w: int, h: int, shot: Path | None = None) -> tuple[dict, list[str]]:
    """The first set of boxes, and every problem found on one screen across the three states."""
    found: list[str] = []
    page = browser.open(f"{variant}.html?seed=3&clock=manual&play=HEART,submit", w, h, 2)
    try:
        page.evaluate("__playable.seek(4.2)")                                   # letters in the tray, the hand out
        first = page.evaluate("__playable.boxes()")
        found += problems(first)
        for letters in range(3, 10):                                            # the tab at every length
            page.evaluate(f"__playable.ui.tray.set({letters}, {letters - 1}, true)")
            page.evaluate(f"__playable.seek({4.2 + 0.4 * (letters - 2)})")
            found += [f"{p} (at {letters} letters)" for p in problems(page.evaluate("__playable.boxes()")) if "tab" in p]
        t = 4.2 + 0.4 * 8
        for _ in range(140):                                                    # on to the opponent's word and its badge
            t = round(t + 0.1, 1)
            now = page.evaluate(f"__playable.seek({t})")
            boxes = page.evaluate("__playable.boxes()")
            if now["phase"] == "bot" and boxes["badge"]:
                found += problems(boxes)
                if shot:
                    picture = page.evaluate(f"__playable.frame({t}, 'image/jpeg', 0.85)")
                    shot.parent.mkdir(parents=True, exist_ok=True)
                    shot.write_bytes(base64.b64decode(picture["image"].split(",", 1)[1]))
                break
        else:
            found.append("the opponent's badge never appeared")
    finally:
        page.close()
    return first, sorted(set(found))


def main() -> None:
    shots = "--shots" in sys.argv
    bad = 0
    with Browser() as browser:
        for label, w, h in SCREENS:
            for variant in ("duel", "comeback"):                 # comeback has the longest headline
                first, found = check_screen(browser, variant, w, h,
                                            OUT / f"{w}x{h}.jpg" if shots and variant == "duel" else None)
                bad += bool(found)
                if variant == "duel":
                    print(f"{label:24s} {w:4d}x{h:<4d}  board tile {first['boardTile']:5.1f}px  "
                          f"tray tile {first['trayTile']:4.1f}px  {'ok' if not found else '; '.join(found)}")
                elif found:
                    print(f"{'':24s} comeback: {'; '.join(found)}")
    print(f"{bad} of {len(SCREENS) * 2} checks found a problem")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
