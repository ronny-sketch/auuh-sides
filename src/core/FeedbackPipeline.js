import * as THREE from "three";
import { presentFragmentShader, presentVertexShader } from "../shaders/present.frag.js";

// Two-pass temporal-feedback pipeline. V3 Phase 7 (docs/v3-creative-
// direction.md): upgraded from a single ping-pong pair to a RING of
// history targets so the scene shader can read several distinct lags at
// once (ECHO family) instead of only "last frame" — per the brief,
// "explore a small multi-tap temporal history... use a ring/history
// architecture rather than allocating new textures each frame."
//
// RING_SIZE targets are allocated ONCE. Each frame writes into exactly one
// slot (the one that held the OLDEST frame in the ring) and reads whatever
// lag taps it needs from the OTHER slots before overwriting — so the cost
// per frame is still exactly one scene-pass render + one present blit,
// same as the v2 two-target version; the ring only changes how many
// textures are available to SAMPLE from, not how much is rendered.
//
// TAP_LAGS (frames): [1, 4, 10, 16] approximates the brief's "previous
// frame / ~4 frames / ~12 frames / ~1 second" ladder at this project's
// preview/master frame rates (24-30fps => lag 16 is ~0.5-0.7s). Going
// further ("optionally several seconds") would need a much larger ring
// (seconds x fps textures) — deferred, noted in docs/v3-creative-
// direction.md §7, not implemented here; RING_SIZE is the one constant to
// raise if that's revisited.
//
// RING_SIZE must be STRICTLY GREATER than the largest lag: with lag L and
// an L-sized ring, (writeIndex - L) mod L === writeIndex, which binds the
// slot about to be written as a READ source in the same draw call — a
// framebuffer/texture feedback loop (caught by an actual WebGL
// GL_INVALID_OPERATION warning during Phase 13 smoke-testing, not by
// reasoning about the code — the exact discipline docs/creative-critique-
// v2.md's Finding 1 already established for this codebase).
const TAP_LAGS = [1, 4, 10, 16];
const RING_SIZE = Math.max(...TAP_LAGS) + 1;

// Two operating modes (unchanged in spirit from v2's Phase 6):
//   - SEEK/QA: warmUp(...) renders warm-up frames ending at t, discarding
//     on-screen output, so every ring slot has plausible history before the
//     real captured frame — same t + same warm-up recipe is deterministic.
//   - MASTER SEQUENTIAL: never reset; renderFrame(t) once per frame in
//     increasing t order, ring carries forward continuously.
export class FeedbackPipeline {
  constructor(renderer, sceneMesh, sceneMaterial, width, height) {
    this.renderer = renderer;
    this.sceneMesh = sceneMesh;
    this.sceneMaterial = sceneMaterial;

    this.sceneScene = new THREE.Scene();
    this.sceneScene.add(sceneMesh);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.ring = Array.from({ length: RING_SIZE }, () => this._makeTarget(width, height));
    this.writeIndex = 0;

    this.presentMaterial = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.ring[0].texture } },
      vertexShader: presentVertexShader,
      fragmentShader: presentFragmentShader,
    });
    this.presentMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.presentMaterial);
    this.presentScene = new THREE.Scene();
    this.presentScene.add(this.presentMesh);
  }

  _makeTarget(width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  setSize(width, height) {
    for (const target of this.ring) target.setSize(width, height);
  }

  _tapIndex(lag) {
    return (this.writeIndex - lag + RING_SIZE * 100) % RING_SIZE;
  }

  // Renders one frame: binds the lag taps (uPrevFrame = lag 1, uHistory1-3
  // = the rest of TAP_LAGS) as history reads, writes the new scene into
  // the ring slot being retired, blits it to the screen, advances the
  // write pointer.
  renderFrame(setUniformsForT) {
    const u = this.sceneMaterial.uniforms;
    u.uPrevFrame.value = this.ring[this._tapIndex(TAP_LAGS[0])].texture;
    u.uHistory1.value = this.ring[this._tapIndex(TAP_LAGS[1])].texture;
    u.uHistory2.value = this.ring[this._tapIndex(TAP_LAGS[2])].texture;
    u.uHistory3.value = this.ring[this._tapIndex(TAP_LAGS[3])].texture;

    setUniformsForT();

    const writeTarget = this.ring[this.writeIndex];
    this.renderer.setRenderTarget(writeTarget);
    this.renderer.render(this.sceneScene, this.orthoCamera);

    this.presentMaterial.uniforms.uTex.value = writeTarget.texture;
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
    for (const target of this.ring) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(null);
    this.writeIndex = 0;
  }
}
