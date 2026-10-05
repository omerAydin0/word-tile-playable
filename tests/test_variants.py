"""The rules a variant must pass before the production line will build it."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import variants as rules  # noqa: E402

GOOD = {"label": "Duel", "hook": "A direct challenge.", "headline": "CAN YOU BEAT EMMA?", "theme": "beach"}


def with_(**changes) -> dict:
    return {**GOOD, **changes}


@pytest.mark.parametrize("path", sorted((ROOT / "variants").glob("*.json")), ids=lambda p: p.stem)
def test_the_committed_variants_pass(path):
    assert rules.problems(json.loads(path.read_text(encoding="utf-8"))) == []


def test_a_plain_variant_passes():
    assert rules.problems(GOOD) == []


@pytest.mark.parametrize("change, expected", [
    ({"headline": "ONLY 1% CAN SOLVE THIS"}, "percentage claim"),
    ({"headline": "ONLY GENIUSES CAN WIN"}, "only N can"),
    ({"headline": "THE BEST WORD GAME"}, "ranking claim"),
    ({"headline": "SPELL WORDS, WIN CASH"}, "reward the game does not give"),
    ({"headline": "BETTER THAN WORDSCAPES"}, "another product's name"),
    ({"headline": "EMMA IS AHEAD. CATCH UP!"}, "botStartScore is 0"),
    ({"headline": "CAN YOU BEAT ANNA?"}, "the opponent is EMMA"),
    ({"headline": "FREE WORDS FOR EVERYONE"}, "store button only"),
    ({"headline": "A HEADLINE THAT GOES ON FOR FAR TOO LONG"}, "30 fit"),
    ({"ctaLabel": "DOWNLOAD IT NOW"}, "12 fit"),
    ({"rounds": 9}, "rounds must be a number from 0 to 4"),
    ({"tutorial": "yes"}, "tutorial must be true or false"),
    ({"theme": "neon"}, "theme must be one of"),
    ({"theme": {"base": "beach", "sky": ["#000000"]}}, "theme.sky needs 4 colours"),
    ({"theme": {"base": "beach", "accent": "yellow"}}, "theme.accent needs 1 colour"),
    ({"theme": {"base": "beach", "tiles": "#ffffff"}}, "not a colour the ad uses"),
    ({"speed": 2}, "unknown settings: speed"),
    ({"hook": ""}, "'hook' is missing"),
    ({"endTitles": {"win": "YES"}}, "exactly win, lose and tie"),
])
def test_a_broken_variant_is_refused_with_the_reason(change, expected):
    found = rules.problems(with_(**change))
    assert any(expected in line for line in found), found


def test_the_claim_rules_allow_what_is_true():
    assert rules.problems(with_(headline="EMMA IS AHEAD. CATCH UP!", botStartScore=30)) == []
    assert rules.problems(with_(headline="CAN YOU BEAT MAYA?", opponentName="MAYA")) == []
    assert rules.problems(with_(ctaLabel="PLAY FREE")) == []


def test_a_custom_theme_passes():
    theme = {"base": "sunset", "sky": ["#101b4d", "#27408b", "#5a7fd6", "#c9d8ff"], "palm": ["#0b1030", "#1c2a5e"],
             "cloud": "#8a93c9", "accent": "#ffd84d", "strip": "#0a1238"}
    assert rules.problems(with_(theme=theme)) == []
