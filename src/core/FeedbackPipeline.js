import * as THREE from "three";
import { presentFragmentShader, presentVertexShader } from "../shaders/present.frag.js";

// Two-pass temporal-feedback pipeline. V3 Phase 7: a RING of history
// targets so the scene shader can read several distinct lags at once
// (ECHO family) instead of only "last frame."
//
// V4 Part 2 (docs/v4-mastering-audit.md): the ring used to be ONE set of
// same-size, same-precision (8-bit RGBA) targets serving BOTH "the frame
// about to be presented/captured" AND "the history taps ECHO/MEMORY read
// from." That conflated two different quality needs — the audit confirmed
// every one of the 17 slots was 8-bit, so temporal compositing (feedback
// bounced through history up to 16 frames deep) was quantizing repeatedly
// through an 8-bit ceiling, and there was no way to render a 4K "current"
// frame without ALSO paying full 4K x N-slots x (precision) VRAM for
// history that mostly exists to be softly, driftingly resampled anyway.
//
// New architecture (three tiers — PREVIEW/MASTER/ULTRA):
//   sceneTarget — ONE target, ALWAYS at the full requested render
//     resolution, in the tier's chosen precision. This is what the shader
//     actually draws into every frame and what gets presented/captured as
//     the real output frame — resolution here is never reduced.
//   historyRing — N targets at a (tier-dependent) POSSIBLY REDUCED
//     resolution (downsampled from sceneTarget after each frame) and a
//     (tier-dependent) precision, used ONLY for the uPrevFrame/uHistory1-3
//     feedback sampling taps. A blurrier/softer ECHO ghost read from a
//     lower-res history buffer is not a visible regression — the taps are
//     already UV-drifted and composited via max(), not shown at 1:1 detail
//     — while the VRAM savings are exactly what the brief's own example
//     (1080p/1440p history under a 4K current frame) illustrates.
//
// TAP_LAGS (frames): unchanged from v3 — [1, 4, 10, 16], RING_SIZE = 17
// (must exceed the largest lag; see the historical GL_INVALID_OPERATION
// framebuffer-feedback-loop finding from V3 Phase 13 for why — this is not
// a re-derivation, it's the same invariant carried forward unchanged).
const TAP_LAGS = [1, 4, 10, 16];
const RING_SIZE = Math.max(...TAP_LAGS) + 1;

// Quality tiers. historyScale multiplies BOTH width and height (so 0.5 =
// 1/4 the pixel count); historyType/sceneType are resolved against actual
// GPU capability at construction time (see _resolveType) and fall back to
// UnsignedByteType if the requested float precision isn't renderable on
// this GPU — "use actual GPU capability detection, gracefully fall back,"
// not an assumption that HalfFloatType is always available.
const QUALITY_TIERS = {
  // Unchanged from V3: full-resolution 8-bit everything. This remains the
  // interactive/review-proxy default — no behavior change for main.js,
  // director-review.js, or proxy-record.js, none of which pass a tier.
  PREVIEW: { historyScale: 1.0, historyType: "byte", sceneType: "byte" },
  // 4K final frame at half-float precision; history downsampled to half
  // resolution (3840x2160 -> 1920x1080) AND half-float, per the brief's
  // own worked example.
  MASTER: { historyScale: 0.5, historyType: "half", sceneType: "half" },
  // Full resolution AND half-float for both scene and history — only sane
  // once VRAM headroom is confirmed by Part 16's stress test; NOT the
  // default even for 4K renders.
  ULTRA: { historyScale: 1.0, historyType: "half", sceneType: "half" },
};

function typeIsRenderable(renderer, threeType) {
  if (threeType === THREE.UnsignedByteType) return true;
  // WebGL2 (three.js r169's baseline) supports rendering to half-float
  // targets natively via EXT_color_buffer_float; linear filtering on them
  // needs OES_texture_float_linear-equivalent support, which WebGL2 also
  // generally exposes for half-float. Checked directly against this
  // renderer's context rather than assumed from "WebGL2 => it works."
  const gl = renderer.getContext();
  const isWebGL2 = renderer.capabilities.isWebGL2;
  if (!isWebGL2) return false;
  const hasColorBufferFloat = !!gl.getExtension("EXT_color_buffer_float");
  return hasColorBufferFloat;
}

// Two operating modes (unchanged in spirit from v2's Phase 6):
//   - SEEK/QA: warmUp(...) renders warm-up frames ending at t, discarding
//     on-screen output, so every ring slot has plausible history before the
//     real captured frame — same t + same warm-up recipe is deterministic.
//   - MASTER SEQUENTIAL: never reset; renderFrame(t) once per frame in
//     increasing t order, ring carries forward continuously.
export class FeedbackPipeline {
  constructor(renderer, sceneMesh, sceneMaterial, width, height, quality = "PREVIEW") {
    this.renderer = renderer;
    this.sceneMesh = sceneMesh;
    this.sceneMaterial = sceneMaterial;
    this.quality = quality;

    const tier = QUALITY_TIERS[quality] || QUALITY_TIERS.PREVIEW;
    const requestedSceneType = tier.sceneType === "half" ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const requestedHistoryType = tier.historyType === "half" ? THREE.HalfFloatType : THREE.UnsignedByteType;

    // Graceful fallback: if half-float rendering isn't actually supported
    // on this GPU/context, both fall back to UnsignedByteType rather than
    // silently producing black/garbage targets — verified per-renderer,
    // not assumed from the tier name.
    this.sceneType = typeIsRenderable(renderer, requestedSceneType) ? requestedSceneType : THREE.UnsignedByteType;
    this.historyType = typeIsRenderable(renderer, requestedHistoryType) ? requestedHistoryType : THREE.UnsignedByteType;
    this.usedFallback = this.sceneType !== requestedSceneType || this.historyType !== requestedHistoryType;

    this.historyScale = tier.historyScale;
    this.width = width;
    this.height = height;

    this.sceneScene = new THREE.Scene();
    this.sceneScene.add(sceneMesh);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.sceneTarget = this._makeTarget(width, height, this.sceneType);
    const [hw, hh] = this._historyDims(width, height);
    this.ring = Array.from({ length: RING_SIZE }, () => this._makeTarget(hw, hh, this.historyType));
    this.writeIndex = 0;

    // Downsample pass: copies sceneTarget's full-res output into the
    // (possibly smaller) history ring slot. Reuses the trivial present
    // shader (a texture sample) — GPU bilinear minification during this
    // blit IS the downsample, no separate mip/box-filter code needed.
    this.downsampleMaterial = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.sceneTarget.texture } },
      vertexShader: presentVertexShader,
      fragmentShader: presentFragmentShader,
    });
    this.downsampleMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.downsampleMaterial);
    this.downsampleScene = new THREE.Scene();
    this.downsampleScene.add(this.downsampleMesh);

    this.presentMaterial = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.sceneTarget.texture } },
      vertexShader: presentVertexShader,
      fragmentShader: presentFragmentShader,
    });
    this.presentMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.presentMaterial);
    this.presentScene = new THREE.Scene();
    this.presentScene.add(this.presentMesh);
  }

  _historyDims(width, height) {
    return [Math.max(1, Math.round(width * this.historyScale)), Math.max(1, Math.round(height * this.historyScale))];
  }

  _makeTarget(width, height, type) {
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.sceneTarget.setSize(width, height);
    const [hw, hh] = this._historyDims(width, height);
    for (const target of this.ring) target.setSize(hw, hh);
  }

  _tapIndex(lag) {
    return (this.writeIndex - lag + RING_SIZE * 100) % RING_SIZE;
  }

  // Renders one frame: binds the lag taps (uPrevFrame = lag 1, uHistory1-3
  // = the rest of TAP_LAGS) from the history ring, renders the scene at
  // FULL resolution into sceneTarget, downsamples that into the ring slot
  // being retired, blits sceneTarget to the screen, advances the write
  // pointer.
  renderFrame(setUniformsForT) {
    const u = this.sceneMaterial.uniforms;
    u.uPrevFrame.value = this.ring[this._tapIndex(TAP_LAGS[0])].texture;
    u.uHistory1.value = this.ring[this._tapIndex(TAP_LAGS[1])].texture;
    u.uHistory2.value = this.ring[this._tapIndex(TAP_LAGS[2])].texture;
    u.uHistory3.value = this.ring[this._tapIndex(TAP_LAGS[3])].texture;

    setUniformsForT();

    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(this.sceneScene, this.orthoCamera);

    const writeTarget = this.ring[this.writeIndex];
    this.downsampleMaterial.uniforms.uTex.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(writeTarget);
    this.renderer.render(this.downsampleScene, this.orthoCamera);

    this.presentMaterial.uniforms.uTex.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.presentScene, this.orthoCamera);

    this.writeIndex = (this.writeIndex + 1) % RING_SIZE;
  }

  // Discards on-screen output for warm-up frames leading up to t — used by
  // seek/QA mode so a fresh seek has plausible ring history instead of an
  // all-black ring. `getUniformsAt(t)` must be the same pure-function-of-t
  // uniform setter the real render uses.
  warmUp(getUniformsAt, tStart, tEnd, stepSeconds) {
    for (let t = tStart; t < tEnd; t += stepSeconds) {
      this.renderFrame(() => getUniformsAt(t));
    }
  }

  reset() {
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    for (const target of this.ring) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(null);
    this.writeIndex = 0;
  }
}
