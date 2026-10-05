"""Makes the pictures the README and the landing page use, from what is already in creatives/.

    python tools/media.py

docs/media/play.gif       the first seconds of the ad, as a loop
docs/media/variants.jpg   the six variants side by side
docs/media/sizes.jpg      one variant in the four placement sizes
docs/media/posters/       a poster frame for each video
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CREATIVES = ROOT / "creatives"
OUT = ROOT / "docs" / "media"
ORDER = ("duel", "comeback", "relax", "two-words", "instruction", "night")
BACKGROUND = (13, 23, 48)


def strip(images: list[Image.Image], height: int, gap: int = 14, pad: int = 14) -> Image.Image:
    """Pictures scaled to one height and set side by side."""
    scaled = [im.resize((round(im.width * height / im.height), height), Image.LANCZOS) for im in images]
    sheet = Image.new("RGB", (sum(im.width for im in scaled) + gap * (len(scaled) - 1) + pad * 2, height + pad * 2), BACKGROUND)
    x = pad
    for im in scaled:
        sheet.paste(im, (x, pad))
        x += im.width + gap
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "posters").mkdir(exist_ok=True)
    names = [n for n in ORDER if (CREATIVES / n / "manifest.json").exists()]

    strip([Image.open(CREATIVES / n / "stills" / "hook-9x16.jpg") for n in names], 560).save(OUT / "variants.jpg", quality=86)
    strip([Image.open(CREATIVES / "duel" / "stills" / f"word-{size}.jpg") for size in ("9x16", "4x5", "1x1", "191x100")],
          520).save(OUT / "sizes.jpg", quality=86)
    for n in names:
        Image.open(CREATIVES / n / "stills" / "hook-9x16.jpg").resize((360, 640), Image.LANCZOS).save(
            OUT / "posters" / f"{n}.jpg", quality=82)

    # The loop: from the deal to the opponent's answer.
    moments = json.loads((CREATIVES / "duel" / "manifest.json").read_text(encoding="utf-8"))["moments"]
    seconds = min(16.0, moments["word"] + 8.5)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-t", f"{seconds:.1f}", "-i", str(CREATIVES / "duel" / "video.mp4"),
                    "-vf", "fps=12,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
                    "-loop", "0", str(OUT / "play.gif")], check=True)
    for file in sorted(OUT.rglob("*")):
        if file.is_file():
            print(f"{file.relative_to(ROOT)}  {file.stat().st_size / 1024:,.0f} KB")


if __name__ == "__main__":
    main()
