import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders/main.frag.js";
import { CameraDirector } from "./core/CameraDirector.js";
import { AudioEngine } from "./core/audio.js";
import { DURATION, EVENTS, RESTRAINT_WINDOWS } from "./core/timeline.js";
import { FeedbackPipeline } from "./core/FeedbackPipeline.js";
import { AudioFeatureEngine } from "./core/AudioFeatureEngine.js";
import { VisualDirector } from "./core/VisualDirector.js";
import { MusicalDirector } from "./core/MusicalDirector.js";
import { SceneDirector, FAMILY } from "./core/SceneDirector.js";
import { LightDirector, LIGHT_MODE, getLightRecipe } from "./core/LightDirector.js";
import { MaterialDirector, getMaterialRecipe } from "./core/MaterialDirector.js";
import { DirectorCueSheet } from "./core/DirectorCueSheet.js";
import directorCues from "./direction/director-cue-sheet.json";

// V3.5 item 2 — the director review mode. This is a SEPARATE entry point
// (director.html) from the main piece (index.html/main.js), not a mode
// flag on the shipped page: it needs a persistent bottom control panel,
// scrub bar, and annotation keyboard handling that have no business being
// in the production single-page app. It intentionally duplicates main.js's
// small renderer-bootstrap wiring (uniforms, pipeline, directors) rather
// than importing from main.js, which is a script with no exports — the
// actual direction LOGIC (every core/* module) is fully shared, so there
// is no risk of the two pages disagreeing about what the piece looks like
// at a given t; only the bootstrap glue is duplicated.

const LIGHT_MODE_NAMES = Object.fromEntries(Object.entries(LIGHT_MODE).map(([k, v]) => [v, k]));

const appEl = document.getElementById("app");
const hudEl = document.getElementById("hud");
const startOverlay = document.getElementById("startOverlay");
const scrubEl = document.getElementById("scrub");
const timeLabelEl = document.getElementById("timeLabel");
const rangeIndicatorEl = document.getElementById("rangeIndicator");
const noteInputEl = document.getElementById("noteInput");
const listEl = document.getElementById("list");
const countLabelEl = document.getElementById("countLabel");

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
appEl.appendChild(renderer.domElement);

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
  uGrainRefWidth: { value: 1280 },
  uGrainRefHeight: { value: 720 },
  uTestPattern: { value: 0 },
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const quad = new THREE.Mesh(geometry, material);
const pipeline = new FeedbackPipeline(renderer, quad, material, window.innerWidth, window.innerHeight);
pipeline.reset();

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
  const h = appEl.clientHeight;
  renderer.setSize(w, h);
  pipeline.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  uniforms.uResolution.value.set(w, h);
}
window.addEventListener("resize", resize);
resize();

function memoryDriftAt(t) {
  const dx = Math.sin(t * 0.13) * 0.0035 + Math.sin(t * 0.037) * 0.0018;
  const dy = Math.cos(t * 0.11) * 0.0035 + Math.cos(t * 0.029) * 0.0018;
  return [dx, dy];
}

function familyWeight(scene, family) {
  if (scene.primaryFamily === family) return 1 - scene.blend;
  if (scene.secondaryFamily === family) return scene.blend;
  return 0;
}

// Identical to src/main.js's applyUniformsForT — see that file's comments
// for the full reasoning behind the director-cue override layer. Kept as a
// parallel copy rather than a shared import (see file header comment).
function applyUniformsForT(t) {
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
  p.meso = scene.meso;
  p.directorCue = cue;
  return p;
}

let lastP = null;

function renderAt(t) {
  pipeline.renderFrame(() => {
    lastP = applyUniformsForT(t);
  });
  hudEl.textContent =
    `t=${t.toFixed(2)}  ch=${lastP.chapterIndex} ${lastP.chapterName}  phase=${lastP.phase} (${lastP.phaseT.toFixed(2)})  shot=${lastP.shotType} (${lastP.transitionType})\n` +
    `scene=${lastP.primaryFamily}->${lastP.secondaryFamily} (${lastP.blend.toFixed(2)}) ${lastP.sceneState}  material=${lastP.materialName}  light=${LIGHT_MODE_NAMES[lastP.lightMode]}  chamberInterior=${lastP.chamberInteriorActive}\n` +
    (lastP.directorCue ? `CUE: ${lastP.directorCue.reason || "(no reason)"}\n` : "") +
    (lastP.meso ? `meso: track=${lastP.meso.track} tension=${lastP.meso.tensionState} density=${lastP.meso.densityState} event=${lastP.meso.exceptionalEvent || "-"}/${lastP.meso.exceptionalEventConfidence || "-"}` : "");
  return lastP;
}

// ---------- transport ----------
const WARMUP_SECONDS = 3.0;
const WARMUP_STEP = 1 / 30;
let playing = false;

function seekTo(t) {
  t = Math.max(0, Math.min(DURATION, t));
  audio.seek(t);
  pipeline.reset();
  const warmStart = Math.max(0, t - WARMUP_SECONDS);
  pipeline.warmUp(applyUniformsForT, warmStart, t, WARMUP_STEP);
  renderAt(t);
  updateTransportUI(t);
}

function updateTransportUI(t) {
  const mm = Math.floor(t / 60);
  const ss = (t % 60).toFixed(1).padStart(4, "0");
  const totalMm = Math.floor(DURATION / 60);
  const totalSs = (DURATION % 60).toFixed(1).padStart(4, "0");
  timeLabelEl.textContent = `${mm}:${ss} / ${totalMm}:${totalSs}${playing ? "  ▶" : "  ⏸"}`;
  if (document.activeElement !== scrubEl) scrubEl.value = String(t);
}

function frame() {
  requestAnimationFrame(frame);
  if (!playing) return;
  const t = audio.currentTime;
  renderAt(t);
  updateTransportUI(t);
  if (audio.ended) togglePlay(false);
}

function togglePlay(forceState) {
  const next = forceState != null ? forceState : !playing;
  if (next === playing) return;
  playing = next;
  if (playing) audio.start();
  else audio.pause();
  updateTransportUI(audio.currentTime);
}

scrubEl.addEventListener("input", () => {
  togglePlay(false);
  seekTo(parseFloat(scrubEl.value));
});

// ---------- annotations ----------
const STORAGE_KEY = "auuh_director_notes_v1";
let annotations = [];
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) annotations = JSON.parse(saved).annotations || [];
} catch {
  // corrupt/absent localStorage — start fresh, not fatal
}

let pendingRangeStart = null;

const TYPE_KEYS = {
  k: "KEEP",
  b: "BORING",
  v: "TOO_VJ",
  w: "WOW",
  s: "NEEDS_STILLNESS",
  c: "BAD_CAMERA",
  l: "BAD_LIGHT",
  m: "MUSICAL_EVENT",
  t: "TRACK_TRANSITION",
  d: "DROP_RETURN",
  r: "BREAKDOWN",
  o: "OTHER",
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ annotations, savedAt: new Date().toISOString() }));
  } catch {
    // storage full/unavailable — annotations still exist in memory and can be exported manually
  }
}

function fmtT(t) {
  const mm = Math.floor(t / 60);
  const ss = (t % 60).toFixed(1).padStart(4, "0");
  return `${mm}:${ss}`;
}

function renderList() {
  countLabelEl.textContent = `${annotations.length} annotation${annotations.length === 1 ? "" : "s"}`;
  listEl.innerHTML = "";
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    const row = document.createElement("div");
    row.className = "row";
    const timeStr = a.time != null ? fmtT(a.time) : `${fmtT(a.start)}–${fmtT(a.end)}`;
    row.innerHTML =
      `<span class="t">${timeStr}</span>` +
      `<span class="type">${a.type}</span>` +
      `<span class="ctx">${a.chapter} / ${a.shot} / ${a.scene} / ${a.light} / ${a.material}</span>` +
      `<span class="text">${a.text || ""}</span>`;
    row.addEventListener("click", () => {
      togglePlay(false);
      seekTo(a.time != null ? a.time : a.start);
    });
    listEl.appendChild(row);
  }
}

function addAnnotation(type) {
  const t = audio.currentTime;
  const timeFields = pendingRangeStart != null ? { start: pendingRangeStart, end: t } : { time: t };
  pendingRangeStart = null;
  rangeIndicatorEl.textContent = "";

  const p = lastP || {};
  const a = {
    ...timeFields,
    type,
    text: "",
    chapter: p.chapterName ?? null,
    shot: p.shotType ?? null,
    scene: p.primaryFamily ? `${p.primaryFamily}->${p.secondaryFamily}(${(p.blend ?? 0).toFixed(2)})` : null,
    light: p.lightMode != null ? LIGHT_MODE_NAMES[p.lightMode] : null,
    material: p.materialName ?? null,
    meso: p.meso ? { ...p.meso } : null,
  };
  annotations.push(a);
  persist();
  renderList();
  noteInputEl.value = "";
  noteInputEl.focus();
}

function attachNoteToLast() {
  if (annotations.length === 0) return;
  annotations[annotations.length - 1].text = noteInputEl.value.trim();
  persist();
  renderList();
  noteInputEl.value = "";
  noteInputEl.blur();
}

document.addEventListener("keydown", (e) => {
  if (document.activeElement === noteInputEl) {
    if (e.key === "Enter") {
      e.preventDefault();
      attachNoteToLast();
    } else if (e.key === "Escape") {
      noteInputEl.value = "";
      noteInputEl.blur();
    }
    return; // never treat other keys as shortcuts while typing a note
  }

  if (e.key === " ") {
    e.preventDefault();
    togglePlay();
    return;
  }
  if (e.key === "[") {
    pendingRangeStart = audio.currentTime;
    rangeIndicatorEl.textContent = `range start: ${fmtT(pendingRangeStart)}`;
    return;
  }
  if (e.key === "Escape") {
    pendingRangeStart = null;
    rangeIndicatorEl.textContent = "";
    return;
  }
  if (e.key.toLowerCase() === "e") {
    exportNotes();
    return;
  }
  if (e.key.toLowerCase() === "i") {
    document.getElementById("importFile").click();
    return;
  }
  const type = TYPE_KEYS[e.key.toLowerCase()];
  if (type) {
    e.preventDefault();
    addAnnotation(type);
  }
});

function exportNotes() {
  const payload = { annotations, duration: DURATION, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "director-notes.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("exportBtn").addEventListener("click", exportNotes);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    annotations = data.annotations || [];
    persist();
    renderList();
  } catch (err) {
    console.error("Failed to import director-notes.json:", err);
  }
  e.target.value = "";
});

renderList();

// ---------- init ----------
async function init() {
  const res = await fetch("/beat_grid.json");
  const grid = await res.json();
  cameraDirector.init(grid.bar_times);

  try {
    await featureEngine.load("/audio_features_v2.bin", "/audio_features_v2.schema.json");
  } catch (err) {
    console.warn("AudioFeatureEngine not available, running MACRO-only:", err);
  }

  try {
    await musicalDirector.load("/track-map.json", "/annotations.json", featureEngine);
  } catch (err) {
    console.warn("MusicalDirector not available, SceneDirector running MACRO-only:", err);
  }

  scrubEl.max = String(DURATION);
  renderAt(0);
  updateTransportUI(0);

  startOverlay.addEventListener("click", () => {
    startOverlay.classList.add("hidden");
    togglePlay(true);
    frame();
  });

  // V3.5 item 8: introspection hooks for analysis/generate_shot_manifest.mjs
  // — read-only, no rendering side effects (applyUniformsForT only sets
  // plain JS uniform values; it does not call pipeline.renderFrame/GPU
  // work unless wrapped, which this deliberately doesn't do).
  window.__AUUH_SHOT_SEGMENTS__ = () => cameraDirector.shotSegments;
  window.__AUUH_META__ = () => ({
    restraintWindows: RESTRAINT_WINDOWS,
    macroEvents: EVENTS,
    exceptionalEvents: musicalDirector.exceptionalEvents,
  });
  window.__AUUH_STATE_AT__ = (t) => {
    const p = applyUniformsForT(t);
    return {
      t,
      chapter: p.chapterName,
      shot: p.shotType,
      transition: p.transitionType,
      scene: `${p.primaryFamily}->${p.secondaryFamily}(${p.blend.toFixed(2)})`,
      sceneState: p.sceneState,
      light: LIGHT_MODE_NAMES[p.lightMode],
      material: p.materialName,
      chamberInteriorActive: p.chamberInteriorActive,
      meso: p.meso,
    };
  };
  window.__AUUH_DIRECTOR_READY__ = true;
}

init();
