import { DURATION, findChapterIndex, getRestraintFactor } from "./timeline.js";

// Camera/editing grammar (v2 Phase 5, upgraded in V3 Phase 8 — see
// docs/v3-creative-direction.md). Precomputes the whole 42:06.9 timeline
// ONCE into a flat, sorted list of shot segments (same discipline as
// timeline.js/params.js) so getShotAt(t) is a pure function of t.
//
// V3 changes from v2:
//   - Shot distance is now solved from actual screen-space frame occupancy
//     (how much of the frame height the body's bounding radius should
//     fill) instead of a multiplier on the chapter's own camDist — fixes
//     the documented v2 bug (creative-critique-v2.md Finding 5) where
//     EXTREME_WIDE's multiplier stacked on an already-small chapter camDist
//     and produced a close-up instead of a wide shot. "Wide" now always
//     means the same thing: a small target occupancy, solved for whatever
//     the chapter's geometry actually needs.
//   - A new PASS_THROUGH shot type with an explicit (not occupancy-solved)
//     distance sweep from outside the body to deep inside it — the only
//     shot type allowed to cross into CHAMBER's auto-detected interior
//     traversal (main.frag.js) — inserted at one authored, hand-picked
//     moment (the 17:47 rupture), not as part of any chapter's normal cycle.
//   - A small transition-grammar layer (EASE, TEMPORAL_DISSOLVE, HARD_CUT)
//     between segments, instead of every cut being an instant parameter
//     swap by construction.

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

// Approximate bounding radius of the raymarched body across every fold/
// formBlend configuration (round-box half-extents up to (1,1.4,1) plus its
// torus reaching r=1.6+0.35=1.95; octahedron pair reaching s=1.55/r=1.9+0.12
// — 2.1 comfortably covers all of them with a small margin). Used to solve
// "how far away must the camera be for this body to fill this fraction of
// the frame," which is what "EXTREME_WIDE actually appears extreme wide"
// requires — a single shared radius, not a per-shot fudge factor.
const BODY_RADIUS = 2.1;
const FOV_DEG = 45;
const TAN_HALF_FOV = Math.tan((FOV_DEG / 2) * (Math.PI / 180));

// occupancy = target fraction of half-frame-height the body's bounding
// radius should span. <1 = object smaller than frame (wide/negative-space
// shots); >1 = object larger than frame (macro/extreme-close shots).
function occupancyDist(occupancy) {
  return BODY_RADIUS / (TAN_HALF_FOV * Math.max(occupancy, 0.01));
}

const SHOT_TYPES = {
  EXTREME_WIDE: { minDur: 8, maxDur: 20, occupancy: [0.16, 0.16], angSpeedMult: 0.6, elevOverride: null, offsetMult: 1.0, allowMotion: true },
  MACRO: { minDur: 4, maxDur: 10, occupancy: [2.4, 2.7], angSpeedMult: 0.4, elevOverride: null, offsetMult: 0.6, allowMotion: true, safeMinDist: 2.8 },
  PROFILE_SILHOUETTE: { minDur: 6, maxDur: 14, occupancy: [1.0, 1.0], angSpeedMult: 0.0, elevOverride: null, offsetMult: 0.3, allowMotion: false, azimuthLockOffset: Math.PI / 2 },
  NEGATIVE_SPACE: { minDur: 6, maxDur: 15, occupancy: [0.32, 0.32], angSpeedMult: 0.3, elevOverride: null, offsetMult: 2.6, allowMotion: true },
  UNEXPECTED_HORIZON: { minDur: 6, maxDur: 14, occupancy: [0.55, 0.55], angSpeedMult: 0.4, elevOverride: 0.85, offsetMult: 0.8, allowMotion: true },
  SLOW_PUSH: { minDur: 10, maxDur: 25, occupancy: [0.45, 1.35], angSpeedMult: 0.2, elevOverride: null, offsetMult: 0.7, allowMotion: true, pushOverTime: true, transitionType: "EASE" },
  VIOLENT_INSERT: { minDur: 1.5, maxDur: 3, occupancy: [2.8, 2.8], angSpeedMult: 1.4, elevOverride: null, offsetMult: 0.4, allowMotion: true, safeMinDist: 2.8, extraJitter: 0.06 },
  STATIC_HOLD: { minDur: 10, maxDur: 25, occupancy: [0.82, 0.82], angSpeedMult: 0.0, elevOverride: null, offsetMult: 1.0, allowMotion: false, transitionType: "EASE" },
  LONG_HOLD: { minDur: 20, maxDur: 40, occupancy: [0.75, 0.92], angSpeedMult: 0.0, elevOverride: null, offsetMult: 1.0, allowMotion: false, pushOverTime: true, transitionType: "EASE" },
  // V3 Phase 3/8: the only shot type that crosses into CHAMBER. distRange is
  // an EXPLICIT distance sweep (not occupancy-solved — once inside, "frame
  // occupancy of the exterior body" is no longer a meaningful quantity),
  // with no safeMinDist floor, because reaching inside the shell on purpose
  // is the entire point. See main.frag.js's in-shader interior auto-detect
  // (originSolidD < -uWallThickness*1.3).
  // distRange[1]=0.55 stops well short of the origin (V3 Phase 13 finding:
  // diving all the way to ~0.1 put the camera nose-against-the-interior-
  // wall, reading as a near-featureless flat gray plane instead of a
  // legible chamber — see docs/creative-critique-v3.md). Stopping at 0.55
  // keeps the camera inside the hollow (past uWallThickness*1.3 ≈ 0.21 in
  // every direction the body's geometry actually reaches) with enough room
  // to see the interior ring architecture rather than pressed against it.
  PASS_THROUGH: { minDur: 9, maxDur: 9, distRange: [7.0, 0.55], angSpeedMult: 0.1, elevOverride: null, offsetMult: 0.2, allowMotion: false, pushOverTime: true, explicitDist: true, transitionType: "PASS_THROUGH" },

  // V3.5 item 4: the authored-motion vocabulary a director cue speaks.
  // Several are aliases of shot types above (kept as separate names because
  // "STATIC"/"PROFILE_LOCK" read better in a cue file than the generative
  // system's own internal names) — NONE of these are added to
  // CHAPTER_SHOT_SEQUENCES, so the generative fallback cycle is completely
  // unchanged; they are reachable ONLY via an explicit director cue
  // (DirectorCueSheet -> CameraDirector.resolveCueCamera).
  STATIC: { occupancy: [0.82, 0.82], angSpeedMult: 0.0, elevOverride: null, offsetMult: 1.0, allowMotion: false },
  SLOW_PULL: { occupancy: [1.35, 0.5], angSpeedMult: 0.15, elevOverride: null, offsetMult: 0.7, allowMotion: true, pushOverTime: true },
  LATERAL_DRIFT: { occupancy: [0.7, 0.7], angSpeedMult: 0.5, elevOverride: null, offsetMult: 1.2, allowMotion: true },
  // ORBIT_PARTIAL: a bounded back-and-forth arc, not a continuous orbit —
  // ARC_AMPLITUDE/ARC_SPEED read by _paramsForSegment's `partialArc`
  // branch below, which oscillates azimuth around whatever the global
  // azimuth table's value was AT THE CUE'S OWN START (so it still picks up
  // continuously from whatever shot preceded it, then holds to a bounded
  // sweep instead of continuing to accumulate).
  ORBIT_PARTIAL: { occupancy: [0.9, 0.9], angSpeedMult: 0, elevOverride: null, offsetMult: 1.0, allowMotion: true, partialArc: true, arcAmplitude: 0.6, arcSpeed: 0.25 },
  PROFILE_LOCK: { occupancy: [1.0, 1.0], angSpeedMult: 0.0, elevOverride: null, offsetMult: 0.3, allowMotion: false, azimuthLockOffset: Math.PI / 2 },
  MACRO_CRAWL: { occupancy: [2.3, 2.3], angSpeedMult: 0.12, elevOverride: null, offsetMult: 0.5, allowMotion: true, safeMinDist: 2.8 },
};

// Authored per-chapter shot sequences (cycled if the chapter runs longer
// than one pass through the list). Chosen per creative-bible.md's per-
// chapter dramatic function — e.g. Contraction leans on STATIC_HOLD (it IS
// the restraint chapter), Fracture alternates VIOLENT_INSERT with
// STATIC_HOLD (matching its real audio turbulence/trough alternation),
// Widening opens wide and pushes into its macro insert, Departure recedes.
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
// the old CHAPTER_CAMERA table — the shot grammar modulates these rather
// than replacing them, so each chapter keeps its own underlying
// "handwriting."
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

// 17:47 ontological rupture (V3 §"17:47 CRITICAL STORY PIVOT"): the ONE
// authored PASS_THROUGH event in the whole piece. Duplicated as a constant
// (not imported) rather than pulled from MusicalDirector, matching this
// file's existing style of duplicating CHAPTER_START_END to avoid a
// circular/async dependency — MusicalDirector.load() is async (fetches
// track-map.json) and CameraDirector.init() must stay synchronous and run
// before first render. Must match MusicalDirector's EXCEPTIONAL_EVENTS
// "rupture_1747" entry.
const RUPTURE_T = 1067.19;
const RUPTURE_LEAD_BARS = 3; // start the pass-through this many bars before the rupture instant
const RUPTURE_TAIL_BARS = 4; // hold inside a few bars past it before cutting away

// Chapter boundaries duplicated here (not imported) to avoid a circular
// import with timeline.js at module-init time when this file is first
// evaluated before timeline.js's CHAPTERS constant is guaranteed ready in
// all bundler orders; values are identical to timeline.js's CHAPTERS.
const CHAPTER_START_END = [
  [0.0, 150.19], [150.19, 504.85], [504.85, 809.82], [809.82, 1067.19],
  [1067.19, 1451.85], [1451.85, 1980.04], [1980.04, 2353.85],
  [2353.85, 2482.0], [2482.0, DURATION],
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

// Splices the one authored PASS_THROUGH event into the segment table across
// the 17:47 rupture, replacing whatever the normal per-chapter cycle would
// have put there. Snapped to the bar grid on both ends — "permission for
// editorial events," same doctrine as every other cut in this file — and
// deliberately straddles the Ch4(Re-ignition)/Ch5(Second Drift) boundary,
// since that boundary already lands exactly on the rupture instant per
// docs/cue-sheet.md ("Ch4 -> Ch5... coincides with the spectral spike
// event... same instant, not a separate cut").
function spliceRuptureOverride(segments, barTimes) {
  const before = barTimes.filter((b) => b <= RUPTURE_T);
  const after = barTimes.filter((b) => b > RUPTURE_T);
  const start = before[Math.max(0, before.length - 1 - RUPTURE_LEAD_BARS)];
  const end = after[Math.min(after.length - 1, RUPTURE_TAIL_BARS)];
  if (start == null || end == null || end <= start) return segments; // beat grid too sparse near the rupture — leave the normal cycle in place rather than risk a malformed segment

  const kept = segments.filter((s) => s.end <= start || s.start >= end);
  const chapterIndexAtRupture = findChapterIndex(RUPTURE_T);
  kept.push({ start, end, type: "PASS_THROUGH", chapterIndex: chapterIndexAtRupture, isRupture: true });
  return kept.sort((a, b) => a.start - b.start);
}

function pseudoNoise(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const lerp3 = (a, b, e) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
const ease = (t) => t * t * (3 - 2 * t);

export class CameraDirector {
  constructor() {
    this.shotSegments = null;
    this.azimuthTable = null;
    // Journey stillness hold state (see update()'s journey param) —
    // stateful like FeedbackPipeline/EnergyReservoir, correct only under
    // sequential increasing-t calls, which is how update() is always
    // invoked in this codebase already.
    this._smoothCamPos = null;
    this._smoothTarget = null;
    this._smoothLastT = null;
  }

  // Must be called once (after beat_grid.json loads) before update().
  init(barTimes) {
    const base = buildShotSegments(barTimes);
    this.shotSegments = spliceRuptureOverride(base, barTimes);
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
    const idx = Math.min(lo, segs.length - 1);
    return { seg: segs[idx], type: SHOT_TYPES[segs[idx].type], idx };
  }

  // Pure function: camera params for a given segment/type at a given
  // absolute time `t` (not necessarily t inside [seg.start,seg.end) — used
  // both for "this shot right now" and for "what would the PREVIOUS shot's
  // params have been at the moment of the cut," which is what an EASE
  // transition blends from.
  _paramsForSegment(seg, type, t, restraintOverride) {
    const base = CHAPTER_BASE[seg.chapterIndex];
    const shotT = ease(Math.min(1, Math.max(0, seg.end > seg.start ? (t - seg.start) / (seg.end - seg.start) : 0)));

    let dist;
    if (type.explicitDist) {
      dist = type.distRange[0] + (type.distRange[1] - type.distRange[0]) * shotT;
    } else {
      const occNow = type.pushOverTime ? type.occupancy[0] + (type.occupancy[1] - type.occupancy[0]) * shotT : type.occupancy[0];
      dist = occupancyDist(occNow);
      if (type.safeMinDist) dist = Math.max(dist, type.safeMinDist);
    }

    let az;
    if (type.partialArc) {
      // ORBIT_PARTIAL: bounded oscillation around the azimuth value the
      // global table already had at the segment's own start — continuous
      // with whatever came before, but never accumulates into a full orbit.
      const azCenter = this._azimuthAt(seg.start);
      az = azCenter + Math.sin((t - seg.start) * (type.arcSpeed || 0.25)) * (type.arcAmplitude || 0.5);
    } else {
      const az0 = this._azimuthAt(t);
      az = type.azimuthLockOffset != null ? az0 + type.azimuthLockOffset : az0;
    }

    const elevOsc = type.allowMotion ? Math.sin(t * 0.05) * 0.08 : 0;
    const elev = type.elevOverride != null ? type.elevOverride : base.baseElev + elevOsc;

    const restraint = restraintOverride != null ? restraintOverride : getRestraintFactor(t);
    const jitterAmt = (type.extraJitter || 0) * (1 - restraint);
    const jitterX = jitterAmt > 0 ? (pseudoNoise(t * 17.3) - 0.5) * jitterAmt : 0;
    const jitterY = jitterAmt > 0 ? (pseudoNoise(t * 23.7 + 91.0) - 0.5) * jitterAmt : 0;

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

    return { camPos, target, dist };
  }

  /**
   * @param {object} p VisualDirector.sample() output (t, restraint, kick, ...)
   * @param {{cameraStillness?:number}|null} [journey] optional — JourneyExpressionDirector output.
   *   Undefined/null (every call site before the journey branch existed, and
   *   any future caller that doesn't pass it) reproduces the exact original
   *   behavior — see the stillness block below, gated entirely behind
   *   `journey && journey.cameraStillness > 0`.
   */
  update(p, journey = null) {
    if (!this.shotSegments) {
      throw new Error("CameraDirector.init(barTimes) must be called before update()");
    }
    const { seg, type, idx } = this._shotAt(p.t);
    const current = this._paramsForSegment(seg, type, p.t, p.restraint);

    let camPos = current.camPos;
    let target = current.target;
    let dissolveWeight = 0;

    // Transition grammar (V3 Phase 8): most cuts are still hard cuts by
    // construction (consecutive segments simply swap recipe at the bar
    // boundary — a deliberate, editorial choice, not an oversight, per
    // v2's own documented rationale). EASE blends camera position across a
    // short window from the previous segment's own end-state; TEMPORAL_
    // DISSOLVE (Fracture's restraint-pocket entries/exits) is signaled back
    // to main.js as a memoryWeight boost rather than a camera change — the
    // cut visibly persists through the feedback trail instead of an instant
    // swap, reusing MEMORY rather than building a second crossfade system.
    const timeSinceStart = p.t - seg.start;
    // Fracture's restraint pockets (R2/R3) are specifically STATIC_HOLD
    // segments inside chapter 6 — override STATIC_HOLD's default EASE with
    // TEMPORAL_DISSOLVE only there, so the "contrast is the point" pockets
    // read as the just-finished turbulence decaying through the feedback
    // trail rather than a smoothed camera move. STATIC_HOLD everywhere else
    // (e.g. Contraction) keeps the plain EASE behavior.
    let transitionType = type.transitionType || "HARD_CUT";
    if (seg.type === "STATIC_HOLD" && seg.chapterIndex === 6) transitionType = "TEMPORAL_DISSOLVE";

    const EASE_WINDOW = 1.6;
    if (transitionType === "EASE" && idx > 0 && timeSinceStart < EASE_WINDOW) {
      const prevSeg = this.shotSegments[idx - 1];
      const prevType = SHOT_TYPES[prevSeg.type];
      const prevAtCut = this._paramsForSegment(prevSeg, prevType, seg.start, p.restraint);
      const e = ease(Math.min(1, timeSinceStart / EASE_WINDOW));
      camPos = lerp3(prevAtCut.camPos, camPos, e);
      target = lerp3(prevAtCut.target, target, e);
    }
    if (transitionType === "TEMPORAL_DISSOLVE" && timeSinceStart < 2.0) {
      dissolveWeight = 1 - ease(Math.min(1, timeSinceStart / 2.0));
    }

    let dist = Math.hypot(camPos[0], camPos[1], camPos[2]);

    // v2 Phase 4 (unchanged): kick -> pressure/displacement, a brief
    // push-in rather than a brightness or scale pulse. Skipped during
    // PASS_THROUGH — a kick-driven wobble while deliberately threading the
    // camera through a thin shell wall risks visibly clipping the cut.
    if (p.kick && !type.explicitDist) {
      const scale = 1 - p.kick * 0.035;
      camPos = [camPos[0] * scale, camPos[1] * scale, camPos[2] * scale];
      dist *= scale;
    }

    // Journey stillness hold (Part 9): during a real gather/compression,
    // the camera should feel like it's holding rather than instantly
    // following the shot grammar's own cut/motion — implemented as a
    // continuous low-pass follow rate on top of whatever the existing
    // shot-segment system already computed, not a change to that system
    // itself. journey==null (every pre-journey call site, and any future
    // caller that doesn't pass it) skips this block entirely and returns
    // byte-identical output to before.
    if (journey && journey.cameraStillness > 0) {
      const dt = this._smoothLastT == null ? 0 : Math.max(0, p.t - this._smoothLastT);
      this._smoothLastT = p.t;
      if (this._smoothCamPos == null) {
        this._smoothCamPos = camPos.slice();
        this._smoothTarget = target.slice();
      } else {
        const followRate = Math.min(1, Math.max(0, dt * (0.3 + 2.0 * (1 - journey.cameraStillness))));
        this._smoothCamPos = lerp3(this._smoothCamPos, camPos, followRate);
        this._smoothTarget = lerp3(this._smoothTarget, target, followRate);
      }
      camPos = this._smoothCamPos;
      target = this._smoothTarget;
      dist = Math.hypot(camPos[0], camPos[1], camPos[2]);
    } else {
      // Reset so the NEXT stillness period starts holding from wherever
      // the shot grammar actually is at that moment, not a stale position
      // from long ago — avoids a jump-cut back to an old hold point.
      this._smoothCamPos = null;
      this._smoothTarget = null;
      this._smoothLastT = p.t;
    }

    return {
      camPos,
      camTarget: target,
      fov: FOV_DEG,
      shotType: seg.type,
      transitionType,
      dissolveWeight,
      isRupture: !!seg.isRupture,
    };
  }

  // V3.5 item 3/4: resolves camera params for an explicit director cue
  // (DirectorCueSheet entry), reusing the exact same _paramsForSegment math
  // the generative system uses — a cue is just a segment the director wrote
  // by hand instead of the bar-grid cycling logic generating one. `cue.
  // cameraMotion` (or `cue.shot`, so the brief's own worked example field
  // name works unmodified) selects the recipe from SHOT_TYPES; a numeric
  // `cue.cameraFraming` overrides the recipe's own occupancy with a fixed
  // value (pushOverTime disabled in that case — an explicit framing number
  // means "hold exactly this," not "sweep from the recipe's default").
  resolveCueCamera(cue, t) {
    const motionName = cue.cameraMotion || cue.shot || "STATIC";
    const baseType = SHOT_TYPES[motionName] || SHOT_TYPES.STATIC;
    const type = { ...baseType };
    if (typeof cue.cameraFraming === "number") {
      type.occupancy = [cue.cameraFraming, cue.cameraFraming];
      type.pushOverTime = false;
    }

    const chapterIndex = findChapterIndex(t);
    const seg = { start: cue.start, end: cue.end, chapterIndex };
    const params = this._paramsForSegment(seg, type, t, getRestraintFactor(t));

    return {
      camPos: params.camPos,
      camTarget: params.target,
      fov: FOV_DEG,
      shotType: motionName,
      transitionType: cue.transition || "HARD_CUT",
      dissolveWeight: 0,
      isRupture: false,
      isCue: true,
    };
  }
}
