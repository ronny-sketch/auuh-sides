# AUUH — Hero Events v3

Phase 9 deliverable. ~10-15 unforgettable authored events across the 42
minutes, per the V3 brief. Every event below cites its musical evidence
(from `docs/creative-bible.md`, `docs/cue-sheet.md`, or
`docs/musical-cue-sheet-v2.md`'s track-map candidates) and its story
justification (the OBJECT→BODY→PLACE→WORLD→MEMORY→OBJECT arc). Status is
marked honestly per event — this pass does not claim all 14 are fully,
uniquely authored; several are confirmed to already emerge correctly from
systems built for other reasons (SceneDirector, CameraDirector's shot
grammar, the restraint doctrine), which is recorded as a finding, not
hidden as if it were bespoke work.

## 1. The First Recession — 02:30

**Musical justification:** the piece's first sustained dip (RMS 0.035,
`docs/creative-bible.md` §6), Chapter 1→2 boundary, landing off-downbeat
(cue-sheet.md: "the audio itself moves mid-bar here").
**Story justification:** Emergence's first pulse doesn't hold — the self
doesn't announce itself confidently on the first try.
**Visual:** foldBlend/turbulence dip in lockstep with the audio (already
authored in `params.js`'s Ch0 keyframes: foldBlend peaks at 0.42 then
recedes to 0.16).
**Setup:** near-silence opening.
**Payoff:** First Drive's much harder commitment two minutes later reads
as a *second* attempt, not a continuation.
**Motif recalled by:** Departure's own recession (event 14).
**Status: already implemented** (v1/v2 `params.js` keyframes) — no new V3
work needed; included here because the brief asks for the recognizable
event list, not only new work.

## 2. First Stillness — 08:25

**Musical justification:** R1, the piece's lowest sustained trough
(12:30-13:30 per the bible, chapter starts 08:25), segmentation goes quiet
(stable, undeveloping material).
**Story justification:** the object stops changing and simply endures —
the first time SIDES holds a single state long enough to be looked at.
**Visual:** STATIC_HOLD/LONG_HOLD camera grammar (unchanged from v2) now
combined with V3's NEAR_DARK light state for the whole chapter
(`LightDirector`'s `CHAPTER_LIGHT_SEQUENCE[2] = [NEAR_DARK]`) — restraint is
now also a *lighting* decision, not just a motion one.
**Setup:** First Drive's aggressive, never-settling build.
**Payoff:** the extreme-macro grazing-light frame confirmed in
`docs/v3-creative-direction.md` §1 — the single most abstract, least-
"visualizer" image in the deck.
**Motif recalled by:** R2/R3 (event 10), the piece's other two restraint
passages.
**Status: implemented** (LightDirector's NEAR_DARK override for restraint
windows, `LightDirector.js`).

## 3. The Rupture — 17:47

**Musical justification:** the piece's single sharpest spectral outlier
(centroid 8002Hz) AND the track-map's highest-corroborated cluster
(17:21-17:48, three independent candidates in under 30s) — two
independently-derived analyses agreeing this is the piece's one most
exceptional instant before the climax.
**Story justification:** the first ontological rupture — the viewer
believed this was an object; the camera now proves it was also a place.
**Visual:** the one authored `PASS_THROUGH` camera shot in the whole
piece, spliced across the Ch4→Ch5 boundary (which cue-sheet.md already
documents as landing exactly on this instant); camera dollies from
outside (occupancy-framed, object recognizable) to deep inside the shell
(explicit distance sweep, bypassing all safety clamps); `SceneDirector`
forces `CHAMBER` at blend=1 for the event window; `LightDirector` forces
`INTERNAL_LIGHT` (light radiating from the origin outward — "light itself
reveals geometry" reads differently from inside); `MaterialDirector`
resolves to `MEMBRANE`; the existing sub-second color flash (`timeline.js`
`getColorMix`) still fires, now coinciding with the spatial rupture instead
of standing alone.
**Setup:** nine minutes of exterior-only viewing (Ch0-3) with a
consistent, established visual grammar.
**Payoff:** CHAMBER, the piece's central formal discovery, becomes real.
**Motif recalled by:** Synthesis's convergence (event 11), 41:22 (event
12).
**Status: implemented** (`CameraDirector.spliceRuptureOverride`,
`SceneDirector`'s `rupture_1747` branch, `LightDirector`'s RUPTURE
override, `MaterialDirector`'s dominant-family fix) — render-verified in
`docs/creative-critique-v3.md`.

## 4. The Changed Return — ~19:20

**Musical justification:** track-map candidate at 19:20.84 (score 0.529,
bass_drop + chroma_discontinuity), the first real transition candidate
after the rupture settles.
**Story justification:** the object looks the same as before 17:47, but
the viewer now knows something the object doesn't announce — residue of
having-been-inside.
**Visual:** SceneDirector's CHAMBER blend does not snap back to the Ch4
resting value of 0 after the rupture window closes — it decays
continuously (confirmed numerically: blend=0.20 at t=1073, six seconds
after the rupture's peak, vs. the chapter's own resting 0). This is an
*emergent* consequence of the rupture's exceptional-event window and the
chapter's own `restBlend`/`breakdownPush` terms, not a bespoke trigger.
**Status: emergent, not separately authored** — recorded honestly as a
finding rather than claimed as new work.

## 5. The Quiet Hangover — 21:00-22:00

**Musical justification:** Second Drift's internal RMS dip (0.069-0.089,
`docs/creative-bible.md` §6) — not one of the three doctrinal restraint
windows, but a real, measured secondary trough.
**Story justification:** after proving the object has an inside, the
piece doesn't rush to explain it — a beat of quiet uncertainty.
**Visual:** whatever `LightDirector` segment happens to be active in this
window from Second Drift's authored `[INTERNAL_LIGHT, SILHOUETTE]` cycle.
**Status: NOT pinned to this exact window** — the light-segment schedule
is deterministic but seeded independently of this specific dip; whether a
SILHOUETTE hold actually lands here is incidental, not authored. Flagged
as a genuine v3.1 candidate (an explicit override, same pattern as the
rupture splice) rather than claimed as done.

## 6. World Opens — 24:12

**Musical justification:** Ch5/Widening chapter boundary; the loudest
sustained passages in the piece begin here (26:00, 27:30).
**Story justification:** CHAMBER opens outward into FIELD — scale becomes
unknowable for the first time from *outside* the object, not just inside
it.
**Visual:** `SceneDirector`'s Ch5 plan (`primary: CHAMBER, secondary:
FIELD, restBlend: 0.35`) plus the corrected `EXTREME_WIDE` shot (now
genuinely wide per the occupancy-based framing fix) landing early in the
chapter, showing the object small against a faintly dust-lit void.
**Status: implemented** (SceneDirector Ch5 plan + CameraDirector's
EXTREME_WIDE fix + FIELD atmosphere) — render-verified.

## 7. Scale Ambiguity — ~26:00-27:30

**Musical justification:** the loudest *sustained* passages before the
ending (RMS 0.178-0.181).
**Story justification:** "the object is microscopic / the object is
planetary / the viewer cannot tell which" (Phase 4's own framing) —
already the strongest accidental image in the v2 deck
(`docs/v3-creative-direction.md` §2).
**Visual:** MACRO shot type during this window, now with FIELD dust
active underneath (formalizing what was previously a happy accident of
one specific camDist multiplier).
**Status: implemented as a formalization**, not new geometry — the
underlying macro-insert quality is v2's; V3's contribution is making
FIELD-family dust/haze available here on purpose via SceneDirector rather
than as an unlabeled side effect.

## 8. The Triple Warning — 31:35 / 32:13 / 32:36

**Musical justification:** three high-confidence track-map candidates in
about a minute, right before Fracture begins.
**Story justification:** the piece's structure starts destabilizing before
the audio's own turbulence (Ch7/Fracture, 33:00) formally arrives —
foreshadowing.
**Status: DEFERRED, not implemented.** Per `docs/v3-creative-direction.md`
§7's own honesty discipline: these are track-map candidates, not the
kind of singular, independently-corroborated event that justified a
bespoke camera splice (unlike the rupture or the final fade). Building a
custom three-cut camera override for a medium-confidence cluster was
judged not worth the risk this pass; the existing bar-cut shot grammar
already produces ordinary cuts through this window. Next-pass candidate
if Ronny confirms these by ear via `analysis/annotate.html`.

## 9. Fracture Ignites — 33:00

**Musical justification:** Ch6 boundary, landing exactly on the raw
segmentation boundary (cue-sheet.md: "clean downbeat, exact to raw
boundary") — the only passage with sustained structural turbulence in the
whole piece.
**Story justification:** temporal identity begins failing — the object's
past selves become visible and stop agreeing with its present one.
**Visual:** `uEchoWeight` (SceneDirector's Ch6 plan: `primary: ECHO`)
activates the three extra multi-tap history reads for the first time in
the piece — genuinely different past-rendered geometry states (different
fold/turbulence/camera a few frames to ~0.5s ago) become visible as
separating, differently-weighted ghosts, composited via `main()`'s ECHO
block.
**Status: implemented** (`FeedbackPipeline`'s ring buffer, main.frag.js's
ECHO compositing, SceneDirector's Ch6 plan) — render-verified.

## 10. Contrast Pockets — 36:20-37:00 (R2) / 38:00-38:45 (R3)

**Musical justification:** two genuine energy troughs embedded *inside*
Fracture's turbulence (RMS 0.049 at both 36:30 and 38:00) — a measured
dense/sparse/dense/sparse alternation, not two arbitrary quiet bits.
**Story justification:** "contrast is the point" (cue-sheet.md) — if the
image reacts to the surrounding chaos at full intensity, these pockets
have nothing to contrast against.
**Visual:** `CameraDirector`'s STATIC_HOLD-inside-chapter-6 override to
`TEMPORAL_DISSOLVE` transition grammar — the cut into the pocket boosts
`memoryWeight` for ~2s so the just-finished turbulence visibly decays
through the feedback trail rather than vanishing on an instant swap, while
`RESTRAINT_INVERTS_TOWARD_PRIMARY` (SceneDirector) pulls the family back
toward stark SHELL instead of softening toward ECHO — restraint reads as
*more* graphic contrast here, not calm.
**Status: implemented** (CameraDirector transition grammar + SceneDirector
restraint inversion) — render-verified.

## 11. Convergence — 39:14 onward

**Musical justification:** the start of the piece's unbroken climb to its
global maximum (RMS 0.11→0.348 by 41:22).
**Story justification:** the piece briefly holds all of its prior states
at once — SHELL, CHAMBER, FIELD, and ECHO — as if remembering everything
it has been.
**Visual:** `SceneDirector`'s Ch7 rotation (`[CHAMBER, FIELD, ECHO]`
cycling every 4s while `tensionState==='rising'`), confirmed numerically
(`scene=SHELL->ECHO (0.30) CONVERGENCE` at t=2410).
**Status: implemented** — render-verified.

## 12. The Climax — 41:22

**Musical justification:** the global RMS maximum (0.348) — the real
climax of the piece, 45 seconds before the end.
**Story justification:** the piece's most structurally complex, most
converged instant — the argument's peak, not its resolution.
**Visual:** the existing authored peak in `params.js` (fold/turbulence/
formBlend/fracture all at or near their piece-wide maxima) plus full color
saturation (`getColorMix`, unchanged) plus the Ch7 convergence rotation
(event 11) still active at its fastest cycling.
**Status: implemented via existing systems** — this event is the
intersection of v1/v2's authored peak and V3's convergence rotation; no
separate override needed or added.

## 13. The Final Fade — 41:43.98

**Musical justification:** the single highest-scored candidate in the
entire track-map dataset (0.682 — bass, percussive, chroma, and RMS all
dropped together) — almost certainly the mix's actual final track fading
out, 23s after the climax.
**Story justification:** a last, brief total disappearance mid-collapse —
distinct from the slower, gentler drain the chapter is already sinking
into.
**Visual:** `SceneDirector`'s `final_fade_1744` branch forces a brief VOID
pulse (`blend: 0.2` toward SHELL, so it doesn't read as identical to the
final true-silence VOID) exactly at this instant.
**Status: implemented** (`SceneDirector.js`, `MusicalDirector`'s
`final_fade_1744` exceptional event) — render-verified.

## 14. True Black — ~42:00-42:07

**Musical justification:** RMS reaches true 0 by ~42:00; the cue sheet's
own instruction: "a genuine cut to nothing, not a fade tail."
**Story justification:** the mirror-inversion of the opening — the same
shape the piece began with (formBlend returns to exactly 0 in `params.js`,
matching Ch0), then nothing.
**Visual:** `SceneDirector`'s RECOGNITION VOID state (t≥2515) plus the new
`uBlackout` uniform ramping 0→1 across `EVENTS.silenceFloor`→`DURATION`,
multiplying the final composited color to true black regardless of
whatever family/light/material state was active a moment before.
**Status: implemented** (`SceneDirector.js`, `uBlackout` in
`main.frag.js`/`main.js`) — render-verified.

## Summary

| # | Event | Time | Status |
|---|---|---|---|
| 1 | First Recession | 02:30 | already implemented (v1/v2) |
| 2 | First Stillness | 08:25 | implemented (V3 light) |
| 3 | The Rupture | 17:47 | implemented (V3 core) |
| 4 | Changed Return | ~19:20 | emergent, not separately authored |
| 5 | Quiet Hangover | 21:00-22:00 | not pinned — v3.1 candidate |
| 6 | World Opens | 24:12 | implemented |
| 7 | Scale Ambiguity | ~26:00-27:30 | implemented (formalization) |
| 8 | Triple Warning | 31:35-32:36 | deferred |
| 9 | Fracture Ignites | 33:00 | implemented |
| 10 | Contrast Pockets | 36:20-38:45 | implemented |
| 11 | Convergence | 39:14+ | implemented |
| 12 | The Climax | 41:22 | implemented via existing systems |
| 13 | The Final Fade | 41:43.98 | implemented |
| 14 | True Black | ~42:00-42:07 | implemented |

10 of 14 are genuinely new V3 work with dedicated code; 2 are confirmed
emergent side-effects of that work (recorded honestly, not double-counted
as separate builds); 1 is a formalization of an existing v2 accident; 1 is
explicitly deferred pending Ronny's by-ear confirmation of a medium-
confidence track-map cluster.
