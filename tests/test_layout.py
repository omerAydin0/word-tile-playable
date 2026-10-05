"""Nothing runs off the screen, nothing overlaps, and the tiles stay big enough to tap, on every screen in the list."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import build  # noqa: E402
import screens  # noqa: E402
from browser import Browser, find_browser  # noqa: E402

pytestmark = pytest.mark.skipif(find_browser() is None, reason="needs a Chromium browser")


@pytest.fixture(scope="module")
def browser():
    for variant in ("duel", "comeback"):
        build.build(ROOT / "variants" / f"{variant}.json", "preview", ROOT / "levels" / "ad_level.json", quiet=True)
    with Browser() as session:
        yield session


@pytest.mark.parametrize("label, width, height", screens.SCREENS, ids=[s[0] for s in screens.SCREENS])
def test_the_layout_holds_on_this_screen(browser, label, width, height):
    _, found = screens.check_screen(browser, "duel", width, height)
    assert found == []


@pytest.mark.parametrize("label, width, height", [s for s in screens.SCREENS if s[0] in (
    "iPhone SE (1st)", "old 3:2 phone", "iPhone SE landscape", "square")], ids=lambda v: str(v))
def test_the_longest_headline_fits_the_smallest_screens(browser, label, width, height):
    _, found = screens.check_screen(browser, "comeback", width, height)
    assert found == []


def test_the_check_itself_can_see_an_overlap():
    box = lambda x, y, w, h: {"x": x, "y": y, "w": w, "h": h}  # noqa: E731
    clean = {"screen": {"w": 360, "h": 640}, "landscape": False, "header": box(0, 0, 360, 40), "scorebar": box(0, 44, 360, 60),
             "opponentRow": box(0, 108, 360, 40), "plate": box(10, 152, 340, 250), "deck": box(100, 410, 160, 40),
             "tray": box(10, 480, 340, 36), "button": box(100, 524, 160, 50), "footer": box(0, 590, 360, 50),
             "tab": box(150, 458, 30, 19), "badge": None, "deckTiles": [box(100, 410, 40, 40)], "rowTiles": [],
             "headlineScale": 0.5, "boardTile": 60, "trayTile": 35, "deckTile": 36}
    assert screens.problems(clean) == []
    raised = dict(clean, tab=box(110, 440, 30, 19))                 # the tab pushed up into the deck
    assert any("multiplier tab overlaps a deck tile" in p for p in screens.problems(raised))
    wide = dict(clean, tray=box(10, 480, 380, 36))                  # the tray wider than the screen
    assert "tray runs off the screen" in screens.problems(wide)
    small = dict(clean, boardTile=32)
    assert any("board tiles are 32px" in p for p in screens.problems(small))
