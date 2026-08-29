import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders/main.frag.js";
import { CameraDirector } from "./core/CameraDirector.js";
import { AudioEngine } from "./core/audio.js";
import { DURATION } from "./core/timeline.js";
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

const appEl = document.getElementById("app");
const hudEl = document.getElementById("hud");
const startOverlay = document.getElementById("startOverlay");

// docs/v3-creative-direction.md §1: every existing QA preview clip has the
// debug HUD baked into the frame, which changes how a composed shot reads
// (text over the bottom third of frame). ?hud=off hides the overlay so
// exemplar renders can be judged purely on composition.
if (new URLSearchParams(location.search).get("hud") === "off") {
  hudEl.style.display = "none";
}

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
appEl.appendChild(renderer.domElement);

// CHAMBER shell thickness (V3 Phase 3) — a single shared constant rather
// than a per-family-blend-modulated value: the interior/exterior switch is
// driven by real camera position crossing this thickness (main.frag.js),
// not by a continuous blend, so varying it per frame would make where the
// camera can safely cross both fuzzy and non-deterministic-feeling.
const WALL_THICKNESS = 0.16;

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
  // Phase 6/7 (temporal feedback) uniforms — uPrevFrame/uHistory1-3 are
  // assigned per-frame by FeedbackPipeline from its history ring.
  uPrevFrame: { value: null },
  uHistory1: { value: null },
  uHistory2: { value: null },
  uHistory3: { value: null },
  uMemoryWeight: { value: 0 },
  uMemoryDrift: { value: new THREE.Vector2(0, 0) },
  // BODY topology blend (v2 Phase 3) + micro-texture boost (v2 Phase 4)
  uFormBlend: { value: 0 },
  uGrainBoost: { value: 1 },
  // V3 SceneDirector families
  uWallThickness: { value: WALL_THICKNESS },
  uFieldWeight: { value: 0 },
  uEchoWeight: { value: 0 },
  uBlackout: { value: 0 },
  // V3 LightDirector
  uLightMode: { value: 1 },
  uLightDir: { value: new THREE.Vector3(0.6, 0.75, -0.3) },
  uLightIntensity: { value: 1.0 },
  uAmbient: { value: 0.02 },
  uRimAmount: { value: 0.18 },
  // V3 MaterialDirector
  uMaterialMode: { value: 0 },
  uAlbedo: { value: 0.85 },
  uSpecular: { value: 0.15 },
  uRoughness: { value: 0.85 },
  uGrainMix: { value: 1.0 },
  // V4 Part 6: fixed grain/scanline reference resolution — see main.frag.js.
  uGrainRefWidth: { value: 1280 },
  uGrainRefHeight: { value: 720 },
  uTestPattern: { value: 0 },
  uAssembly: { value: 1 }, // Journey v38 — 1.0 = pre-journey baseline, exact bypass in the shader
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

pipeline.reset(); // start the history ring from a known black state

const cameraDirector = new CameraDirector();
const audio = new AudioEngine("/AUUH.m4a");
const featureEngine = new AudioFeatureEngine();
const visualDirector = new VisualDirector(featureEngine);
const musicalDirector = new MusicalDirector();
const sceneDirector = new SceneDirector(musicalDirector);
const lightDirector = new LightDirector();
const materialDirector = new MaterialDirector();
const directorCueSheet = new DirectorCueSheet(directorCues);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  pipeline.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  uniforms.uResolution.value.set(w, h);
}
window.addEventListener("resize", resize);
resize();

// Shared film-state logic (journey v38 Part 2) — see src/core/
// FrameDirector.js's header for why this used to be four independently-
// maintained, byte-identical copies of this exact function, and why that
// was a real risk ("we cannot creatively approve one renderer and master
// a subtly different one"). enableJourney:true wires EvolutionDirector/
// JourneyExpressionDirector in — main.js gets the same journey behavior
// master-render.js will use for the final master, so what's creatively
// approved interactively is what actually renders.
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

// Manual time override for the QA/screenshot/preview-render harness
// (Puppeteer sets window.__AUUH_MANUAL_T__ and calls __AUUH_RENDER_AT__).
let manualT = null;

// Seek/QA mode: warm up the feedback ring from WARMUP_SECONDS before the
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
    `t=${t.toFixed(2)}  ch=${p.chapterIndex} ${p.chapterName}  phase=${p.phase} (${p.phaseT.toFixed(2)})  shot=${p.shotType} (${p.transitionType})\n` +
    `fold=${p.fold.toFixed(2)} blend=${p.foldBlend.toFixed(2)} turb=${p.turbulence.toFixed(2)} frac=${p.fracture.toFixed(2)} form=${p.formBlend.toFixed(2)}\n` +
    `camDist=${p.camDist.toFixed(2)} contrast=${p.contrast.toFixed(2)} colorMix=${p.colorMix.toFixed(2)} restraint=${p.restraint.toFixed(2)} mem=${p.memoryWeight.toFixed(2)} grain=${p.grainBoost.toFixed(2)}\n` +
    `scene=${p.primaryFamily}->${p.secondaryFamily} (${p.blend.toFixed(2)}) ${p.sceneState}  material=${p.materialName}  light=${p.lightMode}  chamberInterior=${p.chamberInteriorActive}\n` +
    (p.directorCue ? `CUE: ${p.directorCue.reason || "(no reason given)"}\n` : "") +
    (p.meso ? `meso: track=${p.meso.track} tension=${p.meso.tensionState} density=${p.meso.densityState} event=${p.meso.exceptionalEvent || "-"}/${p.meso.exceptionalEventConfidence || "-"}\n` : "") +
    (p.journeyExpression
      ? `journey: phase=${p.journeyExpression.filmPhase} tier=${p.journeyExpression.eventTier} assembly=${p.journeyExpression.assemblyExpression.toFixed(2)} interior=${p.journeyExpression.interiorExpression.toFixed(2)} field=${p.journeyExpression.fieldExpression.toFixed(2)} stillness=${p.journeyExpression.cameraStillness.toFixed(2)} stored=${p.evolution.storedEnergy.toFixed(2)}`
      : "");

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

  // MusicalDirector (V3 Phase 1) is also optional/graceful — SceneDirector
  // falls back to MACRO-only family plans if track-map.json can't load, and
  // the 17:47 CHAMBER reveal itself is driven by CameraDirector's own
  // hardcoded PASS_THROUGH splice + the shader's real-camera-position
  // interior detection, so it does not depend on MusicalDirector at all.
  try {
    await musicalDirector.load("/track-map.json", "/annotations.json", featureEngine);
    console.log(`MusicalDirector loaded: ${musicalDirector.transitions.length} transitions`);
  } catch (err) {
    console.warn("MusicalDirector not available, SceneDirector running MACRO-only:", err);
  }

  // Journey v38: track alignment + verified structural episodes, same
  // graceful-degradation discipline as everything above — EvolutionDirector
  // still runs without them (TrackContext/StructuralEpisodes just stay
  // "not ready" and contribute nothing), so a render never depends on
  // these existing in public/.
  try {
    await frameDirector.loadJourneyData();
    console.log("Journey data loaded (track alignment + structural episodes)");
  } catch (err) {
    console.warn("Journey data not available, EvolutionDirector running without it:", err);
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
