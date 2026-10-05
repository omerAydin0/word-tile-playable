"""The production line, run for real on one variant (without the video, to keep it short)."""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import produce  # noqa: E402
from browser import Browser, find_browser  # noqa: E402


def jpeg_size(path: Path) -> tuple[int, int]:
    """Width and height from a JPEG's frame header."""
    data = path.read_bytes()
    i = 2
    while i < len(data):
        marker, length = data[i + 1], struct.unpack(">H", data[i + 2:i + 4])[0]
        if 0xC0 <= marker <= 0xC3:
            height, width = struct.unpack(">HH", data[i + 5:i + 9])
            return width, height
        i += 2 + length
    raise ValueError("no frame header")


@pytest.mark.skipif(find_browser() is None, reason="needs a Chromium browser")
def test_one_variant_becomes_playables_and_stills(tmp_path, monkeypatch):
    monkeypatch.setattr(produce, "OUT", tmp_path)
    monkeypatch.setattr(produce, "SIMULATED_GAMES", 100)
    with Browser() as browser:
        m = produce.produce(browser, ROOT / "variants" / "comeback.json", video=False)

    assert m["ok"] and m["video"] is None
    assert set(m["playables"]) == {"preview", "facebook", "google", "mraid"}
    assert all((tmp_path / "comeback" / p["file"]).exists() for p in m["playables"].values())
    assert m["playables"]["facebook"]["kb"] < 2000

    assert 0 < m["moments"]["hook"] < m["moments"]["word"] < m["moments"]["end"]
    assert m["result_of_script"] == "win" and m["words_in_script"][0] == "HEART"
    assert len(m["stills"]) == 12
    sizes = {"9x16": (1080, 1920), "4x5": (1080, 1350), "1x1": (1080, 1080), "191x100": (1200, 628)}
    for name, expected in sizes.items():
        assert jpeg_size(tmp_path / "comeback" / "stills" / f"hook-{name}.jpg") == expected

    assert m["settings"]["botStartScore"] == 30 and "hook" not in m["settings"]
    assert m["outcomes"]["hint"]["win"] == 1 and m["outcomes"]["hint"]["cleared"] == 1
    assert (m["outcomes"]["hint"]["you"], m["outcomes"]["hint"]["opponent"]) == (70, 46)      # her head start is 30
    assert json.loads((tmp_path / "comeback" / "manifest.json").read_text(encoding="utf-8")) == m

    produce.write_page([m])
    page = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert "EMMA IS AHEAD" in page and "comeback/stills/hook-9x16.jpg" in page


def test_a_variant_that_breaks_a_rule_is_not_built(tmp_path, monkeypatch):
    monkeypatch.setattr(produce, "OUT", tmp_path)
    bad = tmp_path / "liar.json"
    bad.write_text(json.dumps({"label": "Liar", "hook": "x", "headline": "ONLY 1% CAN WIN"}), encoding="utf-8")
    m = produce.produce(None, bad, video=False)          # refused before a browser is needed
    assert not m["ok"] and any("percentage" in p for p in m["problems"])
    assert not (tmp_path / "liar").exists()
    produce.write_page([m])
    assert "not built" in (tmp_path / "index.html").read_text(encoding="utf-8")
