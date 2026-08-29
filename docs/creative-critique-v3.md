# AUUH — Creative Critique v3

Phase 13. Same discipline as `creative-critique-v2.md`: ranked, evidenced by
an actual rendered clip (`previews/v3/*.mp4`, rendered via
`analysis/render_v3_exemplars.mjs` at `?hud=off` so composition can be
judged without the debug overlay), not by reading `main.frag.js` and
assuming it's correct. Nine 22-33s exemplars were rendered: SHELL (First
Drive), the 17:47 rupture/CHAMBER, FIELD (Widening), ECHO (Synthesis
convergence), a restraint passage (R1), Fracture, 39:14+ Synthesis, the
41:22 climax, and the ending. Every finding below was caught or confirmed
by pulling frames and looking, exactly as the brief's own standard demands.

## Finding 1 [FIXED, the hard way]: CHAMBER's interior was real but
unreadable — a directional "internal" light left most of what the camera
actually saw completely unlit

**Evidence:** `previews/v3/chamber_rupture_1747.mp4` (first render, before
the fix below) at t≈1069-1080 (roughly the back half of the PASS_THROUGH
shot) — five consecutive sampled frames across that span rendered as an
almost featureless flat dark-gray field with at most a faint silhouette
curve at the edges. Not black, not NaN, not a crash — a normally-exposed
image that simply had no legible structure in it, i.e. exactly the kind of
"semantically wrong, not exposure-wrong" failure `creative-critique-v2.md`
Finding 4 already flagged automated pixel checks as blind to.

**Root cause:** `INTERNAL_LIGHT` (mode 3) computed `lightDir =
normalize(-p)` — a light "placed" at the origin — and fed it into the same
`diff = max(dot(n, lightDir), 0.0)` used by every other (directional, key-
light) mode. For a light AT the chamber's own center, any surface whose
normal points away from the origin (the outer curve of an interior ring,
the far side of a corridor wall as the camera passes it) gets
`dot(n, lightDir) < 0` and is shaded as fully unlit — left with only
`rim*0.08 + ambient*0.06`, i.e. almost nothing. Because the interior
architecture (`mapInteriorArch`'s stacked rings) presents exactly these
away-facing surfaces constantly as the camera moves through it, most of
what the camera actually saw during the interior traversal fell into this
dark case.

**A first fix attempt that helped but didn't solve it:** shortening the
PASS_THROUGH dive from `distRange[1]=0.12` to `0.55` (so the camera stops
well inside the hollow instead of pressed almost against a wall) — a
reasonable hypothesis (camera too close, reading as an abstracted near-
plane) that turned out to only be a secondary contributor. Re-rendering
after this change alone still showed the same flat-gray problem.

**Actual fix:** half-Lambert diffuse (`0.5 + 0.5*dot(n, lightDir)`, never
fully zero) specifically for `uLightMode == 3`, plus a modest bump to
`INTERNAL_LIGHT`'s ambient/rim floor (0.06→0.1, 0.08→0.16) as a safety
margin. This is also the more physically apt read for "light radiating
from inside a chamber" in the first place — a light filling a room, not a
point source casting hard shadows. Re-rendered and re-inspected: the same
time range now shows legible corridor/ceiling geometry — visible fold-seam
lines, a soft light gradient across converging wall panels, a small dark
ring-edge notch — a real, if soft and dreamlike, chamber, not a flat gray
field. Verified by frame, not assumed from the fix's plausibility (per this
project's own standing rule from `creative-critique-v2.md` Finding 1).

**Files:** `src/shaders/main.frag.js` (diffuse term), `src/core/
LightDirector.js` (INTERNAL_LIGHT recipe), `src/core/CameraDirector.js`
(PASS_THROUGH distRange).

## Finding 2 [FIXED]: the ring-buffer ECHO implementation had a genuine
framebuffer feedback loop, caught by an actual WebGL error, not by
reasoning about the code

**Evidence:** the very first smoke-test render (before any exemplar clip
was rendered) logged `GL_INVALID_OPERATION: glDrawElements: Feedback loop
formed between Framebuffer and active Texture.` in the browser console —
caught only because the smoke-test script listened for console errors,
which the exemplar-render script and (previously) `render_v2_previews.mjs`
do not.

**Root cause:** `FeedbackPipeline`'s history ring used `RING_SIZE=16` with
a longest tap lag of exactly `16`. `(writeIndex - 16) mod 16 ===
writeIndex` — the tap meant to be "16 frames old" resolved to the SAME
slot the current frame was about to write into, binding a render target as
both the write target and a read source in the same draw call.

**Fix:** `RING_SIZE = max(TAP_LAGS) + 1` (17, not 16) — the minimal correct
relationship, not a rounder/larger number picked defensively. Re-verified:
zero console errors across the full smoke-test sweep (18 timestamps
spanning the whole piece) and the full nine-clip exemplar render.

**Files:** `src/core/FeedbackPipeline.js`.

**Why Findings 1 and 2 matter beyond the two bugs:** both were invisible to
static reasoning about the code — Finding 1's shader compiled and ran
without error and "looked plausible" line by line; Finding 2 required
watching the browser console, not just the rendered pixels. Every future
change to the multi-tap history system or the interior lighting model
needs the same discipline: render it, watch the console, look at more than
one timestamp.

## Finding 3: the corrected EXTREME_WIDE is a real, confirmed win —
`docs/v3-creative-direction.md`'s highest-ranked mechanical fix delivers
exactly what it promised

**Evidence:** `previews/v3/field_widening.mp4` (Widening chapter, `shot=
EXTREME_WIDE`/`NEGATIVE_SPACE`) shows the body as a small, softly glowing
shape occupying well under a fifth of the frame height, centered in
generous black — a real "distant, small object in void" read, confirmed at
two independent sampled timestamps in the clip. This is the same chapter
and roughly the same wall-clock position `creative-critique-v2.md` Finding
5 documented as broken (`camDist=3.2`, object filling nearly the whole
frame despite `shot=EXTREME_WIDE`). The occupancy-solved distance math
(`docs/v3-creative-direction.md` §5, `CameraDirector.js`'s `occupancyDist`)
fixes exactly the failure that was measured, not a different one.

## Finding 4: FIELD's atmosphere reads as a soft glow around the body
rather than dust filling the frame — a legitimate, if smaller-than-
described, effect

**Evidence:** same `field_widening.mp4` frames as Finding 3 — there is a
visible soft halo around the small distant object, but no perceptible
haze/dust texture in the open black beyond it, despite `uFieldWeight≈0.35`
there. Tracing the shader: most of `fieldDensity`'s accumulation comes from
the `exp(-abs(d)*3)` term during the last several raymarch steps *before* a
hit (small `d`), not from the flat per-step floor added in open/miss space
— so FIELD's visible contribution concentrates as a glow immediately
around the body rather than as ambient dust independent of it.

**Verdict:** not a bug — a real, working effect, just narrower in scope
than "sparse dust filling atmosphere" as originally specified. It
reinforces "the object could be small/far or large/near" (the glow reads
ambiguously at any scale) more than it delivers "the atmosphere itself has
scale cues independent of the object." Left as-is rather than pushed
further this pass: raising the miss-branch dust intensity risks compromising
the crushed-blacks doctrine (Phase 12) for a effect that's already doing
useful work in its current, more restrained form. Worth a dedicated pass
if Ronny wants FIELD to read more atmospherically on its own.

## Finding 5: the multi-tap ECHO ghosting is present but hard to confirm
from stills alone

**Evidence:** `previews/v3/echo_synthesis.mp4` and `fracture_ch6.mp4` (both
`uEchoWeight>0`, confirmed numerically via HUD in earlier debugging)
show plausible fine cross-hatch/wave texture consistent with overlapping
past-frame ghosts, but it's genuinely difficult to distinguish "multi-tap
echo" from "the fbm turbulence pattern itself" in a single still frame —
the effect is inherently temporal (separate, differently-drifting ghosts
becoming visible over several seconds of *motion*), not something a frame-
grab can fully confirm or deny. Recorded honestly as **not fully verified
by this pass's evidence standard** — the next check should be watching the
actual clips in motion (not available to this review method), specifically
looking for the "several silhouettes at different positions" quality the
brief asks for.

## What's genuinely working, confirmed by rendering

- **CHAMBER, post-fix** (Finding 1): a real, legible, atmospheric interior
  reveal — soft, foggy, corridor-like, distinct in character from every
  exterior shot in the piece. The approach-and-threshold half of the
  PASS_THROUGH shot (camera closing from a recognizable object at moderate
  distance down through the shell) reads cleanly as a single continuous
  move, confirmed across five sampled points in the approach.
- **The 17:47 rupture as a whole**: `SceneDirector`'s forced CHAMBER blend,
  `MaterialDirector`'s MEMBRANE (after the dominant-family fix — see below),
  and the existing color flash all land at the same instant, confirmed via
  HUD readout (`scene=SHELL->CHAMBER (1.00) RUPTURE material=MEMBRANE
  light=3` at t=1067.19-1067.2) before the render-only review even began.
- **EXTREME_WIDE's fix** (Finding 3).
- **Fracture** (`fracture_ch6.mp4`): remains the strongest chapter, now
  with OBSIDIAN's real specular lobe replacing the old flat diffuse+rim —
  dense dark facets with sharp, legible highlights, more differentiated
  from BONE's matte look elsewhere than v2's single shared material ever
  was.
- **The ending**: `uBlackout` produces a genuine, clean cut to true black
  at the correct instant (confirmed: a frame at t≈2522, past
  `EVENTS.silenceFloor=2520`, renders as solid black, vs. a frame at
  t≈2499 still showing the collapsing, color-draining body) — "a genuine
  cut to nothing, not a fade tail" per `docs/cue-sheet.md`'s own
  instruction, now actually true of the render, not just the design intent.
- **MaterialDirector's dominant-family fix**: caught during debugging (not
  in the render-only pass) — the rupture initially resolved to BONE
  because `MaterialDirector` only ever looked at `primaryFamily`, and the
  rupture is authored as `primary=SHELL, secondary=CHAMBER, blend=1` (i.e.
  fully CHAMBER). Fixed by passing whichever family the blend actually
  favors; confirmed via HUD (`material=MEMBRANE` at the rupture peak,
  post-fix) before spending render budget on it.
- **Restraint passages remain the deck's most abstract, least-"visualizer"
  images** (`restraint_R1.mp4`): near-black, softly lit, almost
  unparseable-as-3D-geometry stills — the quality `docs/v3-creative-
  direction.md` §1 flagged as the strongest existing evidence for "art, not
  demo," confirmed still true and, if anything, reinforced by NEAR_DARK's
  now-deliberate (rather than accidental) lighting choice.

## What's still not working / open

- **Finding 4** (FIELD's narrower-than-specified scope) and **Finding 5**
  (ECHO not fully confirmable from stills) — both recorded above, neither
  blocking.
- **Hero events #5 and #8** (`docs/hero-events-v3.md`) remain honestly
  unimplemented/unpinned, as documented there — not re-litigated here.
- **This review method's own limit**: every finding above comes from
  still frames pulled at fixed fractions of each clip. Motion-dependent
  qualities — whether a cut actually reads as a hard cut vs. an ease,
  whether ECHO's ghosts visibly separate over time, whether the PASS_
  THROUGH move feels continuous rather than like two shots — are asserted
  from the code's construction (pure functions of t, verified segment
  boundaries) and from adjacent-frame comparison, not from watching actual
  playback. Flagged the same way `creative-critique-v2.md`'s own final line
  flagged this limit for its restraint-passage findings.

## Verdict against the brief's own final-test questions

- **"Did its WORLD become deeper?"** Yes, concretely: there is now a second
  qualitatively different spatial experience (occupying a chamber) where
  v2 had exactly one (observing an object from outside) for the entire 42
  minutes — the core diagnosis this whole brief was written to fix.
- **"Does the camera sometimes inhabit the world rather than observe it?"**
  Yes, once (the 17:47 rupture) — deliberately once, not diluted across
  many weaker instances, matching the brief's own "the ONE authored PASS_
  THROUGH event in the whole piece" framing.
- **"Does a still frame look composed?"** More often than v2: LightDirector
  and MaterialDirector give compositional variety (OBSIDIAN's specular
  facets, NEAR_DARK's restraint stillness, INTERNAL_LIGHT's soft interior
  fill) that v2's single fixed light/material combination didn't have.
- **"Does the music appear to cause meaningful events rather than
  parameter changes?"** Partially — the rupture, the convergence rotation,
  and the final-fade VOID pulse are real MESO-gated *events* (SceneDirector
  branches keyed to specific structural moments), not just smoother
  parameter curves; the Triple Warning cluster (hero event #8) is the
  honest counter-example, deliberately deferred rather than faked.
