"""Builds the playable: one self-contained HTML file per variant.

    python build.py                       # every variant, preview build -> dist/
    python build.py --variant duel        # one variant
    python build.py --network facebook    # network builds -> dist/facebook/

No Node, no bundler: the source files in src/js are concatenated in name order into one
closure, and the libraries, the font, the level and the variant's settings are inlined.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"
DIST = ROOT / "dist"

# What each network expects of the file, and its size limit in bytes.
NETWORKS = {
    "preview":   {"limit": 5_000_000, "zip": False, "head": ""},
    "mraid":     {"limit": 5_000_000, "zip": False, "head": ""},   # AppLovin, Unity, ironSource
    "facebook":  {"limit": 2_000_000, "zip": False, "head": ""},   # Meta: one HTML file under 2 MB
    "google":    {"limit": 5_000_000, "zip": True,
                  "head": '<meta name="ad.orientation" content="portrait,landscape">\n'
                          '<script src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>'},
    "mintegral": {"limit": 5_000_000, "zip": True, "head": ""},
    "tiktok":    {"limit": 5_000_000, "zip": True, "head": ""},
    "vungle":    {"limit": 5_000_000, "zip": True, "head": ""},
}

# pixi-unsafe-eval swaps the functions Pixi would otherwise generate with `new Function`:
# some ad webviews forbid that, and without it the ad would be a blank screen there.
VENDOR_SCRIPTS = ("pixi.min.js", "pixi-unsafe-eval.min.js", "gsap.min.js")

THEME_BACKGROUND = {"beach": "#0b2c66", "sunset": "#2a1250", "lagoon": "#063842"}


def page_background(theme) -> str:
    """The colour behind the canvas while it loads: the theme's header colour."""
    if isinstance(theme, dict):
        return theme.get("strip") or THEME_BACKGROUND.get(theme.get("base"), "#0b2c66")
    return THEME_BACKGROUND.get(theme, "#0b2c66")


def inline_script(code: str) -> str:
    """Code that may sit inside a <script> element."""
    return code.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def app_code() -> str:
    parts = []
    for path in sorted((SRC / "js").glob("*.js")):
        parts.append(f"// ---- {path.name}\n{path.read_text(encoding='utf-8')}")
    return "(function () {\n'use strict';\n" + "\n".join(parts) + "\n})();"


def build(variant_path: Path, network: str, level_path: Path, quiet: bool = False) -> Path:
    spec = NETWORKS[network]
    config = json.loads(variant_path.read_text(encoding="utf-8"))
    for note in ("label", "hook", "creative"):      # notes for the pipeline, not settings of the ad
        config.pop(note, None)
    config.setdefault("variant", variant_path.stem)
    config["network"] = network
    level = json.loads(level_path.read_text(encoding="utf-8"))
    level.pop("source", None)       # how the level was made is for the repo, not the ad
    level.pop("solution", None)
    data = {"config": config, "level": level}

    vendor = "\n".join((VENDOR / name).read_text(encoding="utf-8") for name in VENDOR_SCRIPTS)
    font = base64.b64encode((VENDOR / "fredoka-700.woff2").read_bytes()).decode("ascii")

    html = (SRC / "index.html").read_text(encoding="utf-8")
    for token, value in (
        ("__TITLE__", config.get("brand", "Playable")),
        ("<!--__HEAD__-->", spec["head"]),
        ("__FONT_700__", font),
        ("__BG__", page_background(config.get("theme", "beach"))),
        ("__VENDOR__", inline_script(vendor)),
        ("__DATA__", inline_script(json.dumps(data, separators=(",", ":")))),
        ("__APP__", inline_script(app_code())),
    ):
        if token not in html:
            sys.exit(f"template is missing {token}")
        html = html.replace(token, value, 1)

    out_dir = DIST if network == "preview" else DIST / network
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{variant_path.stem}.html"
    out.write_text(html, encoding="utf-8", newline="\n")
    size = out.stat().st_size
    if spec["zip"]:
        zipped = out.with_suffix(".zip")
        with zipfile.ZipFile(zipped, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            z.write(out, "index.html")
            if network == "tiktok":
                z.writestr("config.json", json.dumps({"playable_orientation": 0}))
        size = zipped.stat().st_size
        out = zipped
    if size > spec["limit"]:
        sys.exit(f"{out}: {size:,} bytes is over the {network} limit of {spec['limit']:,}")
    if not quiet:
        print(f"{out.relative_to(ROOT)}  {size / 1024:,.0f} KB  (limit {spec['limit'] / 1_000_000:.0f} MB)")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", help="a file name in variants/ without .json (default: all)")
    ap.add_argument("--network", default="preview", choices=sorted(NETWORKS))
    ap.add_argument("--level", type=Path, default=ROOT / "levels" / "ad_level.json")
    args = ap.parse_args()

    variants = sorted((ROOT / "variants").glob("*.json"))
    if args.variant:
        variants = [v for v in variants if v.stem == args.variant]
    if not variants:
        sys.exit("no such variant")
    for variant in variants:
        build(variant, args.network, args.level)
    if args.network == "preview" and not args.variant:
        preview_page(variants)


def preview_page(variants: list[Path]) -> None:
    """dist/index.html: every variant side by side, each with the funnel it reports."""
    cards = []
    for path in variants:
        meta = json.loads(path.read_text(encoding="utf-8"))
        cards.append({"name": path.stem, "file": f"{path.stem}.html", "label": meta.get("label", path.stem),
                      "hook": meta.get("hook", ""), "kb": round((DIST / f"{path.stem}.html").stat().st_size / 1024)})
    cards.sort(key=lambda c: (c["name"] != "duel", c["name"]))
    html = (SRC / "preview.html").read_text(encoding="utf-8").replace("__VARIANTS__", inline_script(json.dumps(cards)))
    (DIST / "index.html").write_text(html, encoding="utf-8", newline="\n")
    print("dist/index.html  the preview page")


if __name__ == "__main__":
    main()
