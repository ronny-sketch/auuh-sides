# AUUH — Visual System v2

Architecture reference for the v2 rebuild (see `docs/v2-plan.md` for the
diagnosis and phased plan this implements). This document describes what
was actually built, not what was proposed — update it when the code
changes, the way `docs/final-critique.md` was kept honest against v1.

## Data flow, per frame

```
t (seconds)
  |
  +--> AudioFeatureEngine.sample(t)  -- MICRO: kick/bass/mid/high/onset/...
  |         (binary feature timeline, analysis/audio_features_v2.bin)
  |
  +--> getParams(t)                  -- MACRO: authored chapter keyframes
  |         (src/core/params.js, unchanged in spirit from v1 — the
  |          9-chapter arc, restraint doctrine, color events all still
  |          live in src/core/timeline.js + params.js)
  |
  +--> VisualDirector.sample(t)      -- combines MACRO + MICRO per the
  |         (src/core/VisualDirector.js)   Phase 4 mapping table, gated by
  |                                        (1 - restraint) throughout
  |
  +--> CameraDirector.update(p)      -- shot-grammar camera (src/core/
  |         CameraDirector.js), gated by bar/downbeat timing from
  |         public/beat_grid.json, not a continuous per-chapter orbit
  |
  +--> shader uniforms (src/main.js) -- fold/foldBlend/turbulence/fracture/
  |         formBlend/grainBoost/contrast/colorMix/camPos/camTarget/...
  |
  +--> FeedbackPipeline.renderFrame  -- two-pass ping-pong render (scene
            (src/core/FeedbackPipeline.js)   pass reads last frame's
                                              history via uPrevFrame,
                                              present pass blits to screen)
```

Every stage above is a **pure function of t** (or of values pre-computed
once at module load from data that doesn't depend on t) — this is a hard
requirement carried over from the v1 critique pass and re-verified after
every architectural change in v2 (see "Verification" below). Nothing in
this pipeline accumulates state across frames except the ping-pong render
targets themselves, which are explicitly a two-mode system: reset-and-
warm-up for seek/QA, continuous for the master render.

## AudioFeatureEngine (Phase 1)

- Offline: `analysis/analyze_v2.py` — Demucs 4-stem separation
  (drums/bass/vocals/other) + band energies, percussive envelopes
  (kick/snare/hats), HPSS harmonic/percussive split, standard spectral
  features, beat/bar phase from the existing beat grid, chroma
  (`chroma_stft`, not `chroma_cqt` — see the code comment on why: CQT
  drove this machine into 41GB of swap and had to be killed and replaced
  mid-build), silence detection, and a long-window energy trend. Every
  energy-derived field goes through an asymmetric attack/release envelope
  and percentile-based (not global min/max) normalization — see the field
  table in `docs/v2-plan.md` Phase 1 for the full list and rationale.
- Output: `analysis/audio_features_v2.bin` (flat Float32Array, fixed
  stride per 50Hz frame) + `.schema.json` (field order/count/hop/duration).
  Copied to `public/` so the browser can `fetch()` it.
- Online: `src/core/AudioFeatureEngine.js` — loads the binary once,
  `sample(t)` linearly interpolates between the two nearest frames. Pure
  function of t.
- **Graceful degradation**: if the binary hasn't been generated/copied yet,
  `VisualDirector.sample()` catches that and falls back to pure MACRO
  behavior rather than the piece failing to render at all.

## VisualDirector (Phase 3/4)

`src/core/VisualDirector.js` is the actual wiring for the brief's mapping
philosophy — not generic volume reactivity. Concretely, per frame:

| Feature | Effect | Where |
|---|---|---|
| `kick` | camera pressure/displacement (brief push-in) | `CameraDirector.update` |
| `bass` | slow camDist "breathing" | `VisualDirector.sample` |
| `mid` + `vocalPresence` | `foldBlend` nudge (topological identity) | `VisualDirector.sample` |
| `high` + `hats` | `grainBoost` (micro texture/grain), NOT turbulence | `VisualDirector.sample` -> shader `uGrainBoost` |
| `onset`/`flux` | discrete `fracture` rupture added on top of the chapter baseline | `VisualDirector.sample` |
| `energyTrend` | macro `contrast` tension, long-window only | `VisualDirector.sample` |
| `beatPhase` | passed through (reserved for future continuous cyclic modulation) | — |
| `downbeat`/bar grid | camera edit permission (shot cuts only land on bar boundaries) | `CameraDirector` shot-segment build |

All of the above is multiplied by `(1 - restraint)` — a restrained passage
refuses the entire mapping table, not just turbulence (v1's restraint gate
only touched turbulence/fracture; v2's touches every MICRO channel).

## BODY topology blend (Phase 3)

`src/shaders/main.frag.js`'s `map()` now blends **two** primitive pairs by
a `uFormBlend` uniform:

- Pair A: rounded box + thick torus (soft mass) — the original v1 body.
- Pair B: octahedron + thin wide ring (faceted architecture) — new.

`formBlend` is authored per-chapter in `src/core/params.js` as a fourth
4-keyframe arc (alongside fold/turbulence/fracture/camDist/contrast),
tracing 0 (Emergence) → rising through Widening/Fracture/Synthesis → back
to exactly 0 at Departure's end — a literal geometric enactment of the
SIDES narrative's "the object is a body / the body is architecture / ...
the memories belong to the same original body," without any literal
imagery. See `params.js` chapter comments for the per-chapter reasoning.

## CameraDirector (Phase 5)

`src/core/CameraDirector.js` replaces `camera.js`'s one-continuous-orbit-
per-chapter model with an authored **sequence of shot types** per chapter
(`CHAPTER_SHOT_SEQUENCES`), each shot type (`EXTREME_WIDE`, `MACRO`,
`PROFILE_SILHOUETTE`, `NEGATIVE_SPACE`, `UNEXPECTED_HORIZON`, `SLOW_PUSH`,
`VIOLENT_INSERT`, `STATIC_HOLD`, `LONG_HOLD`) with its own duration range
and camera-parameter recipe (`SHOT_TYPES`). The whole 42:06.9 timeline is
precomputed once into a flat, sorted shot-segment table
(`buildShotSegments`, seeded deterministically per shot via `mulberry32`)
cut only at bar boundaries from `public/beat_grid.json` — "permission for
editorial events" per the mapping table — so `getShotAt(t)` (internally,
the binary-search in `_shotAt`) is a pure function of t.

`HARD_CUT` from the brief's grammar list is not a distinct shot archetype
here — it's a transition property (documented as a possible future
refinement: currently all shot transitions are hard cuts by construction,
since consecutive segments simply swap camera recipe at the bar boundary;
an eased crossfade for *some* transitions is listed as a v2.1 refinement,
not yet implemented).

## FeedbackPipeline / MEMORY (Phase 6)

`src/core/FeedbackPipeline.js` — two `WebGLRenderTarget`s (ping-pong),
swapped every frame. The scene shader reads last frame's target as
`uPrevFrame` and blends a **drift-displaced** sample of it under the
current frame's color (`uMemoryWeight`, `uMemoryDrift` — see the shader
comment on why displacement matters: a plain crossfade reads as motion
blur, a displaced one reads as a ghost trail). A trivial present-pass
shader (`src/shaders/present.frag.js`) blits the scene target to the
visible canvas (Three.js can't render-to-target and render-to-screen in
one pass).

Two modes:
- **Seek/QA**: `window.__AUUH_RENDER_AT__(t)` resets both targets to black,
  then warms up 3 simulated seconds (`WARMUP_SECONDS`) leading up to t at
  30 synthetic fps, discarding that output, before rendering and capturing
  the real frame. Deterministic: same t always re-warms the same way.
- **Master sequential**: `window.__AUUH_RENDER_SEQUENTIAL__(t)` never
  resets — call it in strictly increasing t order for a true unbroken
  feedback history across the full 42 minutes (used by the offline master
  render, Phase 10).

`memoryWeight` itself is currently authored per-chapter in `params.js`
(rising through the piece, boosted sharply during restraint windows — "the
stillness is the feedback settling, not the geometry freezing") rather
than derived from audio features; wiring it to MESO/MICRO signals (e.g.,
raising it specifically during breakdowns) is listed as future work.

## What's NOT built yet (see `docs/v2-plan.md` for the full deferred list)

- **INTERIOR/ARCHITECTURE** and **FIELD/ATMOSPHERE** visual families —
  designed in the plan doc, not implemented.
- MESO (track/phrase) awareness feeding VisualDirector/CameraDirector —
  Phase 2's track-map exists as data (see `docs/musical-cue-sheet-v2.md`)
  but isn't yet consumed by the render loop.
- Eased (non-hard-cut) camera transitions for specific shots.
- The full offline master render pipeline (Phase 10) — only the seek/QA
  Puppeteer-screenshot path exists so far; the stdin-to-ffmpeg pipe
  improvement described in the plan is not yet implemented.

## Verification discipline (unchanged from v1, re-run after every change)

- `analysis/seek_determinism_test.mjs` — redesigned for v2 (see the file's
  own comment): with warm-up now built into every `__AUUH_RENDER_AT__`
  call, the meaningful test is "same t, different call history/order ⇒
  identical pixels," not "stepping through many small increments matches a
  direct seek" (the latter would just be testing warm-up's own cost
  thousands of times over).
- `analysis/memory_test.mjs` — redesigned to use
  `__AUUH_RENDER_SEQUENTIAL__` (the actual master-render code path), not
  `__AUUH_RENDER_AT__` (which would multiply the leak-test cost ~90x for
  no representativeness gain).
- Both re-passed after the FeedbackPipeline/CameraDirector/VisualDirector
  changes landed — results are not carried over from v1 by assumption.
