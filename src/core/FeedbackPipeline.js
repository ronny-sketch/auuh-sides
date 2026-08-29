import * as THREE from "three";
import { presentFragmentShader, presentVertexShader } from "../shaders/present.frag.js";

// Two-pass ping-pong feedback: the scene shader writes to an offscreen
// render target (reading the OTHER target's texture as last frame's
// history), then a trivial present pass blits that target to the screen.
// Targets swap every frame.
//
// Two operating modes (Phase 6 of docs/v2-plan.md):
//   - SEEK/QA: warmUp(t, seconds) renders `seconds` worth of frames ending
//     at t, discarding their on-screen result, so the feedback buffer has
//     plausible history before the real captured frame. Same t + same
//     warm-up recipe always produces the same pixels (seek-determinism
//     preserved, just redefined to include "with this much feedback
//     history").
//   - MASTER SEQUENTIAL: never reset; call renderFrame(t) once per frame
//     in increasing t order for the whole 42 minutes, feedback carries
//     forward continuously.
export class FeedbackPipeline {
  constructor(renderer, sceneMesh, sceneMaterial, width, height) {
    this.renderer = renderer;
    this.sceneMesh = sceneMesh;
    this.sceneMaterial = sceneMaterial;

    this.sceneScene = new THREE.Scene();
    this.sceneScene.add(sceneMesh);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.targetA = this._makeTarget(width, height);
    this.targetB = this._makeTarget(width, height);
    this.writeTarget = this.targetA;
    this.readTarget = this.targetB;

    this.presentMaterial = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.readTarget.texture } },
      vertexShader: presentVertexShader,
      fragmentShader: presentFragmentShader,
    });
    this.presentMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.presentMaterial);
    this.presentScene = new THREE.Scene();
    this.presentScene.add(this.presentMesh);

    this._blankTexture = this.readTarget.texture; // used until first real frame exists
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
    this.targetA.setSize(width, height);
    this.targetB.setSize(width, height);
  }

  // Renders one frame: scene pass (reading readTarget as history) into
  // writeTarget, then blits writeTarget to the screen. Swaps targets
  // afterward so next call reads what was just written.
  renderFrame(setUniformsForT) {
    this.sceneMaterial.uniforms.uPrevFrame.value = this.readTarget.texture;
    setUniformsForT();

    this.renderer.setRenderTarget(this.writeTarget);
    this.renderer.render(this.sceneScene, this.orthoCamera);

    this.presentMaterial.uniforms.uTex.value = this.writeTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.presentScene, this.orthoCamera);

    const tmp = this.writeTarget;
    this.writeTarget = this.readTarget;
    this.readTarget = tmp;
  }

  // Discards on-screen output for `count` warm-up frames — used by seek/QA
  // mode so a fresh seek to timestamp t has plausible feedback history
  // instead of starting from a blank buffer. `getUniformsAt(t)` must be
  // the same pure-function-of-t uniform setter the real render uses.
  warmUp(getUniformsAt, tStart, tEnd, stepSeconds) {
    for (let t = tStart; t < tEnd; t += stepSeconds) {
      this.renderFrame(() => getUniformsAt(t));
    }
  }

  reset() {
    this.renderer.setRenderTarget(this.writeTarget);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.readTarget);
    this.renderer.clear();
    this.renderer.setRenderTarget(null);
  }
}
