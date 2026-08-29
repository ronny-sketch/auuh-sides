# AUUH — Audio Master Report

Measured, not inferred — see `analysis/audio-master-report.json` for the
raw structured data and the exact `ffprobe`/`ffmpeg` commands used.

## Source

`audio/AUUH.m4a`: AAC-LC, 44.1kHz, stereo, 320kbps, 2526.934785s,
96.8 MiB. This duration matches `src/core/timeline.js`'s `DURATION`
constant exactly — no drift between the two.

## Measured levels

| Metric | Value |
|---|---|
| Integrated loudness | -16.22 LUFS |
| Loudness range (LRA) | 7.20 LU |
| True peak | **+0.11 dBTP** |
| Sample peak | +0.004 dB (2 samples) |
| DC offset | 0.000004 (negligible) |
| NaN / Inf / denormal samples | 0 / 0 / 0 |
| Head silence | 0.00s – 2.07s |
| Tail silence | 41:43.69 – 42:06.89 (23.2s) |

The head/tail silence windows independently corroborate
`docs/cue-sheet.md`'s own boundaries (first onset ≈00:02.09, silence floor
≈42:00) — a real cross-check between two differently-derived
measurements, not a new claim.

## Findings and decisions

**True peak exceeds 0 dBTP by 0.11 dB.** This is the one measured
condition in the whole file that constitutes an actual technical
reason to touch the audio at all, per the brief's own standard
("only perform gain/limiting if there is a measured technical
reason"). It matters only for **lossy re-encoding** — decoding AAC and
re-encoding it (or transcoding to another lossy codec) risks the
reconstruction filter's ringing pushing an already-over-peak signal into
audible inter-sample clipping. **Decision: a transparent -1.0 dBTP
ceiling is applied only on the audio feeding the two lossy delivery
MP4s** (a single true-peak limiter pass, not a loudness/dynamics
change) — never on the archival master, where the source PCM is carried
through untouched.

**Integrated loudness (-16.22 LUFS) needs no correction.** Close to Apple
Music's own -16 LUFS reference, and a healthy level for a DJ-mixed set of
already-mastered records. **Decision: no loudness normalization anywhere
in the V4 pipeline.** Not -14 LUFS (a streaming-platform convention that
doesn't apply here), not any other target — the mix's own dynamics and
level relationships are preserved exactly.

**No other processing is applied.** No AI enhancement, no exciters, no
stereo widening, no compression, no EQ. This is a DJ mix of already-
mastered tracks; re-mastering it a second time would be actively wrong,
not neutral.

## Per-deliverable audio path (verified, not assumed)

| Deliverable | Audio path | Verified how |
|---|---|---|
| Archival MOV master | Decode AAC → PCM 24-bit, native 44.1kHz (no resample — a MOV/ProRes container has no 48kHz requirement, and resampling would be an unjustified extra generation) | `ffmpeg -c:a pcm_s24le` test decode confirmed clean 24-bit/44.1kHz/stereo output |
| HEVC delivery MP4 | Stream-copy AAC (byte-identical to source) | `ffmpeg -c:a copy` test: MD5 of the decoded audio stream from source vs. stream-copied output are **identical** (`a8c2c4253a6ab6bd615024098bb1a1b0` both) — confirmed zero-loss, not assumed from "copy should be lossless" |
| H.264 delivery MP4 | Same stream-copy | Same verification |
| 1080p review | Stream-copy or single AAC pass, whichever the container needs | Same discipline |

Stream-copy is the default for every MP4 delivery — the only re-encode
this pipeline ever performs on the music itself is the archival master's
one-time PCM decode, which adds no lossy generation (PCM is lossless by
definition) and exists only to avoid muxing a second lossy pass inside the
mezzanine file.
