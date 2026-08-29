# AUUH — V4 Color Pipeline

Part 3 of the V4 brief. Every claim below was verified by rendering an
actual test pattern through the actual pipeline and measuring the output
pixels — not inferred from reading three.js's source or ffmpeg's
documentation.

## Method

Added a test-pattern mode to `main.frag.js` (`uTestPattern`, wired via
`master-render.html?testpattern=1`): when active, `main()` shortcuts
before any raymarch/tonemap/grain code runs and writes flat vertical bars
at nine exact code values (0/1/2/5/10/18/50/90/100%, i.e. `gl_FragColor =
vec4(vec3(barValue), 1.0)`) plus a smooth 0→1 gradient strip. This isolates
the question Part 3 asks — "does a value the shader intends to output
survive unchanged through WebGL → capture → encode" — from the artistic
tonemap/color-grade math, which is a separate, already-authored decision
not being re-litigated here.

## Finding 1: the raw WebGL canvas is code-value-faithful — no double
gamma, no elevated blacks

Rendered the test pattern via `page.screenshot()` (lossless PNG, no
codec involved) and sampled each bar:

| Bar | Expected code value | Measured |
|---|---|---|
| 0% | 0 | 0 |
| 1% | 3 | 3 |
| 2% | 5 | 5 |
| 5% | 13 | 13 |
| 10% | 26 | 26 |
| 18% | 46 | 46 |
| 50% | 128 | 128 |
| 90% | 230 | 229 (rounding) |
| 100% | 255 | 255 |

Exact match (within ±1 code value of ordinary float→8-bit rounding) at
every step, including 0% landing at exactly 0 (not an elevated black like
16, which is what a stray limited-range interpretation would produce) and
100% landing at exactly 255 (not clipped early). **Conclusion: this
`ShaderMaterial`'s raw `gl_FragColor` writes pass through THREE.js's
`WebGLRenderer` and the browser's WebGL canvas completely unmanaged** —
no automatic sRGB encode is being applied on top of it. This resolves the
audit's open question: three.js's `renderer.outputColorSpace` default
(`SRGBColorSpace` since r152) evidently has no effect on a raw
`ShaderMaterial` that never uses three.js's built-in material/lighting
shader chunks (which is where that transform would normally be injected)
— confirmed by measurement, not assumed from reading three.js's source.

**This also means the piece's existing look (the manual Reinhard-style
tonemap and `pow(.., 1/uContrast)` curve in `main.frag.js`) has always
been the ONLY transform applied, throughout V1-V3.5** — there was no
hidden double-gamma bug lurking in three.js's defaults. Nothing needs to
change in the shader's own color math; the pipeline was already correct
at this stage. The problem, per Finding 2, is entirely downstream.

## Finding 2: delivered files carry NO color metadata at all — a real,
confirmed risk, not a hypothetical

Encoding the same test pattern through the existing (unmodified) H.264
recipe used by every prior render script:
```
ffmpeg -i in.png -c:v libx264 -preset slow -crf 12 -pix_fmt yuv420p out.mp4
```
`ffprobe` on the result: `color_range=unknown`, `color_space=unknown`,
`color_transfer=unknown`, `color_primaries=unknown` — confirms the audit's
grep-based finding (zero `-color_*` flags in any existing render script)
with an actual encoded file, not just an absent command-line flag.

Decoding that same file back and re-measuring the bars showed the ACTUAL
pixel data is still correct (0→0, 255→255, full range preserved in the
real numeric conversion) — so the bits themselves are fine. **The risk is
entirely that a player which does NOT default to full-range-RGB
interpretation for an untagged file could assume limited (16-235) range
and re-expand the image incorrectly** — measurably elevating blacks and
crushing/clipping highlights on that player's screen even though the file
itself is correct. This is precisely the brief's named risk ("washed
QuickTime appearance caused by incorrect metadata"), now confirmed as a
real gap in every prior delivery from this project, not a hypothetical.

## Fix — verified explicit tagging recipe

```
ffmpeg -i in.png -c:v libx264 -preset slow -crf 12 \
  -vf "format=yuv420p" \
  -color_range pc -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -x264opts "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=on" \
  out.mp4
```
Re-probing the result confirms **all four** fields now explicit
(`color_range=pc`, `color_space=bt709`, `color_transfer=bt709`,
`color_primaries=bt709`) — note that `ffmpeg`'s own `-color_primaries`/
`-color_trc` container flags alone were NOT sufficient (a first attempt
without `-x264opts` left `color_transfer`/`color_primaries` at
`unknown` despite the flags being passed — libx264 needs its VUI
parameters set directly via `-x264opts`, not only via the container-level
flags, to actually write them into the H.264 bitstream). Re-sampling the
decoded pixels after adding the tags confirmed **no change to the actual
image data** — this is a pure metadata fix, not a re-grade.

The HEVC delivery encode needs the x265 equivalent
(`-x265-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=full"`);
the ProRes archival master (MOV container) takes the same
`-color_primaries/-color_trc/-colorspace/-color_range` container flags,
which the `mov` muxer writes into the file's `colr` atom directly (no
x264/x265-specific VUI step needed for that container).

## Decision

**Rec.709, full-range (PC range), SDR** — for every deliverable, per the
brief's own default. No technical finding here argues for anything else:
the piece's crushed-blacks doctrine depends on true 0 staying true 0
through the whole pipeline, which is now verified true at the render stage
and will be explicitly guaranteed (not left to player inference) at the
encode stage via the tagging recipe above, applied in
`analysis/mux_deliverable.mjs`.
