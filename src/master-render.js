import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders/main.frag.js";
import { CameraDirector } from "./core/CameraDirector.js";
import { FeedbackPipeline } from "./core/FeedbackPipeline.js";
import { AudioFeatureEngine } from "./core/AudioFeatureEngine.js";
import { VisualDirector } from "./core/VisualDirector.js";
import { MusicalDirector } from "./core/MusicalDirector.js";
import { SceneDirector } from "./core/SceneDirector.js";
import { LightDirector } from "./core/LightDirector.js";
import { MaterialDirector } from "./core/MaterialDirector.js";
import { DirectorCueSheet } from "./core/DirectorCueSheet.js";
import directorCues from "./direction/director-cue-sheet.json";
import { createFrameDirector } from "./core/FrameDirector.js";

// V4 Part 1 — the TRUE offline master renderer. Unlike proxy-record.js:
//   - NO real-time playback, NO requestAnimationFrame, NO audio element,
//     NO MediaRecorder, NO browser audio capture (Part 9: audio is muxed
//     separately from the original source, never captured from the page).
//   - Every frame is requested explicitly by the driver at
//     t = frameIndex / fps via __AUUH_RENDER_SEQUENTIAL__, called in
//     strictly increasing order — identical discipline to main.js's
//     master-sequential mode, just driven frame-by-frame from Node instead
//     of from a live rAF loop, so there is no dependency on real-time
//     browser performance and no dropped/duplicated frames are possible.
//   - Resolution/quality are configurable via URL query params
//     (?w=3840&h=2160&quality=MASTER) rather than hardcoded, per Part 1's
//     --width/--height/--quality CLI requirements (analysis/render_master.mjs
//     forwards its own CLI flags into this URL).
//
// Frame delivery to Node: __AUUH_RENDER_AND_SEND__(t, endpoint) reads the
// canvas's raw pixels via gl.readPixels and POSTs them to a local HTTP
// endpoint (analysis/render_master.mjs's own frame-sink server) rather than
// returning them through page.evaluate()'s JSON-serialized return channel
// — a 3840x2160 RGBA frame is ~33MB, and CDP's Runtime.evaluate return-by-
// value path serializes through JSON, which measured (see docs/v4-
// mastering-audit.md's architecture-benchmark section) as dramatically
// slower than letting the browser's own network stack send raw bytes to a
// localhost server that pipes them directly into ffmpeg's stdin.

const params = new URLSearchParams(location.search);
const WIDTH = parseInt(params.get("w") || "1280", 10);
const HEIGHT = parseInt(params.get("h") || "720", 10);
const QUALITY = params.get("quality") || "PREVIEW"; // PREVIEW | MASTER | ULTRA — see FeedbackPipeline.js
const SS = parseFloat(params.get("ss") || "1"); // supersample factor — render at WIDTH*SS x HEIGHT*SS, downsample happens ffmpeg-side (Part 4)

const renderWidth = Math.round(WIDTH * SS);
const renderHeight = Math.round(HEIGHT * SS);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(renderWidth, renderHeight);
document.getElementById("app").appendChild(renderer.domElement);

const WALL_THICKNESS = 0.16;

const uniforms = {
  uResolution: { value: new THREE.Vector2(renderWidth, renderHeight) },
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
  uPrevFrame: { value: null },
  uHistory1: { value: null },
  uHistory2: { value: null },
  uHistory3: { value: null },
  uMemoryWeight: { value: 0 },
  uMemoryDrift: { value: new THREE.Vector2(0, 0) },
  uFormBlend: { value: 0 },
  uGrainBoost: { value: 1 },
  uWallThickness: { value: WALL_THICKNESS },
  uFieldWeight: { value: 0 },
  uEchoWeight: { value: 0 },
  uBlackout: { value: 0 },
  uLightMode: { value: 1 },
  uLightDir: { value: new THREE.Vector3(0.6, 0.75, -0.3) },
  uLightIntensity: { value: 1.0 },
  uAmbient: { value: 0.02 },
  uRimAmount: { value: 0.18 },
  uMaterialMode: { value: 0 },
  uAlbedo: { value: 0.85 },
  uSpecular: { value: 0.15 },
  uRoughness: { value: 0.85 },
  uGrainMix: { value: 1.0 },
  // V4 Part 6: resolution-independent grain/scanline reference — see
  // main.frag.js. Fixed to the ORIGINAL 1280x720 authored reference
  // regardless of actual render resolution, so 4K doesn't change the
  // perceptual grain/scanline density (only sharpens what's already there).
  uGrainRefWidth: { value: 1280 },
  uGrainRefHeight: { value: 720 },
  // V4 Part 3: ?testpattern=1 renders the color-calibration bars instead
  // of the piece — see main.frag.js and docs/v4-color-pipeline.md.
  uTestPattern: { value: params.get("testpattern") === "1" ? 1 : 0 },
  uAssembly: { value: 1 }, // Journey v38 — 1.0 = pre-journey baseline, exact bypass in the shader
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const quad = new THREE.Mesh(geometry, material);
const pipeline = new FeedbackPipeline(renderer, quad, material, renderWidth, renderHeight, QUALITY);
pipeline.reset();

const cameraDirector = new CameraDirector();
const featureEngine = new AudioFeatureEngine();
const visualDirector = new VisualDirector(featureEngine);
const musicalDirector = new MusicalDirector();
const sceneDirector = new SceneDirector(musicalDirector);
const lightDirector = new LightDirector();
const materialDirector = new MaterialDirector();
const directorCueSheet = new DirectorCueSheet(directorCues);

// Shared film-state logic (journey v38 Part 2) — see src/core/
// FrameDirector.js's header. This is the file that produces the actual
// master; enableJourney:true means the master master render is driven by
// the exact same EvolutionDirector/JourneyExpressionDirector state main.js
// (interactive) and director-review.js (human review) already see —
// "we cannot creatively approve one renderer and master a subtly
// different one."
const frameDirector = createFrameDirector({
  uniforms,
  directorCueSheet,
  visualDirector,
  cameraDirector,
  sceneDirector,
  lightDirector,
  materialDirector,
  featureEngine,
  musicalDirector,
  enableJourney: true,
});
const applyUniformsForT = frameDirector.applyUniformsForT;

// V3.9 Part 8 — assembly diagnostic contact sheet support (analysis/
// assembly_diagnostic.mjs). ?diagPin=1 pins camera/light/material/look
// uniforms to fixed neutral values AFTER the normal journey pipeline sets
// them for this frame, and ?forceAssembly=<0..1> additionally overrides
// uAssembly — so a set of renders at the SAME t with only forceAssembly
// varying isolates exactly what uAssembly does to the geometry, with
// nothing else (camera framing, light angle, material, grain) confounding
// the comparison. Never touched by any non-diagnostic call site (both
// params default off).
const DIAG_PIN = params.get("diagPin") === "1";
const FORCE_ASSEMBLY = params.get("forceAssembly") != null ? parseFloat(params.get("forceAssembly")) : null;

function applyDiagnosticPins() {
  // Distance chosen so the full fragment scatter at the LOWEST tested
  // assembly value stays inside frame: ring radius (up to 1.9) + detach
  // distance (up to 3.8) puts a fragment as far as ~5.7 units from origin
  // (see main.frag.js's fragmentBead()) — wider than the old domain-warp
  // system's ~2.6 max, since these are now real discrete pieces actually
  // traveling away from home, not a subtle warp.
  uniforms.uCamPos.value.set(8.3, 3.6, 9.7);
  uniforms.uCamTarget.value.set(0, 0, 0);
  uniforms.uFov.value = 45;
  uniforms.uFold.value = 1;
  uniforms.uFoldBlend.value = 0;
  uniforms.uTurbulence.value = 0;
  uniforms.uFracture.value = 0;
  uniforms.uContrast.value = 0.8;
  uniforms.uColorMix.value = 0;
  uniforms.uRestraint.value = 0;
  uniforms.uFormBlend.value = 0;
  uniforms.uGrainBoost.value = 1;
  uniforms.uGrainMix.value = 0.2; // reduced, not zero — enough left to judge material read, not so much it obscures assembly seams
  uniforms.uFieldWeight.value = 0;
  uniforms.uEchoWeight.value = 0;
  uniforms.uBlackout.value = 0;
  uniforms.uLightMode.value = 1;
  uniforms.uLightDir.value.set(0.6, 0.75, -0.3);
  uniforms.uLightIntensity.value = 1.0;
  uniforms.uAmbient.value = 0.06; // slightly brighter than default so the diagnostic image reads clearly without needing grading
  uniforms.uRimAmount.value = 0.18;
  uniforms.uMaterialMode.value = 0;
  uniforms.uAlbedo.value = 0.85;
  uniforms.uSpecular.value = 0.15;
  uniforms.uRoughness.value = 0.85;
  if (FORCE_ASSEMBLY != null) uniforms.uAssembly.value = FORCE_ASSEMBLY;
}

function renderAt(t) {
  pipeline.renderFrame(() => {
    applyUniformsForT(t);
    if (DIAG_PIN) applyDiagnosticPins();
  });
}

// Architecture A (chosen — see docs/v4-mastering-audit.md's benchmark
// section): read the canvas's raw RGBA8 pixels directly via gl.readPixels
// and POST them to a local Node HTTP sink, which pipes straight into
// ffmpeg's stdin as rawvideo. No PNG encode/decode, no MediaRecorder, no
// intermediate compression generation.
window.__AUUH_RENDER_AND_SEND__ = async (t, endpoint) => {
  renderAt(t);
  const gl = renderer.getContext();
  const buffer = new Uint8Array(renderWidth * renderHeight * 4);
  gl.readPixels(0, 0, renderWidth, renderHeight, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  await fetch(endpoint, { method: "POST", body: buffer });
};

// Architecture C comparison path: just render, let the driver call
// page.screenshot() externally (no page-side code needed beyond rendering).
window.__AUUH_RENDER_SEQUENTIAL__ = (t) => {
  renderAt(t);
};

async function init() {
  const res = await fetch("/beat_grid.json");
  const grid = await res.json();
  cameraDirector.init(grid.bar_times);
  try {
    await featureEngine.load("/audio_features_v2.bin", "/audio_features_v2.schema.json");
  } catch (err) {
    console.warn("AudioFeatureEngine not available:", err);
  }
  try {
    await musicalDirector.load("/track-map.json", "/annotations.json", featureEngine);
  } catch (err) {
    console.warn("MusicalDirector not available:", err);
  }
  try {
    await frameDirector.loadJourneyData();
  } catch (err) {
    console.warn("Journey data not available:", err);
  }
  renderAt(0);
  window.__AUUH_MASTER_READY__ = true;
}
init();
