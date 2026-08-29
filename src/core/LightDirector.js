import { CHAPTERS, RESTRAINT_WINDOWS, findChapterIndex } from "./timeline.js";

// V3 Phase 5 (docs/v3-creative-direction.md §5, #4 in the perceptual-impact
// ranking): the current shader has exactly one fixed light direction for
// the entire 42 minutes (main.frag.js, hardcoded vec3(0.5,0.8,-0.4)) —
// every compositional variation across the whole piece so far comes from
// geometry and camera angle alone. A small set of strong, HELD light
// states is cheap relative to how much it changes "does a still frame look
// composed," per the brief's own "still lighting is often stronger" and
// "do not continuously animate every light" instructions.
//
// Six states. Each is a light DIRECTION + INTENSITY + AMBIENT FLOOR recipe;
// the shader picks shading behavior per mode index so e.g. SILHOUETTE can
// suppress diffuse entirely rather than just dimming it.
export const LIGHT_MODE = Object.freeze({
  SILHOUETTE: 0, // backlit, near-zero diffuse, form read only from rim + edge
  HARD_SPECULAR: 1, // single hard key light, tight rim, high contrast
  TOP_LIGHT: 2, // light from directly above, heavy top-lit sculptural shadow
  INTERNAL_LIGHT: 3, // light appears to originate from inside the form (CHAMBER)
  VOLUMETRIC_BACKLIGHT: 4, // strong backlight for FIELD atmosphere to catch
  NEAR_DARK: 5, // almost no key light, ambient floor only, form barely legible
});

const LIGHT_RECIPES = {
  [LIGHT_MODE.SILHOUETTE]: { dir: [0.1, 0.15, -1.0], intensity: 0.55, ambient: 0.02, rim: 0.55 },
  [LIGHT_MODE.HARD_SPECULAR]: { dir: [0.6, 0.75, -0.3], intensity: 1.15, ambient: 0.015, rim: 0.14 },
  [LIGHT_MODE.TOP_LIGHT]: { dir: [0.05, 1.0, 0.05], intensity: 1.0, ambient: 0.03, rim: 0.1 },
  [LIGHT_MODE.INTERNAL_LIGHT]: { dir: [0, 0, 0], intensity: 1.1, ambient: 0.1, rim: 0.16 },
  [LIGHT_MODE.VOLUMETRIC_BACKLIGHT]: { dir: [-0.2, 0.3, -1.0], intensity: 0.8, ambient: 0.04, rim: 0.35 },
  [LIGHT_MODE.NEAR_DARK]: { dir: [0.3, 0.4, -0.5], intensity: 0.22, ambient: 0.008, rim: 0.2 },
};

// Authored per-chapter light plan: a short, deliberately small cycle (the
// brief's "very small set of strong authored states," not a state per
// chapter). Restraint windows always force NEAR_DARK or SILHOUETTE — a
// held quiet passage should also be a held dark/graphic one.
const CHAPTER_LIGHT_SEQUENCE = [
  [LIGHT_MODE.SILHOUETTE, LIGHT_MODE.HARD_SPECULAR], // 0 Emergence — barely-there, then first assertion
  [LIGHT_MODE.HARD_SPECULAR], // 1 First Drive — committed, single hard key throughout
  [LIGHT_MODE.NEAR_DARK], // 2 Contraction — restraint chapter, held near-dark
  [LIGHT_MODE.HARD_SPECULAR, LIGHT_MODE.TOP_LIGHT], // 3 Re-ignition — building toward the rupture
  [LIGHT_MODE.INTERNAL_LIGHT, LIGHT_MODE.SILHOUETTE], // 4 Second Drift — CHAMBER now possible, internal light appears
  [LIGHT_MODE.TOP_LIGHT, LIGHT_MODE.VOLUMETRIC_BACKLIGHT], // 5 Widening — macro/FIELD, backlit atmosphere
  [LIGHT_MODE.HARD_SPECULAR, LIGHT_MODE.NEAR_DARK], // 6 Fracture — hard contrast, restraint pockets go near-dark
  [LIGHT_MODE.VOLUMETRIC_BACKLIGHT, LIGHT_MODE.TOP_LIGHT, LIGHT_MODE.HARD_SPECULAR], // 7 Synthesis — convergence
  [LIGHT_MODE.TOP_LIGHT, LIGHT_MODE.SILHOUETTE], // 8 Departure — collapsing back, silhouette into the dark
];

// Held-duration range (seconds) — deliberately long relative to camera shot
// durations (CameraDirector's shots run 1.5-40s); light state changes are a
// slower timescale on top of that, matching "lighting changes should
// generally occur at MESO scale."
const MIN_HOLD = 30;
const MAX_HOLD = 90;

// V3.5 item 1C fix: v3 alternated NEAR_DARK/SILHOUETTE every second inside
// a restraint window (`t % 2 < 1`) — a 1Hz flicker inside the piece's own
// STILLEST passages, exactly backwards from "the strongest restraint
// sections should remain almost completely still visually." Each restraint
// window now holds exactly ONE light state for its full duration, chosen
// per-window (not per-chapter) since R2/R3 sit inside Fracture (chapter 6,
// whose own light sequence is [HARD_SPECULAR, NEAR_DARK]) but need to read
// as MORE graphic contrast than a soft NEAR_DARK fade, per the restraint
// doctrine's "contrast is the point" — SILHOUETTE (near-zero diffuse, edge-
// only) delivers that; R1 (Contraction, chapter 2's own single-state
// sequence is already [NEAR_DARK]) stays consistent with its chapter.
const RESTRAINT_LIGHT_OVERRIDE = {
  R1: LIGHT_MODE.NEAR_DARK,
  R2: LIGHT_MODE.SILHOUETTE,
  R3: LIGHT_MODE.SILHOUETTE,
};

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSegments() {
  const segments = [];
  let counter = 0;
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    const seq = CHAPTER_LIGHT_SEQUENCE[ci];
    let t = CHAPTERS[ci].start;
    let seqIdx = 0;
    while (t < CHAPTERS[ci].end) {
      const rng = mulberry32(counter * 7919 + ci * 104729 + 17);
      const dur = MIN_HOLD + rng() * (MAX_HOLD - MIN_HOLD);
      const end = Math.min(t + dur, CHAPTERS[ci].end);
      segments.push({ start: t, end, mode: seq[seqIdx % seq.length], chapterIndex: ci });
      t = end;
      seqIdx++;
      counter++;
    }
  }
  return segments;
}

export class LightDirector {
  constructor() {
    this.segments = buildSegments();
  }

  _segmentAt(t) {
    const segs = this.segments;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].end <= t) lo = mid + 1;
      else hi = mid;
    }
    return segs[Math.min(lo, segs.length - 1)];
  }

  /**
   * @param {number} t
   * @param {string} sceneState
   * @param {{lightNarrowing?:number}|null} [journey] optional — JourneyExpressionDirector output. Omitted (every pre-journey call site) reproduces the exact original recipe unmodified.
   */
  sample(t, sceneState, journey = null) {
    const seg = this._segmentAt(t);
    let mode = seg.mode;

    // Restraint holds ONE light state for the window's full duration — "the
    // stillness is the feedback settling," now also true of light: a held
    // quiet moment should also be graphically stark AND STILL, not
    // alternating every second (V3.5 item 1C — see RESTRAINT_LIGHT_OVERRIDE
    // comment above for why R1 differs from R2/R3).
    const activeRestraint = RESTRAINT_WINDOWS.find((w) => t >= w.start && t <= w.end);
    if (activeRestraint) mode = RESTRAINT_LIGHT_OVERRIDE[activeRestraint.id] ?? LIGHT_MODE.NEAR_DARK;

    // CHAMBER/rupture forces internal light — the light itself is part of
    // what tells the viewer they are now inside something, per Phase 3.
    if (sceneState === "RUPTURE") mode = LIGHT_MODE.INTERNAL_LIGHT;
    if (sceneState === "RECOGNITION") mode = LIGHT_MODE.SILHOUETTE;

    const recipe = LIGHT_RECIPES[mode];
    let { intensity, ambient, rim } = recipe;

    // Journey narrowing (Part 10): "narrow/reduce ambient/tighten
    // direction" during a real gather — implemented as a continuous
    // reduction of ambient floor and rim spread on top of whichever
    // authored mode is already active, never by switching to a different
    // mode (the held-state authoring above stays in full control of
    // WHICH light state; this only tightens it). journey==null skips this
    // entirely — identical recipe to before.
    if (journey && journey.lightNarrowing > 0) {
      const n = Math.min(1, Math.max(0, journey.lightNarrowing));
      ambient *= 1 - n * 0.7;
      rim *= 1 - n * 0.4;
    }

    return { mode, dir: recipe.dir, intensity, ambient, rim };
  }
}

// V3.5 item 5: director cues specify light by name (e.g. "HARD_SPECULAR"),
// not by mode index — this is the lookup DirectorCueSheet overrides use in
// main.js. Returns the same shape as LightDirector.sample().
export function getLightRecipe(name) {
  const mode = LIGHT_MODE[name];
  if (mode == null) return null;
  const recipe = LIGHT_RECIPES[mode];
  return { mode, dir: recipe.dir, intensity: recipe.intensity, ambient: recipe.ambient, rim: recipe.rim };
}
