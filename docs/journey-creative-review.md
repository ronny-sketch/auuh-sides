# Journey V3.9 — Creative Review Package

Three A/B comparison clips, 1920x1080/30fps, `--type review` H.264 (correct
Rec.709 tagging via mux_deliverable.mjs), source AUUH audio muxed in
separately (never captured from the browser). NEW = this branch
(creative/journey-v38, with the V3.9 integration/semantic fixes/fragment
assembly all applied). OLD = `main` at the pre-journey V4 baseline
(80632e4/c88e9d1), same exact time window, same resolution/fps/audio.

This document does not declare artistic success — that's Ronny's call after
watching. It lists only what changed technically, which musical event is
being interpreted, what developmental state exists at that point in the
film, and what to actually look for.

## A. CONSTRUCTION — 02:25–03:20 (145s–200s)

**Files:** `reviews/journey_ab/construction_old.mp4` / `construction_new.mp4`

**Musical event:** brackets the verified FORMATION trough at 170.58s
(2:50.6) — the first real gather/collapse/re-entry episode in the
recording (`analysis/permanent-acquisitions.json`'s `first_join`
acquisition, relativeDip 0.975).

**Developmental state (NEW only):** `accumulated.assembly` is rising through
roughly 0.08→0.14 across this window (still early in the
`smoothstep(0, DURATION*0.35, t)` ramp) — the film's very first real
"building" step. The V3.9 Part 9 fragment-assembly rewrite is the thing
under test here: 6 persistent ring pieces plus a seed core, scattered at
low assembly, traveling back to their home position on the ring as assembly
rises (replacing the earlier `assemblyWarp` domain-warp, which a fixed-
camera contact sheet showed FAILED — see
`analysis/_assembly_diagnostic/contact_sheet_A_assembly_sweep.png` — every
value produced a frame-filling chaotic mass with no separation and no
visible joining).

**What to assess:** Does the music's build/collapse/re-entry at 170.58s
correspond to material visibly moving TOWARD the body and joining it — not
just texture changing? Does the OLD clip's `assemblyWarp` read as static/
undifferentiated by comparison?

## B. BREATH — 12:35–13:55 (755s–835s)

**Files:** `reviews/journey_ab/breath_old.mp4` / `breath_new.mp4`

**Musical event:** brackets the verified deep-breath episode, trough
791.94s (13:11.9) — relativeDip 0.984, the single deepest "quiet" episode
measured in the first 20 minutes
(`analysis/permanent-acquisitions.json`'s `deep_rest`, deliberately a
NON-acquiring entry — nothing new is permanently learned here, per the
brief's "some tracks may... rest").

**Developmental state (NEW only):** by this point `accumulated.assembly` is
effectively 1.0 (the ramp completes by ~14:44) and `accumulated.mass`,
`materialMaturity`, etc. are all substantially built up — this is a MATURE
organism, not the seed from clip A. `expression` collapses sharply during
the verified trough (`visibleComplexity` measured avg 0.057 inside the
episode vs 0.092 just before it — see `docs/first-20min-film-state.md`),
while every accumulated field holds flat or keeps climbing underneath
(0 monotonicity violations in this exact window — sanity check in
`analysis/trace_film_state.mjs`).

**What to assess:** Does this read as a powerful, already-developed body
going quiet/resting — or does it look like the visualizer reset to an
earlier, simpler state? The whole point of the accumulated/expressed split
is that it must NOT look like the latter.

## C. RUPTURE — 16:55–18:20 (1015s–1100s)

**Files:** `reviews/journey_ab/rupture_old.mp4` / `rupture_new.mp4`

**Musical event:** the verified 17:47.8 rupture (1067.82s) — relativeDip
1.0, the single deepest large-scale compression/trough/release measured in
the entire file, ranked #4 of 84 releases by computed magnitude (top-10
sanity check: PASS). One continuous clip spanning compression-before,
the rupture itself, and the aftermath, so the before/during/after can be
judged together rather than as three separate cuts.

**Developmental state (NEW only):** this is the exact window the V3.9
Part 2 interior-semantics fix targets. Before 1067.82s,
`interiorHintExpression` may rise (bounded below 0.35, unlocked at
1034.38s — concavity/seam/aperture-suggestion only) but true
`interiorExpression` is EXACTLY 0 (verified by
`analysis/trace_film_state.mjs`'s sanity checks, 0 violating samples across
the entire film before this instant). At 1067.82s, `INTERIOR_REVEALED`
unlocks permanently — CameraDirector's one authored `PASS_THROUGH` shot
(the only shot type in the whole piece capable of crossing into the
shell's interior) is spliced in around this exact instant. globalStoryTier
for this release is HERO, not CLIMAX (Part 3 fix — CLIMAX is reserved for
the ~41:21 ending).

**What to assess:**
- Does the music visibly compress/still the system in the seconds before
  17:47?
- Does 17:47 itself feel earned, not arbitrary?
- Does the camera's pass-through genuinely reveal an interior (not just a
  color flash or cut)?
- Does 18:10+ feel like a permanently changed normal, rather than a return
  to how the film looked before 17:47?

## Motion-quality notes (Part 12)

Main's V4 quality critique (`docs/v4-quality-critique.md`) explicitly
flagged that its comparison was based on still frames and had not yet
proven motion-dependent quality. These three clips are the first real test
of that. Logged directly against the rendered files, not guessed from
stills — see the "Motion quality" section below, filled in after render.

## Four questions for Ronny

1. **CONSTRUCTION** — Does it genuinely look like something is being
   built?
2. **BREATH** — Does it feel like the same developed möykky resting?
3. **RUPTURE** — Does 17:47 feel prepared, earned, and transformative?
4. **COHERENCE** — Does the NEW version feel more like one evolving
   organism and less like several coded visual systems?
