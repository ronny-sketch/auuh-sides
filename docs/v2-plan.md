# AUUH — V2 Plan

## Audit summary (what exists today)

The whole visual system is ~1,130 lines across 7 files. The honest diagnosis
in the brief is correct and I confirmed it by re-reading every file:

- `src/shaders/main.frag.js` (262 lines) — one raymarched scene: a rounded
  box smooth-unioned with a torus, with a polar fold (symmetry), an fbm
  domain-warp (turbulence), and a voronoi-edge cut (fracture). All three
  are driven by scalar uniforms that come from `getParams(t)`.
- `src/core/params.js` — nine chapters, each a **hand-authored 4-keyframe
  arc** (arrival/transformEntry/transformPeak/departure) for six scalars
  (fold, foldBlend, turbulence, fracture, camDist, contrast). This is
  authored *animation*, not audio response. The only place real audio data
  touches the image is `getRestraintFactor(t)` and `getColorMix(t)` in
  `timeline.js`, which are themselves keyed to three fixed windows and two
  fixed instants derived from one offline pass over the raw mix (RMS,
  spectral centroid/flatness, a beat grid, and a recurrence-based
  segmentation) — see `analysis/analyze.py` and `analysis/audio_analysis.json`.
- `src/core/camera.js` — nine hand-authored angular-speed/elevation/offset
  profiles, one per chapter, plus a restraint-driven hold. No shot
  grammar, no editorial logic, one continuous orbit model throughout.
- `src/core/timeline.js` — the macro chapter map (9 chapters, fixed
  boundaries) plus restraint windows and the two color events. This is the
  only real "structure" the piece has, and it's macro-only.
- `src/core/audio.js` — 31 lines, just exposes `<audio>.currentTime`. No
  live analysis, no stems, no bands.
- Render/QA tooling (`analysis/*.mjs`): Puppeteer drives a headless Chrome
  page, calls a global `__AUUH_RENDER_AT__(t)`, and screenshots the canvas
  — one PNG per frame, muxed into video with ffmpeg afterward. Works and
  is genuinely deterministic (seek-determinism test passes), but writing
  ~1,200 individual PNGs to disk for a 50-second clip is the wrong tool
  for a 42-minute master.
- `docs/final-critique.md` — nine fixed bugs/gaps and one open creative
  question (the single shared primitive). All fixes were shading-model and
  parameter-value corrections, not architectural ones. The architecture
  itself (time-keyed curves, no audio features, no feedback, no shot
  grammar) was never in question in that pass, and is exactly what this
  brief is asking to replace.

**Confirmed diagnosis: the renderer reacts to time, not to music.** Every
number that changes over the 42 minutes is either a hand-placed keyframe or
one of five scalars derived from a single offline pass over the unseparated
mix. There is no MESO timescale at all (no track/phrase awareness) and the
MICRO timescale barely exists (RMS/centroid/flatness only, no bands, no
stems, no attack/release smoothing, no per-instrument mapping).

## What "Pass 1" actually delivers vs. what's future work

This brief specifies ten phases at a depth that is realistically weeks of
work for a small team, not one implementation pass. I'm not going to claim
completion I haven't earned. Here's the honest split, decided by impact per
hour and by what later phases structurally depend on:

**Built in this pass** (in dependency order, since each depends on the last):

1. **Phase 1 — AudioFeatureEngine**, full depth: Demucs 4-stem separation
   (drums/bass/vocals/other) of the real file, a substantially deeper
   offline analysis pass producing band energies, percussive envelopes,
   spectral features, and beat/bar phase, all with real attack/release
   smoothing and robust (percentile-based, not global-min-max)
   normalization, serialized to a compact binary format and consumed by a
   real `AudioFeatureEngine.sample(t)` in the browser. Nothing downstream
   is meaningful without this, so it comes first.
2. **Phase 6 — Temporal feedback**, real ping-pong render targets, both
   seek/QA-safe (warm-up from N seconds before a seek) and master-sequential
   (true uninterrupted history). This is the single highest-leverage visual
   change available — it's what turns a memoryless shader into something
   that can have ghosts, trails, and persistence at all — and it changes
   the render architecture (single draw call → multi-pass) that every
   visual family has to sit inside, so it comes before the visual families
   are rebuilt on top of it.
3. **Phase 3 — Visual architecture**, `VisualDirector` plus **three** of
   the five families built for real: **BODY** (evolved — topology blend
   between two primitive pairs, not just fold/turbulence), **MEMORY**
   (the feedback system from #2, exposed as a first-class family), and
   **FRACTURE** (rebuilt as discrete audio-triggered rupture events, not a
   smooth per-chapter parameter). **INTERIOR/ARCHITECTURE** and
   **FIELD/ATMOSPHERE** are designed below (concrete enough to build from)
   but not implemented in this pass — seeing whether three families
   genuinely composited through a director and real feedback already
   solves "looks like a collection of VJ presets" is the right checkpoint
   before spending the budget on two more scene types.
4. **Phase 4 — Audio mapping**, the specific philosophy in the brief
   (kick→pressure/displacement, bassline→locomotion, mids→topology,
   highs→micro-texture, flux/onsets→rupture, beat phase→cyclic motion,
   downbeats→editorial permission, energy trend→tension not brightness),
   implemented as the actual wiring between `AudioFeatureEngine` and the
   three built visual families.
5. **Phase 5 — Camera/editing grammar**, a real shot-type state machine
   (wide/macro/profile/negative-space/push/insert/static-hold/hard-cut/
   long-hold) gated by downbeats and MESO events rather than one
   continuous per-chapter orbit.
6. **Phase 2 — Track/phrase map, v1**, derived defensibly from the stems
   and a windowed (not single-global-value) tempo analysis, plus a small
   local scrub-and-annotate tool for the boundaries the algorithm can't
   resolve with confidence. Explicitly v1: I will not hallucinate 15 song
   boundaries from vibes.
7. **Phase 9 — QA**, new per-chapter and per-transition preview clips, a
   larger contact sheet, and automated checks (black-frame, white-clip,
   NaN, frame-time spikes, feature-data continuity) on top of the existing
   seek-determinism and memory tests.
8. **Phase 10 — Render pipeline**, replace the PNG-per-frame Puppeteer
   approach with a proper frame-accurate offscreen capture (evaluated
   below) for anything longer than a short preview.
9. **Phase 7/8 — Story/color**, evaluated and adjusted in the context of
   the new visual system, not redesigned from scratch (the chapter names,
   the SIDES concept, the near-monochrome discipline, and the two rationed
   color events all stay; whether the current alien-green hue survives
   contact with real feedback/temporal persistence gets a real look after
   rendering, per the brief's own instruction).

**Deferred, with a concrete design so it isn't hand-waved:**

- **INTERIOR/ARCHITECTURE** family — camera physically enters the BODY's
  own hollow (the smooth-union hull treated as a shell rather than a solid,
  SDF sign-flipped locally so the raymarcher travels through impossible
  interior corridors built from the *same* primitive language as BODY, not
  a new one — this is what keeps it "one world"). Needs its own SDF scene
  graph and a camera-inside-geometry raymarch mode (different miss/hit
  handling than BODY's exterior view). Real work, cleanly scoped, not done
  here.
- **FIELD/ATMOSPHERE** family — a second, cheap raymarched fog-density
  layer (not particles — a particle system is a second render pipeline;
  a volumetric density field sampled along the primary ray is a few dozen
  lines and composites naturally with everything else) modulated by
  high-frequency energy for "dust catching light." Designed, not built.
- 4K master render. Explicitly the brief's own "optionally, once the work
  itself is locked" — the work is not locked after one pass.
- Exhaustive 15-track annotation. The annotation *tool* ships; doing all
  15 tracks' worth of careful listening-and-marking is Ronny's job, not
  something to fake from waveform shape alone.

## Phase 1 — AudioFeatureEngine, concrete design

### Stem separation

`analysis/stems/` (gitignored — regenerable, large): Demucs `htdemucs`
model, MPS-accelerated, 4 stems (drums/bass/vocals/other) from
`audio/AUUH.m4a`. Smoke-tested on a 20s clip (23.4s of audio processed in
~20s on this machine's MPS backend — roughly real-time), so the full
42:06.9 track is expected to take on the order of 35–45 minutes. Running
in the background via `nohup`+`disown` so it survives shell/session
interruption (this session already had one unplanned restart — the
separation must not need to be babysat).

### Feature extraction (`analysis/analyze_v2.py`)

Computed at a fixed hop of **50Hz (20ms)** — fine enough for kick/transient
timing, coarse enough to keep the output small (2526.9s × 50Hz ≈ 126,350
frames).

Per-frame fields (all float32):

| Field | Source | Notes |
|---|---|---|
| `rms` | full mix | existing, kept |
| `sub` | bass stem, <60Hz band energy | new |
| `bass` | bass stem, 60–250Hz | new |
| `lowMid` | other+vocals, 250–500Hz | new |
| `mid` | other+vocals, 500–2000Hz | new |
| `highMid` | full mix, 2–5kHz | new |
| `high` | full mix, 5kHz+ | new |
| `kick` | drums stem, <120Hz onset envelope, attack/release smoothed | new |
| `snare` | drums stem, 150–4000Hz onset envelope, transient-emphasized | new |
| `hats` | drums stem, >5kHz onset envelope | new |
| `percussive` | HPSS percussive component energy (drums+full mix) | new |
| `harmonic` | HPSS harmonic component energy | new |
| `vocalPresence` | vocals stem RMS, normalized | new |
| `centroid` | full mix spectral centroid | existing, kept |
| `flux` | full mix spectral flux (onset-strength derivative) | new |
| `flatness` | full mix spectral flatness | existing, kept |
| `rolloff` | full mix spectral rolloff (85%) | new |
| `contrast` | full mix spectral contrast (mean across bands) | new |
| `onsetStrength` | full mix onset envelope | new |
| `onset` | boolean-ish (0/1 with short decay) onset trigger | new |
| `beatPhase` | 0–1 phase within current beat, from the existing 123.05 BPM beat grid | new |
| `barPhase` | 0–1 phase within current bar (4-beat) | new |
| `downbeat` | 0/1 pulse at bar starts | new |
| `chroma` | 12-bin chroma, full mix, harmonic-filtered | new (12 extra floats/frame) |
| `silence` | 0/1, RMS below a rolling noise floor | new |
| `energyTrend` | RMS smoothed over a long (8-bar) window, for macro tension, never used directly as brightness | new |

### Smoothing and normalization (the brief is explicit about this — it's a
correctness requirement, not a nicety)

- **Attack/release envelopes**: every energy-derived field goes through an
  asymmetric one-pole filter — fast attack (~5ms time constant) so
  transients aren't smeared, slower release (~120ms for percussive
  envelopes, ~300ms for sustained bands) so the visual system gets a
  usable envelope rather than a jittery raw magnitude. Implemented once as
  a shared `attack_release(signal, sr_frames, attack_s, release_s)` helper
  in `analyze_v2.py`, applied per-field with per-field time constants
  (kick/snare/hats get fast release too — they're percussive; bass/mid/high
  bands get slower release — they're meant to read as body/weight).
- **Normalization**: percentile-based, not global min-max. For each field,
  compute the 5th/95th percentile over the full 42 minutes, clip to that
  range, then rescale to 0–1 — a single extreme peak (the climax at 41:22,
  or a transient click) no longer compresses the usable dynamic range of
  the other 41+ minutes. Percentiles are computed once per field, stored
  in a small `feature_norm.json` alongside the binary, so the mapping is
  documented and reproducible.

### Output format

`analysis/audio_features_v2.bin` — a flat `Float32Array`, one fixed-stride
record per frame (record layout documented in
`analysis/audio_features_v2.schema.json`: field order, count, hop size,
frame count, sample rate). Binary instead of JSON because 126,350 frames ×
~30 floats/frame as JSON text would run 25–35MB and be slow to parse in
the browser; as a flat binary it's ~15MB and loads via one `fetch()` +
`ArrayBuffer` with no parse cost.

### `src/core/AudioFeatureEngine.js`

```
class AudioFeatureEngine {
  async load(url) { /* fetch + parse schema + Float32Array view */ }
  sample(t) {
    // linear-interpolate between the two nearest frames; pure function of
    // t, so it's seek-safe the same way getParams(t)/CameraRig already are
    return { sub, bass, lowMid, mid, highMid, high, kick, snare, hats,
              percussive, harmonic, vocalPresence, centroid, flux,
              flatness, rolloff, contrast, onsetStrength, onset,
              beatPhase, barPhase, downbeat, chroma, silence, energyTrend };
  }
}
```

Must be a pure function of `t` (same discipline as the existing
`getParams`/`CameraRig` fix from the previous critique pass) — anything
else breaks seek-determinism, which stays a hard requirement per the
brief's "preserve... seek QA where practical."

## Phase 6 — Temporal feedback, concrete design

Three.js `WebGLRenderTarget` ping-pong pair (`targetA`/`targetB`, swapped
each frame). Render loop becomes two passes:

1. **Scene pass**: the existing raymarch shader (now reading
   `AudioFeatureEngine` values, not just `getParams(t)`), plus a new
   `uPrevFrame` sampler2D uniform bound to last frame's output target,
   used for feedback displacement/ghosting *inside* the scene shader
   (e.g., sampling `uPrevFrame` at a warped UV and blending it under the
   current hit, for trailing silhouettes) — not just a naive full-screen
   crossfade, which would read as motion blur, not as the "ghost geometry"
   the brief asks for. Output goes to `targetA` (or `B`).
2. **Present pass**: a trivial full-screen shader that reads the just-
   written target and draws it to the screen (needed because Three.js
   can't render-to-target and render-to-screen in the same draw call).

**Seek/QA mode**: on any `__AUUH_RENDER_AT__(t)` call, the harness renders
`N` warm-up frames (e.g., 3 seconds at the target fps) starting from `t-N`
before the requested frame, discarding their on-screen output, so the
feedback buffer has plausible history by the time the real frame is
captured — this is what "feedback can reset and warm up from several
seconds before a requested timestamp" means concretely, and it's why
seek-determinism has to be re-verified after this change (same `t`, same
warm-up recipe, must still produce the same pixels).

**Master sequential mode**: no resets, no warm-up — the feedback buffer
just carries forward from t=0 for the entire 42 minutes, which is only
meaningful in the new offline render pipeline (Phase 10), not in
arbitrary-seek QA screenshots.

## Phase 3 — VisualDirector, concrete design

`src/core/VisualDirector.js` sits between `AudioFeatureEngine`/`timeline.js`
and the shader uniforms. Per frame:

1. Read MACRO state (`getTimelineState(t)` — chapter/phase, unchanged).
2. Read MESO state (`track-map.json` — current track/phrase, section type:
   build/drop/breakdown/blend — new).
3. Read MICRO state (`AudioFeatureEngine.sample(t)` — new).
4. Decide **family weights** — e.g., Fracture chapter mostly BODY+FRACTURE
   blended, with MEMORY weight rising during its restraint pockets (R2/R3)
   so the held moments show *decaying trails of the just-finished
   turbulence* rather than a static frame — the brief's "stillness makes
   movement powerful" applied literally: the stillness is the feedback
   settling, not the geometry freezing.
5. Compute the actual shader uniforms per Phase 4's mapping table (below)
   and hand them to the renderer.

Family blending happens in the **scene shader itself** (a single `map()`
that blends SDF fields from BODY and FRACTURE by weight, plus the MEMORY
feedback sampling that's always active at some weight) rather than
rendering each family as a separate full scene and cross-dissolving —
cross-dissolving separately-rendered scenes is exactly what would produce
the "collection of VJ presets" look the brief explicitly rejects. One
`map()`, blended fields, one raymarch.

## Phase 4 — Audio mapping table (the actual wiring)

| Audio feature | Visual parameter | Rationale |
|---|---|---|
| `kick` (envelope) | camera micro-displacement (a few-frame positional kick, not a scale pulse) + local SDF compression near the silhouette | "pressure, weight, spatial displacement" — a hit should feel like something pushed the frame, not like the image got brighter |
| `bass` (band) | slow domain-warp phase / "breathing" scale oscillation of the whole body | "locomotion, structural breathing" |
| `mid` + `vocalPresence` | `foldBlend` and fold-count target (topological identity) | mids/vocal carry melodic/identity information, so they drive the thing that reads as "which side is this" |
| `high` + `hats` | fine bump-map amplitude and grain intensity, not macro turbulence | "micro texture, surface detail" — must not touch the same channel that already carries material grain independent of turbulence (critique finding #4) |
| `flux` / `onset` | discrete FRACTURE trigger events (a crack opens, holds a few frames, heals) — never continuous | "rupture events, cuts, fractures, flashes" |
| `beatPhase` | continuous, small-amplitude cyclic modulation (e.g., a subtle rotational wobble) | "continuous cyclic motion" |
| `downbeat` | camera edit permission gate — shot changes are only *allowed* to land on a downbeat pulse, never mid-bar (except the two intentional off-downbeat cases already documented in `docs/cue-sheet.md`) | "permission for editorial/camera events" |
| `energyTrend` (long-window) | macro contrast/exposure tension curve, MACRO-timescale only | explicitly not per-frame brightness pumping |

Restraint doctrine (existing, preserved): the `restraint` factor from
`timeline.js` multiplies the *entire mapping table's* contribution to
zero, not just turbulence — a restrained passage should refuse kick,
bass-breathing, and fracture triggers alike, which is a strictly stronger
and more honest version of the current (turbulence-only) restraint gate.

## Phase 5 — Camera/editing grammar, concrete design

`src/core/CameraDirector.js` (replaces the current per-chapter
angular-orbit `CameraRig` internals, keeps its public
`update(p) -> {camPos, camTarget, fov}` shape so the shader/main.js
integration doesn't change). A small shot-type state machine:

`WIDE`, `MACRO`, `PROFILE`, `NEGATIVE_SPACE`, `SLOW_PUSH`,
`VIOLENT_INSERT`, `STATIC_HOLD`, `HARD_CUT`, `LONG_HOLD`.

Each chapter gets an authored **sequence** of shot types (not a single
per-chapter orbit profile), and transitions between shots in the sequence
are gated by `downbeat` (per Phase 4) or by MESO events (track transitions,
drops) from the phrase map — never by an arbitrary clock timer. Shot
duration is drawn from a per-type range biased toward the brief's
"stillness makes movement powerful": `STATIC_HOLD` and `LONG_HOLD` get
long minimums (8–20s), `VIOLENT_INSERT` gets a short, sharp maximum
(1–3s), and a shot is not allowed to change again before its minimum
duration regardless of audio events — this is the mechanism that actually
enforces restraint at the camera level, replacing the old
damp-by-restraint-factor approach (kept as a secondary damping on top, not
the primary control).

## Phase 2 — Track/phrase map, concrete design

- Re-run tempo estimation **windowed** (a tempogram over ~30s windows,
  not one global `librosa.beat.beat_track` call) — the existing analysis
  found a suspiciously exact constant 123.05 BPM for the full 42 minutes,
  which either means the whole mix really is beat-matched at one tempo
  (plausible for some genres/DJs) or means the single global estimate
  papered over real tempo changes between the ~15 source tracks. This
  needs checking before trusting track-boundary inference on tempo alone.
- Track-transition candidates: simultaneous drop in `bass`+`percussive`
  energy from the stems (a real crossfade/blend signature) combined with
  a `harmonic`/`chroma` discontinuity (key change) and, where present, a
  tempo-window change. Scored, not asserted.
- `analysis/track-map.json`: ordered list of candidate transitions with a
  confidence score and the evidence (which signals fired), NOT hallucinated
  song titles.
- `docs/musical-cue-sheet-v2.md`: human-readable version distinguishing
  transitions/blends/new-bassline-arrivals/vocal-arrivals/breakdowns/
  returns/drops/major-timbral-events/phrase-boundaries, each citing its
  supporting signal(s).
- `analysis/annotate.html`: a small standalone page (audio element +
  canvas waveform/RMS overlay drawn from the existing analysis data +
  click-to-drop a named marker + export/import JSON) so Ronny can correct
  or densify the map by ear without needing this tool rebuilt or a server.

## Phase 10 — Render pipeline, evaluation

Current: Puppeteer `page.screenshot()` per frame → PNG on disk → ffmpeg
mux. Works, proven deterministic, but the flagship 50s/24fps/1080p clip
alone was 1,200 individual screenshot round-trips and took real wall-clock
minutes; a 42-minute master at 24fps is ~60,700 frames — not a viable
scale-up of the same method.

Evaluated alternatives:

- **Chrome DevTools Protocol screencast** (`Page.startScreencast`) — still
  frame-by-frame PNG/JPEG over the wire, same fundamental cost, not a real
  win.
- **`HTMLCanvasElement.captureStream()` + `MediaRecorder`**, recorded
  inside the page itself and saved via the File System Access API or
  downloaded — real-time only (bounded by however fast the shader actually
  renders each frame, not by our target fps), and Puppeteer would need to
  drive playback in real-time rather than seeking frame-by-frame, which
  reintroduces frame-timing risk exactly where determinism currently saves
  us.
- **Headless offscreen rendering via `node-canvas`/`gl` bindings**, driving
  the same Three.js scene from Node without a browser at all — the
  correct long-term answer (no browser overhead, can render faster than
  real-time, no screenshot round-trip), but it means porting the
  WebGLRenderer setup to run under `headless-gl` or similar, which is real
  porting work and a real risk (WebGL2/extension support in headless GL
  bindings is inconsistent).
- **Keep Puppeteer, but pipe frames directly to ffmpeg via stdin instead
  of writing individual PNG files** — same number of round-trips (no win
  on the actual bottleneck, which is the per-frame `page.evaluate` +
  `screenshot` cost), but removes disk I/O and the temp-file cleanup step,
  and lets ffmpeg encode incrementally instead of after the fact. This is
  the pragmatic near-term win: same architecture, meaningfully less
  overhead and disk usage, no new rendering backend to validate.

**Decision for this pass**: implement the stdin-pipe-to-ffmpeg version
(`analysis/render_master.mjs`) as the immediate improvement, and record
the `node-canvas`/headless-gl path as the real fix for a true 42-minute,
60fps-capable master, to be evaluated once the visual system itself is
further along (no point hardening the render backend before the shader
it's rendering has stopped changing shape every session).

## Verification plan (per the brief's own standard: render it, don't just
reason about the code)

- Re-run seek-determinism after the feedback system lands — with warm-up
  frames now part of what "seeking to t" means, this test needs updating
  (same t + same warm-up recipe ⇒ same pixels), not just re-running as-is.
- Re-run the long-duration memory test — a ping-pong render-target pair
  and per-frame texture uploads (feature engine sampling) are exactly the
  kind of thing that can leak in ways the previous single-draw-call
  version couldn't.
- New automated checks: black-frame detection, white-clipping detection,
  NaN/Inf detection in a captured frame's pixel data, frame-time-spike
  logging during the master render, and a "feature-data continuity" check
  (no NaN/gaps in the binary feature file, envelope values stay in
  [0,1] post-normalization).
- New QA screenshots + a larger contact sheet, one short (15–30s) preview
  per chapter and per major transition, rendered and *looked at* before
  any finding is marked resolved — this was the operating discipline in
  `final-critique.md` and it does not change for v2.
- A new `docs/creative-critique-v2.md` after the first render pass,
  written the same way as `final-critique.md`: ranked, evidenced by an
  actual frame or clip, honest about what's still not working.
