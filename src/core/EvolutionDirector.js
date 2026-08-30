// Journey branch (creative/journey-v38) — the answer to Ronny's diagnosis
// after watching the first ~20 minutes: "the film doesn't yet feel like
// one thing being built by the music." Every other director in src/core/
// answers "what should render RIGHT NOW" (SceneDirector: which family;
// CameraDirector: which shot; MaterialDirector: which surface). None of
// them answer "what has the möykky BECOME so far" — the thing that would
// make minute 35 visibly, legibly contain the history of minutes 0-34.
// This file answers only that second question. It does not render
// anything and does not replace any existing director; it is a new input
// the existing directors can read from once Ronny reviews this approach
// and the wiring is approved (see docs/journey-v38-plan.md).
//
// THE CENTRAL DISTINCTION (per the brief — "this is critical", not a
// nice-to-have): ACCUMULATED complexity vs. CURRENTLY EXPRESSED complexity
// are different numbers. `accumulated.*` only ever goes up (a ratchet —
// see ratchet()) — it is the organism's permanent history and never
// resets, not even during a breakdown. `expressed.*` is
// `accumulated.* * expression`, where `expression` is a fast-moving 0..1
// factor that can legitimately collapse to near-zero during a breakdown
// (per the brief: "a breakdown may hide 80% of the organism — it may NOT
// reset it to an earlier state"). Anything that reads this class for
// "what should be visible on screen right now" should read `expressed`,
// never `accumulated` directly.
//
// DETERMINISM CONTRACT: same as EnergyReservoir (which this class owns
// one instance of internally) — update(t) must be called with strictly
// increasing t, once per rendered frame, matching FeedbackPipeline's own
// sequential-only discipline. Not safe to call at an arbitrary seek time
// without replaying from t=0 (or from a chunk boundary with sufficient
// preroll, exactly like render_master.mjs already does for the feedback
// ring).
import { EnergyReservoir } from "./EnergyReservoir.js";
import { TrackContext } from "./TrackContext.js";
import { StructuralEpisodes } from "./StructuralEpisodes.js";
import { CHAPTERS, DURATION } from "./timeline.js";

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
// Monotonic combine: a field can only be pushed UP by a new candidate
// value, never down. This is what makes "accumulated" mean accumulated.
function ratchet(current, candidate) {
  return candidate > current ? candidate : current;
}

// Slow macro curve every accumulated field rides as its baseline: overall
// journey progress (0..1), eased so early minutes accumulate a little
// faster (the seed becoming visibly a body sooner) and late minutes don't
// saturate too early (there must be room left to grow through Fracture/
// Synthesis). Individual fields multiply this by their own weight/offset
// rather than each inventing their own progress curve, so they stay
// comparable to each other at a glance.
function baseProgress(t) {
  return smoothstep(0, DURATION, t);
}

function chapterIndexAt(t) {
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (t >= CHAPTERS[i].start && t < CHAPTERS[i].end) return i;
  }
  return CHAPTERS.length - 1;
}

// Evolutionary "capabilities" per the SCENE SYSTEM REFACTOR section — the
// existing SHELL/CHAMBER/FIELD/ECHO/VOID families reframed as things the
// organism ACQUIRES over the journey rather than scenes that replace each
// other. Order matters: once unlocked, a capability stays unlocked
// (another ratchet, at the set level).
//
// CORRECTED (session 2) to match SceneDirector.js's OWN already-authored
// CHAPTER_PLAN for FIELD/ECHO/VOID_DOMINANCE — chapter 5 (Widening,
// 1451.85s) is where "CHAMBER opens into FIELD," and chapter 6 (Fracture,
// 1980.04s) is where ECHO becomes dominant.
//
// CORRECTED AGAIN (V3.9, interior semantics fix): the single "CHAMBER"
// capability unlocking at chapter 3's start (809.82s) contradicted the
// verified ground truth in analysis/permanent-acquisitions.json, which
// places INTERIOR_HINT's earliest evidence at 1034.38s (the compression
// leading into the rupture) and INTERIOR_REVEALED at 1067.82s (the
// rupture itself — the deepest verified collapse in the first 20
// minutes, matching CameraDirector's independent PASS_THROUGH splice at
// 1067.19s). SceneDirector's own CHAMBER_LANGUAGE aesthetic (MEMBRANE
// material/softer atmosphere as a chapter-3 secondary blend, per its
// V3.5 "CHAMBER_PRESENCE vs CHAMBER_INTERIOR" honesty fix) is a
// permitted pre-reveal HINT — concavity, seams, aperture suggestion, not
// a claim of true navigable interior — but this file's own capability
// gate must not independently unlock full interior expression a quarter
// of an hour before the story actually earns it. See
// JourneyExpressionDirector.js's interiorHintExpression/interiorExpression
// split, which is what this schedule now feeds.
const INTERIOR_HINT_T = 1034.38; // permanent-acquisitions.json "interior_hint".earliestHint — pre-rupture compression
const INTERIOR_REVEALED_T = 1067.82; // permanent-acquisitions.json "interior_revealed".earliestHint — the rupture instant itself
const FIELD_UNLOCK_T = CHAPTERS[5].start; // 1451.85 — Widening
const ECHO_UNLOCK_T = CHAPTERS[6].start; // 1980.04 — Fracture
const VOID_DOMINANCE_UNLOCK_T = CHAPTERS[7].start; // 2353.85 — Synthesis, where convergence/collapse begins

// Compared directly against `t` in seconds — NOT against `p` (baseProgress,
// smoothstepped) as an earlier version of this file did. That was a real
// bug: smoothstep(x) != x (it's an S-curve, symmetric around 0.5), so a
// threshold computed as a LINEAR fraction of DURATION and then compared
// against the NONLINEAR smoothstepped progress unlocks at the wrong
// actual time — FIELD's 0.5746 fraction is past the curve's midpoint,
// where smoothstep(x) > x, so `p` crossed 0.5746 about a minute before
// t actually reached 1451.85s. Caught by analysis/trace_film_state.mjs's
// sanity check #4 on a real run (624 violating samples, i.e. ~62s early)
// — exactly the kind of bug that check exists to catch, not a
// hypothetical. Comparing plain `t` against a plain seconds value has no
// such mismatch.
const CAPABILITY_UNLOCK_PROGRESS = [
  { name: "SHELL", atT: 0 },
  { name: "VOID_WHISPER", atT: 0 }, // matches SceneDirector's chapter-0 secondary=VOID usage — available as a faint secondary from the start
  { name: "INTERIOR_HINT", atT: INTERIOR_HINT_T },
  { name: "INTERIOR_REVEALED", atT: INTERIOR_REVEALED_T },
  { name: "FIELD", atT: FIELD_UNLOCK_T },
  { name: "ECHO", atT: ECHO_UNLOCK_T },
  { name: "VOID_DOMINANCE", atT: VOID_DOMINANCE_UNLOCK_T },
];

export class EvolutionDirector {
  constructor() {
    this.energy = new EnergyReservoir();
    this.trackContext = new TrackContext(); // optional — see TrackContext.js; call .load() before update() to enable track-transition-aware salience, otherwise degrades gracefully to "never near a transition"
    this.structuralEpisodes = new StructuralEpisodes(); // optional — see StructuralEpisodes.js; call .load() before update() to feed EnergyReservoir the real RMS-verified breathing episodes, in addition to (not instead of) MusicalDirector's track-transition-based build/drop
    this._lastT = 0;
    this._unlocked = new Set();

    // Cumulative fields — see file header. Initialized at their t=0 floor,
    // never decrease after that.
    this.accumulated = {
      age: 0,
      growth: 0,
      mass: 0,
      assembly: 0,
      surfaceComplexity: 0,
      topologyComplexity: 0,
      spatialDepth: 0,
      interiorHintDepth: 0,
      interiorDepth: 0,
      fieldReach: 0,
      memoryDepth: 0,
      materialMaturity: 0,
      symmetryComplexity: 0,
      instability: 0,
      fracturePotential: 0,
      scaleRange: 0,
      psychedelicDepth: 0,
    };

    // Volatile fields — can move strongly up and down, frame to frame.
    this.expression = 1;
    this.breath = 0;
    this.tension = 0;
    this.storedEnergy = 0; // == effectiveVisualStoredEnergy, kept for existing callers (JourneyExpressionDirector's contraction/attraction/PREPARATION-threshold logic) — see effectiveVisualStoredEnergy's own comment in update()
    this.rawStoredEnergy = 0;
    this.effectiveVisualStoredEnergy = 0;

    this._confirmedTransitionsSeen = 0;
    this._exceptionalEventsSeen = new Set();
  }

  /**
   * @param {number} t seconds, strictly increasing
   * @param {ReturnType<import('./MusicalDirector').MusicalDirector['sample']>} musical
   * @param {ReturnType<import('./AudioFeatureEngine').AudioFeatureEngine['sample']>} audio
   */
  update(t, musical, audio) {
    const p = baseProgress(t);
    const context = { journeyProgress: p, nearTrackTransition: this.trackContext.isNearTransition(t) };

    // Real-audio calibration (per the journey brief): the verified RMS
    // breathing episodes (analysis/verify_structural_episodes.mjs) are OR'd
    // onto MusicalDirector's own track-transition-based build/drop, not
    // substituted for it — most of these episodes sit inside a single
    // track (see StructuralEpisodes.js's header), a phenomenon
    // MusicalDirector's transition-proximity heuristic can't see, so
    // EnergyReservoir would otherwise miss most of the actual gather/
    // release pattern the brief is calibrating against.
    const musicalForEnergy = {
      ...musical,
      build: musical.build || this.structuralEpisodes.isBuilding(t),
      drop: musical.drop || this.structuralEpisodes.isReleasing(t),
    };

    this.energy.update(t, musicalForEnergy, audio, context);
    const e = this.energy.sample();
    this.breath = e.breath;
    this.tension = e.tension;
    this.rawStoredEnergy = e.storedEnergy;

    const chapterIdx = chapterIndexAt(t);
    const chapterProgress = chapterIdx / Math.max(1, CHAPTERS.length - 1);

    // --- Baseline monotonic curves, one per field, each riding `p` (or a
    // blend of p and chapter progress) at its own weight. These are
    // starting curves for the 1080p review pass, not final values —
    // deliberately simple (linear-in-smoothstep) so a director watching
    // the review cut can say "grows too fast/slow" and a curve gets
    // reshaped, rather than debugging an opaque formula.
    const a = this.accumulated;
    a.age = t;
    a.growth = ratchet(a.growth, p);
    a.mass = ratchet(a.mass, smoothstep(0, DURATION * 0.9, t));
    a.assembly = ratchet(a.assembly, smoothstep(0, DURATION * 0.35, t)); // the "is it still being built" phase front-loads
    a.surfaceComplexity = ratchet(a.surfaceComplexity, p * 0.8 + chapterProgress * 0.2);
    a.topologyComplexity = ratchet(a.topologyComplexity, smoothstep(DURATION * 0.1, DURATION * 0.9, t));
    a.spatialDepth = ratchet(a.spatialDepth, smoothstep(DURATION * 0.15, DURATION, t));
    // interiorHintDepth: pre-reveal only, bounded well below 1 — concavity/
    // seam/aperture-suggestion territory (Part 2's "allowed before 17:47"
    // list), never the real thing. Rides the compression window
    // (INTERIOR_HINT_T -> INTERIOR_REVEALED_T) then holds at its 0.35
    // ceiling rather than continuing to climb once the real interiorDepth
    // below takes over.
    a.interiorHintDepth = ratchet(a.interiorHintDepth, smoothstep(INTERIOR_HINT_T, INTERIOR_REVEALED_T, t) * 0.35);
    // interiorDepth: TRUE navigable-interior complexity. Zero by
    // construction for any t < INTERIOR_REVEALED_T (smoothstep(edge0,...)
    // is exactly 0 below edge0) — the rupture is what "the organism
    // permanently owns interiority" means, not a gradual pre-earn. Once
    // past it, this is the same "later it contains chamber-space" curve
    // as before, just correctly time-shifted to start AT the reveal
    // instead of a quarter-hour before it.
    a.interiorDepth = ratchet(a.interiorDepth, smoothstep(INTERIOR_REVEALED_T, DURATION, t));
    a.fieldReach = ratchet(a.fieldReach, smoothstep(DURATION * 0.4, DURATION, t)); // "later it affects its surroundings"
    a.memoryDepth = ratchet(a.memoryDepth, smoothstep(DURATION * 0.55, DURATION, t) + this._confirmedTransitionsSeen * 0.03);
    a.materialMaturity = ratchet(a.materialMaturity, p * 0.6);
    a.symmetryComplexity = ratchet(a.symmetryComplexity, p * 0.5);
    a.scaleRange = ratchet(a.scaleRange, smoothstep(DURATION * 0.25, DURATION, t));
    a.psychedelicDepth = ratchet(a.psychedelicDepth, smoothstep(DURATION * 0.2, DURATION, t) * 0.7);
    // instability / fracturePotential: mostly event-driven (see below),
    // but carry a small rising baseline ceiling so late-piece releases can
    // hit harder than early-piece ones even at the same storedEnergy.
    a.instability = ratchet(a.instability, chapterProgress * 0.3);
    a.fracturePotential = ratchet(a.fracturePotential, chapterProgress * 0.35);

    // --- Event-driven ratchet bumps: ties accumulated growth to actual
    // musical events, not just clock time, per "every song/section should
    // develop the SAME entity further."
    if (musical.track > this._confirmedTransitionsSeen) {
      this._confirmedTransitionsSeen = musical.track;
      a.assembly = ratchet(a.assembly, a.assembly + 0.08);
      a.memoryDepth = ratchet(a.memoryDepth, a.memoryDepth + 0.05);
    }
    if (musical.exceptionalEvent && !this._exceptionalEventsSeen.has(musical.exceptionalEvent)) {
      this._exceptionalEventsSeen.add(musical.exceptionalEvent);
      const boost = musical.exceptionalEventConfidence === "structurally_verified" ? 0.12 : musical.exceptionalEventConfidence === "human_confirmed" ? 0.09 : 0.05;
      a.topologyComplexity = ratchet(a.topologyComplexity, a.topologyComplexity + boost);
      a.psychedelicDepth = ratchet(a.psychedelicDepth, a.psychedelicDepth + boost);
      a.scaleRange = ratchet(a.scaleRange, a.scaleRange + boost * 0.8);
    }
    if (e.releaseCount > 0 && e.phase === "ATTACK" && e.phaseElapsed === 0) {
      // A release just fired THIS EXACT frame — phaseElapsed is reset to
      // 0 only on the frame ATTACK begins, so this is a one-shot edge
      // check, not a time-window one (a "< 0.05s" window double-fires on
      // every frame whose dt is smaller than the window, which is every
      // frame at 30fps). The organism is "permanently changed"
      // (NEW_NORMAL), expressed as a small permanent bump to
      // instability/fracturePotential ceilings scaled by how big the
      // release was.
      a.instability = ratchet(a.instability, a.instability + e.lastReleaseMagnitude * 0.15);
      a.fracturePotential = ratchet(a.fracturePotential, a.fracturePotential + e.lastReleaseMagnitude * 0.12);
      a.materialMaturity = ratchet(a.materialMaturity, a.materialMaturity + 0.04);
    }

    // --- Visual energy capacity (V3.9, "the möykky learns how to hold
    // energy"): EnergyReservoir's raw storedEnergy (this.rawStoredEnergy,
    // set above) is a valid MUSICAL measurement — how much the track
    // itself is charging — and is kept as-is; the bug was treating that
    // number as if it were also already the organism's VISUAL capacity.
    // Early in the film the organism hasn't yet built the physical mass/
    // assembly/material maturity/spatial depth to stage the same enormous
    // compression/release a mature body can, even if the music itself is
    // charging hard. developmentalCapacity is a function of ACCUMULATED
    // STATE (never resets, per the ratchet discipline) — not time/duration
    // directly — so a real developmental shortcut (an early exceptional
    // event that jumps assembly/mass ahead) legitimately raises capacity
    // early, exactly as it should.
    const developmentalCapacity = clamp01(a.assembly * 0.3 + a.mass * 0.25 + a.growth * 0.15 + a.materialMaturity * 0.15 + a.spatialDepth * 0.15);
    // Floor, not zero: per the brief, "seed can pulse, seed can attract,
    // seed can twitch" — a brand-new organism must still visibly respond
    // to the music, just far below what full capacity allows.
    const CAPACITY_FLOOR = 0.25;
    const capacity = CAPACITY_FLOOR + (1 - CAPACITY_FLOOR) * developmentalCapacity;
    this.effectiveVisualStoredEnergy = this.rawStoredEnergy * capacity;
    this.storedEnergy = this.effectiveVisualStoredEnergy; // existing callers (JourneyExpressionDirector's contraction/attraction/PREPARATION-threshold logic) read `storedEnergy` expecting the VISUAL quantity — see file header's accumulated-vs-expressed discipline, same principle applied to energy.

    // --- Capability unlocks (set-level ratchet).
    for (const cap of CAPABILITY_UNLOCK_PROGRESS) {
      if (t >= cap.atT) this._unlocked.add(cap.name);
    }

    // --- Expression: how much of the accumulated organism is CURRENTLY
    // visible. Breakdown / sparse density hides most of it without
    // touching `accumulated`. Tension and storedEnergy also modulate it —
    // a compressed, gathering body reads as visually restrained even
    // before a breakdown proper (per "camera cuts down / surface motion
    // becomes restrained ... visual entropy decreases" during a build).
    let expr = 1;
    if (musical.breakdown) expr *= 0.2;
    else if (musical.densityState === "sparse") expr *= 0.55;

    // A real, verified RMS collapse (StructuralEpisodes) withdraws
    // expression in proportion to how deep it actually is — "the very
    // deep sparse/breathing region" (12:44-13:46, relativeDip ~0.98 once
    // re-verified) should read as near-total withdrawal, not the same
    // mild dip as a shallow, brief hesitation. Falls back to the milder
    // generic reduction when only MusicalDirector's track-transition
    // build signal is active (no episode depth to key off).
    const episode = this.structuralEpisodes.episodeAt(t);
    if (episode && t < episode.verified.trough) {
      expr *= 1 - clamp01(episode.relativeDip) * 0.8;
    } else if (musicalForEnergy.build) {
      expr *= 1 - this.storedEnergy * 0.25; // gathering itself reads as a slight withdrawal
    }
    if (e.phase === "ATTACK" || e.phase === "IMPACT") expr = Math.max(expr, 1); // full release always reads at full expression
    this.expression = clamp01(expr);

    this._lastT = t;
  }

  /** What has the möykky become so far — the permanent record. Never decreases. */
  sampleAccumulated() {
    return { ...this.accumulated, unlockedCapabilities: [...this._unlocked] };
  }

  /** What's actually visible right now — accumulated, scaled by expression. Read THIS for rendering decisions. */
  sampleExpressed() {
    const out = {};
    for (const [k, v] of Object.entries(this.accumulated)) out[k] = v * this.expression;
    return out;
  }

  sample() {
    return {
      accumulated: this.sampleAccumulated(),
      expressed: this.sampleExpressed(),
      expression: this.expression,
      breath: this.breath,
      tension: this.tension,
      storedEnergy: this.storedEnergy, // == effectiveVisualStoredEnergy — kept for existing callers
      rawStoredEnergy: this.rawStoredEnergy,
      effectiveVisualStoredEnergy: this.effectiveVisualStoredEnergy,
      energyPhase: this.energy.phase,
      releaseCount: this.energy.releaseCount,
      lastReleaseMagnitude: this.energy.lastReleaseMagnitude,
      unlockedCapabilities: [...this._unlocked],
    };
  }
}
