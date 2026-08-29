// Shared per-frame film-state logic, extracted verbatim from what was
// FOUR independently-maintained copies of the exact same function
// (src/main.js, src/master-render.js, src/proxy-record.js,
// src/director-review.js each had their own `applyUniformsForT`, each
// explicitly commented "identical logic to src/main.js" — confirmed
// byte-identical by direct comparison before this extraction, not
// assumed). Per the journey brief's Part 2: "we cannot creatively approve
// one renderer and master a subtly different one" — this file is the fix,
// not a new feature. All four entry points now import and call
// createFrameDirector() instead of maintaining their own copy.
//
// This is a MECHANICAL extraction for the base path — the pre-journey
// uniform-setting logic is reproduced exactly, in the same order, with
// the same variable names, so a diff against any of the four original
// functions shows only the extraction itself, not a behavior change.
// The journey wiring (EvolutionDirector/JourneyExpressionDirector/
// uAssembly/camera-light-material modulation) is ADDITIVE on top — see
// the clearly-marked "JOURNEY WIRING" section below — and every one of
// its effects is gated so that when `enableJourney` is false (the
// default), or the journey pipeline hasn't loaded yet, output is
// identical to the pre-journey function.
import { FAMILY } from "./SceneDirector.js";
import { getLightRecipe } from "./LightDirector.js";
import { getMaterialRecipe } from "./MaterialDirector.js";
import { EVENTS, DURATION } from "./timeline.js";
import { EvolutionDirector } from "./EvolutionDirector.js";
import { JourneyExpressionDirector } from "./JourneyExpressionDirector.js";
import { MusicEventStream } from "./MusicEventStream.js";

const WALL_THICKNESS = 0.16;

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
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

// MusicalDirector's own "not ready" shape (see MusicalDirector.js's
// sample() early-return) — reused here so journey wiring has a sane
// default when musicalDirector hasn't loaded (or SceneDirector's meso is
// null for the same reason), rather than crashing on undefined fields.
const NEUTRAL_MUSICAL = {
  track: 0,
  transitionProgress: 0,
  phrasePosition: 0,
  breakdown: false,
  build: false,
  drop: false,
  vocalEntry: false,
  bassEntry: false,
  densityState: "developing",
  tensionState: "low",
  exceptionalEvent: null,
  exceptionalEventConfidence: null,
};

/**
 * @param {object} deps
 * @param {object} deps.uniforms three.js ShaderMaterial uniforms object (must already declare every u* key the base path sets)
 * @param {import('./DirectorCueSheet').DirectorCueSheet} deps.directorCueSheet
 * @param {import('./VisualDirector').VisualDirector} deps.visualDirector
 * @param {import('./CameraDirector').CameraDirector} deps.cameraDirector
 * @param {import('./SceneDirector').SceneDirector} deps.sceneDirector
 * @param {import('./LightDirector').LightDirector} deps.lightDirector
 * @param {import('./MaterialDirector').MaterialDirector} deps.materialDirector
 * @param {import('./AudioFeatureEngine').AudioFeatureEngine} [deps.featureEngine] needed only if enableJourney
 * @param {import('./MusicalDirector').MusicalDirector} [deps.musicalDirector] needed only to build the optional MusicEventStream
 * @param {boolean} [deps.enableJourney] default false — see file header. When true, computes EvolutionDirector/JourneyExpressionDirector state each frame, attaches it to the returned object as `p.evolution`/`p.journeyExpression`, sets uAssembly, and passes journey state into CameraDirector/LightDirector/MaterialDirector's optional modulation params.
 * @param {string} [deps.trackContextUrl] default "/set-track-alignment.json"
 * @param {string} [deps.structuralEpisodesUrl] default "/structural-episodes.json"
 * @returns {{ applyUniformsForT: (t:number)=>object, evolutionDirector: EvolutionDirector|null, journeyExpressionDirector: JourneyExpressionDirector|null, loadJourneyData: ()=>Promise<void> }}
 */
export function createFrameDirector(deps) {
  const {
    uniforms,
    directorCueSheet,
    visualDirector,
    cameraDirector,
    sceneDirector,
    lightDirector,
    materialDirector,
    featureEngine = null,
    musicalDirector = null,
    enableJourney = false,
  } = deps;

  const evolutionDirector = enableJourney ? new EvolutionDirector() : null;
  const journeyExpressionDirector = enableJourney ? new JourneyExpressionDirector() : null;
  let eventStream = null;

  async function loadJourneyData() {
    if (!enableJourney) return;
    await evolutionDirector.trackContext.load(deps.trackContextUrl || "/set-track-alignment.json");
    await evolutionDirector.structuralEpisodes.load(deps.structuralEpisodesUrl || "/structural-episodes.json", "candidate");
    if (musicalDirector && musicalDirector.ready) {
      eventStream = new MusicEventStream(musicalDirector, featureEngine);
    }
  }

  function applyUniformsForT(t) {
    // V3.5 item 3: DIRECTOR CUE is the top of the fallback priority
    // (DIRECTOR CUE > structurally-verified/human-confirmed event > MACRO/
    // MESO plan > generative fallback). Looked up FIRST so `microResponse`
    // can affect VisualDirector's own MICRO sampling below, not just be
    // patched on after the fact.
    const cue = directorCueSheet.at(t);

    const p = visualDirector.sample(t, cue && cue.microResponse != null ? cue.microResponse : 1);

    // Reordered relative to the original four copies: scene is computed
    // BEFORE camera instead of after. This is behavior-NEUTRAL for the
    // base path — SceneDirector.sample(t) takes only `t`, never read `p`
    // or `cam` in any of the four original functions, so its position
    // relative to cam was always arbitrary. Moving it earlier is what
    // lets journey state (which needs scene.meso) be computed before
    // cameraDirector.update(), so camera stillness can actually modulate
    // this frame's camera instead of always lagging one frame behind.
    let scene = sceneDirector.sample(t);

    // ---- JOURNEY WIRING (additive — see file header) ----
    let journey = null;
    if (enableJourney) {
      const musical = scene.meso || NEUTRAL_MUSICAL;
      const audioSample = featureEngine && featureEngine.data ? featureEngine.sample(t) : {};
      evolutionDirector.update(t, musical, audioSample);
      const evo = evolutionDirector.sample();
      journey = journeyExpressionDirector.sample(t, evo, musical, audioSample, eventStream);
      p.evolution = evo;
      p.journeyExpression = journey;
      if (uniforms.uAssembly) uniforms.uAssembly.value = journey.assemblyExpression;
    }

    let cam = cameraDirector.update(p, journey);

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

    let light = lightDirector.sample(t, scene.sceneState, journey);
    if (cue && cue.light) {
      const override = getLightRecipe(cue.light);
      if (override) light = override;
    }

    const dominantFamily = scene.blend > 0.5 ? scene.secondaryFamily : scene.primaryFamily;
    let mat = materialDirector.sample(p.chapterIndex, dominantFamily, scene.sceneState, journey);
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

    // Telemetry tail — harmless extra fields on the returned object,
    // present in ALL four consumers now (previously only main.js and
    // director-review.js read/set these; proxy-record.js and
    // master-render.js simply never looked at them). Adding them
    // unconditionally cannot change rendering: nothing above reads these
    // back, and no uniform is set from them.
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

  return { applyUniformsForT, evolutionDirector, journeyExpressionDirector, loadJourneyData };
}
