# AUUH — Creative Critique v2

Ruthless self-critique of the v2 rebuild, written the same way
`docs/final-critique.md` was: ranked, evidenced by an actual rendered
frame/clip, not by reading the source and assuming it's correct. Per the
brief's own standard — "do not call something fixed because the source
code sounds plausible... render it and inspect the result" — every finding
below was caught or confirmed by actually looking at output.

## Finding 1 [FIXED, the hard way]: a real regression that shattered chapters that should have been smooth, found only by rendering

**Evidence:** `ch0_emergence` preview clip, t=17s — `fold=1.00, form=0.00,
turb=0.08, frac=0.08`, a parameter combination that should render as the
simple, barely-perturbed rounded-box-plus-torus body every screenshot in
this project has shown for Emergence since the very first v1 session.
Instead it rendered as a dense field of dozens of small fractured shards —
the Fracture chapter's signature look, not Emergence's.

**Root cause:** `VisualDirector.sample()` (Phase 4's audio-mapping table)
adds `f.onset * 0.5 * hold` on top of every chapter's own fracture
baseline — "flux/onset -> discrete rupture events," exactly as designed.
But Emergence's v1 baseline fracture was always *exactly* 0, and the
shader's crack-cutting code path (`main.frag.js`, inside `map()`) was only
ever gated by `uFracture > 0.001`. Because that baseline was pinned to
precisely 0 throughout all of v1, the crack code never actually ran for
Emergence, and a latent bug in `opSmoothSubtraction`'s behavior at small
nonzero fracture values was never exposed. The instant VisualDirector
started adding even a small onset-driven bump, fracture crossed the gate
into a range where the bug fired: the smooth-subtraction blend radius
(0.05) is small relative to how far negative "crack" gets even at low
fracture, which saturates the blend factor to 1 and applies the cut at
*full* strength regardless of how small `uFracture` actually is.

**Two failed fix attempts before the right one — documented because both
looked reasonable and both were wrong, which is the actual lesson here:**

1. Raising `crackWidth`'s low end (0.4 → 1.4) to "make cracks rarer at low
   fracture." Rendered a **completely black frame** instead — a crackWidth
   larger than the blend radius saturates the same blend factor to 1 from
   the *other* direction, which (per `opSmoothSubtraction`'s actual
   algebra) carves the entire field to empty space, not "fewer cracks."
2. Linearly blending the cracked and uncut **distance fields**
   (`mix(d, dCracked, smoothstep(...))`). Still rendered fully shattered at
   `frac=0.08` — mixing two SDFs doesn't cleanly interpolate a boolean-like
   cut operation; the blended field produces its *own* small-scale ripples
   rather than "a little bit of cracking."

**Actual fix:** bias the `crack` value strongly positive when fracture is
low (`crack = edge - crackWidth + (1.0 - gate) * 10.0`, where
`gate = smoothstep(0.0, 0.5, uFracture)`). Feeding a large positive value
into `opSmoothSubtraction`'s first argument drives its blend factor to 0,
which is a mathematically exact "no cut applied," not an approximation.
Verified at both ends: Emergence at t=17 now renders the correct smooth
body; Fracture chapter at t=2100 (`frac=0.82`) still renders full heavy
shattering, unchanged from before.

**Why this matters beyond the one bug:** this is exactly the failure mode
the brief's "not solved by making main.frag.js larger" warning and its
"render it, don't just reason about the code" instruction exist to catch.
The fix that *sounded* right (attempt 1) and the fix that *sounded*
principled (attempt 2 — blend fields, don't hack a magic number) were both
wrong in ways only visible by rendering the actual frame. Every future
change to shared low-level shader math needs the same discipline: render
the full range of the parameter that changed, not just the value that
motivated the change.

**Files:** `src/shaders/main.frag.js` (`map()`, the fracture-cut block).

## Finding 2 [process bug, not a rendering bug]: the QA screenshot script stalled mid-run, apparently from resource contention with other automation processes

**Evidence:** a full-resolution QA screenshot pass stalled after 18 of 58
frames, with the background shell showing essentially zero CPU-time growth
over several checks. `ps aux` at the time showed ~48 Chrome-related
processes alive simultaneously — leftovers from several successive
Puppeteer runs in this session (memory tests, automated checks, preview
renders) whose browser instances weren't all being cleanly torn down
between runs, compounded by this machine's chrome-devtools-mcp inspector
session also holding its own Chrome instance open.

**What went wrong in the recovery, worth flagging on myself:** the first
cleanup attempt used `pkill -9 -f "Google Chrome"` — a pattern broad enough
to match the user's actual, non-automation Chrome browser window, which
then visibly relaunched (confirmed via `ps aux`: the new process tree
included `--extension-process` and `--top-chrome-webui` renderer types,
which only appear in a real user browser session, never in a
`--headless=new` Puppeteer-launched instance). This was flagged to Ronny
immediately rather than treated as an inconsequential detail. The fix
going forward: match on `--headless=new` specifically
(`pkill -f -- "--headless=new"`) for any future cleanup of stray
automation Chrome processes, never a bare `"Google Chrome"` substring —
verified after the fact that this narrower pattern matches zero of the
user's real browser processes.

**Files:** none — process/tooling discipline, not application code. Noted
here rather than silently corrected because it's a real mistake made
during this session, not a hypothetical one.

## Finding 3: the two hardest architectural correctness properties (seek-determinism, memory) required test *redesigns*, not just re-runs, and that's a durable lesson about this kind of system

Both `analysis/seek_determinism_test.mjs` and `analysis/memory_test.mjs`
had to be rewritten mid-pass because the v1 versions tested the wrong
thing once temporal feedback existed:

- The v1 determinism test simulated "arriving by stepping through many
  small increments from t=0" and compared that to a direct seek. Once
  `__AUUH_RENDER_AT__` started doing a full reset + ~90-frame feedback
  warm-up on every call (Phase 6), repeating that call thousands of times
  to simulate stepping through the timeline multiplied the warm-up cost by
  90x for no representativeness gain — it would have taken well over an
  hour and tested a code path (repeated full reset-and-rewarm) that no
  real usage pattern actually exercises. Rewritten to test the property
  that's actually load-bearing post-feedback: does `__AUUH_RENDER_AT__(t)`
  produce identical pixels regardless of call history/order, since it
  always fully resets before warming up.
- The v1 memory test used `__AUUH_RENDER_AT__` for the same reason and hit
  the same 90x multiplier. Rewritten to use `__AUUH_RENDER_SEQUENTIAL__` —
  which is also the more *honest* choice, since that's the actual code
  path the eventual 42-minute master render will use, not the seek path.

**Why this is a finding and not just a changelog entry:** both rewrites
were necessary because the *meaning* of "render at time t" changed when
feedback was introduced, and the tests encoded assumptions from before
that change. Any future architectural change that alters what a frame
depends on (a third render pass, MESO-aware state, etc.) needs the same
scrutiny — checking that the existing tests still test the right thing,
not just that they still pass.

## Finding 4 [open]: automated pixel-statistics checks did not catch Finding 1

**Evidence:** `analysis/automated_checks.mjs` (black-frame/white-clip/NaN
detection across 150 sampled timestamps) reported 0 issues in a run that
happened *before* Finding 1 was discovered and fixed — meaning the
shattered-Emergence bug was live in the build at the time and the
automated check passed cleanly anyway.

**Why:** the shattered render isn't black, isn't white-clipped, and
contains no NaN — it's a normally-exposed, structurally *wrong* image.
Pixel-statistics checks can only catch exposure-extreme failures, not
semantic/geometric ones. This is an honest limitation, not something fixed
in this pass — a real fix would need either reference-frame comparison
(expensive to maintain, brittle to intentional changes) or a
learned/perceptual anomaly detector (real scope, not attempted here).
Recorded so it isn't mistaken for a solved problem: **the automated checks
are a floor, not a substitute for actually looking at rendered output**,
which is exactly the discipline this document and `final-critique.md`
both exist to enforce.

## What's genuinely working, confirmed by rendering (not just by reading the code)

- **BODY topology blend** (Phase 3): Synthesis at `formBlend=0.70` renders
  a visibly distinct, wider, more crystalline silhouette compared to
  Emergence/First Drive's rounded-blob silhouette at `formBlend=0`— a real,
  camera-visible difference in the underlying identity, not just texture.
- **AudioFeatureEngine end-to-end**: confirmed loading (126,345 frames) and
  actually modulating rendered output — `grainBoost` and `fracture` values
  visibly differ frame-to-frame in ways that track the real audio (e.g.
  `grain=1.24-1.52` varying with high/hats energy, not fixed).
  Frame values were cross-checked against the HUD overlay, not assumed
  from the code.
- **CameraDirector shot grammar**: confirmed producing varied,
  chapter-appropriate shot types across a spread of ~10 timestamps
  (STATIC_HOLD during Contraction's restraint, MACRO/SLOW_PUSH during
  Synthesis, EXTREME_WIDE at the piece's very start and very end) rather
  than one continuous orbit. The tail beyond the last bar in the beat grid
  (Departure's final ~25 seconds, past 2501.97s) correctly falls back to
  extending the last-assigned shot rather than crashing or producing
  undefined behavior — verified by direct query, not assumed from the
  fallback code's existence.
- **Correctness invariants hold on the full v2 stack**: seek-determinism
  (6/6 pass, redesigned test), long-duration memory stability (3.39MB
  growth over a simulated 42-minute run via the real master-render code
  path), and automated pixel checks (0 issues across 150 samples, with the
  explicit caveat in Finding 4 about what that does and doesn't prove).

## Finding 5: EXTREME_WIDE doesn't always look wide — shot-type distance multipliers stack on top of the chapter's own macro camDist curve, not an absolute frame

**Evidence:** `previews/v2/ch5_widening_macro.mp4` at t=1702 and t=1714 —
HUD reads `shot=EXTREME_WIDE` at both instants, but `camDist=3.2-3.24`,
and the body fills nearly the entire frame. This is Widening's macro-
insert region, where the chapter's own authored `camDist` arc is already
very small (per `params.js`, dipping toward ~2.7 at its transformation
peak). `EXTREME_WIDE`'s multiplier (1.8-2.2x, see `CameraDirector.js`
`SHOT_TYPES`) is applied *relative to* that already-small base, so the
"widest" shot type available still produces a close-up during this window
— the shot grammar modulates the chapter's own distance curve rather than
imposing an absolute framing, which is the correct architecture (per
`docs/v2-plan.md`'s "each chapter keeps its own underlying handwriting")
but means a shot type's name doesn't always match what it visually
delivers when it lands inside a chapter's own extreme moment. Not a bug —
a real interaction between two systems that both have legitimate authority
over camera distance — but worth knowing before assuming "EXTREME_WIDE"
means the same thing everywhere it appears in the shot-segment table.

**What IS confirmed working in motion, not just single frames:** comparing
the same two timestamps, azimuth has genuinely rotated (the fold-seam line
crossing the body moved position), and `fold`/`turbulence` continue
evolving smoothly (8.35→8.65, 0.58→0.61) — this is real, continuous camera
and parameter motion across the clip, not a static frame sampled twice.

## Verdict on the questions this section was left open for

- **INTERIOR/FIELD absence, felt in motion**: yes, still felt. Watching
  full 18-second spans confirms the piece currently has exactly one kind
  of spatial experience (looking at an object from outside, at varying
  distance/angle) for the entire 42 minutes. The BODY topology blend gives
  real silhouette variety (confirmed above), but there's no moment where
  the camera's *relationship* to the form changes qualitatively — it never
  goes from "observing an object" to "occupying a space," which is exactly
  what INTERIOR was designed to provide. This remains the most important
  deferred item for the next pass.
- **Camera grammar in motion**: reads as more than "a fancier orbit" —
  the STATIC_HOLD/VIOLENT_INSERT alternation visible across the Fracture
  clip and the genuine azimuth/distance drift confirmed above are real,
  bar-gated editorial decisions, not a single continuous function. Finding
  5 is the honest caveat: the grammar's *labels* imply more absolute
  control over framing than the system actually has.
- **MEMORY/feedback trails, in motion**: visible but subtle at the
  `memoryWeight` values most chapters actually reach (0.1-0.2 outside
  restraint windows) — confirmed present (soft double-edges on moving
  silhouettes in the Fracture and Widening clips) but not yet strongly
  "dreamlike." Raising baseline `memoryWeight` moderately, or making it
  audio-reactive (per `docs/v2-plan.md`'s noted future work — currently
  it's chapter-authored, not MESO/MICRO-driven) is the likely next lever
  if stronger persistence is wanted.
way single-frame screenshots can't fully show.
