import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders/main.frag.js";
import { CameraDirector } from "./core/CameraDirector.js";
import { AudioEngine } from "./core/audio.js";
import { DURATION, EVENTS } from "./core/timeline.js";
import { FeedbackPipeline } from "./core/FeedbackPipeline.js";
import { AudioFeatureEngine } from "./core/AudioFeatureEngine.js";
import { VisualDirector } from "./core/VisualDirector.js";
import { MusicalDirector } from "./core/MusicalDirector.js";
import { SceneDirector, FAMILY } from "./core/SceneDirector.js";
import { LightDirector, getLightRecipe } from "./core/LightDirector.js";
import { MaterialDirector, getMaterialRecipe } from "./core/MaterialDirector.js";
import { DirectorCueSheet } from "./core/DirectorCueSheet.js";
import directorCues from "./direction/director-cue-sheet.json";

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

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

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

// Slowly-evolving feedback drift — an organic wobble to the ghost trail's
// displacement, not a fixed direction (a fixed drift would read as simple
// directional smear rather than a dreamlike, spatial persistence).
function memoryDriftAt(t) {
  const dx = Math.sin(t * 0.13) * 0.0035 + Math.sin(t * 0.037) * 0.0018;
  const dy = Math.cos(t * 0.11) * 0.0035 + Math.cos(t * 0.029) * 0.0018;
  return [dx, dy];
}

// How much of a family's presence is "live" right now, given SceneDirector's
// primary/secondary/blend model (blend=0 -> pure primary, blend=1 -> pure
// secondary) — shared by the FIELD and ECHO uniform wiring below.
function familyWeight(scene, family) {
  if (scene.primaryFamily === family) return 1 - scene.blend;
  if (scene.secondaryFamily === family) return scene.blend;
  return 0;
}

function applyUniformsForT(t) {
  // V3.5 item 3: DIRECTOR CUE is the top of the fallback priority
  // (DIRECTOR CUE > structurally-verified/human-confirmed event > MACRO/
  // MESO plan > generative fallback). Looked up FIRST so `microResponse`
  // can affect VisualDirector's own MICRO sampling below, not just be
  // patched on after the fact.
  const cue = directorCueSheet.at(t);

  const p = visualDirector.sample(t, cue && cue.microResponse != null ? cue.microResponse : 1);
  let cam = cameraDirector.update(p);
  let scene = sceneDirector.sample(t);

  if (cue) {
    if (cue.cameraMotion || cue.shot) cam = cameraDirector.resolveCueCamera(cue, t);
    if (cue.primaryFamily) {
      scene = {
        ...scene,
        primaryFamily: cue.primaryFamily,
        secondaryFamily: cue.secondaryFamily || scene.secondaryFamily,
        blend: cue.sceneBlend != null ? cue.sceneBlend : scene.blend,
        sceneState: "DIRECTED",
      };
    }
  }

  // CHAMBER_PRESENCE vs. CHAMBER_INTERIOR (V3.5 item 1D): scene.
  // primaryFamily/secondaryFamily === CHAMBER is the aesthetic reading
  // (material/atmosphere); chamberInteriorActive is the separate, honest
  // signal for literal interior camera traversal. True ONLY during
  // PASS_THROUGH, which by construction (every other shot/motion recipe
  // clamps distance outside the solid via occupancy limits or safeMinDist)
  // is the only shot type capable of crossing the wall threshold — see
  // SceneDirector.js's header comment for the full reasoning.
  const chamberInteriorActive = cam.shotType === "PASS_THROUGH";

  let light = lightDirector.sample(t, scene.sceneState);
  if (cue && cue.light) {
    const override = getLightRecipe(cue.light);
    if (override) light = override;
  }

  const dominantFamily = scene.blend > 0.5 ? scene.secondaryFamily : scene.primaryFamily;
  let mat = materialDirector.sample(p.chapterIndex, dominantFamily, scene.sceneState);
  if (cue && cue.material) {
    const override = getMaterialRecipe(cue.material);
    if (override) mat = override;
  }

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
  uniforms.uFormBlend.value = p.formBlend;
  uniforms.uGrainBoost.value = p.grainBoost;

  // TEMPORAL_DISSOLVE cuts (Fracture's restraint pockets) boost memoryWeight
  // for ~2s right at the cut so the previous shot visibly persists/decays
  // through the feedback trail instead of swapping instantly — see
  // CameraDirector's transition-grammar comment. A director cue's
  // `memoryBehavior` can override memoryWeight directly (a number) or
  // request the same boosted-decay ramp as TEMPORAL_DISSOLVE ("DISSOLVE").
  let memoryWeight = p.memoryWeight + cam.dissolveWeight * 0.6;
  if (cue && cue.memoryBehavior === "DISSOLVE") {
    const timeSinceStart = t - cue.start;
    memoryWeight = Math.max(memoryWeight, 1 - Math.min(1, timeSinceStart / 2.0));
  } else if (cue && typeof cue.memoryBehavior === "number") {
    memoryWeight = cue.memoryBehavior;
  }
  uniforms.uMemoryWeight.value = Math.min(0.95, memoryWeight);
  const [dx, dy] = memoryDriftAt(t);
  uniforms.uMemoryDrift.value.set(dx, dy);

  uniforms.uWallThickness.value = WALL_THICKNESS;
  uniforms.uFieldWeight.value = familyWeight(scene, FAMILY.FIELD);
  uniforms.uEchoWeight.value = familyWeight(scene, FAMILY.ECHO);
  uniforms.uBlackout.value = smoothstep(EVENTS.silenceFloor, DURATION, t);

  uniforms.uLightMode.value = light.mode;
  uniforms.uLightDir.value.set(light.dir[0], light.dir[1], light.dir[2]);
  uniforms.uLightIntensity.value = light.intensity;
  uniforms.uAmbient.value = light.ambient;
  uniforms.uRimAmount.value = light.rim;

  uniforms.uMaterialMode.value = mat.mode;
  uniforms.uAlbedo.value = mat.albedo;
  uniforms.uSpecular.value = mat.specular;
  uniforms.uRoughness.value = mat.roughness;
  uniforms.uGrainMix.value = mat.grainMix;

  p.shotType = cam.shotType;
  p.transitionType = cam.transitionType;
  p.sceneState = scene.sceneState;
  p.primaryFamily = scene.primaryFamily;
  p.secondaryFamily = scene.secondaryFamily;
  p.blend = scene.blend;
  p.materialName = mat.material;
  p.lightMode = light.mode;
  p.chamberInteriorActive = chamberInteriorActive;
  p.meso = scene.meso; // MusicalDirector.sample(t) snapshot — used by director-review.js annotations
  p.directorCue = cue; // null when undirected — used by director-review.js and HUD
  return p;
}

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
    (p.meso ? `meso: track=${p.meso.track} tension=${p.meso.tensionState} density=${p.meso.densityState} event=${p.meso.exceptionalEvent || "-"}/${p.meso.exceptionalEventConfidence || "-"}` : "");

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
