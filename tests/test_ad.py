"""The ad itself, run in a headless browser: scripted games, then many simulated ones.

Skipped when no Chromium is installed (set CHROME to point at one).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import build  # noqa: E402
from browser import Browser, find_browser  # noqa: E402

pytestmark = pytest.mark.skipif(find_browser() is None, reason="needs a Chromium browser")


@pytest.fixture(scope="module")
def browser():
    build.build(ROOT / "variants" / "duel.json", "preview", ROOT / "levels" / "ad_level.json", quiet=True)
    with Browser() as session:
        yield session


def play(browser, script: str, until_phase: str | None = None, seconds: float = 0.0) -> tuple[dict, list[dict]]:
    """Runs a self-play script on the ad's own clock; returns where it stopped and what it reported."""
    page = browser.open(f"duel.html?seed=3&clock=manual&pace=0.3&play={script}", 360, 640, 1)
    try:
        t, now = 0.0, {}
        while t < 90:
            t += 0.5
            now = page.evaluate(f"__playable.seek({t})")
            if (until_phase and now["phase"] == until_phase) or (not until_phase and t >= seconds):
                break
        events = json.loads(page.evaluate("JSON.stringify(__playable.events)"))
    finally:
        page.close()
    return now, events


def test_a_player_who_follows_the_hand_clears_the_board_and_wins(browser):
    now, events = play(browser, "follow", until_phase="end")
    assert now["phase"] == "end"
    names = [e["event"] for e in events]
    assert names[:2] == ["ad_loaded", "game_start"]
    words = [(e["event"], e["word"], e["points"]) for e in events if e["event"] in ("word_submitted", "bot_word")]
    assert words == [("word_submitted", "HEART", 32), ("bot_word", "NOT", 6), ("word_submitted", "EASY", 24),
                     ("bot_word", "TOP", 10), ("word_submitted", "YOU", 14)]
    tutorial = next(e for e in events if e["event"] == "tutorial_completed")
    assert tutorial["word"] == "HEART" and tutorial["followed"] is True
    end = next(e for e in events if e["event"] == "game_end")
    assert (end["result"], end["you"], end["opponent"]) == ("win", 70, 16)
    assert end["reason"] == "board_cleared" and end["tilesLeft"] == 0 and end["words"] == 3
    assert not [e for e in events if e["event"] in ("error", "invalid_word", "tile_returned")]


def test_letters_that_spell_nothing_are_not_played_and_the_turn_stays(browser):
    now, events = play(browser, "HTR,submit", seconds=6)
    rejected = [e for e in events if e["event"] == "invalid_word"]
    assert rejected and rejected[0]["word"] == "HTR"
    assert now["phase"] == "player" and now["tray"] == 3
    assert not [e for e in events if e["event"] in ("word_submitted", "bot_word")]


def test_a_player_who_goes_their_own_way_still_gets_a_game(browser):
    now, events = play(browser, "HEAT,submit,hint,submit,hint,submit,hint,submit", until_phase="end")
    names = [e["event"] for e in events]
    assert now["phase"] == "end" and names.count("bot_word") >= 1
    first = next(e for e in events if e["event"] == "word_submitted")
    assert first["word"] == "HEAT" and first["points"] == (4 + 1 + 1 + 1) * 3
    assert next(e for e in events if e["event"] == "game_end")["reason"] in ("board_cleared", "no_words")


def test_a_game_that_leaves_the_plan_still_ends_with_an_empty_board(browser):
    # HATE instead of the planned HEART once ended with the opponent turning over the whole
    # deck and one tile left on the board.
    now, events = play(browser, "HATE,submit" + ",hint,submit" * 6, until_phase="end")
    end = next(e for e in events if e["event"] == "game_end")
    assert (end["reason"], end["tilesLeft"], end["result"]) == ("board_cleared", 0, "win")
    draws = [e for e in events if e["event"] == "deck_draw"]
    assert len(draws) <= 3          # a deck tile now and then, never the whole deck
    assert not [e for e in events if e["event"] == "error"]


def test_taking_a_tile_uncovers_what_is_under_it_and_putting_it_back_covers_it_again(browser):
    page = browser.open("duel.html?seed=3&clock=manual&tutorial=0", 360, 640, 1)
    look = """(() => { const m = __playable.model();
        const at = (x, y, z) => m.tiles.find(t => !t.fromDeck && t.x === x && t.y === y && t.z === z);
        const one = (t) => t.where + ':' + m.stateOf(t);
        return { top: one(at(0.5, 0.5, 1)), under: one(at(0, 0, 0)), beside: one(at(1, 0, 0)), tray: m.tray.length }; })()"""
    tap = "(() => { const m = __playable.model(); __playable.game.onTile(m.tiles.find(t => !t.fromDeck && t.x === %s && t.y === %s && t.z === %s).view); })()"
    try:
        page.evaluate("__playable.seek(3)")
        assert page.evaluate(look) == {"top": "board:free", "under": "board:covered", "beside": "board:covered", "tray": 0}
        page.evaluate(tap % (0.5, 0.5, 1))
        now = page.evaluate(look)
        assert now["under"] == "board:free"            # nothing else lay on it: open at once
        assert now["beside"] == "board:covered"        # a corner is still under the next top tile
        page.evaluate(tap % (0, 0, 0))                 # one layer down, in the same word
        assert page.evaluate(look) == {"top": "tray:free", "under": "tray:free", "beside": "board:covered", "tray": 2}
        page.evaluate(tap % (0.5, 0.5, 1))             # tapping a tray tile puts it back...
        assert page.evaluate(look) == {"top": "board:free", "under": "board:covered", "beside": "board:covered",
                                       "tray": 0}      # ...and what was dug from under it
    finally:
        page.close()


def test_the_same_seed_plays_the_same_game(browser):
    script = "HEAT,submit,hint,submit,hint,submit,hint,submit"       # off the plan, so the opponent has to choose
    _, first = play(browser, script, until_phase="end")
    _, second = play(browser, script, until_phase="end")
    words = lambda events: [e["word"] for e in events if e["event"] in ("word_submitted", "bot_word")]  # noqa: E731
    assert words(first) == words(second) and len(words(first)) >= 3


def test_a_frame_is_a_picture_of_the_whole_canvas(browser):
    page = browser.open("duel.html?seed=3&clock=manual", 360, 640, 2)
    try:
        shot = page.evaluate("__playable.frame(3.0)")
        size = page.evaluate("[__playable.app.canvas.width, __playable.app.canvas.height]")
    finally:
        page.close()
    assert shot["image"].startswith("data:image/jpeg;base64,") and len(shot["image"]) > 50_000
    assert size == [720, 1280]


def test_simulated_outcomes_match_the_design(browser):
    page = browser.open("duel.html?simulate=1000", 360, 640, 1)
    try:
        report = json.loads(page.data()["simulation"])
    finally:
        page.close()
    hint, casual, short = report["hint"], report["casual"], report["short"]
    assert hint["win"] == hint["games"] and hint["cleared"] == hint["games"]      # following the hand always wins
    assert (hint["you"], hint["opponent"]) == (70, 16)
    assert casual["win"] / casual["games"] > 0.8         # so, mostly, does any everyday word
    assert casual["cleared"] / casual["games"] > 0.95    # and whatever they play, the board comes out empty
    assert short["win"] / short["games"] < casual["win"] / casual["games"]        # the least effort does worse
