# Notes

The longer version of what the README leaves out.

## The hardest part

The stills and the video had to come from the playable itself. If each format were made
separately, a variant would be expensive again.

The problem is that a browser running without a screen draws only a few frames a second, so
you can't just play the ad and record it. My first try took 1.7 seconds per frame, which is
half an hour for one video.

What worked was taking over the ad's clock. The line tells the ad "be at second 4.3", the
ad moves all its animations to that moment and draws one frame. A still is one of those
steps and a video is about a thousand. The tests use the same trick, so what gets filmed is
what gets tested. A frame now takes a few hundredths of a second.

The sound works the same way. The ad keeps a list of every sound it was asked to play and
when. At the end it renders that list, with the music, into one audio file for the video.

## What the agents got wrong

- The reviewer checks what is on its list and nothing more. In the first batch one variant
  could not be lost, even by a player who did as little as possible. The number was right
  there in the manifest, but the list didn't mention it. I spotted it and added it.
- The writer only uses options it has been told about. Its first night theme came out half
  dark because its instructions didn't list all the colours it could change.
- One reviewer read the "0pts" button as "Opts". The label now has a space.

The first two were fixed by changing the instructions, the third by changing the label.

When the ad changed, the three variants the agent had written were out of date too. I asked
it to go over them. It kept one as it was, changed the settings of another because its idea
no longer did anything, and redid the colours of the third. Then they were reviewed again.
The batch report is in [`creatives/REPORT.md`](../creatives/REPORT.md).

## What I would measure first

Every variant reports the same events, so two variants can be compared step by step:

`ad_loaded`, `first_interaction`, `tutorial_completed`, `word_submitted`, `endcard_shown`,
`cta_click`

A few more show where people get stuck: `invalid_word`, `tile_returned`,
`covered_tile_tap`, `deck_draw`, `hint_shown`. Open `dist/index.html` to play the variants
side by side and watch them come in.

Two comparisons to start with:

- The night colours against the standard ones. The ad is otherwise identical, so if more
  people touch it, the look did that.
- A shorter game against the standard one. Do more people reach the end card and the store
  button?

A network reports impressions, clicks and installs by itself. What happens inside the ad is
a different matter. Some networks give a playable a way to send its own events, others
don't allow a playable to send anything. So the step-by-step comparison is only possible
where the network supports it.

That is a plan. None of these ads has run anywhere yet.

## Who wins

The ad plays itself 1,000 times for each of three kinds of player. If someone does what the
tutorial shows and still loses, the ad has told them the game isn't for them.

| The player… | Duel | Comeback | Relax |
|---|---|---|---|
| follows the tutorial | wins 100% | wins 100% | wins 100% |
| plays any common word | wins 82.2% | wins 24% | wins 82.4% |
| does as little as possible | wins 0% | wins 0% | wins 0% |

Comeback is the hard one. With the opponent 30 points ahead, a player who ignores the
tutorial loses three games in four.

## Screens and speed

A script lays the ad out on 23 screen sizes, from a 320×480 phone to tablets, landscape and
square. I wrote it after noticing on my own phone that a small label was sitting on top of
the tiles above it. My first version of the check had missed that, because it only measured
the parts that never move.

For speed I slowed my laptop's processor down instead of using slow phones. Slowed six
times, the ad is ready in about 2 seconds and stutters now and then. That is a rough guide,
not a measurement.

## The game in the ad

It is a short word duel, modelled on Word Tiles GO. I worked from playing that game and
from a handful of screenshots. I worked the scoring out from the screenshots, and read about
two thirds of the letter values off the tiles. The rest of the values, some of the colours
and the way the opponent chooses her words are my guesses.

The level is built backwards from a finished game, the way my other project,
[word-tile-lab](https://github.com/omerAydin0/word-tile-lab), does it. That is how I can be
sure a viewer who follows the tutorial always finishes the board.

A viewer who spells their own words leaves that planned game, and a 30-second ad should
not end stuck with letters nobody can use. So three things keep it moving. The opponent and
the hint avoid words that would leave a dead end. A deck tile that is still face down
becomes a letter that makes a word. And a single tile left on the board goes with the last
word. The last two are my own, not taken from the real game. With them the board comes out
empty in 98% of simulated games where the player ignores the hint completely.

## How it is put together

- The ad is one HTML file of about 1 MB, made with PixiJS and GSAP.
- It contains no image or sound files. Everything on screen is drawn by code when the ad
  loads. The sound effects and the music are generated in the browser too. That is why a
  new look is just a few colours in the settings file, and why an agent can come up with
  one.
- The rest is Python: one script builds the ad, another runs the line. It drives Edge or
  Chrome for the pictures and uses ffmpeg for the video. Node is not needed.

In Claude Code, from the project folder, one command runs a whole brief:

```
/produce-creatives briefs/2026-10-first-seconds.md 3
```

## Everything that is missing

- Nothing has run on a real ad network. I have no click, install or cost numbers. The
  simulation shows an ad can be won. It doesn't show that it works.
- This covers making and checking creatives. Budgets, bidding and performance reports are
  not part of it.
- The agents have done one brief so far: three variants, revised once, and eight reviews
  (two of them the broken ones). That shows the line runs from start to finish. It doesn't
  show how good its judgement is. I also started each agent myself for that batch. The
  single command that chains them exists but I haven't run it yet.
- I followed each network's published rules for the builds, but I haven't put them through
  the networks' own test tools.
- I have played it on one real phone. The other screen sizes were checked in a desktop
  browser set to those sizes, and I haven't tried old iPhones.
- The opponent is a bot with a person's name.
