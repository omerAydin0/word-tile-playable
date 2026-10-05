"""The production line: one variant file in, a full set of ad creatives out.

    python produce.py                      # every variant in variants/
    python produce.py comeback relax       # only these
    python produce.py duel --no-video      # skip the slow step

For each variant, into creatives/<name>/:

    playable/     the ad as each network wants it (single HTML, or a zip)
    stills/       three moments of the ad (the hook, the first word, the end card) in four
                  ad sizes: 9:16, 4:5, 1:1 and 1.91:1
    video.mp4     the ad played to the end card by a player who follows the hand, 720x1280 at 30 fps,
                  with the sound a viewer would hear
    manifest.json what was made, how big, how the ad tends to end, and how long each step took

and creatives/index.html, a page that shows the whole batch.

A variant that breaks a rule (tools/variants.py) is not built. Needs Edge or Chrome, and
the packages in requirements.txt.
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))

import build  # noqa: E402
import variants as rules  # noqa: E402
from browser import Browser  # noqa: E402

OUT = ROOT / "creatives"
NETWORKS = ("preview", "facebook", "google", "mraid")
# name, CSS width, CSS height, device scale -> the picture is width*scale by height*scale
STILL_SIZES = (("9x16", 540, 960, 2), ("4x5", 540, 675, 2), ("1x1", 540, 540, 2), ("191x100", 600, 314, 2))
VIDEO = {"width": 360, "height": 640, "scale": 2, "fps": 30, "hold": 2.5, "limit": 90}
DEFAULT_PLAY = "follow"                                    # a player who does what the hand shows, to the end
SEED = 3
SIMULATED_GAMES = 1000


def page_of(name: str, play: str) -> str:
    return f"{name}.html?seed={SEED}&clock=manual&play={play}"


def decode(data_url: str) -> bytes:
    return base64.b64decode(data_url.split(",", 1)[1])


def find_moments(browser: Browser, name: str, play: str) -> dict:
    """Plays the ad through once, without pictures, to find the seconds worth a still.

    hook: three letters are in the tray and the hand is pointing at the next one.
    word: the first word has just been accepted. end: the end card has settled.
    """
    page = browser.open(page_of(name, play), 360, 640, 1)
    moments: dict[str, float] = {}
    try:
        t = 0.0
        while t < VIDEO["limit"]:
            t = round(t + 0.1, 1)
            now = page.evaluate(f"__playable.seek({t})")
            if "hook" not in moments and now["phase"] == "player" and now["tray"] == 3:
                moments["hook"] = round(t + 0.6, 2)
            if "word" not in moments and now["phase"] == "resolving":
                moments["word"] = round(t + 0.35, 2)
            if now["phase"] == "end":
                moments["end"] = round(t + 1.6, 2)
                break
        events = json.loads(page.evaluate("JSON.stringify(__playable.events)"))
    finally:
        page.close()
    return {"moments": moments, "events": events}


def make_video(browser: Browser, name: str, play: str, out: Path, until: float) -> dict:
    """Steps the ad frame by frame into ffmpeg, up to second `until`, then adds what was heard."""
    import imageio_ffmpeg
    fps = VIDEO["fps"]
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    silent = out.with_name("silent.mp4")
    sound = out.with_name("sound.wav")
    encoder = subprocess.Popen(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps),
         "-c:v", "mjpeg", "-i", "-", "-an",
         # JPEG frames are full-range; ad platforms and phones expect the usual video range
         "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-color_range", "tv",
         "-c:v", "libx264", "-crf", "21",
         "-preset", "veryfast", str(silent)],
        stdin=subprocess.PIPE)
    page = browser.open(page_of(name, play), VIDEO["width"], VIDEO["height"], VIDEO["scale"])
    frame = 0
    try:
        while frame / fps <= until:
            shot = page.evaluate(f"__playable.frame({frame / fps:.5f})")
            encoder.stdin.write(decode(shot["image"]))
            frame += 1
        # The ad kept a note of every sound it was asked for; it renders them, and the music, to a file.
        sound.write_bytes(base64.b64decode(page.evaluate(f"__playable.soundtrack({frame / fps:.3f})")))
    finally:
        page.close()
        encoder.stdin.close()
        encoder.wait()
    if encoder.returncode:
        raise RuntimeError("ffmpeg could not write the video")
    mixed = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(silent), "-i", str(sound), "-c:v", "copy",
                            "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", str(out)])
    silent.unlink(missing_ok=True)
    sound.unlink(missing_ok=True)
    if mixed.returncode:
        raise RuntimeError("ffmpeg could not add the sound")
    return {"frames": frame, "seconds": round(frame / fps, 1)}


def make_stills(browser: Browser, name: str, play: str, moments: dict[str, float], out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for size, width, height, scale in STILL_SIZES:
        page = browser.open(page_of(name, play), width, height, scale)
        try:
            for moment, t in sorted(moments.items(), key=lambda kv: kv[1]):
                shot = page.evaluate(f"__playable.frame({t:.3f}, 'image/jpeg', 0.93)")
                path = out / f"{moment}-{size}.jpg"
                path.write_bytes(decode(shot["image"]))
                written.append(path.name)
        finally:
            page.close()
    return written


def simulate(browser: Browser, name: str) -> dict:
    page = browser.open(f"{name}.html?simulate={SIMULATED_GAMES}", 360, 640, 1)
    try:
        report = json.loads(page.data()["simulation"])
    finally:
        page.close()
    return {policy: {"win": round(r["win"] / r["games"], 3), "tie": round(r["tie"] / r["games"], 3),
                     "lose": round(r["lose"] / r["games"], 3), "cleared": round(r["cleared"] / r["games"], 3),
                     "you": r["you"], "opponent": r["opponent"], "words": r["words"]}
            for policy, r in report.items()}


def produce(browser: Browser, path: Path, video: bool) -> dict:
    name = path.stem
    config = json.loads(path.read_text(encoding="utf-8"))
    found = rules.problems(config)
    if found:
        return {"name": name, "ok": False, "problems": found}

    out = OUT / name
    shutil.rmtree(out, ignore_errors=True)
    (out / "playable").mkdir(parents=True)
    took: dict[str, float] = {}
    play = (config.get("creative") or {}).get("play", DEFAULT_PLAY)

    t = time.time()
    playables = {}
    for network in NETWORKS:
        built = build.build(path, network, ROOT / "levels" / "ad_level.json", quiet=True)
        target = out / "playable" / (f"{network}{built.suffix}")
        shutil.copyfile(built, target)
        playables[network] = {"file": f"playable/{target.name}", "kb": round(target.stat().st_size / 1024)}
    took["playable"] = round(time.time() - t, 2)

    t = time.time()
    outcomes = simulate(browser, name)
    took["simulation"] = round(time.time() - t, 2)

    t = time.time()
    found = find_moments(browser, name, play)
    moments, events = found["moments"], found["events"]
    stills = make_stills(browser, name, play, moments, out / "stills")
    took["stills"] = round(time.time() - t, 2)

    film = None
    if video:
        t = time.time()
        end = moments.get("end", VIDEO["limit"] - VIDEO["hold"])
        film = make_video(browser, name, play, out / "video.mp4", end + VIDEO["hold"])
        took["video"] = round(time.time() - t, 2)

    manifest = {
        "name": name, "ok": True,
        "label": config.get("label", name), "hook": config.get("hook", ""),
        "headline": config.get("headline", ""), "cta": config.get("ctaLabel", "PLAY NOW"),
        "settings": {k: v for k, v in config.items() if k not in rules.NOTES},
        "playables": playables,
        "stills": stills,
        "video": None if not film else {"file": "video.mp4", "seconds": film["seconds"], "frames": film["frames"],
                                        "kb": round((out / "video.mp4").stat().st_size / 1024)},
        "script": play,
        "moments": moments,
        "result_of_script": next((e.get("result") for e in events if e["event"] == "game_end"), None),
        "words_in_script": [e["word"] for e in events if e["event"] in ("word_submitted", "bot_word")],
        "outcomes": outcomes,
        "seconds": dict(took, total=round(sum(took.values()), 2)),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8", newline="\n")
    return manifest


# ---------------------------------------------------------------- the page that shows the batch

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Creative batch</title>
<style>
:root{--bg:#0d1730;--card:#16244a;--line:#2a3c70;--ink:#eef3ff;--dim:#9db0dc;--good:#67e06b;--bad:#ff7a8a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header,main{max-width:1180px;margin:0 auto;padding:24px 18px}
h1{margin:0 0 4px;font-size:24px}header p{margin:0;color:var(--dim);max-width:75ch}
section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:22px}
h2{margin:0;font-size:20px}.hook{color:var(--dim);margin:2px 0 14px;max-width:75ch}
.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
video{width:230px;border-radius:14px;background:#000;display:block}
.stills{display:grid;grid-template-columns:repeat(4,auto);gap:8px;align-items:end;justify-content:start}
.stills img{height:150px;border-radius:8px;display:block}
.stills figure{margin:0}.stills figcaption{font-size:12px;color:var(--dim);text-align:center}
table{border-collapse:collapse;font-size:14px;margin-top:6px}
td,th{padding:4px 12px 4px 0;text-align:left;font-variant-numeric:tabular-nums}th{color:var(--dim);font-weight:500}
.facts{min-width:260px;flex:1}.facts h3{margin:14px 0 2px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
a{color:#9fd0ff}.bad{color:var(--bad)}.stillwrap{overflow-x:auto;max-width:100%}
</style></head><body>
<header><h1>Creative batch</h1>
<p>__SUMMARY__</p></header>
<main>__SECTIONS__</main></body></html>
"""


def section(m: dict) -> str:
    e = html.escape
    if not m["ok"]:
        items = "".join(f"<li>{e(p)}</li>" for p in m["problems"])
        return f'<section><h2>{e(m["name"])} <span class="bad">not built</span></h2><ul>{items}</ul></section>'
    name = m["name"]
    moments = sorted({s.split("-")[0] for s in m["stills"]}, key=lambda k: ("hook", "word", "end").index(k) if k in ("hook", "word", "end") else 9)
    stills = ""
    for moment in moments:
        for size, *_ in STILL_SIZES:
            file = f"{moment}-{size}.jpg"
            if file in m["stills"]:
                stills += (f'<figure><a href="{name}/stills/{file}"><img loading="lazy" src="{name}/stills/{file}" alt="{e(moment)} {size}"></a>'
                           f'<figcaption>{e(moment)} · {size.replace("x", ":").replace("191:100", "1.91:1")}</figcaption></figure>')
    video = (f'<video controls loop playsinline preload="metadata" src="{name}/video.mp4"></video>' if m["video"] else "")
    files = "".join(f'<tr><td><a href="{name}/{p["file"]}">{network}</a></td><td>{p["kb"]:,} KB</td></tr>' for network, p in m["playables"].items())
    if m["video"]:
        files += f'<tr><td><a href="{name}/video.mp4">video</a></td><td>{m["video"]["kb"]:,} KB · {m["video"]["seconds"]} s</td></tr>'
    names = {"hint": "follows the hand", "casual": "any everyday word", "short": "cheapest word"}
    outcomes = "".join(f'<tr><td>{names[k]}</td><td>{o["win"]:.1%}</td><td>{o["tie"]:.1%}</td><td>{o["lose"]:.1%}</td>'
                       f'<td>{o["cleared"]:.1%}</td><td>{o["you"]}\u2013{o["opponent"]}</td></tr>' for k, o in m["outcomes"].items())
    took = "".join(f"<tr><td>{e(k)}</td><td>{v:.1f} s</td></tr>" for k, v in m["seconds"].items())
    return f"""<section>
<h2>{e(m["label"])}: “{e(m["headline"])}”</h2><p class="hook">{e(m["hook"])}</p>
<div class="row">{video}
<div class="facts">
<h3>Files</h3><table>{files}</table>
<h3>How the ad ends ({SIMULATED_GAMES:,} simulated games each)</h3>
<table><tr><th>the player…</th><th>wins</th><th>ties</th><th>loses</th><th>board cleared</th><th>average score</th></tr>{outcomes}</table>
<h3>Time to produce</h3><table>{took}</table>
</div></div>
<h3 style="margin:16px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)">Stills</h3>
<div class="stillwrap"><div class="stills">{stills}</div></div>
</section>"""


def write_page(manifests: list[dict]) -> None:
    built = [m for m in manifests if m["ok"]]
    files = sum(len(m["stills"]) + len(m["playables"]) + (1 if m["video"] else 0) for m in built)
    total = sum(m["seconds"]["total"] for m in built)
    summary = (f"{len(built)} variant{'s' if len(built) != 1 else ''}, {files} files, produced in {total:.0f} seconds "
               f"({total / max(1, len(built)):.0f} s per variant). Each variant is one small settings file; "
               "everything on this page was made from it by <code>produce.py</code>.")
    page = PAGE.replace("__SUMMARY__", summary).replace("__SECTIONS__", "\n".join(section(m) for m in manifests))
    (OUT / "index.html").write_text(page, encoding="utf-8", newline="\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*", help="variant names (default: all)")
    ap.add_argument("--no-video", action="store_true")
    args = ap.parse_args()

    paths = sorted((ROOT / "variants").glob("*.json"))
    if args.names:
        missing = set(args.names) - {p.stem for p in paths}
        if missing:
            sys.exit(f"no such variant: {', '.join(sorted(missing))}")
        paths = [p for p in paths if p.stem in args.names]
    OUT.mkdir(exist_ok=True)

    started = time.time()
    refused = []
    with Browser() as browser:
        for path in paths:
            try:
                m = produce(browser, path, video=not args.no_video)
            except (OSError, RuntimeError, TimeoutError) as error:
                # A laptop that dozes off mid-run takes the browser's connection with it.
                print(f"{path.stem}: {type(error).__name__}, starting the browser again")
                browser.close()
                browser.__init__()
                m = produce(browser, path, video=not args.no_video)
            if not m["ok"]:
                refused.append(m)
            if m["ok"]:
                print(f"{m['name']}: {len(m['playables'])} playables, {len(m['stills'])} stills"
                      + (f", video {m['video']['seconds']} s" if m["video"] else "")
                      + f"  in {m['seconds']['total']:.0f} s")
            else:
                print(f"{m['name']}: NOT BUILT")
                for line in m["problems"]:
                    print(f"  - {line}")

    # The page lists every variant that has a manifest, not only the ones made just now.
    manifests = []
    for folder in sorted(p for p in OUT.iterdir() if p.is_dir()):
        file = folder / "manifest.json"
        if file.exists():
            manifests.append(json.loads(file.read_text(encoding="utf-8")))
    manifests.sort(key=lambda m: (m["name"] != "duel", m["name"]))
    write_page(manifests + refused)
    print(f"creatives/index.html  ({time.time() - started:.0f} s in all)")


if __name__ == "__main__":
    main()
