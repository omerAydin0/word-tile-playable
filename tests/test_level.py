"""The committed level: clearable, clean, and consistent with what the ad is told about it."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import build_level as bl  # noqa: E402

LEVEL = json.loads((ROOT / "levels" / "ad_level.json").read_text(encoding="utf-8"))
TILES = {(x, y, z): ch for x, y, z, ch in LEVEL["tiles"]}


def decode(packed: str) -> list[str]:
    """The same decoding the ad does (decodeWords in src/js/10_rules.js)."""
    out, prev, i = [], "", 0
    while i < len(packed):
        j = i + 1
        while j < len(packed) and not packed[j].isdigit():
            j += 1
        prev = prev[:int(packed[i])] + packed[i + 1:j]
        out.append(prev)
        i = j
    return out


WORDS = decode(LEVEL["words"])


def test_layout_is_two_layers_with_six_open_tiles():
    layout = bl.layout()
    assert len(layout) == 18 and set(layout) == set(TILES)
    free = bl.free_of(set(layout))
    assert len(free) == 6 and all(p[2] == 1 for p in free)


def test_a_tile_is_covered_by_any_overlapping_tile_above():
    assert bl.covers((0.5, 0.5, 1), (0, 0, 0))
    assert bl.covers((0.5, 0.5, 1), (1, 1, 0))
    assert not bl.covers((0.5, 0.5, 1), (2, 0, 0))
    assert not bl.covers((0, 0, 0), (0.5, 0.5, 1))


PLAN = [(step["word"], [tuple(p) for p in step["tiles"]]) for step in LEVEL["plan"]]


def test_the_planned_game_clears_the_board():
    assert bl.verify(TILES, PLAN)
    assert PLAN[0][0] == LEVEL["opener"]
    assert [len(word) for word, _ in PLAN] == list(bl.PLAN)
    assert [step["by"] for step in LEVEL["plan"]] == [0, 1, 0, 1, 0]          # the player starts and finishes


def test_the_planned_game_is_a_clear_win_and_she_never_leads():
    assert all(step["points"] == bl.word_points(step["word"]) for step in LEVEL["plan"])
    you, her, led = bl.plan_scores(PLAN)
    assert not led and you - her >= 20
    assert bl.word_points("EASTWARD") == 91           # read off a screenshot of the game: 13 letters' worth, times 7


def test_the_planned_words_are_ones_the_ad_may_show():
    for step in LEVEL["plan"]:
        assert step["word"] in LEVEL["common"], step["word"]
        assert step["word"] not in bl.UNSAFE | bl.OPPONENT_AVOID


def test_the_opener_can_be_spelled_from_the_open_tiles():
    free = Counter(TILES[p] for p in bl.free_of(set(TILES)))
    assert not Counter(LEVEL["opener"]) - free


def test_word_list_survives_front_coding():
    assert WORDS == sorted(set(WORDS))
    assert bl.front_code(WORDS) == LEVEL["words"]
    assert all(3 <= len(w) <= 9 and w.isalpha() and w.isupper() for w in WORDS)


def test_every_accepted_word_fits_the_level_letters():
    letters = Counter("".join(TILES.values()) + LEVEL["deck"])
    assert all(not Counter(w) - letters for w in WORDS)


def test_nothing_unsafe_is_accepted_and_the_opponent_avoids_more():
    accepted = set(WORDS)
    assert not accepted & bl.UNSAFE
    common = set(LEVEL["common"])
    assert common <= accepted
    assert not common & bl.OPPONENT_AVOID
    assert set(LEVEL["hints"]) <= common
    assert not set(LEVEL["hints"]) & bl.STOPWORDS
    assert LEVEL["opener"] in common


def test_every_letter_has_a_value():
    assert set(LEVEL["values"]) == set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    assert all(isinstance(v, int) and v >= 1 for v in LEVEL["values"].values())
