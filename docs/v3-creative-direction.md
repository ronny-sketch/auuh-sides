# AUUH — V3 Creative Direction

Phase 0 audit for the V3 brief. Written the same way `docs/v2-plan.md` and
`docs/creative-critique-v2.md` were: by reading every listed file, then
actually pulling and looking at frames from the existing `previews/v2/*.mp4`
clips (mid-clip frame from `ch0_emergence`, `ch2_contraction_restraint`,
`ch5_widening_macro`, `ch6_fracture`, `ch7_synthesis_bleed`,
`ch8_departure_climax`, `transition_flash_1067`) — not from reading
`main.frag.js` and assuming it renders as described.

## 1. What currently still reads as a visualizer

- **Exactly one spatial relationship for 42 minutes.** Every single frame
  pulled — Emergence's soft box-torus, Widening's asteroid-scale macro
  insert, Fracture's shattered facets, Synthesis's green-tinted "planet,"
  Departure's shard cluster — is the same shot: an object, floating in a
  black void, viewed from outside, at some distance/angle. The BODY
  topology blend genuinely changes the object's silhouette (confirmed:
  rounded-box-and-torus vs. faceted-octahedron-and-ring are visibly
  different things), but the camera's *relationship* to that object never
  changes. This is `docs/creative-critique-v2.md`'s own diagnosis,
  independently reconfirmed here — it is still exactly true after looking
  at seven fresh frames across the full arc.
- **The HUD is baked into every QA frame.** Not a creative problem (it's
  correctly a debug overlay, `hudEl.textContent` — see `src/main.js`), but
  worth naming: nobody has looked at these clips *without* the green
  telemetry text sitting over the bottom-left of every frame. The overlay
  needs a `hud=off` param before any exemplar clip in Phase 13 is judged
  for composition — text over the bottom third of frame changes how a
  35mm-style silhouette shot reads.
- **`EXTREME_WIDE` doesn't mean wide** (Finding 5, `creative-critique-v2.md`,
  reconfirmed at `ch5_widening_macro_mid.jpg`, t=1709, shot=EXTREME_WIDE,
  camDist=3.19 — the frame is filled edge-to-edge by rock texture, the
  opposite of "extreme wide"). This is a real, measured bug in the camera
  system, not a matter of taste.
- **Color, when it lands (Synthesis/Departure frames), still reads as "the
  shader got a green tint," not as rupture.** The alien-hue wash is
  correctly *not* a conventional teal-orange grade (that fight was already
  won in v1→v2), but a uniform hue multiply over the same shot grammar as
  everything else doesn't carry extra ontological weight on its own —
  it's a filter change, not an event. It needs to coincide with something
  spatially strange (per the brief's 17:47 instruction) to stop reading as
  "palette swap."
- **Restraint passages are visually the strongest material in the deck
  and are under-exploited.** `ch2_contraction_restraint_mid.jpg` (extreme
  macro grazing-light surface, a single hairline crack, most of the frame
  near-white with almost no incident detail) is the single most abstract,
  least-"visualizer" image in the whole set — it doesn't read as geometry
  at all, closer to a photograph of ice or skin. That's not an accident of
  camera distance; it's what happens when STATIC_HOLD/LONG_HOLD stay put
  long enough for the eye to stop parsing "3D rendered object" and start
  reading pure light/texture. This is the single best evidence in the
  existing build for what "art, not demo" looks like when it happens, and
  it currently only happens by camera-distance accident, not by design.

## 2. What already reads as authored artwork

- **Fracture** (`ch6_fracture_mid.jpg`) is the strongest chapter as-is: dark
  faceted planes at grazing angles, real negative space, a scratchy
  horizontal noise signature bottom-left. This is close to Lorn/"Anvil"
  territory already — weight, dread, brutalist geometry — without help
  from any new V3 system. Whatever V3 adds to Fracture should risk making
  it *worse* if applied carelessly; it's the chapter furthest from needing
  the "activate everything at once" treatment.
- **The Widening macro insert** (`ch5_widening_macro_mid.jpg`) accidentally
  already delivers on "the object is microscopic / the object is
  planetary / the viewer cannot tell which" (Phase 4's FIELD goal) — the
  fbm surface detail at extreme macro genuinely reads as eroded rock or
  a small moon, not "a shader bump map." FIELD doesn't need to invent this
  quality from nothing; it needs to make it *available on purpose*, at
  other times, at other scales, rather than as a side effect of one
  specific camDist multiplier landing in one specific chapter.
- **The restraint doctrine** works as designed — R1's held 59.6s single
  slow move, confirmed in the pulled frame, is genuinely doing "the
  stillness is the feedback settling, not the geometry freezing" (v2-plan's
  own framing). This is a real, working piece of dramatic architecture,
  not aspirational.
- **BODY topology blend and MEMORY** are both confirmed working end-to-end
  (per `creative-critique-v2.md`'s verified findings) and don't need to be
  rebuilt — V3's job is to give them somewhere new to live, not to replace
  them.

## 3. What must stay (do not touch, per the brief and per what's confirmed
working)

- `AudioFeatureEngine` (offline analysis + `sample(t)`), untouched.
- The MACRO chapter map, restraint doctrine, and the two rationed color
  events in `timeline.js`/`params.js` — the dramatic architecture in Phase
  10 below is a *reading* of this existing structure, not a replacement.
- The BODY topology blend (pair A/pair B in `main.frag.js`'s `map()`) as
  the base geometric DNA — CHAMBER, FIELD, ECHO, and VOID all need to be
  built as different *readings* of this same field, not new primitives.
- FeedbackPipeline's ping-pong architecture as the base — V3 upgrades it
  to a ring of taps but keeps the reset/warm-up-for-seek vs.
  never-reset-for-master split, which is load-bearing for QA.
- The fracture-cut fix and its documented failure modes
  (`opSmoothSubtraction` saturating from either direction) — any new
  interior/shell SDF work touches the same operator family and must be
  render-verified across the full parameter range before being trusted,
  per that finding's own stated lesson.
- Seek-determinism and the master-sequential/seek-mode split in
  `FeedbackPipeline`/`main.js`. Multi-tap memory (Phase 7) and any new
  per-frame state (interior camera mode, MESO lookups) must stay pure
  functions of `t`.

## 4. What's over-engineered relative to its visual value

- **`src/core/camera.js` (`CameraRig`, 112 lines) is dead code.** Nothing
  imports it — `main.js` only imports `CameraDirector`. It's a full
  duplicate implementation of a superseded v1 system sitting unused in the
  tree. Delete it; it's not "future work," it's confusion risk for the
  next person (or the next session) who greps for camera logic and finds
  two.
- **The camera shot-type table's `distMult` multiplier design** (Finding 5)
  is more general than it needs to be and is precisely what causes
  `EXTREME_WIDE` to fail — multiplying an already-small per-chapter
  `camDist` by a fixed ratio has no floor tied to what the lens/frame
  actually needs. This needs to become distance-from-target-frame-fraction
  math (Phase 8), which is *less* code, not more — the current design pays
  complexity cost (nine chapter base recipes × nine shot types × two
  multiplier axes) without buying the one guarantee ("wide" looks wide)
  that would justify it.
- **`VisualDirector`'s flat mapping table is fine and should not grow.**
  It's tempting to bolt MESO reactivity onto it directly (more `if`
  branches keyed to track index). Per the brief's own instruction ("MICRO
  must modulate a scene, must NOT determine what scene exists"),
  `VisualDirector` should stay exactly what it is — the MICRO layer — and
  the new `SceneDirector` should sit structurally *above* it, deciding
  which family is active, with `VisualDirector` untouched underneath.
  Adding MESO logic directly into `VisualDirector` would be exactly the
  kind of scope-creep into `main.frag.js`/one-file-does-everything the
  brief explicitly warns against.
- **The annotation/track-map tooling is good v1 and should not be
  rebuilt or expanded in this pass.** `analysis/track-map.json` (124
  scored candidates, 13 high-confidence) and `analysis/annotate.html`
  already do exactly what Phase 1 asks for ("support annotation overrides")
  — the honest move is to *consume* this data in a new `MusicalDirector`,
  not re-derive it.

## 5. What would produce the largest perceptual leap

Ranked by (perceptual impact) ÷ (implementation risk), which is why CHAMBER
is first in both the brief and here:

1. **CHAMBER.** Every pulled frame confirms the exact bottleneck named in
   the brief. A single continuous exterior→interior camera move is the one
   change most likely to make a viewer say "this isn't a visualizer" the
   first time it happens, because it's a category of shot the piece has
   never done, not a variation on a category it already does nine ways.
2. **Fixing camera framing semantics (EXTREME_WIDE, screen-space distance
   solve).** Cheap, mechanical, and currently actively lying to the
   audience — a wide shot that isn't wide undermines the "scale must be
   dramatized" doctrine every time it fires.
3. **MusicalDirector + SceneDirector, so state changes have a reason.**
   Right now every visual variation is either MACRO-chapter-scheduled or
   MICRO-audio-jittered. There is no timescale in between deciding "now is
   the moment the piece shows you the interior" — without it, CHAMBER/
   FIELD/ECHO/VOID would just be five more per-chapter presets, which is
   the exact failure mode ("VJ presets, not ontological states") the brief
   explicitly rejects.
4. **LightDirector with a small set of held states.** The current single
   fixed `lightDir` (`main.frag.js`, hardcoded `vec3(0.5, 0.8, -0.4)`) means
   every compositional variation in the pulled frames comes entirely from
   geometry and camera angle — lighting has never once been an authored
   decision. A handful of strong, still, rare light changes is very cheap
   relative to its effect on "does a still frame look composed."
5. **Multi-tap MEMORY (ECHO).** High conceptual fit with "temporal selves"
   (Phase 11's psychedelia rule) and technically a bounded, well-scoped
   extension of an already-working system (ring buffer instead of one
   ping-pong pair).
6. **FIELD as a volumetric reading of the existing distance field**, not a
   new particle system. Lower priority than the above because Widening's
   macro insert already proves the "scale ambiguity" quality is reachable
   from the current SDF — FIELD's job is to make that intentional and
   available at more than one accidental camera distance.
7. **VOID and MaterialDirector's OBSIDIAN/NEGATIVE states** are the
   cheapest of the five families (shading-mode changes, not new geometry)
   and are treated here as high-value/low-risk finishing work rather than
   a structural priority — they compose naturally once LightDirector and
   SceneDirector exist to arbitrate when they're allowed to appear.

## 6. Architecture consequence: one `map()`, five readings

The five families are **not** five scenes to cross-dissolve (v2-plan.md
already rejected that approach for BODY/FRACTURE and the same argument
applies with more force here — cross-dissolving five separately-rendered
scenes is the textbook "collection of VJ presets" failure). Instead:

- **SHELL** = the existing exterior raymarch against `map()`, solid hit,
  surface shading. This is what's already built; SceneDirector treats it
  as the default/base state.
- **CHAMBER** = the *same* `map()`, but the camera has crossed to the
  inside of a thin-shell version of the field (`abs(d) - wallThickness`),
  so the raymarcher continues through empty interior space and hits
  interior architecture built from smaller/repeated copies of the same
  primitives — same DNA, same file, different traversal.
- **FIELD** = the same `map()` used as a *density* source (small `|d|` =
  dense) for a volumetric integration along the ray, instead of a hard
  surface hit — same field, different accumulation rule.
- **ECHO** = the same `map()`'s *history* — multiple time-delayed frames
  of the same geometry, sampled from a ring of feedback textures at
  different lags and composited with different weights/drift — same
  field, sampled at different times instead of different positions.
- **VOID** = the same `map()`, but the shading model treats a hit as
  absence (near-black mask) against a lit atmosphere, so presence reads as
  a hole rather than a lit surface — same field, inverted shading
  semantics.

This is why `SceneDirector` produces `primaryFamily`/`secondaryFamily`/
`blend` rather than five booleans: two adjacent families (e.g. SHELL↔
CHAMBER during a pass-through, or CHAMBER↔FIELD as chamber walls dissolve
into atmosphere) can genuinely co-render from the same `map()` call, which
is what makes "one continuous shot" possible for the Phase 3 pass-through
requirement — it is not possible if each family is its own render pipeline.

## 7. What this pass actually implements vs. defers

Following the same honesty discipline as `docs/v2-plan.md`'s own split
(the brief specifies work that is realistically weeks for a small team):

**Built in this pass:**
- `MusicalDirector.js` (Phase 1) consuming `track-map.json` + a small
  exceptional-events list including 17:47, feeding MESO state to the
  render loop.
- `SceneDirector.js` (Phase 2), five-family model, MACRO+MESO-gated.
- CHAMBER interior raymarch mode (Phase 3) — thin-shell SDF, sign-aware
  traversal, one continuous exterior→interior camera capability, wired to
  the 17:47 rupture specifically as its first appearance.
- FIELD volumetric density pass (Phase 4), cheap, same `map()`.
- `LightDirector.js` (Phase 5) — six authored states, held not animated.
- `MaterialDirector.js` (Phase 6) — four states (BONE/OBSIDIAN/MEMBRANE/
  NEGATIVE), rare and story-gated.
- Multi-tap MEMORY / ECHO (Phase 7) — ring-buffer history, several taps.
- Camera v3 (Phase 8): the EXTREME_WIDE screen-space fix, an authored cue
  timeline generated from MACRO+MESO+exceptional events (not per-chapter
  random cycling alone), and a transition-grammar layer (hard cut / ease /
  pass-through / black cut / temporal dissolve) between segments.
- 17:47 ontological rupture as a real implemented moment, not a doc note.
- `docs/hero-events-v3.md` with ~12 designed events; a representative
  subset actually implemented and render-verified (not all 12 — see the
  doc for which).
- `docs/creative-critique-v3.md` after rendering the Phase 13 exemplar
  clips, ruthless, evidence-based.
- Deleting `src/core/camera.js` (dead code, §4).

**Deferred, with a concrete design so it isn't hand-waved:**
- Full breakdown/build/drop/vocal-entry classification beyond what
  `vocalPresence` thresholding and the existing track-map already support
  — `MusicalDirector` exposes the fields the brief asks for, but not all
  of them are populated from a real detector in this pass (documented
  per-field in the file itself, same discipline as `VisualDirector`'s
  graceful-degradation comment).
- All ~12 hero events fully choreographed shot-by-shot — a representative
  set is built and verified; the rest are specified in the doc as the next
  pass's punch list.
- 4K / full 42-minute master render — still explicitly out of scope per
  the brief's own "optionally, once locked."
