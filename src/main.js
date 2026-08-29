import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders/main.frag.js";
import { getParams } from "./core/params.js";
import { CameraRig } from "./core/camera.js";
import { AudioEngine } from "./core/audio.js";
import { DURATION } from "./core/timeline.js";

const appEl = document.getElementById("app");
const hudEl = document.getElementById("hud");
const startOverlay = document.getElementById("startOverlay");

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const quad = new THREE.Mesh(geometry, material);
scene.add(quad);

const cameraRig = new CameraRig();
const audio = new AudioEngine("/AUUH.m4a");

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  uniforms.uResolution.value.set(w, h);
}
window.addEventListener("resize", resize);
resize();

// Manual time override for the QA/screenshot/preview-render harness
// (Puppeteer sets window.__AUUH_MANUAL_T__ and calls __AUUH_RENDER_AT__).
let manualT = null;

function renderAt(t) {
  const p = getParams(t);
  const cam = cameraRig.update(p);

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

  renderer.render(scene, orthoCamera);

  hudEl.textContent =
    `t=${t.toFixed(2)}  ch=${p.chapterIndex} ${p.chapterName}  phase=${p.phase} (${p.phaseT.toFixed(2)})\n` +
    `fold=${p.fold.toFixed(2)} blend=${p.foldBlend.toFixed(2)} turb=${p.turbulence.toFixed(2)} frac=${p.fracture.toFixed(2)}\n` +
    `camDist=${p.camDist.toFixed(2)} contrast=${p.contrast.toFixed(2)} colorMix=${p.colorMix.toFixed(2)} restraint=${p.restraint.toFixed(2)}`;

  return p;
}

// Exposed for headless capture (Puppeteer). Deterministic: same t always
// produces the same frame, independent of playback history.
window.__AUUH_RENDER_AT__ = (t) => {
  manualT = t;
  renderAt(t);
};
window.__AUUH_DURATION__ = DURATION;

function frame() {
  requestAnimationFrame(frame);
  if (manualT !== null) return; // headless mode takes over entirely
  const t = audio.currentTime;
  renderAt(t);
}

startOverlay.addEventListener("click", async () => {
  startOverlay.classList.add("hidden");
  await audio.start();
  frame();
});

// Headless/QA mode: skip the click-to-play overlay entirely when driven by
// the capture harness.
if (new URLSearchParams(location.search).has("headless")) {
  startOverlay.classList.add("hidden");
  renderAt(0);
}
