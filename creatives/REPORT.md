# Batch report: what should the first three seconds be?

5 October 2026. Brief: [`briefs/2026-10-first-seconds.md`](../briefs/2026-10-first-seconds.md).

**The brief in one sentence:** the three existing variants test the tone of the promise;
this batch tests what the viewer sees and does first.

## What was made

| Variant | Headline | The idea | Verdict | Wins following the hand | Wins with any everyday word | Seconds to produce |
|---|---|---|---|---|---|---|
| `two-words` | TWO WORDS EACH. GO! | A duel capped at two words each, so the viewer sees at once that the whole ad is short. | PASS | 100% | 82.7% | 24 |
| `instruction` | TAP LETTERS. SPELL A WORD. | No question and no challenge, only what to do; no hand until the viewer has waited two seconds. | PASS | 100% | 82.8% | 24 |
| `night` | LIGHTS OUT. WORDS ON. | A dark shore, to stand out in a bright feed; the same duel as Duel. | PASS | 100% | 82.8% | 25 |

Each has four playables, twelve stills and a video. The numbers are from each variant's
`manifest.json`; the verdicts are in its `review.md`, shortened from what the reviewer
returned. The gallery is [`index.html`](index.html).

## Two rounds

**First round.** The writer produced the three variants, all three passed the rule checker
on the first try and their first review. Nothing was revised or rejected.

That alone says little about the review step, so I gave the reviewer two variants with a
fault planted in each, without telling it: one whose headline is nearly unreadable, one
whose headline is false. It returned REVISE for both, for the planted reasons
([`docs/probes/`](../docs/probes/README.md)). Neither probe is in this batch.

What the first round showed:

- **`two-words` could not be lost.** A simulated player who always took the cheapest word
  won it every time. The reviewer was not asked to look at that number and did not; I found
  it in the manifest. The reviewer's checklist now includes it.
- **`night` was only half dark.** The houses and clouds stayed white: the writer's
  instructions listed the colours a theme may set, and those were not on the list.
- **`instruction` was a copy test**: apart from the headline it was `duel`.

**Then the ad itself changed.** After comparing it with the real game I changed its rules,
its layout and its look, including which settings and colours a variant can use. That made
the three variants out of date, so the writer was asked to go over them again:

- `two-words`: idea kept. `rounds: 2` is now an early stop, which is the idea.
- `instruction`: settings changed. With the hand always showing, "the hand comes back after
  two seconds" did nothing; the writer turned the hand off (`tutorial: false`) so that the
  two-second wait is real.
- `night`: the removed colours dropped, `palm`, `cloud` and a dim `glow` added, so nothing
  stays daylight-bright.

**Second round.** All three were produced again and reviewed again: three PASS.

## What the second reviews said that is worth acting on

- **`instruction` sits close to `relax`.** Both now hide the hand until the viewer waits
  (2 seconds here, 4 there). A comparison between them reads as "instruction headline and a
  faster hint", not as a clean test of either.
- **`two-words` is mostly a copy test.** Its first frame is the plain duel's; only the
  headline and the length differ. It stops with three tiles left on the board, under a
  "QUICK WIN!" title, which one reviewer found slightly odd.
- **`0pts` read as `Opts`.** One reviewer transcribed the button that way. The label now
  has a space ("0 pts"); the stills in the gallery were made after that change, the reviews
  before it.
- The end card is tight at 1.91:1 in every variant, and the dimmed game behind it still
  shows its last state.
- A player who always takes the cheapest word now loses every variant. That is the
  opposite of the first round's problem, and it is the same for all six.

## Which two first

`night` and `two-words`, each against `duel` as the control.

- `night` vs `duel` asks whether the look alone changes how many people touch the ad at
  all. Compare `first_interaction` per `ad_loaded`; everything after that should be equal,
  since the game is the same.
- `two-words` vs `duel` asks whether a shorter, visibly bounded game gets more people to
  the end card and the store button. Compare `endcard_shown` and `cta_click` per
  `ad_loaded`.

`instruction` should wait until it has been pulled further from `relax`.

None of this has run on a network. These are the comparisons the variants are built for,
not results.

## How this batch was run

The writer and the reviewers ran as agents with the instructions in `.claude/agents/`,
started one by one from a working session rather than through the `/produce-creatives`
command. The steps and their order were the command's, except that the second round was
caused by a change to the game, which the command does not cover.
