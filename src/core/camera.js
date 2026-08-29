import { DURATION, findChapterIndex, getRestraintFactor } from "./timeline.js";

// Authored camera rig. Every chapter has its own angular-velocity profile,
// framing offset, and jitter character — deliberately NOT a generic
// physics orbit. Composition is intentionally off-center by default
// (creative-bible §4): centered symmetric framing is rationed to specific
// authored beats, not the resting state.
//
// IMPORTANT: azimuth must be a pure function of global time t, not a
// per-frame accumulator — otherwise seeking directly to a timestamp (QA
// screenshots, scrubbing, the seek-determinism test) produces a different
// camera angle than reaching that same timestamp by playing through from
// zero. We precompute a cumulative-azimuth lookup table once at load time
// (azimuth(t) = integral of angSpeed(t') * restraintDamping(t') dt') and
// interpolate into it, so azimuthAt(t) is deterministic and seek-safe.

const TAU = Math.PI * 2;

const CHAPTER_CAMERA = [
  // 0 Emergence — slow, uncertain drift inward, off-axis target
  { angSpeed: 0.015, elevBase: 0.15, elevAmp: 0.08, offset: [0.35, -0.15], jitter: 0.0 },
  // 1 First Drive — committed orbital push, offset held wide
  { angSpeed: 0.05, elevBase: 0.24, elevAmp: 0.05, offset: [-0.4, 0.1], jitter: 0.0 },
  // 2 Contraction — near-static hold, tiny creep only
  { angSpeed: 0.008, elevBase: 0.2, elevAmp: 0.02, offset: [0.1, 0.05], jitter: 0.0 },
  // 3 Re-ignition — accelerating push toward the flash, tightening offset
  { angSpeed: 0.07, elevBase: -0.24, elevAmp: 0.1, offset: [0.2, -0.3], jitter: 0.0 },
  // 4 Second Drift — long lateral drift, symmetric offset avoided
  { angSpeed: 0.03, elevBase: 0.2, elevAmp: 0.15, offset: [-0.3, -0.1], jitter: 0.0 },
  // 5 Widening — slow settle, violent macro insert (handled via camDist),
  // wide recede; offset drifts toward center only briefly during the insert
  { angSpeed: 0.02, elevBase: 0.3, elevAmp: 0.2, offset: [0.45, 0.2], jitter: 0.0 },
  // 6 Fracture — handheld shake, alternating with true static holds (restraint)
  { angSpeed: 0.09, elevBase: 0.22, elevAmp: 0.25, offset: [-0.2, 0.25], jitter: 0.05 },
  // 7 Synthesis — converging push, offset relaxing toward (not reaching) center
  { angSpeed: 0.04, elevBase: 0.1, elevAmp: 0.1, offset: [0.15, -0.1], jitter: 0.015 },
  // 8 Departure — receding, offset drifting back out to mirror Ch0
  { angSpeed: 0.012, elevBase: 0.15, elevAmp: 0.05, offset: [-0.3, 0.15], jitter: 0.0 },
];

const TABLE_STEP = 0.25; // seconds
const TABLE_N = Math.ceil(DURATION / TABLE_STEP) + 1;
const azimuthTable = new Float64Array(TABLE_N);

(function buildAzimuthTable() {
  let acc = 0;
  for (let i = 0; i < TABLE_N; i++) {
    const t = i * TABLE_STEP;
    const chapterIdx = findChapterIndex(t);
    const restraint = getRestraintFactor(t);
    const speed = CHAPTER_CAMERA[chapterIdx].angSpeed * (1 - restraint);
    azimuthTable[i] = acc;
    acc += speed * TABLE_STEP * TAU * 0.1;
  }
})();

function azimuthAt(t) {
  const clamped = Math.min(Math.max(t, 0), DURATION);
  const idx = clamped / TABLE_STEP;
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, TABLE_N - 1);
  const frac = idx - i0;
  return azimuthTable[i0] + (azimuthTable[i1] - azimuthTable[i0]) * frac;
}

function pseudoNoise(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export class CameraRig {
  // p is the object returned by getParams(t): includes chapterIndex,
  // camDist, restraint (0-1), t. Pure function of p — no internal state —
  // so update(p) for a given t always returns the same result regardless
  // of call history (seek-safe).
  update(p) {
    const c = CHAPTER_CAMERA[p.chapterIndex];

    // Restraint must mean a genuinely held shot, not "mostly held" — the
    // azimuth table already accounts for restraint (built into
    // azimuthAt's integral), but elevation drift and handheld jitter were
    // previously undamped by restraint, contradicting the cue sheet's
    // explicit "no cuts, single held shot" claim for R1/R2/R3.
    const holdFactor = 1 - p.restraint;

    const az = azimuthAt(p.t);
    const elev = c.elevBase + Math.sin(p.t * 0.05) * c.elevAmp * holdFactor;
    const dist = p.camDist;

    const jitterX = c.jitter > 0 ? (pseudoNoise(p.t * 17.3) - 0.5) * c.jitter * holdFactor : 0;
    const jitterY = c.jitter > 0 ? (pseudoNoise(p.t * 23.7 + 91.0) - 0.5) * c.jitter * holdFactor : 0;

    const finalAz = az + jitterX;
    const finalEl = elev + jitterY;

    const camPos = [
      dist * Math.cos(finalEl) * Math.sin(finalAz),
      dist * Math.sin(finalEl),
      dist * Math.cos(finalEl) * Math.cos(finalAz),
    ];

    // Off-center target offset, expressed as an ANGLE (scaled by camDist)
    // rather than a fixed world-space distance. A fixed offset subtends a
    // shrinking screen-space angle as camDist grows, so wide shots (most
    // of the piece runs camDist 5-14) read as centered regardless of the
    // offset value — scaling by distance keeps the de-centering visually
    // consistent whether the shot is wide or a macro close-up.
    const target = [c.offset[0] * dist * 0.05, c.offset[1] * dist * 0.05, 0];

    return { camPos, camTarget: target, fov: 45 };
  }
}
