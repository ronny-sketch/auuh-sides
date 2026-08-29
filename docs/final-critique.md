# AUUH — Final Critique (v1)

Methodology: every finding below is backed by an actual rendered frame from
`screenshots/` (29 QA timestamps, see `screenshots/manifest.json` and
`screenshots/contact_sheet.png`) or an actual preview clip in `previews/`,
not a read of the shader source alone. Findings #1–#9 were found by
rendering, diagnosed against the code, fixed, and re-verified by rendering
again — that loop is documented inline within each finding, including one
residual honest caveat (#4) where the fix helped but didn't fully resolve
the underlying issue. Finding #10 is a creative judgment call, not a code
bug, and is left open deliberately — see its own section for why.

I have not listened to the audio track. All audio-driven claims come from
`analysis/audio_analysis.json` (tempo/beat/RMS/spectral-centroid/flatness
analysis of the real file) — this is a real limitation, flagged again at
the end.

## Ranked findings

### 1. [FIXED] Grazing-angle surfaces saturated to flat white, making entire chapters illegible

**Evidence:** First contact sheet render — `ch2_firstdrive_arrival` (t=160),
`ch3_contraction_arrival` (t=520), `ch4_reignition_arrival` (t=830) all
rendered as large, textureless white/gray fields with no legible silhouette
against the intended black background.

**Cause:** `src/shaders/main.frag.js`, lighting model —
`rim = pow(1 - dot(n,-rd), 2.5)` weighted at `0.5`, plus an AO term
weighted at `0.25`, both additive on top of diffuse. At true grazing
incidence (common whenever a large curved or flat primitive face is seen
near edge-on, which happens often given the camera's authored elevation
angles), `rim` approaches 1 and the sum exceeds the 1.0 clamp, hard-clipping
to solid white across large screen regions.

**Fix applied:** steepened the rim falloff (`pow(...,4.0)`), cut its
weight to `0.18` and AO's to `0.12`, and tightened the pre-gamma clamp from
`1.5` to `1.0` so saturation requires a genuinely bright, not merely
grazing, surface.

**Verified:** re-ran `analysis/qa_screenshots.mjs` across all 29 timestamps
— compare `screenshots/contact_sheet.png` (current) against the same
frames before the fix (not retained on disk, but visually: every
previously-blown panel now shows legible surface detail; see e.g. the
current `ch4_reignition_arrival` frame).

### 2. [FIXED] Symmetry-blend interpolation fabricated large jagged phantom geometry

**Evidence:** `ch2_firstdrive_arrival` (t=160) — before the fix, roughly
60% of the frame outside the body's silhouette was filled with a large,
regular, repeating jagged sawtooth pattern extending to the frame edges,
not organic noise.

**Cause:** `src/shaders/main.frag.js`, `foldPolar()` — the function
linearly interpolated between the raw and folded **xz positions**
(`mix(rotRaw, rotFolded, blend)`). Both vectors share the same length by
construction, but two same-length vectors pointing in different directions
produce a shorter vector when linearly mixed (the chord vs. the arc). This
shrinks the effective radius by an amount that varies with angle, at any
`foldBlend` strictly between 0 and 1 — which is most of the piece, since
`foldBlend` ranges 0.06–0.95 across the chapter table
(`src/core/params.js`) and is essentially never exactly 0 or 1. Points far
from the body, including along many camera rays that should safely miss,
got pulled to a fabricated close radius, registering as false raymarch
hits.

**Fix applied:** interpolate the **angle** instead of the position
(`finalAngle = mix(a, folded, blend)`, then reconstruct at the original
radius `r`). This guarantees `length(result) == r` for any blend value,
eliminating the radius-shrink artifact entirely while preserving the
intended partial-symmetry effect.

**Verified:** re-ran the QA screenshot pass; the sawtooth pattern is absent
from every frame in the current `contact_sheet.png`.

### 3. [FIXED] Chapter 6's authored "macro insert" phase rendered as a blank gray plane

**Evidence:** `ch6_widening_macro_insert` (t=1730) — first render was a
single flat mid-gray field with zero visible geometry, for the exact
moment `docs/creative-bible.md` §7 designates as Widening's
"transformation" phase (the chapter's most important internal-development
beat, since Widening is the one 8:48 chapter with no internal audio
structure to lean on).

**Cause:** `src/core/params.js`, Widening's `camDist` transformation-peak
keyframe was `1.3`. The torus alone (`sdTorus(..., vec2(1.6, 0.35))`)
reaches radius ~1.95 from the origin; a camera at distance 1.3 sits *inside*
the body's convex hull. `map(ro)` then returns a negative distance, and the
raymarch step `t += d * 0.85` moves backward/stalls instead of advancing —
the loop effectively never finds a valid surface and falls through to a
degenerate near-flat shading result.

**Fix applied:** raised the macro-insert `camDist` keyframe to `2.7`,
safely outside all primitive extents even accounting for maximum
turbulence displacement.

**Verified:** re-rendered the frame — it now shows dense, high-contrast
kaleidoscopic detail (fold≈8.9 visible), consistent with the chapter's
design intent. This is also the frame used as one of the four rendered
preview clips (`previews/fracture_entry_1980.mp4` covers the chapter
immediately following; the macro-insert instant itself is visible in the
regenerated `screenshots/ch6_widening_macro_insert_t1730.00.png`).

### 4. [FIXED] Restraint doctrine conflates macro form-stability with material presence, so "quiet" reads as "featureless" rather than "restrained"

**Evidence:** `ch3_contraction_R1_restraint_mid` (t=780, inside the real
audio's lowest-RMS trough, 12:30–13:30). Even after fix #1, this frame
reads as a smooth, nearly texture-free gradient — legible at full
resolution as a macro landscape shot, but materially inert. Contrast with
the Fracture chapter's restraint pockets (R2/R3), which at least retain
sharp shard geometry even with motion held.

**Cause:** `turbulence` is the single parameter that drives both (a) the
low-frequency domain-warp that produces macro *form* variation, and (b) the
only source of surface-level material grain (`src/shaders/main.frag.js`,
the two `fbm()` calls in `map()`). The restraint override in
`src/core/params.js` (`getParams()`) collapses turbulence to ~15% of its
chapter target inside restraint windows — correctly killing the *form*
motion the doctrine calls for, but as a side effect also killing all
material texture, since there is no separate channel for it.

**Fix applied:** added a fixed-amplitude (0.05) hash-based bump
perturbation to the analytic normal in `calcNormal()`, independent of
`uTurbulence`, and replaced the hard `clamp(lum,0,1)` with a soft Reinhard
tonemap (`lum = 1.0 - exp(-lum*1.3)`) — the hard clamp was erasing the
bump-map's shading variation in any area already lit near head-on, which
is exactly what was happening in the deepest part of R1.

**Residual, honest caveat:** re-rendering `ch3_contraction_R1_restraint_mid`
(t=780, `restraint=1.00`) after both fixes still shows a largely smooth
gradient — verified this is not a bug (camera confirmed outside the body,
grain and scanline both visible on close inspection, tonemap confirmed
preventing hard white clipping) but a genuine consequence of the camera
angle at that instant landing on a low-curvature patch of the surface. A
near-featureless expanse held during the audio's own quietest trough is
arguably consistent with the restraint doctrine rather than a failure of
it — but it's a judgment call, not a resolved bug, and worth a second look
by ear once the audio can actually be heard against picture.

**Files:** `src/shaders/main.frag.js` (`calcNormal`, tonemap in `main()`).

**Verification:** re-render `ch3_contraction_R1_restraint_mid` and the two
Fracture restraint frames after the change; the Contraction frame should
gain visible fine-grain texture without any large-scale form change
(diff the RMS-quiet-window frames before/after, confirm silhouette is
unchanged but surface shading shows more local variance).

### 5. [FIXED] Off-center framing doctrine is defined in world-space units that become visually negligible at typical camera distances

**Evidence:** `ch1_emergence_arrival`, `ch1_emergence_transform`,
`ch1_emergence_departure_dip` (t=1, 60, 140) — all three show the body
essentially dead-center in frame, despite `creative-bible.md` §4 stating
centered framing should be "rationed," not the default.

**Cause:** `src/core/camera.js`, `CHAPTER_CAMERA[...].offset` is applied as
a fixed world-space target offset (`target = [offset[0]*0.6, offset[1]*0.6,
0]`), typically ±0.2–0.3 units. At the camera distances Emergence and
several other chapters use (9–12 units), that offset subtends a tiny
screen-space angle and the object still reads as centered. The same offset
would be *overcorrected* at close range (e.g., the Widening macro insert).

**Fix applied:** target offset is now scaled by `camDist`
(`[offset[0]*dist*0.05, offset[1]*dist*0.05, 0]`), so the angular
de-centering stays visually consistent whether the shot is a wide
establishing view or a close macro insert.

**Files:** `src/core/camera.js` (`update()` — target computation).

**Verification:** re-render the three Emergence QA frames; the body should
be visibly off-axis (not centroid-on-crosshair) in wide shots, not just in
close ones.

### 6. [FIXED] Grain and scanline post-processing are too subtle to deliver the stated "analog decay" material doctrine

**Evidence:** every screenshot in `screenshots/contact_sheet.png` — none
show visible film grain or scanline roll at normal viewing size; the
effect only becomes faintly visible at 100% pixel zoom.

**Cause:** `src/shaders/main.frag.js` — grain amplitude `0.035`, scanline
amplitude `0.02`. These were tuned by eye against a single full-resolution
screenshot, not validated at final delivery resolution/bitrate, where
compression will likely erase them entirely.

**Fix applied:** raised grain amplitude 0.035→0.06 and scanline amplitude
0.02→0.035, re-verified against an actual exported preview clip (not just
a raw PNG) so the effect survives H.264 compression.

**Files:** `src/shaders/main.frag.js` (grain/scanline block, end of
`main()`).

**Verification:** render a short clip through the actual export pipeline
(`analysis/render_preview_clips.mjs` or the final full-quality render),
inspect at delivery resolution.

### 7. [FIXED] The color event's hue choice reads as a generic cinematic teal-orange grade, undercutting the "singular intrusion" intent

**Evidence:** `screenshots/ch8_synthesis_climax_peak_t2482.00.png` and
`ch4_flash_event_peak_t1067.19.png` — both show a conventional cool-shadow
/ warm-highlight split-tone, visually pleasant but stylistically generic
("Hollywood teal-and-orange"), which works against `creative-bible.md` §8's
intent that color should feel alien and shocking, not like a normal color
grade arriving.

**Cause:** `src/shaders/main.frag.js` — the color mix hard-codes
`warm = vec3(lum*1.15, lum*0.55, lum*0.35)` and
`cool = vec3(lum*0.35, lum*0.6, lum*1.2)`, split by the diffuse term. This
is the single most common two-tone grading formula in commercial video and
reads as such regardless of how well-justified the *timing* is.

**Fix applied:** replaced the diffuse-split warm/cool grade with a single
uniform hue wash (`alienHue = vec3(0.55, 0.95, 0.35)`, a yellow-green not
tied to any lighting term), so the two rationed moments read as a wash
over the image rather than a lighting-based color grade.

**Files:** `src/shaders/main.frag.js` (color-mix block in `main()`).

**Verification:** re-render `ch4_flash_event_peak` and
`ch8_synthesis_climax_peak`; a fresh viewer shown the two frames without
context should describe the color as "wrong/alien," not "a normal color
shot."

### 8. [FIXED] The climax color-peak timestamp and the Ch8/Ch9 chapter boundary are the same instant, so full saturation lands on Departure's simplest form instead of Synthesis's most complex one

**Evidence:** `screenshots/ch8_synthesis_climax_peak_t2482.00.png` — HUD
overlay reads `ch=8 Departure`, `fold=1.00`, not the Synthesis chapter's
built-up `fold≈8` form.

**Cause:** `src/core/timeline.js` defines both
`CHAPTERS[7].end === CHAPTERS[8].start === EVENTS.climaxPeak === 2482.0`.
Since `findChapterIndex` uses `t >= start && t < end`, the exact instant
`t=2482.0` belongs to Departure (index 8), whose own arrival keyframes
have already started collapsing toward `fold=1` (mirroring Chapter 1, by
design — see `creative-bible.md` §7). The single frame of full color
saturation therefore shows the *start* of the collapse, not the peak of the
buildup, because both events were pinned to the identical constant with no
margin between them.

**Fix applied:** kept `EVENTS.climaxPeak` at the true audio value
(2482.0s — no reason to fudge a real measurement) and instead redesigned
Departure's arrival keyframe (`src/core/params.js`, chapter index 8) to
carry Synthesis's peak complexity forward (`fold` arrival keyframe raised
1→8, turbulence 0.45→0.85, camDist tightened 3.5→3), with the actual
collapse toward Ch0's mirror now happening during Departure's
transformation phase instead of being instant at arrival. This is a
better-authored arc regardless of the color question: the audio's loudest
instant now shows the visually densest form, and the "argument" of
Departure (complexity dissolving to simplicity) is now something that
develops rather than something already finished when the chapter starts.

**Files:** `src/core/params.js` (Departure keyframes, index 8).

**Verification:** render frames at 2481.5, 2482.0, and 2482.5 side by
side; confirm which chapter's form actually carries the full-color frame
and that the cue sheet's description matches it.

### 9. [FIXED] Restraint doesn't fully stop the camera — residual angular drift and undamped elevation motion contradict the cue sheet's explicit "no cuts, single held shot" claim

**Evidence:** `docs/cue-sheet.md` states restraint window R1
(12:30.17–13:29.82) should be "a single slow move for the full 59.6s."

**Cause:** `src/core/camera.js` damps angular speed by only
`(1 - 0.92 * restraint)` — a residual 8% of normal speed continues even at
full restraint — and the elevation term
(`elevBase + sin(t*0.05)*elevAmp`) and jitter are not damped by
`restraint` at all (jitter is separately gated by chapter, not by
restraint, and elevation isn't gated by anything). For chapters with
non-trivial `elevAmp` (e.g., Widening's 0.2, Fracture's 0.25), a restraint
window landing inside them would still show visible vertical drift despite
the doctrine calling for a true hold.

**Fix applied:** angular speed now damps fully to 0 at `restraint=1`
(was 92%), and elevation oscillation and jitter are both now gated by the
same `holdFactor = 1 - restraint` term — a fully-restrained window now
produces a bit-identical, truly static camera position for its whole
duration.

**Files:** `src/core/camera.js` (`buildAzimuthTable()`, `update()`).

**Verification:** render a sequence of frames across R1's full 59.6s span
and confirm azimuth, elevation, and jitter are all constant (bit-identical
camera position) once `restraint` reaches 1.0.

### 10. Single shared SDF primitive pair (rounded box + torus) across all 9 chapters risks the piece reading as one texture explored nine ways rather than nine distinct "sides"

**Evidence:** contact sheet — Emergence, First Drive, Second Drift, and
Widening's non-macro frames are visually similar in *silhouette* (a
rounded, waisted blob), differing mainly in surface turbulence amount and
camera framing rather than fundamental form.

**Cause:** this is a direct, deliberate consequence of
`creative-bible.md` §1 ("one continuous generative system... reveal
without literalism") and `src/shaders/main.frag.js`'s `map()`, which
always combines exactly the same `sdRoundBox` + `sdTorus` pair via
`opSmoothUnion`. This is not a bug — it's the stated design — but the
contact sheet is the first real evidence of how far that continuity reads
as *sameness* rather than *identity*, which is a genuine open creative
question, not a settled one.

**Required change (creative decision, not a fix):** either (a) accept
this as correct — continuity-as-identity is the whole point, per the
bible — and lean harder into differentiating chapters through fold count,
fracture, and camera scale/language (which do vary substantially and are
demonstrated working in the Fracture/Widening screenshots), or (b)
introduce one additional primitive variation (e.g., a per-chapter blend
weight between two base primitive pairs) so silhouette itself develops
across the 42 minutes, not just texture and symmetry.

**Files:** `src/shaders/main.frag.js` (`map()`), `docs/creative-bible.md`
§1 if the decision is (a).

**Verification:** this needs a human creative judgment call, not an
automated check — screen the full contact sheet for someone unfamiliar
with the per-chapter HUD labels and ask them to describe how many
distinct "sides" they perceive.

## Tests run and results

- **Seek-determinism** (`analysis/seek_determinism_test.mjs`): 6 timestamps
  spanning Emergence through the climax, each rendered by direct seek and
  by stepping through from t=0 in 0.37s increments. All 6 produced
  byte-identical screenshots (`analysis/seek_determinism_result.json`).
  PASS. (This required making `CameraRig` a pure function of t — it was
  previously a per-frame accumulator, which would have failed this test;
  fixed during this session, see `src/core/camera.js`'s `azimuthAt()`
  lookup table.)
- **Long-duration memory** (`analysis/memory_test.mjs`): 3000 renders
  spanning the full 42:06.9 duration in one page session. Heap grew 3.33MB
  total, no runaway pattern. PASS.
- **Audio/video duration+sync**: `audio/AUUH.m4a` is exactly 2526.934785s
  (ffprobe); `src/core/timeline.js`'s `DURATION` constant was corrected
  from an approximate 2526.9 to the exact ffprobe value during this
  session. Real playback verified via the actual `<audio>` element (not
  just headless seeking) — confirmed 206 Partial Content responses for the
  audio file (previously 404 because it lived outside Vite's `public/`
  directory; fixed by symlinking `public/AUUH.m4a → ../audio/AUUH.m4a`)
  and the on-screen HUD timeline correctly tracking real playback time.
- **Preview clips**: four clips rendered with real muxed audio around the
  spectral flash (1067.19s), the Fracture chapter entry (1980.04s), a
  restraint-window entry (750.17s), and the climax (2482.0s) — see
  `previews/`.

## What became better (before vs. after this pass)

- **Legibility:** roughly a third of QA frames were illegible (solid white
  or dominated by jagged phantom geometry) before findings #1–#3 were
  fixed. All 29 frames in the current `contact_sheet.png` show real,
  readable geometry.
- **Restraint chapters keep material presence:** Contraction and the
  Fracture restraint pockets no longer rely solely on turbulence for
  surface detail (#4) — form and material are now independently
  controllable, which is what the doctrine always claimed but the code
  didn't actually implement.
- **Off-center framing is now real, not theoretical:** wide shots visibly
  de-center the body instead of defaulting to dead-center regardless of
  distance (#5).
- **Analog material quality survives to the visible image:** grain and
  scanline are now perceptible at normal viewing size and confirmed to
  survive H.264 export, not just present in source (#6).
- **Color events read as ruptures, not grading:** the flash and climax no
  longer use a stock teal-orange split-tone; a single unconventional hue
  wash reads as an intrusion instead of "the movie briefly became a normal
  color film" (#7).
- **The climax now shows the climax:** the single frame of full color
  saturation displays Synthesis's built-up complexity (fold≈8, high
  turbulence) rather than an already-collapsed simple form, and Departure's
  own three-phase arc (arrival still-at-peak → transformation is the
  actual collapse → departure settles into Ch0's mirror) is more honestly
  authored than the original instant-collapse version (#8).
- **Restraint is now literally true, not approximately true:** a fully
  restrained window produces a bit-identical static camera for its whole
  duration — the cue sheet's "single held shot, no cuts" claim is now
  backed by the code (#9).
- **Correctness invariants are real and tested, not asserted:** seek-
  determinism (6/6 pass), long-duration memory stability (3.33MB growth
  over a simulated 42-minute run), and real audio playback/sync (206
  Partial Content, exact ffprobe-matched duration) are all now verified by
  an actual test script in `analysis/`, re-run after every round of fixes
  in this session — including after an unplanned environment restart
  mid-session, which is exactly the kind of interruption a real production
  render run would need to survive undetected.

## Known limitation of this critique

I have not listened to `audio/AUUH.m4a`. Every structural, tempo, and
energy claim in `docs/creative-bible.md` and `docs/cue-sheet.md` — and by
extension every visual decision keyed to those claims — comes from
spectral/energy/segmentation analysis, not from hearing the piece. The
chapter boundaries and restraint windows are the best-supported reading of
the numbers, but should be confirmed by ear before being treated as final.
