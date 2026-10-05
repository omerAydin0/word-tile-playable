"""What the build produces: one self-contained file per variant, within each network's limit."""
from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build  # noqa: E402

LEVEL = ROOT / "levels" / "ad_level.json"
VARIANTS = sorted((ROOT / "variants").glob("*.json"))


def injected(html: str) -> dict:
    return json.loads(re.search(r"window\.__PLAYABLE__=(\{.*?\});</script>", html, re.S).group(1))


@pytest.mark.parametrize("variant", VARIANTS, ids=lambda p: p.stem)
def test_preview_build_is_one_self_contained_file(variant):
    out = build.build(variant, "preview", LEVEL)
    html = out.read_text(encoding="utf-8")
    assert out.stat().st_size < 2_000_000
    assert html.count("<script") == 3 and "<script src" not in html
    assert "<link" not in html and "<img" not in html
    data = injected(html)
    assert data["config"]["variant"] == variant.stem and data["config"]["network"] == "preview"
    assert "hook" not in data["config"] and "label" not in data["config"]
    assert "solution" not in data["level"] and "source" not in data["level"]


def test_facebook_build_fits_two_megabytes():
    out = build.build(ROOT / "variants" / "duel.json", "facebook", LEVEL)
    assert out.suffix == ".html" and out.stat().st_size < 2_000_000
    assert injected(out.read_text(encoding="utf-8"))["config"]["network"] == "facebook"


def test_google_build_is_a_zip_with_the_exit_api():
    out = build.build(ROOT / "variants" / "duel.json", "google", LEVEL)
    assert out.suffix == ".zip"
    with zipfile.ZipFile(out) as z:
        assert z.namelist() == ["index.html"]
        html = z.read("index.html").decode("utf-8")
    assert "exitapi.js" in html and 'name="ad.orientation"' in html


def test_inlined_code_cannot_close_its_script_tag():
    assert "</script" not in build.inline_script("a</script>b<!--c")


def test_every_variant_only_uses_known_settings():
    core = (ROOT / "src" / "js" / "00_core.js").read_text(encoding="utf-8")
    defaults = core[core.index("const DEFAULTS"):core.index("const INJECTED")]
    known = set(re.findall(r"^\s{2}(\w+):", defaults, re.M))
    for variant in VARIANTS:
        settings = set(json.loads(variant.read_text(encoding="utf-8"))) - {"label", "hook"}
        assert settings <= known, f"{variant.name}: {settings - known}"
