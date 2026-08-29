// Chapter map, restraint windows, and singular events — all derived from
// analysis/audio_analysis.json and docs/cue-sheet.md. Times are seconds.
// Keep this file and docs/cue-sheet.md in sync by hand; there is no
// generator step because the boundaries were chosen by structural/energy
// reading, not by a formula.

// Exact ffprobe duration of audio/AUUH.m4a — kept precise (not rounded) so
// the Departure chapter's collapse-to-silence timing and the final beat/bar
// snap in the cue sheet line up with the real file, not an approximation.
export const DURATION = 2526.934785;

export const CHAPTERS = [
  { name: "Emergence", start: 0.0, end: 150.19 },
  { name: "First Drive", start: 150.19, end: 504.85 },
  { name: "Contraction", start: 504.85, end: 809.82 },
  { name: "Re-ignition", start: 809.82, end: 1067.19 },
  { name: "Second Drift", start: 1067.19, end: 1451.85 },
  { name: "Widening", start: 1451.85, end: 1980.04 },
  { name: "Fracture", start: 1980.04, end: 2353.85 },
  { name: "Synthesis", start: 2353.85, end: 2482.0 },
  { name: "Departure", start: 2482.0, end: DURATION },
];

// Default phase split (arrival / transformation / departure) as fractions
// of chapter duration. Overridden per-chapter below where the audio or the
// authored design calls for a different split.
const DEFAULT_PHASE_SPLIT = [0.25, 0.75]; // arrival ends at 25%, transformation ends at 75%

const PHASE_SPLIT_OVERRIDES = {
  // Widening (index 5) is the longest chapter with no internal audio
  // structure — authored as three deliberately uneven phases so it doesn't
  // read as one static drone: a long settle, a short violent macro insert,
  // then a longer withdrawal.
  5: [0.35, 0.55],
  // Departure is a short coda; almost entirely "departure" phase by nature.
  8: [0.15, 0.35],
};

export function getPhaseSplit(chapterIndex) {
  return PHASE_SPLIT_OVERRIDES[chapterIndex] || DEFAULT_PHASE_SPLIT;
}

export const RESTRAINT_WINDOWS = [
  { id: "R1", start: 750.17, end: 809.82 },
  { id: "R2", start: 2179.87, end: 2220.06 },
  { id: "R3", start: 2280.15, end: 2324.78 },
];

export const EVENTS = {
  flash: 1067.19, // spectral spike, Chapter 4->5 boundary
  climaxStart: 2353.85, // start of color bleed-in (Synthesis start)
  climaxPeak: 2482.0, // full color saturation (global RMS max)
  silenceFloor: 2520.0, // color fully drained, true silence approaching
};

export function findChapterIndex(t) {
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (t >= CHAPTERS[i].start && t < CHAPTERS[i].end) return i;
  }
  return t < 0 ? 0 : CHAPTERS.length - 1;
}

export function getRestraintFactor(t) {
  // returns 1.0 inside a restraint window, 0.0 outside, with a short
  // crossfade at the edges so the transition in/out isn't a hard cut in
  // parameter space (the cut in image content still happens at the beat
  // per the cue sheet; this only smooths the underlying turbulence value).
  const FADE = 1.5;
  for (const w of RESTRAINT_WINDOWS) {
    if (t >= w.start && t <= w.end) {
      const inFade = Math.min(1, (t - w.start) / FADE);
      const outFade = Math.min(1, (w.end - t) / FADE);
      return Math.min(inFade, outFade);
    }
  }
  return 0.0;
}

export function getColorMix(t) {
  // Two rationed color events: a single-frame flash, and a bleed-in to the
  // climax followed by a drain to black silence. Everything else is 0.
  const FLASH_HALF_WIDTH = 0.06; // ~2-4 frames at 30-60fps
  if (Math.abs(t - EVENTS.flash) < FLASH_HALF_WIDTH) {
    return 1.0;
  }
  if (t >= EVENTS.climaxStart && t < EVENTS.climaxPeak) {
    const u = (t - EVENTS.climaxStart) / (EVENTS.climaxPeak - EVENTS.climaxStart);
    return u * u * (3 - 2 * u); // smoothstep bleed-in
  }
  if (t >= EVENTS.climaxPeak && t < EVENTS.silenceFloor) {
    const u = (t - EVENTS.climaxPeak) / (EVENTS.silenceFloor - EVENTS.climaxPeak);
    return 1.0 - u * u * (3 - 2 * u); // smoothstep drain
  }
  if (t >= EVENTS.silenceFloor) return 0.0;
  return 0.0;
}

export function getTimelineState(t) {
  const chapterIndex = findChapterIndex(t);
  const chapter = CHAPTERS[chapterIndex];
  const chapterT = (t - chapter.start) / (chapter.end - chapter.start);
  const [a, b] = getPhaseSplit(chapterIndex);
  let phase, phaseT;
  if (chapterT < a) {
    phase = "arrival";
    phaseT = chapterT / a;
  } else if (chapterT < b) {
    phase = "transformation";
    phaseT = (chapterT - a) / (b - a);
  } else {
    phase = "departure";
    phaseT = (chapterT - b) / (1 - b);
  }
  return {
    t,
    chapterIndex,
    chapterName: chapter.name,
    chapterT,
    phase,
    phaseT,
    restraint: getRestraintFactor(t),
    colorMix: getColorMix(t),
  };
}
