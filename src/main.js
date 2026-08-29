import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders/main.frag.js";
import { CameraDirector } from "./core/CameraDirector.js";
import { AudioEngine } from "./core/audio.js";
import { DURATION } from "./core/timeline.js";
import { FeedbackPipeline } from "./core/FeedbackPipeline.js";
import { AudioFeatureEngine } from "./core/AudioFeatureEngine.js";
import { VisualDirector } from "./core/VisualDirector.js";

const appEl = document.getElementById("app");
const hudEl = document.getElementById("hud");
const startOverlay = document.getElementById("startOverlay");

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
appEl.appendChild(renderer.domElement);

const uniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3(0, 0, 9) },
  uCamTarget: { value: new THREE.Vector3(0, 0, 0) },
  uFov: { value: 45 },
  uFold: { value: 1 },
  uFoldBlend: { value: 0.1 },
  uTurbulence: { value: 0.05 },
  uFracture: { value: 0 },
  uContrast: { value: 0.8 },
  uColorMix: { value: 0 },
  uRestraint: { value: 0 },
  // Phase 6 (temporal feedback) uniforms — uPrevFrame is assigned per-frame
  // by FeedbackPipeline from the ping-pong history target.
  uPrevFrame: { value: null },
  uMemoryWeight: { value: 0 },
  uMemoryDrift: { value: new THREE.Vector2(0, 0) },
  // BODY topology blend (v2 Phase 3) + micro-texture boost (v2 Phase 4)
  uFormBlend: { value: 0 },
  uGrainBoost: { value: 1 },
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const quad = new THREE.Mesh(geometry, material);

const pipeline = new FeedbackPipeline(
  renderer,
  quad,
  material,
  window.innerWidth,
  window.innerHeight
);

pipeline.reset(); // start both history targets from a known black state

const cameraDirector = new CameraDirector();
const audio = new AudioEngine("/AUUH.m4a");
const featureEngine = new AudioFeatureEngine();
const visualDirector = new VisualDirector(featureEngine);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  pipeline.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  uniforms.uResolution.value.set(w, h);
}
window.addEventListener("resize", resize);
resize();

// Slowly-evolving feedback drift — an organic wobble to the ghost trail's
// displacement, not a fixed direction (a fixed drift would read as simple
// directional smear rather than a dreamlike, spatial persistence).
function memoryDriftAt(t) {
  const dx = Math.sin(t * 0.13) * 0.0035 + Math.sin(t * 0.037) * 0.0018;
  const dy = Math.cos(t * 0.11) * 0.0035 + Math.cos(t * 0.029) * 0.0018;
  return [dx, dy];
}

function applyUniformsForT(t) {
  const p = visualDirector.sample(t);
  const cam = cameraDirector.update(p);

  uniforms.uTime.value = t;
  uniforms.uCamPos.value.set(cam.camPos[0], cam.camPos[1], cam.camPos[2]);
  uniforms.uCamTarget.value.set(cam.camTarget[0], cam.camTarget[1], cam.camTarget[2]);
  uniforms.uFov.value = cam.fov;
  uniforms.uFold.value = p.fold;
  uniforms.uFoldBlend.value = p.foldBlend;
  uniforms.uTurbulence.value = p.turbulence;
  uniforms.uFracture.value = p.fracture;
  uniforms.uContrast.value = p.contrast;
  uniforms.uColorMix.value = p.colorMix;
  uniforms.uRestraint.value = p.restraint;
  uniforms.uMemoryWeight.value = p.memoryWeight;
  uniforms.uFormBlend.value = p.formBlend;
  uniforms.uGrainBoost.value = p.grainBoost;
  const [dx, dy] = memoryDriftAt(t);
  uniforms.uMemoryDrift.value.set(dx, dy);

  p.shotType = cam.shotType;
  return p;
}

// Manual time override for the QA/screenshot/preview-render harness
// (Puppeteer sets window.__AUUH_MANUAL_T__ and calls __AUUH_RENDER_AT__).
let manualT = null;

// Seek/QA mode: warm up the feedback buffer from WARMUP_SECONDS before the
// requested t, discarding that output, so a direct seek doesn't start from
// a blank feedback history. Same t + same warm-up recipe is deterministic
// (pure function of t throughout — see core/CameraDirector.js, core/params.js).
const WARMUP_SECONDS = 3.0;
const WARMUP_STEP = 1 / 30;

function renderAt(t) {
  let p;
  pipeline.renderFrame(() => {
    p = applyUniformsForT(t);
  });

  hudEl.textContent =
    `t=${t.toFixed(2)}  ch=${p.chapterIndex} ${p.chapterName}  phase=${p.phase} (${p.phaseT.toFixed(2)})  shot=${p.shotType}\n` +
    `fold=${p.fold.toFixed(2)} blend=${p.foldBlend.toFixed(2)} turb=${p.turbulence.toFixed(2)} frac=${p.fracture.toFixed(2)} form=${p.formBlend.toFixed(2)}\n` +
    `camDist=${p.camDist.toFixed(2)} contrast=${p.contrast.toFixed(2)} colorMix=${p.colorMix.toFixed(2)} restraint=${p.restraint.toFixed(2)} mem=${p.memoryWeight.toFixed(2)} grain=${p.grainBoost.toFixed(2)}`;

  return p;
}

function frame() {
  requestAnimationFrame(frame);
  if (manualT !== null) return; // headless mode takes over entirely
  const t = audio.currentTime;
  renderAt(t);
}

// Everything below needs the beat/bar grid loaded first (CameraDirector's
// shot-segment table is built from it) — the piece can't correctly render
// a single frame before this resolves, so nothing is exposed to the
// capture harness or the click-to-play flow until init() completes.
async function init() {
  const res = await fetch("/beat_grid.json");
  const grid = await res.json();
  cameraDirector.init(grid.bar_times);

  // AudioFeatureEngine is optional at this stage of the build — if the v2
  // analysis hasn't been generated/copied to public/ yet, VisualDirector
  // falls back to pure MACRO behavior (see VisualDirector.sample) rather
  // than blocking the whole piece from rendering.
  try {
    await featureEngine.load("/audio_features_v2.bin", "/audio_features_v2.schema.json");
    console.log(`AudioFeatureEngine loaded: ${featureEngine.nFrames} frames`);
  } catch (err) {
    console.warn("AudioFeatureEngine not available, running MACRO-only:", err);
  }

  window.__AUUH_RENDER_AT__ = (t) => {
    manualT = t;
    pipeline.reset();
    const warmStart = Math.max(0, t - WARMUP_SECONDS);
    pipeline.warmUp(applyUniformsForT, warmStart, t, WARMUP_STEP);
    renderAt(t);
  };
  window.__AUUH_DURATION__ = DURATION;

  // Master sequential mode (Phase 6/10): render the next frame continuing
  // unbroken feedback history, no reset/warm-up. Used by the offline
  // master render pipeline, which calls this in strictly increasing t order.
  window.__AUUH_RENDER_SEQUENTIAL__ = (t) => {
    manualT = t;
    renderAt(t);
  };

  window.__AUUH_READY__ = true;

  startOverlay.addEventListener("click", async () => {
    startOverlay.classList.add("hidden");
    await audio.start();
    frame();
  });

  // Headless/QA mode: skip the click-to-play overlay entirely when driven
  // by the capture harness.
  if (new URLSearchParams(location.search).has("headless")) {
    startOverlay.classList.add("hidden");
    renderAt(0);
  }
}

init();
