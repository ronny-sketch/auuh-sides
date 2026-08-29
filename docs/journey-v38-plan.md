# Journey v38 — Architecture Notes (creative/journey-v38)

Sibling worktree to the main `auuh` checkout (which stays untouched and
dedicated to the running V4 technical-master render). Branch
`creative/journey-v38`, forked from `6119c19`. Nothing here has been wired
into `src/main.js` or `src/master-render.js` yet — everything below is new
code that exists and is tested in isolation, waiting on Ronny's review of
the approach before it starts actually changing what renders.

## Why this branch exists

Ronny watched the first ~20 minutes of the V4 technical-master render and
diagnosed the real remaining problem: the film doesn't yet feel like one
thing being built by the music. Every existing director
(SceneDirector/CameraDirector/MaterialDirector/LightDirector) already
answers "what should render right now" well — that's not in question. None
of them answer "what has the möykky become so far," which is the missing
piece that would make minute 35 visibly contain the history of minutes
0-34. This branch adds that missing layer without touching the layers that
already work.

## What already existed and was NOT rebuilt

`src/core/MusicalDirector.js` is more sophisticated than the journey brief
assumed going in: confidence-graded transitions (candidate /
strong_candidate / human_confirmed / structurally_verified),
build/drop/breakdown detection (algorithmic + human-marker union),
densityState/tensionState, hand-verified exceptional events (the 17:47
rupture, the RMS-max climax), vocal/bass entry detection, phrase
boundaries. This is already most of "deeper music structure" — it was
extended, not replaced.

## New files, what each answers, and how they compose

```
MusicalDirector.sample(t)  ──┐
AudioFeatureEngine.sample(t) ┼──> EnergyReservoir.update(t, musical, audio)
                              │        (storedEnergy, tension, breath,
                              │         ATTACK/IMPACT/AFTERSHOCK/NEW_NORMAL)
                              │
                              └──> EvolutionDirector.update(t, musical, audio)
                                       owns one EnergyReservoir internally
                                       exposes .accumulated (monotonic,
                                       never decreases) and .expressed
                                       (= accumulated * expression, can
                                       collapse during a breakdown)

MusicalDirector (loaded)  ──> MusicEventStream(musicalDirector, featureEngine)
                                  canonical {type, timestamp, confidence,
                                  salience, hierarchy} events, MICRO..CLIMAX
                                  .eventsInWindow(start,end) — what a
                                  renderer actually needs per frame
                                  .corroborationCount(t) — "multiple
                                  independent signals agreeing"

analysis/build_review_candidates.mjs  ──> analysis/_review_candidates.json
    (Node, reuses the real browser code above via a fetch() shim — no
    detection logic duplicated) ──> analysis/annotate.html's new
    "Director critique" section ──> director-critique-log.json
```

### `src/core/EnergyReservoir.js`

storedEnergy charges during `build`/rising tension (rate scaled by
buildup duration and energyTrend), decays passively otherwise. A
build→drop edge triggers a one-shot release: `lastReleaseMagnitude` is
computed from stored energy, buildup duration, and exceptional-event
salience, then the reservoir mostly (not fully) empties — the floor
ratchets up slightly on every release, which is the mechanical expression
of "the organism is permanently changed." Runs a small ATTACK → IMPACT →
AFTERSHOCK → NEW_NORMAL → (GATHER) phase machine.

**Stateful, not pure-of-t** — same determinism contract as
`FeedbackPipeline`: `update(t)` must be called every frame with strictly
increasing `t`, benefits from the same `PREROLL_SECONDS` warm-up
`render_master.mjs` already does for the feedback ring. Not safe to seek
to arbitrary `t` without replaying from a preroll point.

Smoke-tested (synthetic 60s build→drop sequence, pure Node, no
browser/GPU) — caught and fixed a real double-counting bug in the
release-bump trigger during that test (a `phaseElapsed < 0.05` time-window
check fired on two consecutive frames at 30fps instead of once; fixed to
an exact `phaseElapsed === 0` edge check). See the file's own comment at
that line.

### `src/core/EvolutionDirector.js`

The central new abstraction. Owns one `EnergyReservoir`. Exposes 16
`accumulated.*` fields named in the brief (age, growth, mass, assembly,
surfaceComplexity, topologyComplexity, spatialDepth, interiorDepth,
fieldReach, memoryDepth, materialMaturity, symmetryComplexity, instability,
fracturePotential, scaleRange, psychedelicDepth) — each combined via
`ratchet()` (monotonic max), so nothing in `accumulated` can ever go down.
Also tracks a growing `unlockedCapabilities` set (SHELL → CHAMBER → FIELD
→ ECHO → VOID, thresholded on overall journey progress) — the data
SceneDirector would eventually query to answer "which properties of the
existing organism are visible right now" instead of "which scene is
active," per the brief's SCENE SYSTEM REFACTOR section. **SceneDirector
itself was deliberately not touched** — that's a real integration
decision, not busywork, and shouldn't happen blind before Ronny has seen
whether the accumulated-field curves even feel right on a review render.

`expressed.*` = `accumulated.* * expression`, where `expression` drops
during a breakdown/sparse section and rises back during a real release —
this is the file's implementation of the brief's single most emphasized
distinction ("accumulated vs. currently expressed — this is critical").

Baseline curves for each field are first-pass authored guesses
(smoothstep-in-t at different start points/weights) — deliberately simple
so a director watching the 1080p review cut can say "X grows too fast"
and get a specific curve reshaped, rather than an opaque formula. **Not
tuned against picture yet** — that requires the review render this branch
doesn't build without GPU time.

### `src/core/MusicEventStream.js`

Adapter, not a detector: reshapes MusicalDirector's five separate arrays
(`transitions`, `humanEvents`, `exceptionalEvents`, `vocalEntries`/
`bassEntries`, `phraseBoundaries`) into one sorted, canonical event list
with a `hierarchy` (MICRO/PHRASE/SECTION/TRACK/HERO/CLIMAX) — the concept
MusicalDirector doesn't have and the brief explicitly asks for ("a normal
kick must never have the same visual authority as a drop"). Adds one new
detection of its own: MICRO-tier kick onsets, scanned once from the
continuous 50Hz feature stream (not per-frame). `climax_2482` (the
objective global-RMS-max event) is the one CLIMAX-tier event in the piece
by construction; every other exceptional event is HERO.

`eventsInWindow(start, end)` is the actual query shape the brief specifies
("renderer should detect all events crossing the current video-frame time
window") — binary-search-then-scan over a pre-sorted array.
`corroborationCount(t)` implements "major visual transformations require
multiple independent signals agreeing" as a real, callable check (counts
distinct SECTION-tier-and-above event types within a window).

### `analysis/build_review_candidates.mjs` + `analysis/annotate.html`

Runs the ACTUAL `MusicalDirector`/`MusicEventStream` code in Node (via a
minimal `fetch()` shim pointing at local files — `track-map.json`,
`audio_features_v2.bin`+schema — rather than a second, drifting
reimplementation) to produce `analysis/_review_candidates.json`: every
SECTION-tier-and-above event (80 of them, out of 3,832 total events
including MICRO kicks, on a real run against this project's actual
`track-map.json` — tested, not hypothetical). `annotate.html` gained a
second, clearly-separated "Director critique" panel with the brief's
exact tag vocabulary (BUILD_START, PRE_DROP, DROP, BREAKDOWN, RETURN,
TRACK_BLEND_START, TRACK_RESOLVE, WOW, BORING, NEEDS_BREATH, TOO_BUSY,
TOO_VJ, MISSED_MUSICAL_MOMENT) and a "Load prepopulated candidates" button
that turns those 80 candidates into pre-filled, unconfirmed review rows —
Ronny confirms/corrects, doesn't start from a blank timeline. Exports to
`director-critique-log.json`, kept separate from the structural
`track-map-annotations.json` export so a critique tag can never be
mistaken for a structural marker MusicalDirector.js would consume.

## What this branch deliberately does NOT do yet

- Does not touch `src/main.js`, `src/master-render.js`, `SceneDirector.js`,
  `CameraDirector.js`, `MaterialDirector.js`, or `LightDirector.js` — no
  wiring, no rendering behavior has changed anywhere.
- Does not render anything, at any resolution — no GPU time was used
  building this (everything above was tested via plain Node execution of
  the underlying logic, confirmed against the real `track-map.json` and
  real audio-feature data already in the repo).
- Does not tune any of the accumulated-field curves against picture —
  there is no picture yet to tune against.
- Does not decide how `expressed.*`/`unlockedCapabilities` actually maps
  onto SceneDirector's family choice, CameraDirector's framing, or
  MaterialDirector's surface — that mapping is the next real design
  decision, and should happen with Ronny watching a review render, not
  guessed blind.

## Update: real-audio-derived form (session 2 — actual recording, track order, Spotify priors)

Ronny supplied the actual recording's confirmed track order (15 tracks,
ascending) and Spotify metadata priors, and asked that the story be built
from the ACTUAL musical form rather than inferred from generic audio-
reactive features. Authority order enforced throughout: recording >
human-confirmed sequence > automatic feature analysis > Spotify metadata.
Spotify values are treated as context/priors only — never as timing
ground truth (tracks are pitched/tempo-synced/looped in the mix).

### `analysis/verify_structural_episodes.mjs`

Re-verified all 16 compression→trough→release episode timestamps Ronny
supplied (from an independent audio pass) against the repo's real 50Hz
RMS data, per the brief's explicit instruction not to hard-code them
unverified. **Result: all 16 confirmed `structurally_verified`** (relative
RMS dip 0.6-1.0 against local surroundings), with corrected timestamps
drifting 0-7.5s from the brief's rough mm:ss estimates. Output:
`analysis/_structural_episodes/verified_episodes.json`. This directly
confirms the brief's own claim that "the previously chosen 17:47 visual
rupture was NOT arbitrary" — it's now backed by a measured 100% relative
RMS collapse-and-recovery, the deepest of all 16.

### `analysis/build_track_alignment.mjs` → `analysis/set-track-alignment.json`

Constrained DP aligner: places the 14 known track boundaries onto
`track-map.json`'s 124 existing evidence-scored candidates (never
re-detects transitions from scratch), maximizing evidence score against a
soft DJ-set-plausible segment-length prior. All 14 boundaries resolved
with `candidate`/`strong_candidate` confidence — deliberately never higher,
since no human has confirmed a single track identity yet (same discipline
MusicalDirector.js already enforces). Track 1 stays `title: null` — not
inferred. A genuinely useful cross-check: the DP's independently-selected
boundary for track #15 (Tanzen) landed at t=2503.98s — **exactly**
MusicalDirector.js's own pre-existing, independently-derived
`final_fade_1744` event. Two unrelated detectors agreeing is real
corroboration, not a coincidence worth ignoring.

### `analysis/classify_episodes_against_tracks.mjs`

Joins the two artifacts above to answer the brief's "is this a track blend
or an in-track event?" question per episode, rather than assuming novelty
= new track. Finding: the 17:47 rupture sits **inside** "Satisfaction -
Tuccillo Vocal Radio Mix" (#6), ~26s before the next track boundary — an
in-track drop, not a DJ transition. Several second-half episodes (26:45,
30:42, 32:48, 33:36-ish, 41:19) DO land within 25s of a track boundary and
are classified `TRACK_BLEND`. Output:
`analysis/_structural_episodes/episodes_vs_tracks.json`.

### EnergyReservoir salience — recalibrated with real factors

Per the brief's explicit multi-factor list, `EnergyReservoir.update()` now
takes an optional 4th `context` argument and computes release magnitude as
a product of independent factors (each ~1.0-neutral, so one weak factor
pulls the total down): build depth/duration, bass return (tracked via a
running min during the build vs. bass at drop), spectral change (flux
max during build), exceptional-event confidence, journey position, track-
transition proximity, and a causal "rarity vs. releases-so-far" factor.
New `src/core/TrackContext.js` (loads `set-track-alignment.json`) and
`src/core/StructuralEpisodes.js` (loads `structural-episodes.json`) supply
the real-audio inputs; both degrade gracefully to neutral/off if unloaded.

**Critically**, `EvolutionDirector.update()` now feeds EnergyReservoir a
build/drop signal that's the OR of MusicalDirector's track-transition-based
build/drop AND `StructuralEpisodes`' RMS-verified breathing episodes — not
either alone. This matters because most of the 16 verified episodes are
in-track (per the classification above), which MusicalDirector's
transition-proximity heuristic can't see at all. Without this OR, the
reservoir would have missed most of the actual gather/release pattern the
brief is calibrating against. `expression`'s withdrawal during a
compression is now scaled by the episode's actual measured `relativeDip`
(near-total withdrawal for the ~0.98 dip at 12:44-13:46, mild for a
shallow one) instead of one fixed discount for every build.

### `analysis/calibrate_energy_reservoir.mjs` — end-to-end validation, not assertion

Ran the real pipeline (AudioFeatureEngine + MusicalDirector + TrackContext
+ StructuralEpisodes + EvolutionDirector) across the full 42:06.93 file at
10Hz. **84 releases detected total.** The 17:47/18:03 rupture ranks **#3
of 84** by computed magnitude (1.52) — genuinely "very high," and three
later events (31:44 - 2.03, 41:21 - 1.82, 23:41 - 1.56) rank above it,
which is exactly what the brief predicted ("later events may exceed it as
the film approaches climax") and here is measured, not assumed. Full
ranked list: `analysis/_calibration/energy_reservoir_calibration.json`.

**Known follow-up, not yet addressed**: `lastReleaseMagnitude` is an
unbounded product of factors (observed range ~0.3-2.0 across the real
run) — fine for relative ranking, which is what this calibration pass
tests, but whatever eventually reads this value to drive a visual
parameter will need to normalize/clamp it first. Flagged, not fixed here,
since the right normalization curve is a rendering-integration decision,
not something to guess blind.

### First-20-minutes story beats — now anchored to VERIFIED timestamps

The brief's SEED → FORMATION → ASSEMBLY → IDENTITY → BREATH → PREPARATION
→ MAJOR COMPRESSION → FIRST ONTOLOGICAL RELEASE → CHANGED NORMAL story arc
maps onto the verified (not claimed) episode timestamps as follows —
update any future review-window definitions from this table, not the
brief's original rough numbers:

| Beat | Verified anchor (was claimed) |
|---|---|
| FORMATION event | trough 170.58s / 2:50.6 (was 2:50) |
| ASSEMBLY event | trough 394.86s / 6:34.9 (was 6:34) |
| IDENTITY event | trough 654.0s / 10:54.0 (exact match) |
| BREATH (deep) | trough 791.94s / 13:11.9 (was 13:11) — relativeDip 0.984, the deepest "quiet" episode measured |
| MAJOR COMPRESSION / RELEASE | trough 1067.82s / 17:47.8 (was 17:47) — relativeDip 1.0 (the single deepest measured collapse in the whole file), rank #3 of 84 by release magnitude |

## Next steps (need GPU time and/or Ronny's review — cannot happen from here)

1. Wire `EvolutionDirector`/`MusicEventStream` into `src/master-render.js`
   read-only first (log/telemetry only, no visual change) to sanity-check
   the accumulated curves against the real audio track end-to-end.
2. Render a 1080p/30fps creative-review cut (per the brief — NOT 4K) once
   wiring is live, so the accumulated/expressed split and hierarchy tiers
   can actually be watched, not just read as numbers.
3. Run `analysis/build_review_candidates.mjs` again against that review
   cut's timestamps, open `analysis/annotate.html`, load the candidates,
   and have Ronny actually tag WOW/BORING/TOO_VJ/etc. against picture.
4. Only after that pass: decide how SceneDirector reads
   `unlockedCapabilities`/`expressed.*` to actually change what renders —
   this is the step that turns this branch from "instrumentation" into
   "the film feels different."

### First review windows (brief's six, re-centered on verified timestamps)

The brief asked for six ~1-minute 1080p test windows once GPU time is
available, chosen to cover assembly/storage/release/breath/revelation/
changed-normal. Re-centered on this session's verified episode data
(±15-20s padding around each real trough for pre-roll + settle):

| # | Window | Tests |
|---|---|---|
| 1 | 02:25-03:20 (unchanged — brackets verified 2:50.6 trough) | assembly step at FORMATION |
| 2 | 06:10-07:20 (unchanged — brackets verified 6:34.9 trough) | ASSEMBLY→new-normal step |
| 3 | 10:30-11:30 (unchanged — brackets verified 10:54.0, exact) | IDENTITY release |
| 4 | 12:40-14:00 (widened slightly — brackets verified 13:11.9, the deepest breath episode) | BREATH restraint |
| 5 | 16:55-18:20 (unchanged — brackets verified 17:47.8, rank #3/84 by magnitude) | MAJOR COMPRESSION → FIRST ONTOLOGICAL RELEASE |
| 6 | 18:20-19:20 (unchanged) | CHANGED NORMAL |

Not yet turned into a render_master.mjs job list — that requires wiring
(next-step #1) to exist first, since these windows are only meaningful
once EvolutionDirector/EnergyReservoir are actually driving something
visible.
