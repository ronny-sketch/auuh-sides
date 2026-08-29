// V3.5 "director's cut" — item 3 of the brief. The final-direction data
// model: an explicit, human-authored cue for any [start, end) window
// overrides whatever the generative system (VisualDirector/CameraDirector/
// SceneDirector/LightDirector/MaterialDirector) would otherwise produce.
//
// Fallback priority (enforced by the CALLER — see src/main.js's
// applyUniformsForT — not by this class, which only answers "is there a
// cue for t"):
//
//   DIRECTOR CUE
//   > structurally verified / human-confirmed MusicalDirector event
//   > MACRO/MESO generative plan (SceneDirector/CameraDirector/etc.)
//   > deterministic generative fallback
//
// The generative system is NOT deleted or bypassed by this file — cues are
// sparse, deliberate overrides for specific authored moments; every second
// without an active cue still renders exactly as the generative system
// alone would produce. This is what lets the final film support "every
// second becoming explicitly authored" without requiring every second to
// actually BE authored before the piece is watchable.
//
// Cue shape (every field optional except start/end — see docs/v3-creative-
// direction.md-style docs for the worked example this mirrors):
//   {
//     start, end,                 // seconds, required
//     shot / cameraMotion,        // name from CameraDirector's SHOT_TYPES
//                                 // (includes the V3.5 authored-motion
//                                 // vocabulary: STATIC, SLOW_PUSH,
//                                 // SLOW_PULL, LATERAL_DRIFT,
//                                 // ORBIT_PARTIAL, PROFILE_LOCK,
//                                 // MACRO_CRAWL, PASS_THROUGH,
//                                 // VIOLENT_INSERT)
//     cameraFraming,              // optional numeric occupancy override
//                                 // (see CameraDirector.occupancyDist) —
//                                 // fixes framing regardless of the
//                                 // motion recipe's own default
//     transition,                 // "HARD_CUT" | "EASE" | "TEMPORAL_DISSOLVE"
//     primaryFamily, secondaryFamily, sceneBlend,
//     light,                       // name from LightDirector.LIGHT_MODE
//     material,                    // name from MaterialDirector.MATERIAL
//     memoryBehavior,               // number (explicit memoryWeight) or
//                                   // "DISSOLVE" (temporary boosted ramp)
//     microResponse,                // 0-1+ multiplier on MICRO audio
//                                    // reactivity (VisualDirector)
//     specialEvent,                 // free-form string, carried through
//                                    // to telemetry only
//     reason,                       // human-readable justification —
//                                    // required in spirit, not enforced,
//                                    // but every cue SHOULD have one
//   }
export class DirectorCueSheet {
  constructor(cues = []) {
    this.cues = [...cues].sort((a, b) => a.start - b.start);
  }

  at(t) {
    // Linear scan: cue counts are expected to stay small (tens, not
    // thousands) even for a fully-directed film, so this is simpler and
    // plenty fast — no need for CameraDirector's binary-search-over-a-
    // precomputed-table treatment here.
    for (const cue of this.cues) {
      if (t >= cue.start && t < cue.end) return cue;
    }
    return null;
  }
}
