# AUUH — Creative Bible (v0.2)

Status: Structural timestamps below are derived from real analysis of
`audio/AUUH.m4a` (42:06.9, 123.05 BPM constant) — see
`analysis/audio_analysis.json` (beat grid, RMS energy, spectral centroid,
spectral flatness, recurrence-based structural segmentation). This has NOT
been confirmed by ear — I do not have listening access to the track. The
chapter boundaries and restraint passages below are the best-supported
reading of the quantitative data; treat them as a strong first draft to
validate by actually listening, not as ground truth.

## 1. Premise

**Working title:** AUUH — *Sides*

A 42-minute real-time audiovisual piece built entirely in black and white,
depicting the different, often contradictory, sides of a single self. Not a
narrative with characters — a single evolving form (one continuous geometric
"body") that is progressively revealed to be many things at once: rigid and
fluid, ordered and collapsing, singular and multiplied.

The "different sides" idea is not illustrated literally (no faces, no masks).
It is structural: the piece is built from one generative system whose
symmetry, density, and material behavior change chapter to chapter, so the
audience recognizes it is still "the same thing" throughout — the way a person
recognizes themself across contradictory moods. Continuity of the underlying
form *is* the identity claim. Reveal without literalism.

## 2. Visual language reference: Lorn / "Anvil"

Reference point is Lorn's visual world (his own videos and the visual
language his music invites — heavy desaturation, tape-era artifacting,
brutalist/ritual geometry, weight and dread rather than euphoria). Concretely,
that means:

- **Monochrome, not just grayscale.** Crushed blacks, blown highlights, a
  narrow usable midtone band. Contrast is a compositional tool, not a filter.
- **Weight over speed.** Movement is heavy, viscous, occasionally violent —
  not the fast shimmering motion typical of generic "music visualizers."
- **Analog decay, not digital glitch.** Grain, scan-line roll, tape-warp
  wobble, CRT bloom bleed. Avoid datamoshing/pixel-sort clichés — those read
  as "demo," not "artwork" (this is explicitly a failure mode to avoid, see
  `docs/final-critique.md` once written).
- **Sacred-geometry-through-a-broken-lens.** Symmetry (mandala, kaleidoscope,
  radial) is present but is allowed to fail, drift, and re-cohere. Perfect
  unbroken symmetry for more than a few seconds reads as a screensaver —
  deliberate asymmetric intrusion is what keeps it art rather than pattern.
- **Color is rationed to zero for most of the piece.** Color (if used at all)
  is a single, structural event — not a palette shift. Whether and where it
  appears is decided from the real structural analysis (see open item below),
  not fixed to an arbitrary timestamp.

## 3. Structural approach

Chapters are not evenly spaced by clock time. They are derived from the
track's actual structure — tempo changes, energy (RMS) arcs, spectral
character, and the recurrence-based segmentation in
`analysis/audio_analysis.json`. Once that analysis completes, this document's
chapter table gets filled in with real boundary timestamps, not estimates.

Every chapter (per the project brief) must have three phases:

1. **Arrival** — the chapter's defining constraint/behavior is introduced,
   under-explained, at low confidence.
2. **Transformation** — the constraint is pushed, complicated, or broken. This
   is where the chapter argues something, not just plays something.
3. **Departure** — the chapter resolves toward (not identical to) its own
   arrival state, leaving a trace that the next chapter can pick up or
   contradict.

## 4. Camera doctrine

- The camera is an authored character, not a physics-driven orbit. Every
  camera move in the cue sheet has a reason tied to the music (a phrase
  boundary, a lyric/vocal event if present, an energy inflection) — "camera
  drifts because it looks nice" is not an acceptable justification anywhere
  in this project.
- Centered symmetric framing is allowed only as a deliberate, rationed
  choice (e.g., to open or close a chapter) — not the default resting frame.
  Default framing should feel discovered, not centered-by-default.
- Scale must be dramatized across the 42 minutes: extreme macro (texture as
  landscape) to extreme scale-out (the "body" as a distant, small object in
  void) at least once each in the piece, timed to structural high/low points.

## 5. Restraint doctrine

At least three sustained passages (target: 45–90s each) where the image
deliberately does not react to the audio — this is a compositional choice,
not a bug, and must be logged explicitly in the cue sheet with the reason
("holding," "letting the ear lead," etc.). These are chosen at the track's
actual low-energy/sparse sections once identified, not at arbitrary times.

## 6. Real structural arc (from analysis)

Tempo is a constant 123.05 BPM for the full 42:06.9 — no tempo changes to
choreograph around, so structure comes entirely from energy (RMS), timbre
(spectral centroid/flatness), and the recurrence-based segmentation (221
raw boundaries, heavily clustered in specific windows — clustering density
itself is signal: it marks zones of fast timbral change vs. long stable
zones).

Reading of the arc, low-to-high resolution:

- **00:00–02:30** — near silence at 00:00 (RMS≈0, flatness spikes to 1.0,
  i.e. true noise-floor/silence), building unevenly to a first dip at 02:30
  (RMS 0.035, the quietest point in the opening).
- **02:30–08:25** — first sustained oscillating build, RMS climbing into the
  0.10–0.19 range with no long stable boundary gaps (frequent segmentation
  boundaries = the material is actively developing, not looping).
- **08:25–13:30** — the segmentation goes quiet here (few boundaries =
  stable, undeveloping material) while RMS sags to the piece's lowest
  sustained trough, 0.036–0.056 across 12:30–13:30. **Primary restraint
  candidate.**
- **13:30–17:47** — rebuild (RMS back to 0.13–0.14 by 14:30), terminating in
  a singular, unrepeated event: spectral centroid spikes to 8002 Hz at
  17:47 (nothing else in the piece reaches even half that), coinciding with
  a tight cluster of ~15 structural boundaries in under 15 seconds
  (17:36–17:50). One sharp, bright, structurally violent instant.
- **17:47–24:12** — second long stable-ish oscillating zone, RMS mostly
  0.09–0.14, a secondary dip at 21:00–22:00 (RMS 0.069–0.089).
- **24:12–33:00** — third oscillating zone, includes the piece's loudest
  *sustained* passages outside the ending (RMS peaks 0.178 at 26:00, 0.181
  at 27:30) — the closest thing to a mid-piece "chorus" energy.
- **33:00–39:14** — sustained structural turbulence: boundary density goes
  from ~1 per 30–60s (everywhere above) to more than 100 boundaries packed
  into these 6 minutes, in two dense bursts (33:25–34:56, then an extreme
  ~1.4s-alternation burst at 36:12–36:58, then again 38:00–39:14) separated
  by real energy troughs (RMS drops to 0.049 at both 36:30 and 38:00). This
  is genuine, measured fragmentation — not a guess — and it's the piece's
  only passage that behaves this way.
- **39:14–41:22** — steady, unbroken climb: RMS rises from ~0.11 to its
  **global maximum of 0.348 at 41:22**, centroid holding high (2900–2950).
  This is the real climax of the piece, arriving 45 seconds before the end,
  not mid-piece.
- **41:22–42:07** — collapse: by 41:30 RMS is back to 0.073 and centroid has
  fallen to 945 Hz with flatness spiking to 0.55 (noise-like decay); by
  42:00 the piece is at true silence (RMS 0.0). The ending is a mirror-
  inversion of the opening (silence → the piece; the piece → silence), not
  a new idea — see §7.

## 7. Chapter map (v1, from real structure)

| # | Chapter | Window | Duration | Arrival / Transformation / Departure |
|---|---|---|---|---|
| 1 | Emergence | 00:00–02:30 | 2:30 | Near-silence resolving into first pulse; dips back toward silence at 02:30 rather than building cleanly — the self does not announce itself confidently. |
| 2 | First Drive | 02:30–08:25 | 5:55 | Committed oscillating build with no stable plateau — constant small development, never settling into a loop. |
| 3 | Contraction | 08:25–13:30 | 5:05 | Material stabilizes (few structural changes) while energy drains to the piece's first true low point (12:30–13:30). **Restraint passage R1.** |
| 4 | Re-ignition | 13:30–17:47 | 4:17 | Rebuild culminating in the single sharpest, brightest, most structurally violent instant in the piece (17:47). Candidate for the foreshadowing color-flash (§8). |
| 5 | Second Drift | 17:47–24:12 | 6:25 | Long oscillating plateau with an internal dip (21:00–22:00) — development without escalation; the piece is comfortable being "itself" for the longest stretch so far. |
| 6 | Widening | 24:12–33:00 | 8:48 | The loudest sustained passages before the ending (26:00, 27:30) — the closest the piece gets to a mid-piece peak, but still restrained relative to the true climax at 41:22. |
| 7 | Fracture | 33:00–39:14 | 6:14 | The only passage with sustained structural turbulence — real, not staged. Contains **restraint passages R2 (~36:20–37:00) and R3 (~38:00–38:45)**, both genuine energy troughs inside the turbulence, not just loud chaos throughout. |
| 8 | Synthesis | 39:14–41:22 | 2:08 | Unbroken climb to the piece's global energy maximum. Color bleed-in begins here (§8), reaching full saturation at the 41:22 peak. |
| 9 | Departure | 41:22–42:07 | 0:45 | Collapse to true silence, color draining out in lockstep with RMS/centroid decay. Structurally and sonically the exact inversion of Chapter 1 — same material, opposite direction. |

Chapter 6 (8:48) is the longest and is the one place the "arrival /
transformation / departure" internal structure has to be authored most
deliberately (§3) — the audio itself does not subdivide it further, so the
visual system must supply the internal development the segmentation didn't
find. This is a known risk area, flagged in `docs/final-critique.md`.

## 8. Color doctrine (revised — earned, not scheduled)

Color is rationed to two moments, both tied to measured, singular events in
the audio rather than a fixed clock time. The color itself is a single,
unconventional hue wash (implemented as a yellow-green tint applied
uniformly, not split between shadow and highlight) — an early version used
a lighting-based cool-shadow/warm-highlight split-tone, which read as a
conventional cinematic color grade rather than an alien intrusion; see
`docs/final-critique.md` finding #7.

1. **17:47 — flash.** A single, sub-second color intrusion at the piece's
   sharpest spectral outlier (Chapter 4 departure). Chekhov's gun: brief,
   unexplained, gone before it can be parsed. No other color anywhere else
   in Chapters 1–7.
2. **39:14→41:22 — bleed and arrival.** Color desaturation is inverted
   gradually across Chapter 8's climb, reaching full (but still
   contrast-heavy, not "colorful") saturation exactly at the 41:22 global
   RMS peak, then draining back to monochrome/black in lockstep with the
   Chapter 9 collapse to silence.

This replaces the brief's placeholder "24:40 color introduction" — 24:40
falls inside Chapter 6 (Widening), a stable oscillating zone with no
singular event to justify a palette change there. The earned version ties
color strictly to the two moments the data actually marks as exceptional.

## 9. Open items still pending

- [ ] Confirm this reading by ear — I have not listened to the track;
      everything above is inferred from spectral/energy/structural features.
      Boundaries especially in Chapter 6 (no internal segmentation found)
      should be checked against what's actually audible before locking.
- [ ] Bar-level (4/4-assumed) grid is a heuristic (every 4th beat) — has not
      been verified against audible downbeats; if the track isn't in 4/4
      throughout, the cue sheet's bar-aligned events need re-deriving.
- [ ] Final go/no-go on Chapter 6's length — 8:48 with no internal audio
      structure is the single largest authorship burden in the piece.
