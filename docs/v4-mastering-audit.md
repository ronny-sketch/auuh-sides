# AUUH — V4 Mastering Audit

Phase 0 of V4. Every number below was measured (ffprobe/ffmpeg/direct code
inspection of the file as it exists at HEAD), not inferred from filenames
or assumed from how the code "should" behave. Where a claim could not be
empirically verified without building new tooling, it is marked **OPEN —
verify in Part 3** rather than asserted.

## AUDIO — measured

Source: `audio/AUUH.m4a`, probed with `ffprobe`, loudness/level-measured
with `ffmpeg`'s `loudnorm` (analysis pass, EBU R128) and `astats` filters.

| Field | Value | Source |
|---|---|---|
| Container | MOV/MP4 (M4A brand) | ffprobe `format_name` |
| Codec | AAC-LC (`mp4a.40.2`) | ffprobe `codec_name`/`profile` |
| Sample rate | 44,100 Hz | ffprobe |
| Channels | 2 (stereo) | ffprobe |
| Bit depth | N/A (lossy, `bits_per_sample=0`) | ffprobe |
| Bitrate | 320,074 bps (functionally CBR 320kbps) | ffprobe `bit_rate` |
| Duration | **2526.934785 s** | ffprobe `duration` — exact match to `timeline.js`'s `DURATION` constant |
| File size | 101,547,343 bytes (96.8 MiB) | `ls -la` |
| Encoder init padding | 2112 samples | ffprobe `initial_padding` — standard AAC encoder priming, not audio content |
| Integrated loudness | **-16.22 LUFS** | `loudnorm` analysis, `input_i` |
| Loudness range (LRA) | **7.20 LU** | `loudnorm`, `input_lra` — narrow, consistent with a continuously-mixed DJ set, not a dynamics problem |
| Gating threshold | -26.31 LUFS | `loudnorm`, `input_thresh` |
| **True peak** | **+0.11 dBTP** | `loudnorm`, `input_tp` — **exceeds full scale**, see finding below |
| Sample peak | +0.004 dB (2 samples at/above 0dBFS, per `astats` "Peak count") | `astats` |
| Max/min sample value | 1.000471 / -0.997317 (decoded float PCM) | `astats` — confirms the +0.004dB reading; a lossy-codec Gibbs-overshoot artifact, not source clipping |
| DC offset | 0.000004 | `astats` — negligible, not meaningful |
| NaN/Inf/denormal count | 0 / 0 / 0 | `astats` |

**Finding: true peak exceeds 0 dBTP by 0.11 dB.** This is a measured,
real technical condition (not a guess) that matters specifically for
**lossy re-encoding**: encoding audio with inter-sample peaks already
above full scale risks audible inter-sample clipping in the lossy
codec's reconstruction filter. It does **not** justify touching the
archival master's audio (which will carry the source PCM losslessly,
where a peak of +0.11 dBTP is not "clipping," just headroom-negative)
— per Part 9/10, this is the one condition where a small, transparent,
measured true-peak ceiling on the **distribution encodes only** is
technically justified, not a stylistic loudness decision.

**Finding: -16.22 LUFS integrated needs no correction.** This is close to
Apple Music's -16 LUFS reference and is a normal, healthy level for a
DJ-mixed set of already-mastered records. There is no measured technical
reason to raise or lower it. Per the brief's own instruction, this is
left untouched — no loudness normalization anywhere in the V4 pipeline.

## VIDEO — measured / read from code at HEAD

### Current rendering resolution
Not fixed — driven by whatever calls `renderer.setSize(...)`:
- `src/main.js` (interactive): `window.innerWidth/innerHeight × min(devicePixelRatio, 2)`.
- `src/director-review.js`: same, minus the bottom panel's height.
- `src/proxy-record.js`: fixed 1280×720 (`renderer.setPixelRatio(1)`).
- `analysis/render_v3_exemplars.mjs`: 1280×720 (Puppeteer viewport).
- `analysis/render_flagship.mjs`: 1920×1080.

No script has ever rendered at 4K. This is the first pass that will.

### Internal framebuffer precision
`src/core/FeedbackPipeline.js`, `_makeTarget()`:
```js
new THREE.WebGLRenderTarget(width, height, {
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
  depthBuffer: false, stencilBuffer: false,
});
```
**Every one of the 17 ring targets is 8-bit RGBA (`UnsignedByteType`)** —
confirmed by reading the constructor call directly, not inferred. This
includes the "current frame" target the raymarch shader itself writes
into every frame, not just the older history lags.

### History-buffer precision
Same as above — all 17 ring slots share one `_makeTarget()` call with no
per-slot precision differentiation. There is currently no "current scene
vs. short-history vs. long-history" tiering of any kind — Part 2's
proposed architecture does not exist yet in any form.

### Antialiasing strategy
`src/main.js`: `new THREE.WebGLRenderer({ antialias: false, ... })` —
**explicitly disabled**, and this setting would do essentially nothing for
this scene even if enabled: MSAA resolves geometric-primitive edges, and
the entire scene is one full-screen quad; the actual silhouette edges are
produced by the raymarch's own hit/miss threshold (`d < 0.001`) inside the
fragment shader, which MSAA cannot see or smooth. **There is currently no
edge antialiasing of any kind on the raymarched silhouette** — one ray per
output pixel, hard threshold, no supersampling, no analytic edge softening.
`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` in `main.js`
increases the actual render resolution on high-DPI displays, which
incidentally sharpens/downsamples-via-display edges on a Retina screen,
but this is a side effect of display density, not an intentional AA pass,
and it does not apply to any of the fixed-resolution render scripts.

### Raymarch precision
`main.frag.js`, the raymarch loop and `calcNormal`:
- Max 100 steps, hard break at `t > 40.0`.
- Hit threshold: fixed `d < 0.001` regardless of ray distance or output
  resolution.
- Step relaxation: `t += d * 0.85` (fixed under-relaxation factor).
- Normal epsilon: fixed `vec2(0.001, 0.0)` central-difference offset,
  independent of distance from camera or pixel footprint.

None of these are resolution- or distance-adaptive. At 4K, the same fixed
epsilon corresponds to a much smaller fraction of a pixel's on-screen
footprint for near geometry and a *larger* one for distant/grazing
geometry than it did at 720p — this is the mechanism Part 5's "adaptive
normal epsilon, distance-aware raymarch epsilon" concern is about, and
needs to be judged from actual 4K motion, not asserted here.

### Color pipeline
`main.frag.js`'s `main()` builds a scalar `lum` from diff/rim/ao/spec
terms, applies a hand-rolled Reinhard-style compression
(`1.0 - exp(-lum*1.3)`) and a `pow(.., 1/uContrast)` curve, then tints with
`alienHue` — all computed as **raw shader math with no reference to any
formal color space**, and written directly to `gl_FragColor`. No script
anywhere sets `renderer.outputColorSpace` — meaning the piece has been
running on whatever three.js r169's *default* is (`THREE.SRGBColorSpace`
since r152) for its entire history, applied post-hoc to a shader that was
never authored with that transform in mind.

**OPEN — verify in Part 3**: whether three.js's default output color
space transform is actually being applied on top of this raw
`ShaderMaterial`'s output (some three.js versions/paths skip the transform
for materials that write `gl_FragColor` directly; this needs the test
pattern from Part 3, not a reading of three.js's source, to answer with
confidence for this exact renderer configuration).

### Output gamma / color space (delivery)
No render script (`render_v3_exemplars.mjs`, `render_director_proxy.mjs`,
`render_flagship.mjs`) sets any color metadata on its ffmpeg output —
grep confirms zero occurrences of `-color_primaries`, `-color_trc`,
`-colorspace`, or `-color_range` in any of them. Every delivered file to
date has undocumented, player-inferred color metadata.

### Grain implementation
```glsl
float grain = hash3(vec3(vUv * uResolution, mod(uTime * 60.0, 1000.0))) - 0.5;
col += grain * 0.06 * uGrainBoost * uGrainMix;
```
`vUv * uResolution` means **one grain "cell" is exactly one output pixel**
at any resolution. At 4K (3840×2160 vs. 1280×720, ~9x more pixels), grain
frequency scales directly with pixel count — it will read as much finer,
denser noise, not "the same analog texture photographed at higher
resolution." This is exactly Part 6's concern, confirmed by reading the
formula.

### Scanline implementation
```glsl
float scan = sin((vUv.y + uTime * 0.03) * uResolution.y * 0.9) * 0.035;
```
Scanline frequency is `uResolution.y * 0.9` — **directly proportional to
vertical resolution**. At 4K (2160px) vs. 720p (720px), scanlines pack 3x
denser. Same class of bug as grain.

### Temporal-feedback precision
8-bit (`UnsignedByteType`), all 17 ring slots — see "internal framebuffer
precision" above; same finding, same evidence.

### Encoding pipeline / every lossy generation currently happening

| Path | Generations | Detail |
|---|---|---|
| `render_v3_exemplars.mjs` / `render_flagship.mjs` | 1 lossy video generation | WebGL 8-bit canvas → `page.screenshot()` (lossless PNG, but capped at the canvas's 8-bit ceiling) → **one** H.264 encode. The cleanest existing path. |
| `render_director_proxy.mjs` (proxy) | **2 lossy video generations** | WebGL 8-bit canvas → `MediaRecorder` real-time VP8 encode (`videoBitsPerSecond: 700_000`, genuinely lossy at a low bitrate) → **second**, independent H.264 transcode of the already-lossy VP8. This compounds two lossy generations and is why the proxy is explicitly disqualified from being the master (`docs/v3-5-director-review-guide.md` already calls it "NOT the master," confirmed here with the exact mechanism). |
| Both paths | 1 unavoidable quantization | The 8-bit render-target ceiling itself (see above) — happens before either path even starts capturing. |
| Both paths | 0 supersampling | No AA anywhere, at any resolution, in any script to date. |

## Architecture benchmark (Part 1) — measured, on a 10s 4K section (t=1060-1070, the 17:47 approach)

**Architecture B (WebCodecs `VideoEncoder`) eliminated at the feasibility
gate**, before any benchmark was run: `typeof VideoEncoder === "undefined"`
in this Puppeteer-driven headless Chrome (v151), checked both with default
launch args and with `--enable-features=WebCodecs --use-gl=angle
--ignore-gpu-blocklist`. This is a hard API absence, not a
config-unsupported response — there is nothing to benchmark.

**A vs. C, both at 3840×2160/30fps/MASTER quality, 300 frames:**

| | A: `gl.readPixels` → HTTP POST → ffmpeg rawvideo | C: `page.screenshot()` PNG → ffmpeg image2pipe |
|---|---|---|
| Wall time (300 frames) | 912.2s | 462.5s |
| Effective fps | 0.33 | **0.65** (~2x faster) |
| Avg Chrome CPU | 36% | 83% |
| Peak Chrome RSS | 701 MB | 283 MB |
| Output | 309.8 MB, 10.000000s, correct | 309.8 MB, 10.000000s, correct (byte-identical size to A — same rendered content, confirms both captured correctly) |

**This overturned my own expectation going in** — direct framebuffer
readback is the theoretically "purer" path (no image-codec generation),
but empirically it was the slower, more memory-hungry, LESS CPU-utilized
of the two (lower CPU% while taking longer wall-clock time means it's
spending most of its time blocked, not computing) — consistent with
`gl.readPixels` forcing a full GPU→CPU pipeline stall for a ~33MB 4K RGBA8
frame, compounded by pushing that same 33MB through `fetch()` to a local
HTTP sink every frame. Chrome's own internal `Page.captureScreenshot` path
(what `page.screenshot()` uses) is evidently far more optimized for this
exact operation than anything built on top of the public `gl.readPixels`
+ `fetch()` primitives.

**Decision: Architecture C**, built as `analysis/render_master.mjs`. It
is simultaneously the fastest, the simplest (no CORS/sink-server
infrastructure, no manual `vflip`, no raw-pixel-format bookkeeping), and
per the brief's own "do not default back to 75,000 PNG files" instruction
— it never writes a PNG to disk; every frame streams through
`page.screenshot({encoding:"binary"})` directly into `ffmpeg`'s stdin via
the `image2pipe`/`png` demuxer, in memory, one at a time.

**Known limitation of this decision, documented rather than hidden**:
`page.screenshot()` is an 8-bit-per-channel capture, full stop — even
though MASTER/ULTRA tiers now render internally at RGBA16F (Part 2), the
FINAL captured frame is always quantized to 8 bits at the moment of
capture. This is not a regression: a single quantization to delivery bit
depth at final output is normal and unavoidable for any 8-bit delivery
target (H.264/HEVC 8-bit, and even ProRes 422 HQ's usual 10-bit needs a
capture path carrying more than 8 bits to actually benefit from it). The
internal 16-bit float precision still earns its keep independently of
capture bit depth — it prevents the *repeated* 8-bit requantization that
happens on every one of up to 16 feedback-history bounces per frame,
which is a different and larger problem than the single unavoidable final
quantization. A genuine 10-bit-through-final-output capture path
(`renderer.readRenderTargetPixels` with `FloatType` → 16-bit raw → ProRes)
is designed but explicitly NOT built this pass — see `docs/v4-quality-
critique.md` for whether Part 15's comparison reel finds a visible reason
to justify that additional complexity for the archival master specifically.

## Antialiasing benchmark (Part 4) — measured on Fracture/OBSIDIAN (t=2010, fine cracks)

Rendered the same frame at 1280x720 output with supersample factors
1x/1.5x/2x/3x (render internally at `1280*ss × 720*ss`, Lanczos-downsample
to 1280x720), cropped to the same region containing thin crack edges and
a grazing shard silhouette, compared visually.

- **1x → 1.5x**: large, immediately visible improvement — most of the
  harsh stair-stepping on the main diagonal shard edge disappears.
- **1.5x → 2x**: real, smaller further improvement — edges read as clean.
- **2x → 3x**: marginal, mostly confined to the finest background cracks;
  not a meaningful further improvement for normal viewing.

**Decision: 2x supersample is the quality sweet spot; 1.5x is the
practical default** given the render-time cost below. Per the brief's own
instruction ("do not automatically use the most expensive solution... pick
the best perceptual improvement per render-time cost"), 3x is rejected —
it roughly doubles 2x's already-high cost for a difference visible only in
a pixel-peeped crop.

### Render-time economics — the actual cost of supersampling, projected to the full 42-minute piece

Using the Architecture-C throughput measured in the Part 1 benchmark
(0.65 fps at 3840×2160/ss=1) and the fact that supersample cost scales
with ss² (pixel count):

| Supersample | Effective 4K fps | Full 42:07 master (75,809 frames @30fps) |
|---|---|---|
| 1x (no SS) | 0.65 | ~32.4 hours (1.3 days) |
| **1.5x** | **0.29** | **~72.9 hours (3.0 days)** |
| 2x | 0.16 | ~129.6 hours (5.4 days) |
| 3x | 0.07 | ~291.6 hours (12.1 days) |

**This is real information Ronny needs before committing to a full master
render, not a rounding detail.** A full 4K/30fps archival master at the
visually-ideal 2x supersample is a multi-day, single-machine, unattended
commitment. The chunked/restartable architecture (Part 1) makes this
*survivable* (a crash loses at most one chunk's progress), but does not
make it fast. Recommendation: default to **1.5x** for the actual full-
length master if/when it is commissioned (3 days, already removes nearly
all the visible stair-stepping) and reserve 2x for excerpts or a future
higher-patience pass — this is a cost/quality call for Ronny, not one this
pass makes unilaterally by picking a default and rendering 5+ days of
unattended GPU time.

## Performance/VRAM safety (Part 16) — a real, reproducible instability found and mitigated

Three separate stress-test attempts at 3840×2160/MASTER quality (RGBA16F
scene target), sustained single-browser-session rendering, all failed in
the same narrow window:

| Attempt | Pattern | Failure | Where |
|---|---|---|---|
| 1 | Periodic cropped screenshot (synthetic) | WebSocket closed mid-call | frame 0 (first checkpoint) |
| 2 | Same, retried | CDP call hung indefinitely, zero CPU, 34+ min before manual kill | frame 1260/1800 (exact same frame both times) |
| 3 | Full-frame screenshot every frame (the ACTUAL production capture pattern) | `Target closed` — the Chrome tab/renderer process itself died | frame ~1500-1650/1800 |

All three failures land between roughly 42-65 real seconds (1260-1960
frames at 30fps) of sustained rendering in a single browser session at
this resolution/precision — consistent with a genuine resource-exhaustion
ceiling (most likely Chrome's own out-of-memory kill of the renderer or
GPU process after enough 4K HalfFloat allocations/screenshots accumulate),
not a coincidence and not specific to one capture method. This was found
by actually running the stress test, not assumed from "16-bit float at 4K
sounds like it should be fine."

**Mitigation, verified**: `render_master.mjs` already launches a fresh
browser process per chunk (`renderChunk()`). Re-running the identical
production pattern with `--chunk-seconds 20` (well under the observed
42-65s failure window) completed two consecutive chunks cleanly with zero
errors, correct 40.000000s final duration after concat. **Recommendation:
20-second chunks for any real MASTER-quality render** — comfortably below
the observed instability threshold with real margin, at the cost of more
frequent (cheap) browser relaunches, which the chunking architecture
already amortizes correctly (verified seamless at chunk boundaries, see
Part 1's continuity test above).

`protocolTimeout` was also changed from disabled to a bounded 90s in
`render_master.mjs` (and 60s in the stress-test script) as a second,
independent safety net — a future hang or crash now fails visibly within
a bounded time instead of consuming wall-clock indefinitely, which is what
made diagnosing attempt #2 above take over half an hour longer than it
needed to.

## Summary: what Parts 1-8 of the V4 brief are actually responding to

Every one of the brief's stated concerns (8-bit history, no AA, resolution-
coupled grain/scanlines, no color management, double-lossy proxy) is
confirmed present by this audit — none were hypothetical. The rest of this
document set (implementation + benchmarks + comparison reel) follows in
`docs/v4-quality-critique.md`, `docs/audio-master-report.md`, and the
render/QA scripts under `analysis/`.
