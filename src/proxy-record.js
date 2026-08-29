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

// V3.5 item 8 — the director review PROXY renderer. NOT the master: this
// plays the piece in real time (audio + rAF, exactly like a normal
// viewing) and records the canvas+audio via MediaRecorder, instead of the
// expensive deterministic per-frame Puppeteer-screenshot pipeline used for
// the Phase-13-style exemplar clips. 42 minutes of real-time playback is
// dramatically cheaper than ~30,000 individual screenshot round-trips
// (which measured at several hundred ms each during V3's exemplar
// rendering — hours for the full length), at the cost of NOT being frame-
// exact/deterministic — acceptable and correct for a proxy whose only job
// is "let Ronny watch the whole thing economically," not for the master.
//
// Fixed 1280x720 (not window-size-based) so the recording resolution is
// deterministic regardless of the host window/screen.

const WIDTH = 1280;
const HEIGHT = 720;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
document.getElementById("app").appendChild(renderer.domElement);

const WALL_THICKNESS = 0.16;
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const uniforms = {
  uResolution: { value: new THREE.Vector2(WIDTH, HEIGHT) },
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
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const quad = new THREE.Mesh(geometry, material);
const pipeline = new FeedbackPipeline(renderer, quad, material, WIDTH, HEIGHT);
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

// Identical logic to src/main.js's applyUniformsForT (see that file for
// full comments) — duplicated per this project's established pattern for
// separate entry points (director-review.js does the same).
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

  return p;
}

function renderAt(t) {
  pipeline.renderFrame(() => applyUniformsForT(t));
}

let rafHandle = null;
function loop(endT, onDone) {
  const t = audio.currentTime;
  renderAt(t);
  if (t >= endT || audio.ended) {
    onDone();
    return;
  }
  rafHandle = requestAnimationFrame(() => loop(endT, onDone));
}

// Exposed to the Puppeteer driver. startT/endT let the same page be used
// for a short validation run before committing to the full 42-minute pass.
//
// DELIBERATELY NOT an async function the caller awaits: Puppeteer's
// page.evaluate() on an async function uses CDP's Runtime.callFunctionOn
// with awaitPromise:true, which is bound by Puppeteer's protocolTimeout
// (default ~3 minutes) regardless of how long the PAGE itself is willing
// to keep running — this killed the first full-length attempt at ~3
// minutes in with "Runtime.callFunctionOn timed out," well before the
// page's own work was anywhere near done. Returning synchronously and
// running the real work in a detached async IIFE means page.evaluate()
// resolves almost immediately; the driver instead polls
// window.__PROXY_DONE__ via waitForFunction (a repeated short poll, not
// one long blocking call), which is immune to this timeout class entirely.
window.__START_PROXY_RECORDING__ = (startT = 0, endT = DURATION, fps = 15) => {
  recordProxy(startT, endT, fps);
  return true;
};

async function recordProxy(startT, endT, fps) {
  audio.seek(startT);
  // Warm the feedback ring so the recording doesn't open on a blank buffer
  // if startT > 0 (used by the short validation run against a mid-piece
  // window like the 17:47 rupture).
  if (startT > 0) {
    pipeline.reset();
    const warmStart = Math.max(0, startT - 3.0);
    pipeline.warmUp(applyUniformsForT, warmStart, startT, 1 / 30);
  }

  const videoStream = renderer.domElement.captureStream(fps);
  const audioStream = audio.el.captureStream();
  const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioStream.getAudioTracks()]);

  const recorder = new MediaRecorder(combined, {
    mimeType: "video/webm;codecs=vp8,opus",
    videoBitsPerSecond: 700_000,
    audioBitsPerSecond: 96_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "director_proxy_raw.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve();
    };
  });

  recorder.start(1000); // 1s timeslice so ondataavailable fires periodically, not just once at the end
  await audio.start();
  loop(endT, () => {
    cancelAnimationFrame(rafHandle);
    audio.pause();
    recorder.stop();
  });

  await stopped;
  window.__PROXY_DONE__ = true;
}

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
  renderAt(0);
  window.__PROXY_READY__ = true;
}
init();
