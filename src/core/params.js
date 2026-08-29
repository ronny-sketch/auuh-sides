import { getTimelineState } from "./timeline.js";

// Per-chapter visual parameters for the single generative body. Every
// chapter reuses the same shader (creative-bible.md §1: "one continuous
// generative system"); what changes chapter to chapter is symmetry order,
// how strongly symmetry is enforced (foldBlend — lets asymmetry bleed
// through even inside a "symmetric" chapter), turbulence, fracture, camera
// distance, and material contrast.
//
// Each parameter is a 4-keyframe arc: [arrival, transformEntry,
// transformPeak, departure]. Arrival eases arrival->transformEntry;
// transformation eases transformEntry->transformPeak (the chapter's
// argument — pushed away from where it started); departure eases
// transformPeak->departure (resolving toward, not equal to, the arrival
// state). This gives every chapter real internal motion in all three
// phases rather than a held plateau.
//
// Restraint-window collapse (turbulence/fracture -> near zero) is applied
// globally in getParams() regardless of which phase a restraint window
// falls in, so keyframes below don't need to hand-align to restraint
// timing.

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const BASE = [
  // 0 Emergence — barely-there, a first pulse asserts, then dips back
  // toward near-silence (matches the real audio dip at 02:30).
  { fold: [1, 1, 1, 1], foldBlend: [0.08, 0.3, 0.42, 0.16], turbulence: [0.03, 0.15, 0.22, 0.06], fracture: [0, 0, 0, 0], camDist: [12, 9, 8, 10.5], contrast: [0.5, 0.78, 0.88, 0.62] },
  // 1 First Drive — commits to 3-fold symmetry, pushes hard, never fully settles
  { fold: [2, 3, 3, 3], foldBlend: [0.4, 0.65, 0.82, 0.75], turbulence: [0.15, 0.3, 0.52, 0.36], fracture: [0, 0, 0, 0], camDist: [9, 6.5, 4.2, 5.2], contrast: [0.85, 0.95, 1.08, 1.0] },
  // 2 Contraction — stabilizes, pushed toward stillness (not intensity) as its transformation
  { fold: [3, 3, 3, 3], foldBlend: [0.78, 0.85, 0.9, 0.86], turbulence: [0.32, 0.18, 0.07, 0.11], fracture: [0, 0, 0, 0], camDist: [5, 4.6, 4, 4.2], contrast: [1.0, 1.0, 0.94, 0.96] },
  // 3 Re-ignition — climbs 3->5-fold, turbulence surges hard into the flash cut
  { fold: [3, 4, 5, 5], foldBlend: [0.85, 0.8, 0.78, 0.8], turbulence: [0.1, 0.3, 0.68, 0.55], fracture: [0, 0, 0, 0], camDist: [4, 4, 3.2, 3], contrast: [0.95, 1.0, 1.18, 1.1] },
  // 4 Second Drift — hard cut in from the flash, oscillates without escalating
  { fold: [5, 5, 5, 5], foldBlend: [0.7, 0.66, 0.72, 0.68], turbulence: [0.35, 0.24, 0.38, 0.26], fracture: [0, 0, 0, 0], camDist: [6, 6.6, 6, 6.3], contrast: [1.0, 0.98, 1.02, 1.0] },
  // 5 Widening — the long authored chapter: settle, violent macro insert, wide recede
  { fold: [6, 7, 9, 7], foldBlend: [0.75, 0.85, 0.95, 0.88], turbulence: [0.35, 0.45, 0.65, 0.4], fracture: [0.05, 0.08, 0.2, 0.1], camDist: [6.5, 5, 2.7, 14], contrast: [1.05, 1.15, 1.3, 1.15] },
  // 6 Fracture — base arc; fast oscillation layered on top in getParams()
  { fold: [4, 5, 6, 5], foldBlend: [0.75, 0.8, 0.85, 0.78], turbulence: [0.5, 0.65, 0.85, 0.55], fracture: [0.4, 0.6, 0.9, 0.6], camDist: [7, 6.4, 5.6, 6.8], contrast: [1.15, 1.25, 1.4, 1.22] },
  // 7 Synthesis — motif callback: fold pushes from Ch1's 3 toward Ch5's 8-9
  { fold: [3, 4.5, 8, 8], foldBlend: [0.78, 0.82, 0.9, 0.9], turbulence: [0.45, 0.6, 0.95, 0.9], fracture: [0.5, 0.35, 0.15, 0.1], camDist: [8, 6, 3.2, 3], contrast: [1.2, 1.26, 1.38, 1.35] },
  // 8 Departure — arrives still carrying Synthesis's peak complexity (the
  // real audio climax at 2482.0s IS this chapter's arrival instant, so the
  // full-color frame should show the built-up form, not an already-
  // collapsed one); the collapse toward Ch0's mirror image is the
  // chapter's actual transformation/argument, settling by departure.
  { fold: [8, 4, 1, 1], foldBlend: [0.9, 0.5, 0.15, 0.08], turbulence: [0.85, 0.4, 0.05, 0.02], fracture: [0.15, 0.05, 0, 0], camDist: [3, 5, 10, 13], contrast: [1.3, 1.0, 0.6, 0.5] },
];

function pick(keys, phase, phaseT) {
  const e = ease(Math.min(1, Math.max(0, phaseT)));
  if (phase === "arrival") return lerp(keys[0], keys[1], e);
  if (phase === "transformation") return lerp(keys[1], keys[2], e);
  return lerp(keys[2], keys[3], e);
}

function chapterParams(idx, state) {
  const k = BASE[idx];
  const { phase, phaseT } = state;
  return {
    fold: pick(k.fold, phase, phaseT),
    foldBlend: pick(k.foldBlend, phase, phaseT),
    turbulence: pick(k.turbulence, phase, phaseT),
    fracture: pick(k.fracture, phase, phaseT),
    camDist: pick(k.camDist, phase, phaseT),
    contrast: pick(k.contrast, phase, phaseT),
  };
}

export function getParams(t) {
  const state = getTimelineState(t);
  const p = chapterParams(state.chapterIndex, state);

  // Restraint doctrine: turbulence and fracture collapse toward zero inside
  // restraint windows regardless of the chapter's own target, wherever in
  // the chapter's phase arc that window happens to fall.
  const r = state.restraint;
  p.turbulence = lerp(p.turbulence, p.turbulence * 0.15, r);
  p.fracture = lerp(p.fracture, p.fracture * 0.2, r);

  // Fracture chapter (index 6): fast symmetry oscillation on top of the
  // authored arc — the audio's own turbulence there (sub-2s alternations)
  // is faster than any hand-keyframed track could usefully follow.
  if (state.chapterIndex === 6) {
    const osc = Math.sin(t * 5.2) * (1 - r); // silenced during R2/R3
    p.fold = Math.max(1, p.fold + osc * 3.5);
  }

  return { ...p, ...state };
}
