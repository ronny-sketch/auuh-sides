# AUUH — Musical Cue Sheet v2

Source: `analysis/build_track_map.py` output (`analysis/track-map.json`),
derived from `analysis/audio_features_v2.bin` (bass/percussive energy,
chroma, RMS — see `docs/v2-plan.md` Phase 1/2 and `analysis/analyze_v2.py`).

**These are candidates, not confirmed track boundaries.** None were
hallucinated from track names — there are no track names to hallucinate
from; the source file is an unlabeled ~42-minute DJ mix believed to contain
roughly 15 records. Every candidate below is scored from actual signal
evidence (which is listed per candidate) and needs confirmation by ear.
Use `analysis/annotate.html` to scrub the real audio and confirm, correct,
rename, or add markers — that tool writes/reads the same JSON shape this
document is built from.

## Open question this document does NOT resolve

`analysis/analyze.py` (v1) found a single, exact, constant tempo of
**123.05 BPM across the entire 42:06.9** track. That's either genuinely
true (some DJs/genres beatmatch an entire set to one tempo) or it means the
single global tempo estimate papered over real local tempo changes between
the ~15 source tracks. This pass did **not** re-run a windowed tempogram to
check — see `docs/v2-plan.md` Phase 2. Until that's done, treat every
transition candidate's *timing precision* (how exactly it lines up with a
beat/bar) as approximate, even where the underlying detection (bass/chroma
discontinuity) is solid.

## Detection method (honest description, not a black box)

For each of ~126 non-overlapping 20-second windows across the track:

1. Compute the drop in smoothed (4s window) bass + percussive energy
   between the window's start and its point of maximum combined dip.
2. Compute the maximum chroma-vector discontinuity (cosine distance
   between chroma ~8s apart) within ±2s of that point.
3. Compute the RMS dip as a secondary, weaker confirmation signal.
4. Score = weighted sum of whichever signals fired; tiered by score
   percentile into **high** (top 10%), **medium** (next 15%), **low**
   (everything else) rather than a fixed cutoff — with ~126 candidate
   windows and an expected ~14 real internal transitions, most windows are
   not real boundaries, and tiering surfaces the strongest ones first
   without silently discarding the rest.

## High-confidence candidates (13)

| Time | Score | Evidence |
|---|---|---|
| 17:21.22 | 0.557 | bass_drop, chroma_discontinuity |
| 17:40.16 | 0.503 | bass_drop, chroma_discontinuity |
| 17:48.42 | 0.565 | bass_drop, chroma_discontinuity, rms_dip |
| 19:20.84 | 0.529 | bass_drop, chroma_discontinuity |
| 22:39.82 | 0.542 | bass_drop, chroma_discontinuity |
| 23:41.08 | 0.490 | bass_drop, chroma_discontinuity |
| 31:35.20 | 0.588 | bass_drop, chroma_discontinuity, rms_dip |
| 32:13.52 | 0.490 | bass_drop, chroma_discontinuity |
| 32:36.50 | 0.553 | bass_drop, chroma_discontinuity |
| 34:43.30 | 0.494 | chroma_discontinuity, rms_dip |
| 34:44.48 | 0.494 | chroma_discontinuity |
| 38:32.16 | 0.481 | chroma_discontinuity, rms_dip |
| 41:43.98 | 0.682 | bass_drop, percussive_drop, chroma_discontinuity, rms_dip |

Notable, worth flagging explicitly rather than presenting as 13 independent
facts:

- **17:21–17:48 is a cluster of three candidates in under 30 seconds**,
  not three separate transitions — this is almost certainly one real
  transition the windowed detector caught at multiple nearby points (or a
  genuinely complex triple-layered blend). It also sits essentially on top
  of the piece's already-documented spectral flash event at **17:47**
  (`docs/cue-sheet.md`) — the same instant that independent v1 analysis
  flagged as the piece's single sharpest spectral outlier is *also* where
  the v2 track-detection signal fires hardest. That's real corroboration
  between two independently-derived analyses, not a coincidence worth
  ignoring: 17:47 is very likely both a musical track transition **and**
  the visual flash event, which the existing creative bible's "Chekhov's
  gun" framing (a single unexplained color intrusion) may actually be
  underselling — it may be a real structural pivot, not just a sonic
  outlier.
- **34:43.30 and 34:44.48 are the same detection, 1.2s apart** — an
  artifact of the 20-second window spacing catching the same real event
  from two adjacent windows. Treat as one candidate at ~34:43.5, not two.
- **41:43.98 has the highest score of any candidate (0.682) and every
  signal fired** (bass, percussive, chroma, RMS all dropped together) —
  this is the strongest single piece of evidence in the whole dataset, and
  it lands 23 seconds after the documented global RMS climax at 2482.0s
  (41:22.0) and inside the already-documented Departure chapter's collapse
  toward silence. This is very likely the mix's final transition — the
  last track fading out — rather than a transition *into* something new,
  which is consistent with `docs/creative-bible.md`'s Departure chapter
  already being authored as a collapse, not an arrival.

So of the 13 high-confidence candidates, realistically **~11 distinct
transition events** once the two duplicate-detection pairs are merged.

## Medium-confidence candidates

19 further candidates in `analysis/track-map.json` (tier: `medium`) —
listed there, not reproduced here in full; review in `analysis/annotate.html`
if the 11 high-confidence transitions turn out to be fewer than the real
track count once confirmed by ear (a 15-track mix with only 11 detected
internal transitions likely means 3-4 more real ones are hiding in the
medium tier, probably softer/longer blends that dropped less sharply in
bass+percussive energy than a hard cut would).

## What this document does NOT yet do

Per the brief's own distinction (transitions / long blends / new-bassline
arrivals / vocal arrivals / breakdowns / returns / drops / major timbral
events / phrase boundaries / true exceptional events) — this pass only
detects the **transition** category with any rigor. Breakdown/return/drop
classification, phrase-boundary detection at 8/16/32-bar granularity, and
vocal-arrival detection (the `vocalPresence` field exists in the feature
timeline and is strong enough to threshold, but hasn't been run through a
detector yet) are still open work, listed in `docs/v2-plan.md`'s deferred
section. The `VisualDirector`/`CameraDirector` render pipeline does not yet
consume any of this track-map data — see `docs/visual-system-v2.md`'s
"what's not built yet" section.
