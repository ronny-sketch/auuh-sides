import { getParams } from "./params.js";

// Phase 3/4 of docs/v2-plan.md: sits between the MACRO authored curves
// (getParams — chapter keyframes) and the MICRO audio features
// (AudioFeatureEngine), applying the specific mapping philosophy from the
// brief rather than generic "volume reactivity":
//
//   kick        -> camera pressure/displacement (handled in CameraDirector,
//                  passed through here as p.kick)
//   bass        -> slow structural "breathing" (nudges camDist)
//   mid+vocal   -> topological identity (nudges foldBlend)
//   high+hats   -> micro texture / grain intensity (uGrainBoost), NEVER
//                  the same channel as macro turbulence (critique #4)
//   flux/onset  -> discrete rupture events added on top of the chapter's
//                  own fracture baseline, never sustained
//   energyTrend -> macro tension via contrast, NEVER per-frame brightness
//
// Every one of these is gated by (1 - restraint): a restrained passage
// refuses the mapping table wholesale, not just turbulence — a strictly
// stronger, more honest restraint than the v1 (turbulence-only) gate.
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export class VisualDirector {
  constructor(featureEngine) {
    this.features = featureEngine;
  }

  sample(t) {
    const p = getParams(t);

    if (!this.features || !this.features.data) {
      // Feature engine not loaded (e.g. an environment that hasn't run
      // analysis/analyze_v2.py yet) — fall back to pure MACRO behavior
      // rather than throwing, so the piece still renders.
      p.grainBoost = 1;
      p.kick = 0;
      return p;
    }

    const f = this.features.sample(t);
    const hold = 1 - p.restraint;

    // bass -> slow structural breathing (locomotion), a few percent of camDist
    const breathe = (f.bass - 0.5) * 0.12 * hold;
    p.camDist = p.camDist * (1 + breathe);

    // mid + vocal presence -> topological identity
    const identity = f.mid * 0.6 + f.vocalPresence * 0.4;
    p.foldBlend = clamp01(p.foldBlend + (identity - 0.5) * 0.15 * hold);

    // flux/onset -> discrete rupture, added on top of (not replacing) the
    // chapter's authored fracture baseline
    p.fracture = clamp01(p.fracture + f.onset * 0.5 * hold);

    // high + hats -> micro texture intensity, kept off the turbulence channel
    p.grainBoost = 1 + (f.high * 0.5 + f.hats * 0.5) * 1.5 * hold;

    // energyTrend -> macro tension (contrast), long-window only, never a
    // per-frame brightness pump
    p.contrast = p.contrast * (1 + (f.energyTrend - 0.5) * 0.1);

    // passed through for CameraDirector (pressure/displacement) and for
    // future MESO/track-map wiring
    p.kick = f.kick * hold;
    p.beatPhase = f.beatPhase;
    p.features = f;

    return p;
  }
}
