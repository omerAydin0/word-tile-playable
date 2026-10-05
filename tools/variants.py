"""Checks a variant file before anything is built from it.

    python tools/variants.py                 # every file in variants/
    python tools/variants.py variants/duel.json

A variant is written by a person or by an agent; either way it goes through here first.
The rules are the ones a reviewer would otherwise have to remember: settings that exist,
copy that fits its box, and a headline that does not promise what the ad does not do.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from build_level import UNSAFE  # noqa: E402

THEMES = ("beach", "sunset", "lagoon")
THEME_COLOURS = {"sky": 4, "sea": 3, "sand": 3, "palm": 2, "cloud": 1, "glow": 1,
                 "strip": 1, "panel": 1, "accent": 1}
NOTES = ("label", "hook", "creative")       # read by the pipeline, stripped from the ad
TEXT_LIMITS = {"headline": 30, "ctaLabel": 12, "brand": 18, "opponentName": 8, "playerName": 8, "endSubtitle": 34}
NUMBER_RANGES = {"rounds": (0, 4), "botStartScore": (0, 60), "botSkill": (0, 1), "hintIdle": (2, 10),
                 "autoEndSeconds": (0, 90), "scoreScale": (1, 10), "seed": (0, 2 ** 31)}

# Claims an ad for this game cannot back up, and names it must not borrow.
FORBIDDEN = [
    (r"\d+\s*%", "a percentage claim"),
    (r"\bONLY\b.*\bCAN\b", "an 'only N can' claim"),
    (r"\bIQ\b|\bGENIUS\b", "an intelligence claim"),
    (r"#\s*1\b|\bNO\.?\s*1\b|\bBEST\b", "a ranking claim"),
    (r"\bCASH\b|\bMONEY\b|\bPRIZES?\b|\bEARN\b", "a reward the game does not give"),
    (r"WORDSCAPES|WORD TILES|SCRABBLE|WORDLE|CANDY CRUSH", "another product's name"),
]


def known_settings() -> set[str]:
    core = (ROOT / "src" / "js" / "00_core.js").read_text(encoding="utf-8")
    defaults = core[core.index("const DEFAULTS"):core.index("const INJECTED")]
    return set(re.findall(r"^\s{2}(\w+):", defaults, re.M))


def is_colour(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) is not None


def problems(config: dict) -> list[str]:
    """Everything wrong with a variant, in words. An empty list means it may be built."""
    out: list[str] = []
    unknown = set(config) - known_settings() - set(NOTES)
    if unknown:
        out.append(f"unknown settings: {', '.join(sorted(unknown))}")
    for note in ("label", "hook"):
        if not str(config.get(note, "")).strip():
            out.append(f"'{note}' is missing: the gallery and the report need it")

    for key, limit in TEXT_LIMITS.items():
        if key in config:
            text = config[key]
            if not isinstance(text, str) or not text.strip():
                out.append(f"{key} must be text")
            elif len(text) > limit:
                out.append(f"{key} is {len(text)} characters; {limit} fit")
    for key in ("opponentName", "playerName"):
        if key in config and isinstance(config[key], str) and not config[key].isalpha():
            out.append(f"{key} must be letters only")

    for key, (lo, hi) in NUMBER_RANGES.items():
        if key in config:
            value = config[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not lo <= value <= hi:
                out.append(f"{key} must be a number from {lo} to {hi}")
    for key in ("tutorial", "botMercy", "sound", "music", "debug"):
        if key in config and not isinstance(config[key], bool):
            out.append(f"{key} must be true or false")

    theme = config.get("theme", "beach")
    if isinstance(theme, dict):
        if theme.get("base") not in THEMES:
            out.append(f"theme.base must be one of {', '.join(THEMES)}")
        for key, value in theme.items():
            if key == "base":
                continue
            if key not in THEME_COLOURS:
                out.append(f"theme.{key} is not a colour the ad uses")
                continue
            count = THEME_COLOURS[key]
            colours = value if isinstance(value, list) else [value]
            if len(colours) != count or not all(is_colour(c) for c in colours):
                out.append(f"theme.{key} needs {count} colour{'s' if count > 1 else ''} like \"#1a2b3c\"")
    elif theme not in THEMES:
        out.append(f"theme must be one of {', '.join(THEMES)}, or an object with a base")

    titles = config.get("endTitles")
    if titles is not None:
        if not isinstance(titles, dict) or set(titles) != {"win", "lose", "tie"}:
            out.append("endTitles needs exactly win, lose and tie")
        else:
            out += [f"endTitles.{k} is {len(v)} characters; 18 fit" for k, v in titles.items() if len(str(v)) > 18]

    # What the words promise must be what the ad does.
    copy = " ".join(str(config.get(k, "")) for k in ("headline", "ctaLabel", "endSubtitle", "brand")).upper()
    copy += " " + " ".join(str(v) for v in (titles or {}).values()).upper() if isinstance(titles, dict) else ""
    for pattern, what in FORBIDDEN:
        if re.search(pattern, copy):
            out.append(f"the copy makes {what}")
    bad = sorted(set(re.findall(r"[A-Z]+", copy)) & UNSAFE)
    if bad:
        out.append(f"the copy uses words the ad itself blocks: {', '.join(bad)}")
    headline = str(config.get("headline", "")).upper()
    if re.search(r"\bAHEAD\b|\bBEHIND\b|\bCATCH UP\b|\bCOMEBACK\b", headline) and not config.get("botStartScore"):
        out.append("the headline says the opponent is ahead, but botStartScore is 0")
    promised = [headline, str(config.get("endSubtitle", "")).upper()]
    promised += [str(v).upper() for v in titles.values()] if isinstance(titles, dict) else []
    if re.search(r"\bFREE\b", " ".join(promised)):
        out.append("'free' belongs on the store button only")
    opponent = str(config.get("opponentName", "EMMA")).upper()
    for name in re.findall(r"\bBEAT (\w+)", headline):
        if name not in (opponent, "THE"):
            out.append(f"the headline names {name}, but the opponent is {opponent}")

    creative = config.get("creative")
    if creative is not None:
        if not isinstance(creative, dict) or set(creative) - {"play", "stills"}:
            out.append("creative may only hold 'play' and 'stills'")
        elif "play" in creative and not re.fullmatch(r"[A-Za-z0-9.,]+", str(creative["play"])):
            out.append("creative.play is a comma-separated list of letters, submit, hint, draw and w<seconds>")
    return out


def main() -> None:
    paths = [Path(a) for a in sys.argv[1:]] or sorted((ROOT / "variants").glob("*.json"))
    failed = False
    for path in paths:
        try:
            found = problems(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as error:
            found = [f"cannot be read: {error}"]
        print(f"{path.name}: {'ok' if not found else ''}")
        for line in found:
            failed = True
            print(f"  - {line}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
