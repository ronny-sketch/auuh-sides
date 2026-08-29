# AUUH — Cue Sheet (v1)

Source: `analysis/audio_analysis.json`. Tempo constant at 123.05 BPM
(0.4876s/beat, ~1.951s/bar at assumed 4/4). All timestamps below are the
real beat/bar nearest to the structurally-derived boundary in
`docs/creative-bible.md` §6–7 — not rounded clock times.

Bar grid is a heuristic (every 4th beat from the detected beat grid, not a
verified downbeat tracker) — flagged in the bible as an open item. If the
track isn't in 4/4 throughout, re-derive.

## Chapter transitions (beat-locked)

| Transition | Snapped time | Beat # | Position in bar | Notes |
|---|---|---|---|---|
| Piece start / Ch1 Emergence | 00:02.09 | beat 0 | 1/4 | First detected onset, not 00:00 — true 00:00–02:09 is pre-beat noise floor. |
| Ch1 → Ch2 First Drive | 02:30.19 | beat 306 | 3/4 | Off-bar-1 landing — do NOT force this cut to a downbeat; the audio itself moves mid-bar here. |
| Ch2 → Ch3 Contraction | 08:24.85 | beat 1038 | 3/4 | Also off-bar-1; matches the segmentation's own boundary almost exactly (08:25.34 raw). |
| Ch3 → Ch4 Re-ignition | 13:29.82 | beat 1668 | 1/4 | Clean downbeat landing. |
| Ch4 → Ch5 Second Drift | 17:47.19 | beat 2200 | 1/4 | Coincides with the spectral spike event (see below) — same instant, not a separate cut. |
| Ch5 → Ch6 Widening | 24:11.85 | beat 2999 | 4/4 | Lands on the bar's last beat — treat the cut as anticipatory (land visually 1 beat early). |
| Ch6 → Ch7 Fracture | 33:00.04 | beat 4100 | 1/4 | Clean downbeat, exact to raw boundary (33:00.00). |
| Ch7 → Ch8 Synthesis | 39:13.85 | beat 4879 | 4/4 | Anticipatory cut, same treatment as Ch5→Ch6. |
| Ch8 → Ch9 Departure (climax) | 41:22.00 | beat 5146 | 3/4 | The global RMS peak lands mid-bar, not on a downbeat — the climax is not "on the one," which argues against a clean symmetrical hit here; see camera note below. |
| Piece end | 41:43.41 | beat 5191 (last) | 4/4 | Last detected beat; true silence follows through 42:06.9 — do not place any event after this. |

## Singular events (not chapter boundaries)

| Event | Time | Description | Visual instruction |
|---|---|---|---|
| Spectral flash | 17:47.19 | Centroid spikes to 8002 Hz (piece max, ~2.5x the next-highest reading); coincides with a ~15-boundary micro-cluster in 14 seconds | Single-frame (2–4 frame) full-color flash per creative-bible §8. Everything before and after stays monochrome. No ramp — it must feel like an intrusion, not a transition. |
| Climax peak | 41:22.00 | Global RMS maximum (0.348), off-downbeat (beat 3/4) | Color saturation reaches its full value exactly here (end of the Ch8 bleed-in). Because the peak itself isn't "on the one," the camera should NOT do a symmetrical/centered snap-to here — see camera doctrine, this is a peak that arrives sideways, not one that announces itself. |
| Silence floor reached | ~42:00 | RMS effectively 0, centroid 0 | Full black, no residual bloom/particles carried over from Ch9 — a genuine cut to nothing, not a fade tail. |

## Restraint passages (image does not react to audio)

Per creative-bible §5, minimum three, target 45–90s each. All three below
are real, measured energy troughs — not arbitrarily chosen quiet moments.

| ID | Window | Duration | Real audio evidence | Why the image holds |
|---|---|---|---|---|
| R1 | 12:30.17 – 13:29.82 | 59.6s | RMS 0.036–0.056, lowest sustained trough in the first half; segmentation shows almost no boundaries here (stable, undeveloping material) | Chapter 3 (Contraction)'s whole premise is stabilization under draining energy — reacting to every small fluctuation here would contradict the chapter's own argument. Camera holds a single slow move for the full 59.6s; no cuts. |
| R2 | 36:19.87 – 37:00.06 | 40.2s | RMS trough at 36:30 (0.049) embedded inside Chapter 7's turbulence — a pocket of quiet inside the fragmentation, not the fragmentation itself | Contrast is the point: if the image reacts to the surrounding chaos at full intensity, this pocket has nothing left to contrast against. Under 45s target — extend by holding 5–10s into the following micro-build rather than cutting exactly at the RMS rebound. |
| R3 | 38:00.15 – 38:44.78 | 44.6s | Second trough (RMS 0.049 at 38:00) inside Chapter 7, mirroring R2's shape | Same logic as R2 — this is the second half of a call-and-response pattern the audio itself makes (turbulence / pocket / turbulence / pocket) across Ch7; the visual restraint should mirror R2's held shot language so the pairing reads as a pair, not two unrelated quiet bits. |

Three passages confirmed; R2 and R3 sit close together inside Chapter 7 by
design (the audio itself alternates dense/sparse there) — if a 4th,
more spread-out restraint passage is wanted, Chapter 6 (24:12–33:00,
8:48, no internal segmentation) is the only chapter with no restraint
passage at all and is the candidate to add one to.

## Alignment policy

- Every cut in the table above snaps to the **beat**, not just the second.
  Cuts landing on beat position 4/4 are called out as "anticipatory" —
  visually resolve one beat early so the cut reads as arriving on the
  downbeat rather than trailing it.
- Off-downbeat landings (Ch1→Ch2, Ch2→Ch3, the climax itself) are marked
  explicitly and must NOT be forced onto the nearest downbeat — the source
  material itself is not moving in clean 4-bar phrases at those points, and
  forcing a symmetrical cut there would be scoring against the audio, not
  with it.
