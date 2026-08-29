import { getTimelineState, getRestraintFactor } from "./timeline.js";

// V3 Phase 2 (docs/v3-creative-direction.md §6): decides which of the five
// ontological states — SHELL / CHAMBER / FIELD / ECHO / VOID — the render
// is currently reading `map()` as. This sits ABOVE VisualDirector: MACRO
// (which chapter, which act) and MESO (MusicalDirector — track/breakdown/
// build/drop/tension) decide WHICH SCENE EXISTS; VisualDirector's MICRO
// mapping continues to modulate parameters *inside* whatever state this
// picks. SceneDirector never reads AudioFeatureEngine directly — if MICRO
// data leaks into "what scene exists," that's exactly the failure mode the
// brief warns against.
//
// No per-frame randomness anywhere in this file — every output is a
// deterministic function of (chapter, phase, restraint, MesoState), all of
// which are themselves pure functions of t. Same discipline as
// CameraDirector's shot-segment table.
//
// V3.5 honesty fix (item 1D of the director's-cut brief): primaryFamily/
// secondaryFamily === CHAMBER means "the CHAMBER aesthetic (MEMBRANE
// material, softer atmosphere, the reading that this passage is ABOUT
// interiority)" is active — it does NOT mean the camera is literally
// inside the shell. That is a SEPARATE fact, `chamberInteriorActive`,
// computed in main.js from CameraDirector's own shot type: by construction
// (every SHOT_TYPES entry except PASS_THROUGH clamps its distance well
// outside the body's solid radius via occupancy limits or safeMinDist),
// PASS_THROUGH is the ONLY shot capable of crossing the wall threshold —
// so `shotType === "PASS_THROUGH"` is a sound, non-approximate proxy for
// "the shader is actually doing interior traversal right now." Telemetry
// and docs must report CHAMBER_PRESENCE (this file's family label) and
// CHAMBER_INTERIOR (main.js's chamberInteriorActive) as the two distinct
// claims they are — never conflate "the aesthetic is CHAMBER" with "the
// viewer is inside."

export const FAMILY = Object.freeze({
  SHELL: "SHELL",
  CHAMBER: "CHAMBER",
  FIELD: "FIELD",
  ECHO: "ECHO",
  VOID: "VOID",
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Per-chapter base plan (Phase 10 dramatic architecture): which two
// families this chapter lives between, the resting blend toward the
// secondary, and how much MESO breakdown/build/density is ALLOWED to push
// the blend before it's clamped back — the chapter's own "handwriting,"
// same pattern as CameraDirector's CHAPTER_BASE.
//
//   ACT I   (0-2, Emergence/First Drive/Contraction): SHELL dominant,
//           restraint-doctrine. Only a whisper of VOID during held stillness.
//   ACT II  (3-4, Re-ignition/Second Drift): the rules established in Act I
//           start failing; 17:47 is CHAMBER's first-ever appearance.
//   ACT III (5, Widening): CHAMBER opens into FIELD — scale becomes
//           unknowable (the macro-insert quality already confirmed working
//           in v2, now formalized as a named, repeatable state).
//   ACT IV  (6, Fracture): ECHO — temporal identity failure — dominant,
//           with restraint pockets (R2/R3) pulling hard toward stark SHELL
//           to make the contrast the brief asks for, not softening it.
//   ACT V   (7-8, Synthesis/Departure): convergence, then collapse back to
//           the Ch0-mirroring SHELL identity already authored in params.js,
//           draining to VOID/true-black at the very end.
const CHAPTER_PLAN = [
  // 0 Emergence
  { primary: FAMILY.SHELL, secondary: FAMILY.VOID, restBlend: 0.05, restraintPush: 0.35, buildPush: 0, breakdownPush: 0.1 },
  // 1 First Drive — committed exterior, no secondary intrusion
  { primary: FAMILY.SHELL, secondary: FAMILY.SHELL, restBlend: 0, restraintPush: 0, buildPush: 0, breakdownPush: 0 },
  // 2 Contraction — the restraint chapter; stillness reveals absence (VOID)
  { primary: FAMILY.SHELL, secondary: FAMILY.VOID, restBlend: 0.1, restraintPush: 0.55, buildPush: 0, breakdownPush: 0.2 },
  // 3 Re-ignition — CHAMBER is not yet possible except at the 17:47 rupture
  // itself, which SceneDirector forces via exceptionalEvent handling below,
  // not via this resting blend.
  { primary: FAMILY.SHELL, secondary: FAMILY.CHAMBER, restBlend: 0, restraintPush: 0, buildPush: 0.5, breakdownPush: 0 },
  // 4 Second Drift — post-rupture: CHAMBER is now a real possibility the
  // piece can drift toward, not force.
  { primary: FAMILY.SHELL, secondary: FAMILY.CHAMBER, restBlend: 0.2, restraintPush: 0.1, buildPush: 0.3, breakdownPush: 0.25 },
  // 5 Widening — CHAMBER opening into FIELD across the chapter's macro insert
  { primary: FAMILY.CHAMBER, secondary: FAMILY.FIELD, restBlend: 0.35, restraintPush: 0, buildPush: 0.45, breakdownPush: 0.15 },
  // 6 Fracture — ECHO dominant; restraint pockets (R2/R3) pull toward SHELL
  // for contrast, so restraintPush here targets the OTHER direction
  // (handled as a sign flip below, since ECHO is primary here, not secondary).
  { primary: FAMILY.ECHO, secondary: FAMILY.SHELL, restBlend: 0.3, restraintPush: 0.7, buildPush: 0.2, breakdownPush: 0.4 },
  // 7 Synthesis — convergence begins; secondary rotates with tension (see sample())
  { primary: FAMILY.SHELL, secondary: FAMILY.FIELD, restBlend: 0.3, restraintPush: 0, buildPush: 0.6, breakdownPush: 0 },
  // 8 Departure — collapses back toward pure SHELL (mirrors Ch0's formBlend
  // returning to exactly 0), draining to VOID only in the last few seconds
  // of true silence (handled as an explicit override below, not this table).
  { primary: FAMILY.SHELL, secondary: FAMILY.VOID, restBlend: 0.15, restraintPush: 0, buildPush: 0, breakdownPush: 0 },
];

// Chapters where restraintPush pulls TOWARD the primary (contrast) instead
// of toward the secondary (the normal case) — currently only Fracture,
// where the brief explicitly asks restraint pockets to read as "extreme
// contrast," not as a softer version of the dominant ECHO state.
const RESTRAINT_INVERTS_TOWARD_PRIMARY = new Set([6]);

// V3.5 item 1A: hard editorial decisions (forcing a family, not just
// nudging a blend) are only permitted when MusicalDirector reports one of
// these confidence grades for the active exceptionalEvent. A
// strong_candidate (e.g. final_fade_1744 — the single highest-scored
// algorithmic detection, but not independently corroborated or confirmed
// by ear) may NOT trigger a hard override by default; it stays a
// documented, inert candidate until Ronny confirms it (analysis/
// annotate.html -> EXCEPTIONAL_SOUND) or an explicit director cue
// activates it.
const HARD_OVERRIDE_GRADES = new Set(["human_confirmed", "structurally_verified"]);

export class SceneDirector {
  constructor(musicalDirector) {
    this.musical = musicalDirector;
  }

  sample(t) {
    const macro = getTimelineState(t);
    const meso = this.musical && this.musical.ready ? this.musical.sample(t) : null;
    const plan = CHAPTER_PLAN[macro.chapterIndex];
    const restraint = macro.restraint;

    let blend = plan.restBlend;
    if (meso) {
      if (meso.build) blend += plan.buildPush * smoothstep(0, 1, meso.transitionProgress || 0.5);
      if (meso.breakdown) blend += plan.breakdownPush;
      if (meso.densityState === "dense") blend += 0.1;
    }

    const restraintTerm = plan.restraintPush * restraint;
    blend += RESTRAINT_INVERTS_TOWARD_PRIMARY.has(macro.chapterIndex) ? -restraintTerm : restraintTerm;
    blend = clamp01(blend);

    let primaryFamily = plan.primary;
    let secondaryFamily = plan.secondary;
    let sceneState = "STABLE";
    let eventState = null;

    // Synthesis (7): convergence — secondary rotates through the three
    // families the piece has actually visited by this point (CHAMBER
    // opened in Act II/III, ECHO dominated Act IV) as tension rises toward
    // the 41:22 climax, rather than resting on one fixed secondary — this
    // is the "SHELL + CHAMBER + FIELD + ECHO converge" instruction, applied
    // as a deterministic function of tensionState (itself a pure function
    // of t via MusicalDirector), not randomness.
    if (macro.chapterIndex === 7 && meso) {
      const rotation = [FAMILY.CHAMBER, FAMILY.FIELD, FAMILY.ECHO];
      const idx = meso.tensionState === "rising" ? Math.floor((t % 12) / 4) : 0;
      secondaryFamily = rotation[idx % rotation.length];
      if (meso.tensionState === "rising") sceneState = "CONVERGENCE";
    }

    // 17:47 ontological rupture (docs/creative-bible.md §8, promoted from
    // "color flash only" to a real spatial event per the V3 brief): for a
    // short window around the confirmed rupture instant, force CHAMBER
    // regardless of the chapter's resting blend — this is the FIRST time
    // in the piece CHAMBER is even possible, so it must not fade in
    // gradually like an ordinary secondary blend; it has to arrive as an
    // intrusion the same way the color flash already does.
    const hardEventAllowed = meso && HARD_OVERRIDE_GRADES.has(meso.exceptionalEventConfidence);

    if (hardEventAllowed && meso.exceptionalEvent === "rupture_1747") {
      primaryFamily = FAMILY.SHELL;
      secondaryFamily = FAMILY.CHAMBER;
      blend = 1; // full CHAMBER at the rupture's peak instant; ramp handled by caller via transitionProgress
      sceneState = "RUPTURE";
      eventState = "rupture_1747";
    }

    // Hero event (docs/hero-events-v3.md #13): 41:43.98 is the single
    // highest-scored transition in the whole track-map dataset (0.682,
    // every signal fired at once) — the mix's final track fading out,
    // 23s after the 41:22 climax, already inside Departure's authored
    // collapse. A brief VOID pulse right here would read as the identity
    // briefly vanishing entirely mid-collapse. V3.5: this event is tagged
    // strong_candidate (MusicalDirector.js), not human_confirmed or
    // structurally_verified — per item 1A, it therefore does NOT fire by
    // default anymore (`hardEventAllowed` gates it out). Left in place,
    // inert, as a documented candidate: promote it by confirming it in
    // analysis/annotate.html (re-tag EXCEPTIONAL_SOUND there), or activate
    // it explicitly via a director cue — do not re-enable it by loosening
    // this gate.
    if (hardEventAllowed && meso.exceptionalEvent === "final_fade_1744") {
      primaryFamily = FAMILY.VOID;
      secondaryFamily = FAMILY.SHELL;
      blend = 0.2;
      sceneState = "RECOGNITION";
      eventState = "final_fade_1744";
    }

    // Final silence tail: true VOID (identity as absence), matching the cue
    // sheet's "genuine cut to nothing, not a fade tail" instruction for the
    // last few seconds.
    if (t >= 2515) {
      primaryFamily = FAMILY.VOID;
      secondaryFamily = FAMILY.VOID;
      blend = 0;
      sceneState = "RECOGNITION";
    }

    if (restraint > 0.01 && sceneState === "STABLE") sceneState = "RESTRAINT";

    return { primaryFamily, secondaryFamily, blend, sceneState, eventState, meso, macro };
  }
}
