"""Builds the playable's level: a small two-layer board of letter tiles, and the game planned on it.

    python tools/build_level.py --search 60            # screen seeds, print the best
    python tools/build_level.py --seed 7 -o levels/ad_level.json

The method is the one word-tile-lab uses: empty an unlabelled layout in a legal order and
write a real word onto the tiles each step removes, so replaying those words always clears
the board. Here the order is also a game: the player's word, the opponent's, the player's,
and so on until nothing is left. The ad's tutorial hand leads the player along it, and the
opponent keeps to it for as long as the player does, so a viewer who follows the hand
clears the board and wins. One who goes their own way gets an ordinary game.

The vocabulary, word frequencies and block list come from word-tile-lab (next to this
folder, or --lab PATH). The playable can't ship a dictionary, so the level carries the
words its own letters can spell.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

Pos = tuple[float, float, int]

# Letter values, as the game prints them on its tiles. Read off screenshots: A E I L N O R S
# T U = 1, D G = 2, M P = 3, F = 4, W Y = 5, J = 9. The rest are assumed, Scrabble-like.
# One screenshot also confirms the scoring: EASTWARD is 13 points of letters and was worth
# 91, which is 13 times (length - 1).
VALUES = dict(A=1, B=3, C=3, D=2, E=1, F=4, G=2, H=4, I=1, J=9, K=5, L=1, M=3, N=1, O=1, P=3,
              Q=10, R=1, S=1, T=1, U=1, V=4, W=5, X=8, Y=5, Z=10)

# Words no ad should accept, play or suggest.
UNSAFE = set("""
ABUSE ABUSED ANAL ANUS ARSE ARSES ASS ASSES BALLS BASTARD BITCH BLOODY BONER BOOB BOOBS BOOTY
BREAST BREASTS BUGGER BUM BUMS BUTT BUTTS CLIT COCK COCKS COKE COON COONS CRAP CRAPPY CUM CUNT
DAGO DAMN DAMNED DICK DICKS DILDO DYKE ERECT FAG FAGS FAGGOT FART FARTS FATSO FELCH FUCK FUCKED
FUCKER FUCKS GAYS GOD GODS GOOK HELL HO HOE HOES HOMO HOMOS HOOKER HORNY HUMP JERK JEW JEWS JISM
KIKE KINKY KNOB LEZ LESBO MILF MOLEST NAZI NAZIS NEGRO NIGGER NIP NIPS NIPPLE NUDE NUDES ORGASM
ORGY PAKI PECKER PEE PEES PENIS PIMP PISS PISSED POO POOP POOS PORN PORNO PRICK PUBE PUBES PUBIC
PUSSY QUEER RAPE RAPED RAPES RAPIST RECTA RECTUM RETARD SCREW SEMEN SEX SEXES SEXY SHAG SHAT
SHIT SHITS SLAG SLUT SLUTS SMUT SNATCH SPERM SPIC SPICS SPUNK STRIP SUCK SUCKS TEAT TEATS TIT
TITS TITTY TRAMP TURD TURDS TWAT URINE VAGINA WANK WANKER WEED WHORE WHORES WOP WOPS
""".split())

# Real words a player may spell, but not ones the opponent should play or the hand suggest:
# grim words, names that happen to be dictionary words, chat interjections, abbreviations.
OPPONENT_AVOID = set("""
ARREST ARSENAL ATTACK BLOOD BOMB BOMBS BULLET BURIED CANCER CEMETERY CHEAT CORPSE CRASH CREEPY
CRIME DEAD DEADLY DEATH DEATHS DEVIL DIE DIED DIES DRUG DRUGS DRUNK ENEMY EVIL FATAL GRAVE GUN
GUNS HARM HARSH HATE HATED HATER HATES HURT INJURY JAIL KILL KILLED KILLER KILLS LUST MURDER
NASTY PAIN POISON PRISON RAT RATS RIFLE SATAN SCARE SCARY SCREAM SHAME SHOOT SHOT SHOTS SIN
SINS SLAM SLAVE SLAVES SMASH STAB STEAL SUICIDE TEARS TERROR THREAT TRASH VICTIM WAR WARS WEAPON
WOUND
ADAM ALAN ALEX ANDY ANNA ANNE BEN BILL BOB CARL CARTER CHAD CHRIS DAN DANA DAVE DEAN DON DOUG
EARL ERIC ERIN FRED GARY GENE GLEN GREG HANK HARPER HARRY HART HENRY JACK JAKE JANE JAY JEAN
JEFF JERRY JESS JILL JIM JOE JOHN JON JOSH JOY JUDY KEN KENT KIM KURT LEE LEO LOU LUKE MARC
MARIA MARK MARS MARTIN MARY MATT MAX MEG MEL MIKE MOLLY NAN NED NICK PALMER PAM PAT PAUL PERRY
PETE PETER RALPH RAY REX RICK ROB ROD RON ROSE ROY RUTH SAL SAM SARA SCOTT SEAN SETH SID SPENCER
STAN STEVE SUE TED TERRY TEXAS TIM TOM TONY TROY VAL WALT WARD WILL
AHA AHH AIN BRO CAM CANT CIS COS DEV DOC ETA EST GONNA GOTTA HAHA HEY HMM HUH LAS LOL MAC MAR
MID MIL NAH NON OHH OOH REP SEC SEN SIS THEE THOU THY TRANS UMM VIA WANNA YEA YEAH YEP YER
""".split())

# Too plain to be worth pointing a tutorial hand at.
STOPWORDS = set("""
ABOUT AFTER AGAIN ALSO BEEN BEING BOTH COULD DOES DOING DONE EACH ELSE EVEN EVER FROM HAVE HERE
INTO JUST LESS MANY MERE MORE MOST MUCH MUST ONLY OTHER OVER SAID SAME SHALL SINCE SOME SUCH THAN
THAT THEIR THEM THEN THERE THESE THEY THIS THOSE UNTIL UPON VERY WERE WHAT WHEN WHERE WHICH WHILE
WHOM WHOSE WITH WOULD YOUR
""".split())

BOT_MIN_ZIPF = 4.2       # the opponent's words are shown on screen: everyday words only
HINT_MIN_ZIPF = 4.4
RARE_MIN_ZIPF = 2.3      # six letters and up are accepted only if someone might know them
LEVEL_BAND = (4.9, 7.0)  # how common the words written onto the board are: an ad wants easy ones


LAYERS = ((4, 3), (3, 2))
# Letters per word in the planned game: the player first, then turn about. They add up
# to the 18 tiles, and the opponent's words are the short ones.
PLAN = (5, 3, 4, 3, 3)


def layout() -> list[Pos]:
    """4x3, then 3x2 half a tile in: 18 tiles, six of them open at the start.

    An ad is over in half a minute, and this one ends when the board is empty: four or
    five words between the two players.
    """
    out: list[Pos] = []
    for z, (cols, rows) in enumerate(LAYERS):
        for r in range(rows):
            for c in range(cols):
                out.append((c + z * 0.5, r + z * 0.5, z))
    return out


def covers(a: Pos, b: Pos) -> bool:
    return a[2] > b[2] and abs(a[0] - b[0]) < 0.99 and abs(a[1] - b[1]) < 0.99


def free_of(remaining: set[Pos]) -> list[Pos]:
    return sorted(p for p in remaining if not any(covers(q, p) for q in remaining))


def load_lab(path: Path):
    sys.path.insert(0, str(path))
    from wordtiles import vocab, wordlists
    from wordtiles.lexicon import Lexicon
    return vocab, wordlists, Lexicon


def word_points(word: str) -> int:
    """The sum of the letters, times one less than the length: how the game scores."""
    return sum(VALUES[ch] for ch in word) * (len(word) - 1)


def construct(lab, seed: int, opener: str, max_restarts: int = 80):
    """Tiles and the planned game that clears them, or None if no restart worked."""
    vocab, wordlists, _ = lab
    banned = set(wordlists.blocked()) | UNSAFE | OPPONENT_AVOID
    theirs = {n: [w for w in vocab.words_in_band(LEVEL_BAND[0], LEVEL_BAND[1], n) if w not in banned]
              for n in set(PLAN)}
    ours = {n: [w for w in pool if w not in STOPWORDS] for n, pool in theirs.items()}
    top_layer = len(LAYERS) - 1

    for restart in range(max_restarts):
        rng = random.Random(seed * 7919 + restart)
        remaining = set(layout())
        tiles: dict[Pos, str] = {}
        solution: list[tuple[str, list[Pos]]] = []
        for step, n in enumerate(PLAN):
            free = free_of(remaining)
            wanted_next = PLAN[step + 1] if step + 1 < len(PLAN) else 0
            if step == 0:
                chosen, word = rng.sample([p for p in free if p[2] == top_layer], n), opener
            else:
                chosen = None
                for _ in range(40):
                    if len(free) < n:
                        break
                    pick = rng.sample(free, n)
                    after = remaining - set(pick)
                    if len(free_of(after)) >= wanted_next and (after or not wanted_next):
                        chosen = pick
                        break
                if chosen is None:
                    break
                word = rng.choice((ours if step % 2 == 0 else theirs)[n])
            letters = list(word)
            rng.shuffle(letters)
            for pos, ch in zip(chosen, letters):
                tiles[pos] = ch
            ordered, unused = [], list(chosen)
            for ch in word:
                pos = next(p for p in unused if tiles[p] == ch)
                unused.remove(pos)
                ordered.append(pos)
            solution.append((word, ordered))
            remaining -= set(chosen)
        if not remaining and len(solution) == len(PLAN):
            return tiles, solution, rng
    return None


def plan_scores(solution) -> tuple[int, int, bool]:
    """The player's and the opponent's totals along the plan, and whether she ever led."""
    totals = [0, 0]
    led = False
    for step, (word, _) in enumerate(solution):
        totals[step % 2] += word_points(word)
        led = led or (step % 2 == 1 and totals[1] >= totals[0])
    return totals[0], totals[1], led


def verify(tiles: dict[Pos, str], solution) -> bool:
    remaining = set(tiles)
    for word, positions in solution:
        free = set(free_of(remaining))
        if any(p not in free for p in positions) or "".join(tiles[p] for p in positions) != word:
            return False
        remaining -= set(positions)
    return not remaining


def make_deck(rng: random.Random, first: str, size: int) -> str:
    letters = "EEEEAAAIIOOUNRRTTLSSDGMPCH"
    while True:
        rest = [rng.choice(letters) for _ in range(size - 1)]
        if sum(ch in "AEIOU" for ch in rest) >= 2 and max(Counter(rest).values()) <= 2:
            return first + "".join(rest)


def front_code(words: list[str]) -> str:
    """Sorted words as 'shared-prefix-length digit + the rest': a third of the plain size."""
    out, prev = [], ""
    for w in sorted(words):
        k = 0
        while k < min(len(prev), len(w), 9) and prev[k] == w[k]:
            k += 1
        out.append(f"{k}{w[k:]}")
        prev = w
    return "".join(out)


def screen(lab, tiles, deck: str, common: list[str], games: int, seed: int) -> dict:
    """Plays whole games with two players who take any everyday word they can see.

    Says how often the board gets cleared and how many words that takes. It is a quick
    screen for picking a seed, and a pessimistic one: it does not let a word dig down
    through the tiles it takes, which the ad does. The ad's own simulation gives the
    numbers that are quoted.
    """
    _, _, Lexicon = lab
    lex = Lexicon(common)
    rng = random.Random(seed)
    cleared = words = 0
    for _ in range(games):
        remaining = dict(tiles)
        pile, waste = list(deck[1:]), [deck[0]]
        while remaining:
            free = free_of(set(remaining))
            while True:
                letters = [remaining[p] for p in free]
                options = lex.spellable_using(letters, waste[-1:] if waste else [])
                if options or not pile:
                    break
                waste.append(pile.pop(0))
            if not options:
                break
            words += 1
            word = rng.choice(options)
            need = Counter(word)
            for p in sorted(free, key=lambda q: (-q[2], rng.random())):
                if need[remaining[p]] > 0:
                    need[remaining[p]] -= 1
                    del remaining[p]
            if sum(need.values()) and waste:
                waste.pop()
        cleared += not remaining
    return {"cleared": round(cleared / games, 3), "words_per_game": round(words / games, 1)}


def build(lab, seed: int, opener: str, deck_size: int, deck_first: str):
    vocab, wordlists, _ = lab
    made = construct(lab, seed, opener)
    if made is None:
        return None
    tiles, solution, rng = made
    assert verify(tiles, solution)
    you, her, led = plan_scores(solution)
    if led or you - her < 20 or len({w for w, _ in solution}) < len(solution):
        return None                 # a planned game should be a clear win, never a repeat
    deck = make_deck(rng, deck_first, deck_size)

    zipf = vocab.zipf_table()
    banned = set(wordlists.blocked()) | UNSAFE
    letters = "".join(tiles.values()) + deck
    spellable = vocab.accepted_for(letters).words
    accepted = [w for w in spellable if w not in banned and (len(w) <= 5 or zipf[w] >= RARE_MIN_ZIPF)]
    common = sorted((w for w in accepted if zipf[w] >= BOT_MIN_ZIPF and w not in OPPONENT_AVOID and len(w) <= 7),
                    key=lambda w: (-zipf[w], w))
    hints = [w for w in common if 4 <= len(w) <= 6 and zipf[w] >= HINT_MIN_ZIPF and w not in STOPWORDS]
    data = {
        "source": {"method": "reverse construction, as in word-tile-lab", "seed": seed},
        "tiles": [[x, y, z, ch] for (x, y, z), ch in sorted(tiles.items(), key=lambda kv: (kv[0][2], kv[0][1], kv[0][0]))],
        "deck": deck,
        "openAtStart": 1,
        "values": VALUES,
        "opener": opener,
        "plan": [{"by": i % 2, "word": w, "points": word_points(w), "tiles": [list(p) for p in ps]}
                 for i, (w, ps) in enumerate(solution)],
        "words": front_code(accepted),
        "common": common,
        "hints": hints,
    }
    stats = {"tiles": len(tiles), "accepted": len(accepted), "common": len(common), "hints": len(hints),
             "words_kb": round(len(data["words"]) / 1024, 1), "plan": f"you {you} - {her} opponent"}
    return data, stats, tiles, common, set(hints)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lab", type=Path, default=ROOT.parent / "word-tile-lab")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--opener", default="HEART", help="the word the tutorial hand spells")
    ap.add_argument("--deck", type=int, default=7, help="deck tiles, the first of them already open")
    ap.add_argument("--deck-first", default="S", help="the tile that is open at the start")
    ap.add_argument("--search", type=int, help="screen seeds 1..N and list them best first")
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args()
    lab = load_lab(args.lab.resolve())
    opener = args.opener.upper()

    if args.search:
        rows = []
        for seed in range(1, args.search + 1):
            made = build(lab, seed, opener, args.deck, args.deck_first.upper())
            if made is None:
                continue
            data, stats, tiles, common, hints = made
            s = screen(lab, tiles, data["deck"], common, 200, seed)
            you = sum(p["points"] for p in data["plan"] if p["by"] == 0)
            her = sum(p["points"] for p in data["plan"] if p["by"] == 1)
            rows.append((-s["cleared"], seed, you, her,
                         " ".join(f'{p["word"]}({p["points"]})' for p in data["plan"]), data["deck"]))
        for cleared, seed, you, her, plan, deck in sorted(rows)[:15]:
            print(f"seed {seed:3d}  off-plan cleared {-cleared:.2f}  plan {you}-{her}  deck {deck}  | {plan}")
        return

    if args.seed is None or args.out is None:
        ap.error("--seed and --out are needed to build")
    made = build(lab, args.seed, opener, args.deck, args.deck_first.upper())
    if made is None:
        sys.exit("that seed gives no clearable board")
    data, stats, tiles, common, hints = made
    stats.update(screen(lab, tiles, data["deck"], common, 1000, args.seed))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, separators=(",", ":")), encoding="ascii")
    print(f"{args.out}: {stats}")
    print("planned game:", " ".join(f'{p["word"]}({p["points"]})' for p in data["plan"]))


if __name__ == "__main__":
    main()
