import { DURATION, findChapterIndex, getRestraintFactor } from "./timeline.js";

// Camera/editing grammar (v2, Phase 5 of docs/v2-plan.md). Replaces
// CameraRig's "one continuous orbit per chapter" model with an authored
// SEQUENCE of shot types per chapter, cut only at bar boundaries (downbeats)
// — "permission for editorial events" per the Phase 4 mapping table — with
// a few explicitly documented off-downbeat exceptions already established
// in docs/cue-sheet.md (Ch1->Ch2, Ch2->Ch3, the climax).
//
// The whole 42:06.9 timeline is precomputed ONCE into a flat, sorted list
// of shot segments (same discipline as camera.js's azimuthAt lookup table)
// so getShotAt(t) is a pure function of t — deterministic and seek-safe.

const TAU = Math.PI * 2;

// Deterministic PRNG (mulberry32) seeded per-shot so re-running the build
// always produces the same segment durations.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOT_TYPES = {
  EXTREME_WIDE: { minDur: 8, maxDur: 20, distMult: [1.8, 2.2], angSpeedMult: 0.6, elevOverride: null, offsetMult: 1.0, allowMotion: true },
  MACRO: { minDur: 4, maxDur: 10, distMult: [0.3, 0.42], angSpeedMult: 0.4, elevOverride: null, offsetMult: 0.6, allowMotion: true, safeMinDist: 2.8 },
  PROFILE_SILHOUETTE: { minDur: 6, maxDur: 14, distMult: [0.9, 1.1], angSpeedMult: 0.0, elevOverride: null, offsetMult: 0.3, allowMotion: false, azimuthLockOffset: Math.PI / 2 },
  NEGATIVE_SPACE: { minDur: 6, maxDur: 15, distMult: [1.3, 1.6], angSpeedMult: 0.3, elevOverride: null, offsetMult: 2.6, allowMotion: true },
  UNEXPECTED_HORIZON: { minDur: 6, maxDur: 14, distMult: [1.0, 1.3], angSpeedMult: 0.4, elevOverride: 0.85, offsetMult: 0.8, allowMotion: true },
  SLOW_PUSH: { minDur: 10, maxDur: 25, distMult: [1.5, 0.65], angSpeedMult: 0.2, elevOverride: null, offsetMult: 0.7, allowMotion: true, pushOverTime: true },
  VIOLENT_INSERT: { minDur: 1.5, maxDur: 3, distMult: [0.32, 0.32], angSpeedMult: 1.4, elevOverride: null, offsetMult: 0.4, allowMotion: true, safeMinDist: 2.8, extraJitter: 0.06 },
  STATIC_HOLD: { minDur: 10, maxDur: 25, distMult: [1.0, 1.0], angSpeedMult: 0.0, elevOverride: null, offsetMult: 1.0, allowMotion: false },
  LONG_HOLD: { minDur: 20, maxDur: 40, distMult: [1.1, 0.95], angSpeedMult: 0.0, elevOverride: null, offsetMult: 1.0, allowMotion: false, pushOverTime: true },
};

// Authored per-chapter shot sequences (cycled if the chapter runs longer
// than one pass through the list). Chosen per creative-bible.md's per-
// chapter dramatic function, not arbitrarily — e.g. Contraction leans on
// STATIC_HOLD (it IS the restraint chapter), Fracture alternates
// VIOLENT_INSERT with STATIC_HOLD (matching its real audio turbulence/
// trough alternation), Widening opens wide and pushes into its macro
// insert, Departure recedes.
const CHAPTER_SHOT_SEQUENCES = [
  ["EXTREME_WIDE", "UNEXPECTED_HORIZON", "SLOW_PUSH"], // 0 Emergence
  ["SLOW_PUSH", "NEGATIVE_SPACE", "PROFILE_SILHOUETTE"], // 1 First Drive
  ["STATIC_HOLD", "LONG_HOLD"], // 2 Contraction
  ["SLOW_PUSH", "UNEXPECTED_HORIZON", "VIOLENT_INSERT"], // 3 Re-ignition
  ["NEGATIVE_SPACE", "PROFILE_SILHOUETTE", "EXTREME_WIDE"], // 4 Second Drift
  ["EXTREME_WIDE", "SLOW_PUSH", "MACRO", "NEGATIVE_SPACE"], // 5 Widening
  ["VIOLENT_INSERT", "STATIC_HOLD", "VIOLENT_INSERT", "PROFILE_SILHOUETTE"], // 6 Fracture
  ["MACRO", "SLOW_PUSH", "UNEXPECTED_HORIZON"], // 7 Synthesis
  ["SLOW_PUSH", "EXTREME_WIDE", "LONG_HOLD"], // 8 Departure
];

// Per-chapter base recipe (heading/elevation character), carried over from
// the old CHAPTER_CAMERA table in camera.js — the shot grammar modulates
// these rather than replacing them, so each chapter keeps its own
// underlying "handwriting."
const CHAPTER_BASE = [
  { baseAngSpeed: 0.015, baseElev: 0.24, offset: [0.35, -0.15] },
  { baseAngSpeed: 0.05, baseElev: 0.24, offset: [-0.4, 0.1] },
  { baseAngSpeed: 0.008, baseElev: 0.2, offset: [0.1, 0.05] },
  { baseAngSpeed: 0.07, baseElev: -0.24, offset: [0.2, -0.3] },
  { baseAngSpeed: 0.03, baseElev: 0.2, offset: [-0.3, -0.1] },
  { baseAngSpeed: 0.02, baseElev: 0.3, offset: [0.45, 0.2] },
  { baseAngSpeed: 0.09, baseElev: 0.22, offset: [-0.2, 0.25] },
  { baseAngSpeed: 0.04, baseElev: 0.1, offset: [0.15, -0.1] },
  { baseAngSpeed: 0.012, baseElev: 0.15, offset: [-0.3, 0.15] },
];

function buildShotSegments(barTimes) {
  const segments = [];
  let shotCounter = 0;

  for (let ci = 0; ci < CHAPTER_BASE.length; ci++) {
    const chapterStart = CHAPTER_START_END[ci][0];
    const chapterEnd = CHAPTER_START_END[ci][1];
    const barsInChapter = barTimes.filter((b) => b >= chapterStart && b < chapterEnd);
    const sequence = CHAPTER_SHOT_SEQUENCES[ci];

    let barIdx = 0;
    let seqIdx = 0;
    let segStart = chapterStart;

    while (barIdx < barsInChapter.length) {
      const shotName = sequence[seqIdx % sequence.length];
      const shot = SHOT_TYPES[shotName];
      const rng = mulberry32(shotCounter * 7919 + ci * 104729);
      const targetDur = shot.minDur + rng() * (shot.maxDur - shot.minDur);
      shotCounter++;

      let accDur = 0;
      let cutBar = barsInChapter[barIdx];
      while (barIdx < barsInChapter.length && accDur < targetDur) {
        cutBar = barsInChapter[barIdx];
        accDur = cutBar - segStart;
        barIdx++;
      }
      const segEnd = barIdx < barsInChapter.length ? cutBar : chapterEnd;

      segments.push({ start: segStart, end: segEnd, type: shotName, chapterIndex: ci });
      segStart = segEnd;
      seqIdx++;
    }

    if (segStart < chapterEnd) {
      // no bars left in this chapter (short chapter / sparse bar grid) —
      // close out with one final shot of whatever's next in the sequence
      const shotName = sequence[seqIdx % sequence.length];
      segments.push({ start: segStart, end: chapterEnd, type: shotName, chapterIndex: ci });
    }
  }

  return segments;
}

// Chapter boundaries duplicated here (not imported) to avoid a circular
// import with timeline.js at module-init time when this file is first
// evaluated before timeline.js's CHAPTERS constant is guaranteed ready in
// all bundler orders; values are identical to timeline.js's CHAPTERS.
const CHAPTER_START_END = [
  [0.0, 150.19], [150.19, 504.85], [504.85, 809.82], [809.82, 1067.19],
  [1067.19, 1451.85], [1451.85, 1980.04], [1980.04, 2353.85],
  [2353.85, 2482.0], [2482.0, DURATION],
];

function pseudoNoise(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export class CameraDirector {
  constructor() {
    this.shotSegments = null;
    this.azimuthTable = null;
  }

  // Must be called once (after beat_grid.json loads) before update().
  init(barTimes) {
    this.shotSegments = buildShotSegments(barTimes);
    this._buildAzimuthTable();
  }

  _buildAzimuthTable() {
    const STEP = 0.25;
    const n = Math.ceil(DURATION / STEP) + 1;
    this.azimuthTable = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const t = i * STEP;
      const chapterIdx = findChapterIndex(t);
      const restraint = getRestraintFactor(t);
      const shot = this._shotAt(t);
      const speed = CHAPTER_BASE[chapterIdx].baseAngSpeed * shot.type.angSpeedMult * (1 - restraint);
      this.azimuthTable[i] = acc;
      acc += speed * STEP * TAU * 0.1;
    }
  }

  _azimuthAt(t) {
    const clamped = Math.min(Math.max(t, 0), DURATION);
    const idx = clamped / 0.25;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, this.azimuthTable.length - 1);
    const frac = idx - i0;
    return this.azimuthTable[i0] + (this.azimuthTable[i1] - this.azimuthTable[i0]) * frac;
  }

  _shotAt(t) {
    const segs = this.shotSegments;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].end <= t) lo = mid + 1;
      else hi = mid;
    }
    const seg = segs[Math.min(lo, segs.length - 1)];
    return { seg, type: SHOT_TYPES[seg.type] };
  }

  update(p) {
    if (!this.shotSegments) {
      throw new Error("CameraDirector.init(barTimes) must be called before update()");
    }
    const base = CHAPTER_BASE[p.chapterIndex];
    const { seg, type } = this._shotAt(p.t);

    const shotT = seg.end > seg.start ? (p.t - seg.start) / (seg.end - seg.start) : 0;

    // camDist: interpolate the shot's distance multiplier (pushOverTime
    // shots sweep from distMult[0] to distMult[1] across the shot;
    // otherwise it's a fixed multiplier of the chapter's own camDist).
    const distMultNow = type.pushOverTime
      ? type.distMult[0] + (type.distMult[1] - type.distMult[0]) * shotT
      : type.distMult[0];
    let dist = p.camDist * distMultNow;
    if (type.safeMinDist) dist = Math.max(dist, type.safeMinDist);

    // v2 Phase 4: kick -> pressure/displacement, a brief push-in rather
    // than a brightness or scale pulse — the mapping table's "pressure,
    // weight, spatial displacement" for kick/sub. p.kick is already
    // restraint-gated and attack/release-smoothed by VisualDirector /
    // AudioFeatureEngine, so no extra gating needed here.
    if (p.kick) dist *= 1 - p.kick * 0.035;

    const az0 = this._azimuthAt(p.t);
    const az = type.azimuthLockOffset != null ? az0 + type.azimuthLockOffset : az0;

    const elevOsc = type.allowMotion ? Math.sin(p.t * 0.05) * 0.08 : 0;
    const elev = type.elevOverride != null ? type.elevOverride : base.baseElev + elevOsc;

    const jitterAmt = (type.extraJitter || 0) * (1 - p.restraint);
    const jitterX = jitterAmt > 0 ? (pseudoNoise(p.t * 17.3) - 0.5) * jitterAmt : 0;
    const jitterY = jitterAmt > 0 ? (pseudoNoise(p.t * 23.7 + 91.0) - 0.5) * jitterAmt : 0;

    const finalAz = az + jitterX;
    const finalEl = elev + jitterY;

    const camPos = [
      dist * Math.cos(finalEl) * Math.sin(finalAz),
      dist * Math.sin(finalEl),
      dist * Math.cos(finalEl) * Math.cos(finalAz),
    ];

    const offsetScale = base.offset;
    const target = [
      offsetScale[0] * dist * 0.05 * type.offsetMult,
      offsetScale[1] * dist * 0.05 * type.offsetMult,
      0,
    ];

    return { camPos, camTarget: target, fov: 45, shotType: seg.type };
  }
}
