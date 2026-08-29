# AUUH — V3.5 Director's Cut: Audit, Fixes, and How to Run the Review

Phase 0 of this pass was auditing the CURRENT repository at HEAD (V3,
commit `f4c91d1`) against what its own docs claimed — not trusting
`docs/v3-creative-direction.md`/`docs/creative-critique-v3.md`/`docs/
hero-events-v3.md` at face value. All four semantic problems the brief
predicted were confirmed present by reading the actual code:

## Audit findings (confirmed by reading code, not by trusting docs)

**A) MusicalDirector's confidence model was too strong.**
`_buildTransitions` in the V3 source literally set `confidence: c.tier ===
"high" ? "confirmed" : "candidate"` — an algorithmic score's top decile was
being labeled with the same word as "a human listened and confirmed this."
`docs/v3-creative-direction.md` itself even used the word "confirmed" this
way in its own commentary, so the docs and the code agreed with each other
— and were both wrong relative to what "confirmed" should mean. **Fixed**:
four explicit levels (`candidate` / `strong_candidate` / `human_confirmed`
/ `structurally_verified`) — see `src/core/MusicalDirector.js`'s header
comment for the full reasoning per level.

**B) `phrasePosition` was hardcoded to `0`** with a comment explaining why
(no verified phrase grid) — this was already honest, not a bug, but the
brief asked for it to actually support real annotations rather than stay a
permanent stub. **Fixed**: `MusicalDirector` now computes a real
`phrasePosition` from human-placed `PHRASE_BOUNDARY` markers when at least
two exist around `t`; falls back to `0` (not fabricated) otherwise.

**C) LightDirector's restraint override alternated NEAR_DARK/SILHOUETTE
every second** (`t % 2 < 1`) — inside the piece's own STILLEST passages,
which is exactly backwards from the doctrine "the strongest restraint
sections should remain almost completely still." Confirmed by reading
`src/core/LightDirector.js` directly; nothing in the V3 docs even
mentioned this existed. **Fixed**: each restraint window now holds exactly
one light state for its full duration (R1→NEAR_DARK, R2/R3→SILHOUETTE, per
the restraint doctrine's own contrast reasoning for the Fracture pockets).

**D) SceneDirector's CHAMBER family label did not mean "camera is inside."**
Confirmed by instrumented testing: at t=1700 (Widening, well inside the
chapter's authored CHAMBER-primary window), the HUD reported
`scene=CHAMBER->FIELD` while `chamberInteriorActive` (a signal that did not
exist until this pass) was `false` — the camera was still outside,
rendering the exterior SHELL surface with CHAMBER's MEMBRANE material and
softer lighting. **Fixed** via the brief's option 1: `main.js` now computes
`chamberInteriorActive` (true only when `shotType === "PASS_THROUGH"`,
which by construction is the only shot type whose distance range crosses
the wall threshold) and exposes it as a field genuinely distinct from
`primaryFamily === "CHAMBER"`. Both are visible in the HUD and in every
director-review annotation's context snapshot, labeled honestly:
`scene=SHELL->CHAMBER(1.00) ... chamberInterior=true` at the rupture,
`scene=CHAMBER->FIELD(0.57) ... chamberInterior=false` in Widening.

## What else changed (items 3-6 of the brief)

- **`src/core/DirectorCueSheet.js`** + **`src/direction/director-cue-sheet.json`**
  (currently `[]` — no cues authored yet, on purpose; see "What happens
  next" below). `main.js`'s `applyUniformsForT` now resolves a cue for the
  current `t` FIRST and applies it as a strict override on top of the
  generative output — fallback priority is DIRECTOR CUE > structurally-
  verified/human-confirmed MusicalDirector event > MACRO/MESO generative
  plan > deterministic fallback, exactly as specified. The generative
  system is untouched and still drives every second with no active cue.
- **`CameraDirector.js`** gained the authored-motion vocabulary (`STATIC`,
  `SLOW_PULL`, `LATERAL_DRIFT`, `ORBIT_PARTIAL`, `PROFILE_LOCK`,
  `MACRO_CRAWL`, plus the pre-existing `PASS_THROUGH`/`VIOLENT_INSERT`/
  `SLOW_PUSH`) as NEW entries in `SHOT_TYPES`, reachable only via an
  explicit `resolveCueCamera(cue, t)` call — none were added to any
  chapter's generative cycle, so the existing per-chapter shot sequences
  (and every render before this pass) are bit-for-bit unaffected. The
  17:47 `PASS_THROUGH` splice is untouched.
- **`LightDirector.js`**/**`MaterialDirector.js`** each export a
  `getLightRecipe(name)`/`getMaterialRecipe(name)` lookup that
  `main.js` uses for cue overrides — no new light/material states, per
  the brief's "keep the six existing lighting languages... do not add
  more."
- **`analysis/annotate.html`** gained the one genuinely missing marker
  type (`build`) alongside its existing nine. `MusicalDirector` now
  normalizes both that tool's pre-existing kebab-case vocabulary and the
  brief's canonical UPPER_SNAKE names onto one internal set (see
  `TYPE_ALIASES` in `MusicalDirector.js`) — the annotation tool did not
  need to be rebuilt, only extended by one option and actually consumed
  for the first time.
- **FIELD and ECHO were not touched.** Per item 7, their current
  limitations (documented in `docs/creative-critique-v3.md` Findings 4 and
  5 — FIELD reads as a glow rather than filling atmosphere; ECHO's
  separation isn't confirmable from stills) stand as-is. No code changed
  in either system this pass.

## Operational note: dev server vs. preview server

Building the proxy renderer surfaced a real incident worth recording:
Vite's dev server (`npm run dev`) broadcasts a full-page reload to **every**
connected browser tab whenever it can't hot-update a file change —
including tabs whose own module graph never imported the edited file. This
silently killed a 42-minute real-time recording mid-run when an unrelated
source file was edited in a separate terminal while the recording page was
still connected to the dev server's HMR WebSocket. **Any long-running
browser automation (the proxy render, or a future frame-exact master
render) must run against `npm run preview` (or an equivalent static
build), never `npm run dev`.** `vite.config.js` now lists `director.html`
and `proxy-record.html` as build entries so `vite build` + `vite preview`
actually serve them (previously only `index.html` was bundled).

## Correctness re-verified

`analysis/seek_determinism_test.mjs`: 6/6 PASS (re-run after the semantic
fixes and cue-sheet wiring landed, including the rupture timestamp
1067.19). Full memory/automated-checks re-run is deferred until after the
proxy render below finishes, to avoid running two Puppeteer/Chrome
automation pipelines concurrently — see `docs/creative-critique-v2.md`
Finding 2 for exactly the resource-contention failure mode that discipline
exists to avoid.

## How to run the Director Review

1. `npm run dev` (or use the already-running dev server).
2. Open **`http://localhost:5173/director.html`** — NOT `index.html`. This
   is a separate local tool, not part of the shipped piece.
3. Click to start. It plays continuously with real audio, exactly like the
   finished piece.
4. Controls (all keyboard, work anywhere except while typing in the note
   field):
   - `SPACE` — play/pause
   - drag the scrub bar to jump anywhere (pauses automatically, re-warms
     the feedback ring so the frame you land on looks correct)
   - `K` KEEP · `B` BORING · `V` TOO_VJ · `W` WOW · `S` NEEDS_STILLNESS ·
     `C` BAD_CAMERA · `L` BAD_LIGHT · `M` MUSICAL_EVENT · `T`
     TRACK_TRANSITION · `D` DROP_RETURN · `R` BREAKDOWN · `O` OTHER — each
     drops a marker at the current playhead time and captures the full
     context automatically (chapter, shot, scene family/blend, light,
     material, MESO state) — you don't need to write any of that down
     yourself.
   - After a marker, the note field auto-focuses — type an optional note
     and press `Enter` to attach it (or `Escape` to leave it blank and
     keep watching).
   - **Ranges** ("boring from 14:20–14:55"): press `[` at the range's
     start, keep watching/scrubbing to the end, then press the type key
     (e.g. `B`) — it records `{start, end}` instead of a single instant.
     `Escape` cancels a pending range-start without creating anything.
   - `E` — export everything to a downloaded `director-notes.json`. Move
     that file to `analysis/director-notes.json` when you're done with a
     session (or partway through — you can re-import it with `I` to
     continue later; every annotation is also auto-saved to this browser's
     local storage as a safety net, but the exported file is the real
     source of truth).
5. Annotations accumulate in the scrollable list at the bottom (newest
   first) — click any row to jump back to that moment.

There is no need to watch it in one sitting. Export/re-import as often as
you like.

## The review proxy

**Rendered and verified.** `reviews/AUUH_v3_5_director_proxy.mp4` — the
full 42:06.9 piece (2526.968s, matches `timeline.js`'s `DURATION` to within
a frame), 1280x720, ~350MB, real audio throughout (spot-checked, mean
-17dB/max 0dB — not silent). Recorded in real time via `canvas.
captureStream()`+`MediaRecorder` (`src/proxy-record.js`,
`analysis/render_director_proxy.mjs`), not the expensive frame-exact
Puppeteer-screenshot pipeline used for the earlier exemplar clips — good
for economical full-length viewing outside the interactive tool (e.g. on a
TV, or scrubbing in QuickTime) before doing the annotated pass in
`director.html`.

`reviews/AUUH_v3_5_director_proxy.manifest.json` — the companion
timestamped shot/event manifest: every one of the piece's 205 generative
camera shots (start/end/type/transition/chapter/scene family+blend/light/
material/`chamberInteriorActive`/MESO snapshot, evaluated at each shot's
own start instant) plus all 6 known structural events (3 restraint
windows, 3 exceptional events with their confidence tier). Generated by
`analysis/generate_shot_manifest.mjs` directly from `CameraDirector`'s
already-deterministic shot-segment table — no rendering involved, runs in
seconds. Useful as a text-searchable index while reviewing (e.g. "where
are all the VIOLENT_INSERT shots" or "what's the confidence on the two
events near the end") without needing to scrub the video to find out.

## What happens next (NOT done in this pass, on purpose)

Per the brief's own instruction: no creative-director pass is being
guessed at without your notes. Once `analysis/director-notes.json` exists,
say so and the next pass will:

1. Read every note.
2. Produce `docs/director-response.md` — for each one: what was happening,
   diagnosis, proposed change, which cue/system it touches.
3. Apply the accepted changes as entries in
   `src/direction/director-cue-sheet.json` — authored cues, not rewrites
   to the generative systems underneath, wherever a cue can solve it.

Nothing will be invented or assumed about what you want changed before
that file exists.
