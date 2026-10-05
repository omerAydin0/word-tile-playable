---
name: produce-creatives
description: Turn a creative brief into finished ad creatives. Writes new variants, runs the production line on them, reviews what came out, and reports. Use when asked for new ad variants, hooks or a creative batch.
argument-hint: <brief file or a one-line idea> [number of variants]
---

# Produce a batch of creatives

You run the production line for this project's playable ad. One variant is one small JSON
file in `variants/`; `produce.py` turns it into playables for each network, twelve stills
and a video. Your job is everything around that: deciding what to make, and deciding
whether what came out is good enough to show.

The request is: **$ARGUMENTS**

If it names a file in `briefs/`, read it. If it is a one-line idea, treat that line as the
brief and take the standing rules from `briefs/README.md`. Default to three variants.

## Steps

1. **Read.** The brief, `briefs/README.md`, and every file in `variants/` (so nothing new
   repeats what exists).

2. **Write.** Start the `hook-writer` agent with the brief and the number of variants. It
   writes the files into `variants/` and returns their names. Every file it returns has
   already passed `python tools/variants.py <file>`.

3. **Produce.** Run `python produce.py <name> <name> ...` once, with all the new names.
   It takes about a minute and a half per variant. If it reports a variant as NOT BUILT,
   give the reasons to `hook-writer` and have that one file fixed, then run it again.

4. **Review.** Start one `creative-reviewer` agent per new variant, all in one message so
   they run side by side. Each reads `creatives/<name>/manifest.json`, looks at the stills,
   and returns a verdict.

5. **Revise once.** For each variant that got REVISE, send the reviewer's reasons to
   `hook-writer`, produce it again, review it again. One round only: a variant that fails
   twice is reported as rejected, with the reasons, and its file is deleted from
   `variants/` along with its folder in `creatives/`.

6. **Report.** Write `creatives/REPORT.md`:
   - the brief, in one sentence;
   - a table: variant, headline, the idea behind it, verdict, win rate when following the
     hand, seconds to produce (all from the manifests);
   - what was revised or rejected, and why;
   - which two you would put in front of real traffic first, and what you expect to learn
     from the comparison.
   Then tell the user where the gallery is: `creatives/index.html`.

## Rules

- You and the agents change files in `variants/` only. Never edit `src/`, `tools/`,
  `levels/`, `build.py` or `produce.py` from this skill; if the pipeline itself looks
  wrong, say so in the report.
- Every number in the report comes from a `manifest.json`. Do not estimate.
- No variant is reported as ready unless its reviewer said PASS.
- Nothing here has run on a network. Never write that a variant "performs" or "converts";
  say what it is designed to test.
