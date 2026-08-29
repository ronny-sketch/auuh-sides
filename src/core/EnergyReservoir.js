// Journey branch (creative/journey-v38). Answers one question the V1-V4
// generative stack never modeled explicitly: not "what is the music doing"
// (MusicalDirector already answers that well — build/drop/breakdown,
// confidence-graded transitions, exceptional events) but "how much energy
// has the möykky been gathering, and what happens to it when it's
// released." Per the journey brief: builds should feel like compression,
// not just "a build() boolean is true"; drops should feel like release
// proportional to how much was actually stored, not a fixed-size sting.
//
// DETERMINISM CONTRACT — read before calling update() out of order: unlike
// CameraDirector/params.js (pure functions of absolute t, safe to seek
// anywhere), this class is STATEFUL, following the exact same discipline
// FeedbackPipeline already established and the seek-determinism test suite
// already verifies: correct only when update(t) is called with strictly
// increasing t, every frame, in the same sequence the master renderer
// actually uses (see render_master.mjs's PREROLL_SECONDS mechanism, which
// exists precisely to give stateful systems like this one a plausible
// running history before a chunk's first captured frame — this class
// benefits from that preroll exactly the way FeedbackPipeline does).
// Calling update() with a t that jumps backward or skips forward will
// desync storedEnergy/phase from reality; there is no seek-repair here by
// design, matching FeedbackPipeline's own tradeoff.

const PHASES = /** @type {const} */ (["GATHER", "ATTACK", "IMPACT", "AFTERSHOCK", "NEW_NORMAL"]);

// How much a sustained build (seconds) is worth in stored energy, before
// any release. Long builds should out-charge short ones — "magnitude
// depends on... preceding buildup duration" per the brief.
const CHARGE_PER_SECOND_OF_BUILD = 0.045;
const CHARGE_PER_SECOND_OF_RISING_TENSION = 0.02;
// Passive bleed so energy doesn't accumulate forever during a long quiet
// stretch that never resolves into a drop.
const PASSIVE_DECAY_PER_SECOND = 0.006;
// A release never fully empties the reservoir — the floor itself ratchets
// up slightly with every release, the mechanical expression of "the
// organism is permanently changed" / NEW_NORMAL.
const FLOOR_RATCHET_PER_RELEASE = 0.015;
const FLOOR_RATCHET_CAP = 0.35;

const PHASE_DURATIONS = {
  ATTACK: 0.35, // near-instant — the transient itself
  IMPACT: 1.6, // the body of the release
  AFTERSHOCK: 5.0, // decaying overshoot before settling
  // NEW_NORMAL has no fixed duration — it persists until the next GATHER.
};

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

// Running-average tracker for `rarity` — deliberately causal/online
// (only compares a new release to releases-so-far, never to future ones,
// since the reservoir is a strictly-sequential-t system like everything
// else in this file). "Rarity" therefore means "unusually large compared
// to what this film has shown so far," which is honestly what's knowable
// in a single forward pass — not a claim about the whole piece's true
// distribution, which would require a non-causal analysis pass this class
// deliberately doesn't do (see EvolutionDirector's determinism contract).
class RunningMean {
  constructor() {
    this.n = 0;
    this.mean = 0;
  }
  push(x) {
    this.n++;
    this.mean += (x - this.mean) / this.n;
  }
}

export class EnergyReservoir {
  constructor() {
    this.storedEnergy = 0; // 0..~1.6 (can overcharge above 1 on a long build)
    this.tension = 0; // 0..1, faster-moving than storedEnergy
    this.floor = 0; // ratcheting baseline storedEnergy never drops below
    this.phase = "NEW_NORMAL";
    this.phaseElapsed = 0;
    this.breath = 0; // -1..1 slow oscillation, present even at rest
    this._buildStartT = null;
    this._wasDrop = false;
    this._lastT = null;
    this.releaseCount = 0;
    this.lastReleaseMagnitude = 0;
    this.lastSalienceFactors = null; // last release's factor breakdown — for telemetry/tuning, see sample()
    this._bassMinDuringBuild = Infinity;
    this._fluxMaxDuringBuild = 0;
    this._magnitudeHistory = new RunningMean();
  }

  /**
   * @param {number} t seconds, strictly increasing across calls
   * @param {ReturnType<import('./MusicalDirector').MusicalDirector['sample']>} musical
   * @param {{ energyTrend:number, rms:number, onsetStrength:number, barPhase:number, bass?:number, flux?:number }} audio
   * @param {{ journeyProgress?:number, nearTrackTransition?:boolean }} [context] real-audio calibration inputs — see EvolutionDirector, which sources these from timeline.js progress and analysis/set-track-alignment.json respectively. Both optional; omitted context degrades gracefully to the pre-calibration behavior (context factors default to neutral).
   */
  update(t, musical, audio, context = {}) {
    const dt = this._lastT == null ? 0 : Math.max(0, t - this._lastT);
    this._lastT = t;

    // Slow breathing independent of structural events — a low-frequency
    // sine over barPhase-scale time so it reads as organic, not metronomic.
    this.breath = Math.sin(t * 0.15 + (audio.barPhase || 0) * Math.PI * 2 * 0.05);

    if (musical.build) {
      if (this._buildStartT == null) {
        this._buildStartT = t;
        this._bassMinDuringBuild = audio.bass ?? Infinity;
        this._fluxMaxDuringBuild = audio.flux ?? 0;
      } else {
        if (audio.bass != null) this._bassMinDuringBuild = Math.min(this._bassMinDuringBuild, audio.bass);
        if (audio.flux != null) this._fluxMaxDuringBuild = Math.max(this._fluxMaxDuringBuild, audio.flux);
      }
      this.storedEnergy += dt * CHARGE_PER_SECOND_OF_BUILD * (0.6 + 0.8 * (audio.energyTrend ?? 0.5));
    } else if (musical.tensionState === "rising") {
      this.storedEnergy += dt * CHARGE_PER_SECOND_OF_RISING_TENSION;
    } else {
      this.storedEnergy -= dt * PASSIVE_DECAY_PER_SECOND;
    }
    this.storedEnergy = Math.max(this.floor, Math.min(1.6, this.storedEnergy));

    // tension tracks storedEnergy but leads/lags it slightly by also
    // reacting directly to onset density, so it can spike a beat ahead of
    // the slower-moving reservoir — this is what should visibly narrow
    // light/contract the body a moment before the number itself peaks.
    const target = clamp01(this.storedEnergy * 0.7 + (audio.onsetStrength ?? 0) * 0.3);
    this.tension += (target - this.tension) * clamp01(dt * 3);

    const dropEdge = musical.drop && !this._wasDrop;
    this._wasDrop = musical.drop;

    if (dropEdge && this.phase !== "ATTACK") {
      const buildDuration = this._buildStartT != null ? t - this._buildStartT : 0;

      // Multi-factor salience, per the brief's explicit list: "a visually
      // huge release should require agreement" across several independent
      // signals, not just raw storedEnergy. Each factor is a 0..1-ish
      // ratio around 1.0 (neutral); the product is the final multiplier,
      // so any single weak factor pulls the result down rather than one
      // strong factor being able to fake the rest.
      const buildDepthFactor = 0.5 + Math.min(1, buildDuration / 24) * 0.5; // "length of preceding anticipation"
      const bassReturn = audio.bass != null && Number.isFinite(this._bassMinDuringBuild) ? clamp01(audio.bass - this._bassMinDuringBuild) : 0;
      const bassReturnFactor = 0.85 + bassReturn * 0.4; // "bass return" — filtered-bass-back-in is a classic drop signature
      const spectralChangeFactor = 0.85 + clamp01(this._fluxMaxDuringBuild / 3) * 0.3; // "spectral change / novelty" during the build (flux is already 0-ish..~3 raw per the schema's un-normalized recording of this field)
      const exceptionalFactor = musical.exceptionalEventConfidence === "structurally_verified" ? 1.5 : musical.exceptionalEventConfidence === "human_confirmed" ? 1.3 : 1.0; // "rarity" in the strongest sense — an independently-verified singular moment
      const journeyPositionFactor = 0.9 + clamp01(context.journeyProgress ?? 0) * 0.3; // "position in overall journey" — later releases can hit harder
      const transitionFactor = context.nearTrackTransition ? 1.15 : 1.0; // "track-transition context"

      const rawMagnitude = clamp01(this.storedEnergy) * buildDepthFactor * bassReturnFactor * spectralChangeFactor * exceptionalFactor * journeyPositionFactor * transitionFactor;
      const priorMean = this._magnitudeHistory.mean;
      // "Rarity" relative to releases-so-far: neutral (1.0) until there's
      // enough history to compare against, then nudges up to +30% for a
      // release well above the running average and down to -20% for one
      // well below it — a bounded multiplier, not an unbounded ratio, so
      // one outlier early release can't distort everything after it.
      const magnitudeRatio = priorMean > 0.05 ? rawMagnitude / priorMean : 1.0;
      const rarityFactor = priorMean > 0.05 ? Math.max(0.8, Math.min(1.3, 1 + (magnitudeRatio - 1) * 0.3)) : 1.0;
      this._magnitudeHistory.push(rawMagnitude);

      this.lastReleaseMagnitude = rawMagnitude * rarityFactor;
      this.lastSalienceFactors = { buildDuration, buildDepthFactor, bassReturn, bassReturnFactor, spectralChangeFactor, exceptionalFactor, journeyPositionFactor, transitionFactor, rarityFactor, rawMagnitude };

      this.releaseCount++;
      this.floor = Math.min(FLOOR_RATCHET_CAP, this.floor + FLOOR_RATCHET_PER_RELEASE);
      this.phase = "ATTACK";
      this.phaseElapsed = 0;
      this._buildStartT = null;
      this._bassMinDuringBuild = Infinity;
      this._fluxMaxDuringBuild = 0;
      // The attack itself instantly drains most (not all) of what was
      // stored — the release IS the spend.
      this.storedEnergy = Math.max(this.floor, this.storedEnergy * 0.25);
    } else {
      this.phaseElapsed += dt;
      if (this.phase === "ATTACK" && this.phaseElapsed >= PHASE_DURATIONS.ATTACK) {
        this.phase = "IMPACT";
        this.phaseElapsed = 0;
      } else if (this.phase === "IMPACT" && this.phaseElapsed >= PHASE_DURATIONS.IMPACT) {
        this.phase = "AFTERSHOCK";
        this.phaseElapsed = 0;
      } else if (this.phase === "AFTERSHOCK" && this.phaseElapsed >= PHASE_DURATIONS.AFTERSHOCK) {
        this.phase = "NEW_NORMAL";
        this.phaseElapsed = 0;
      } else if (this.phase === "NEW_NORMAL" && (musical.build || musical.tensionState === "rising")) {
        this.phase = "GATHER";
        this.phaseElapsed = 0;
      }
    }
  }

  sample() {
    return {
      storedEnergy: this.storedEnergy,
      tension: this.tension,
      breath: this.breath,
      phase: this.phase,
      phaseElapsed: this.phaseElapsed,
      releaseCount: this.releaseCount,
      lastReleaseMagnitude: this.lastReleaseMagnitude,
      lastSalienceFactors: this.lastSalienceFactors,
      floor: this.floor,
    };
  }
}

export const ENERGY_PHASES = PHASES;
