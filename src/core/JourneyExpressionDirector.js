// The translation layer between MUSICAL FORM and the render's existing
// visual directors. Three separate, deliberately distinct layers (per the
// journey brief — this distinction is the actual point of this file, not
// an implementation detail):
//
//   1. CAPABILITY  — what has permanently been acquired.       EvolutionDirector.accumulated
//   2. EXPRESSION  — how much of that the music exposes NOW.   THIS FILE
//   3. MICRO       — small instantaneous physiological twitch. VisualDirector / AudioFeatureEngine (unchanged, untouched)
//
// Conceptually, any final visible property should read as:
//
//   VISIBLE PROPERTY = PERMANENT CAPABILITY × CURRENT EXPRESSION + SMALL MICRO RESPONSE
//
// This file computes the middle term as a set of PERCEPTUAL controls
// (named for what a director would ask for — "more stillness," "narrower
// light" — not shader uniforms), so CameraDirector/LightDirector/
// MaterialDirector/main.frag.js can each pick the pieces relevant to them
// without this file knowing anything about their internals. It reads
// EvolutionDirector + MusicEventStream + TrackContext + StructuralEpisodes
// (all already loaded/updated by the caller — this file is stateless,
// call sample(t, ...) fresh each frame like VisualDirector does, NOT
// update()-style like EvolutionDirector/EnergyReservoir) and never invents
// new detection of its own.
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, e) => a + (b - a) * e;

// Event-tier visual-authority ceiling, per the brief's Part 7 ("84
// releases are not 84 visual explosions") — an event's TIER caps how much
// perceptual change it's ALLOWED to cause, independent of its raw
// magnitude. A MICRO kick can never argue its way to HERO-level screen
// impact no matter how loud it is; a HERO event's ceiling is high, but
// still a ceiling, not a mandate to max everything.
const TIER_IMPACT_CEILING = {
  MICRO: 0.08,
  PHRASE: 0.2,
  SECTION: 0.45,
  MAJOR: 0.75,
  HERO: 1.0,
  CLIMAX: 1.0,
};

// V3.9 tiering fix: this used to rank a release against releases-SO-FAR
// (causal/online) — a real bug, because "top 1% of what's happened so
// far" is a wildly different bar 90 seconds into the film (maybe 3
// releases have happened) than at minute 40 (maybe 80 have). That produced
// false early CLIMAX labels: an ordinary early release could rank #1 of
// the 2-3 releases seen so far and get crowned CLIMAX, a word that should
// mean something. This is an OFFLINE-AUTHORED FILM — the full 84-release
// magnitude distribution is already known in advance
// (analysis/_calibration/energy_reservoir_calibration.json, calibrated by
// running the same EnergyReservoir once over the whole track in advance —
// see calibrate_energy_reservoir.mjs) — so there is no reason to pretend
// otherwise at runtime. Percentile is now computed against the FULL 84,
// not the online prefix. `localRecord` (see sample()) keeps the old
// causal "strongest so far" idea alive as a separate, explicitly-labeled
// descriptive value — it must never again feed the actual visible tier.
//
// Percentile thresholds unchanged from before (still land in the brief's
// suggested rough distribution on the real 84-release data — see
// analysis/trace_film_state.mjs's tier-distribution report) EXCEPT that
// CLIMAX is additionally gated to CLIMAX_WINDOW (below): "the word CLIMAX
// must remain meaningful" means reserved for the film's actual ending, not
// just whichever passage happens to hit the loudest raw number — the
// single highest-magnitude release in the whole film (1904.1s / 31:44,
// magnitude 2.03) sits well BEFORE the final act and must read as HERO,
// not steal the word CLIMAX from the ~41:21 ending the film is actually
// built to land on.
export const CLIMAX_WINDOW = [2455, 2503.98]; // permanent-acquisitions.json's "final_convergence" window — the verified final major stored-energy episode leading directly into MusicalDirector's independently-detected final_fade_1744 (2503.98s)
function classifyEventTier(magnitude, fullFilmMagnitudesSorted, t) {
  if (!fullFilmMagnitudesSorted || fullFilmMagnitudesSorted.length === 0) return "SECTION"; // calibration not loaded — degrade to a modest, non-presumptuous tier rather than guessing
  const rank = fullFilmMagnitudesSorted.filter((m) => m <= magnitude).length / fullFilmMagnitudesSorted.length;
  const inClimaxWindow = t >= CLIMAX_WINDOW[0] && t <= CLIMAX_WINDOW[1];
  if (rank >= 0.988) return inClimaxWindow ? "CLIMAX" : "HERO"; // ~top 1 of 84 — CLIMAX only inside the film's actual ending
  if (rank >= 0.94) return "HERO"; // ~top 3-5 of 84
  if (rank >= 0.82) return "MAJOR"; // ~top 8-15 of 84
  if (rank >= 0.55) return "SECTION"; // ~top 40% — "clearly perceptible"
  if (rank >= 0.25) return "PHRASE";
  return "MICRO";
}

export class JourneyExpressionDirector {
  constructor() {
    this._releaseMagnitudeHistory = []; // causal, releases-seen-so-far — used ONLY for localRecord, never for eventTier
    this._fullFilmMagnitudesSorted = []; // offline calibration — the actual tier classifier's population
    this._maxMagnitudeSoFar = 0;
    this._lastReleaseCount = 0;
    this._activeEnvelope = null; // { tier, salience, startT, ... } — see _updateEnvelope
  }

  /**
   * Loads the offline, full-film release-magnitude calibration (all 84
   * releases, known in advance since this is an authored film, not a live
   * stream) so classifyEventTier() ranks against the real population
   * instead of a causal prefix. Call once before the first sample(), same
   * pattern as TrackContext.load()/StructuralEpisodes.load(). Missing/
   * failed fetch degrades gracefully to classifyEventTier's SECTION
   * fallback rather than throwing — a review render without this file
   * should still run, just without properly calibrated tiers.
   */
  async load(url = "/release-calibration.json") {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      this._fullFilmMagnitudesSorted = (data.rankedReleases || []).map((r) => r.magnitude).sort((a, b) => a - b);
    } catch {
      // leave _fullFilmMagnitudesSorted empty — classifyEventTier degrades gracefully
    }
  }

  /**
   * @param {number} t
   * @param {ReturnType<import('./EvolutionDirector').EvolutionDirector['sample']>} evolution
   * @param {ReturnType<import('./MusicalDirector').MusicalDirector['sample']>} musical
   * @param {ReturnType<import('./AudioFeatureEngine').AudioFeatureEngine['sample']>} audio
   * @param {import('./MusicEventStream').MusicEventStream|null} [eventStream] optional — corroboration count only
   */
  sample(t, evolution, musical, audio, eventStream = null) {
    const acc = evolution.accumulated;
    const expr = evolution.expressed;
    const cap = new Set(evolution.unlockedCapabilities);

    // Track new releases (EnergyReservoir's releaseCount ratchets up by
    // exactly 1 per drop-edge) to classify THIS release's tier and open an
    // event envelope. This file is called every frame like a sample()
    // function, but release detection is inherently edge-triggered, so it
    // keeps this one small piece of frame-to-frame state — everything else
    // below is a pure function of the inputs.
    const releaseCount = evolution.releaseCount ?? 0;
    let eventTier = "MICRO";
    let eventSalience = 0;
    let localRecord = false;
    if (releaseCount > this._lastReleaseCount) {
      this._lastReleaseCount = releaseCount;
      const magnitude = evolution.lastReleaseMagnitude;
      // globalStoryTier: the actual visible/ceiling-setting classification —
      // ranked against the full-film offline calibration, never the causal
      // prefix. See classifyEventTier's header comment.
      eventTier = classifyEventTier(magnitude, this._fullFilmMagnitudesSorted, t);
      // localRecord: purely descriptive/debug — "is this louder than
      // anything the causal playthrough has seen so far." Explicitly NOT
      // used to set eventTier (that was the bug) — kept only because it's
      // a legitimately different, occasionally useful fact ("the film just
      // topped itself locally") from "how big is this globally."
      localRecord = magnitude > this._maxMagnitudeSoFar;
      this._maxMagnitudeSoFar = Math.max(this._maxMagnitudeSoFar, magnitude);
      this._releaseMagnitudeHistory.push(magnitude);
      eventSalience = clamp01(magnitude / 2.2); // observed real range ~0.3-2.0 (see analysis/_calibration) — 2.2 headroom so a genuine record-setter can still read as "more," not clipped flat against the same ceiling as everything else
      this._activeEnvelope = { tier: eventTier, salience: eventSalience, startT: t, ceiling: TIER_IMPACT_CEILING[eventTier], localRecord };
    } else if (this._activeEnvelope) {
      eventTier = this._activeEnvelope.tier;
      eventSalience = this._activeEnvelope.salience;
      localRecord = this._activeEnvelope.localRecord;
    }

    // Envelope phase timing (Part 6): PREPARATION/IMPACT/AFTERSHOCK/
    // NEW_NORMAL, derived from EnergyReservoir's own phase machine (which
    // already tracks ATTACK/IMPACT/AFTERSHOCK/NEW_NORMAL) rather than
    // duplicating a second timer — this file just renames ATTACK to IMPACT
    // for the perceptual-control vocabulary (an "attack" IS the impact
    // instant) and adds PREPARATION as "GATHER, but only once storedEnergy
    // is meaningfully charged" so a brand-new film-start GATHER (energy
    // still near zero) doesn't visually read as pre-drop tension.
    const energyPhase = evolution.energyPhase;
    let filmPhase = "STEADY";
    if (energyPhase === "GATHER" && evolution.storedEnergy > 0.15) filmPhase = "PREPARATION";
    // EnergyReservoir has its OWN internal "IMPACT" phase (the ~1.6s
    // "body of the release," distinct from its ~0.35s "ATTACK"
    // transient) — both map onto this file's single perceptual IMPACT
    // phase (the brief's "100-700ms depending on event" is this file's
    // tunable envelope, not a hard boundary at EnergyReservoir's own
    // ATTACK/IMPACT split, which exists for a different reason — see
    // EnergyReservoir.js's PHASE_DURATIONS comment).
    else if (energyPhase === "ATTACK" || energyPhase === "IMPACT") filmPhase = "IMPACT";
    else if (energyPhase === "AFTERSHOCK") filmPhase = "AFTERSHOCK";
    else if (energyPhase === "NEW_NORMAL") filmPhase = "NEW_NORMAL";

    const ceiling = this._activeEnvelope?.ceiling ?? TIER_IMPACT_CEILING.MICRO;
    // `impact`: how much THIS instant should visually assert itself,
    // capped by the active event's tier ceiling — this is the direct
    // enforcement of "an 84th release is not 84 visual explosions."
    const impact = filmPhase === "IMPACT" ? Math.min(ceiling, eventSalience) : filmPhase === "AFTERSHOCK" ? Math.min(ceiling, eventSalience) * 0.5 : 0;
    const aftershock = filmPhase === "AFTERSHOCK" ? Math.min(ceiling, eventSalience) : 0;

    // --- Perceptual controls, each visibleProperty = accumulated × expression (+ small explicit event terms) ---
    const visibleComplexity = clamp01((expr.surfaceComplexity + expr.topologyComplexity + expr.interiorDepth) / 3);
    const reveal = clamp01(expr.interiorDepth + impact * 0.3); // how much of "what's inside" is currently legible
    const breath = evolution.breath;

    const assemblyExpression = clamp01(expr.assembly);
    // attractionStrength: HIGH during gathering (fragments pull inward,
    // per Part 5 — "attraction increases but motion may slow"), moderate
    // baseline otherwise scaled by how much assembly capability even
    // exists yet (an unassembled seed has nothing to attract INTO).
    const attractionStrength = clamp01(acc.assembly * (0.3 + 0.7 * (filmPhase === "PREPARATION" ? evolution.storedEnergy : 0.2)));

    const contraction = filmPhase === "PREPARATION" ? clamp01(evolution.storedEnergy) : musical.breakdown ? 0.6 : 0;
    const expansion = filmPhase === "IMPACT" || filmPhase === "AFTERSHOCK" ? impact + aftershock : 0;

    // motionScale/coherence/entropy: gathering REDUCES entropy and speed
    // (per Part 5 — align, don't just fly faster); breakdown reduces scale
    // without necessarily reducing coherence (a breath is calm, not chaotic).
    const motionScale = clamp01(1 - contraction * 0.7 - (musical.breakdown ? 0.5 : 0)) * (1 + expansion * 0.4);
    const motionCoherence = clamp01(0.5 + attractionStrength * 0.5 - (musical.densityState === "dense" ? 0.15 : 0));
    const entropy = clamp01((1 - motionCoherence) * 0.7 + expansion * 0.3);

    const spatialCompression = contraction;
    const spatialExpansion = expansion;
    const symmetryLock = clamp01(expr.symmetryComplexity * (0.4 + attractionStrength * 0.6));

    // Family expressions: EACH gated by its own unlocked capability — a
    // capability that doesn't exist yet contributes exactly 0, regardless
    // of what the current audio/scene state would otherwise request (Part
    // 3's explicit example: "if fieldReach == 0, fieldExpression MUST be
    // 0"). This is the hard gate SceneDirector's own hardEventAllowed
    // mechanism already enforces at the chapter level for CHAMBER — this
    // file makes the same guarantee available as a continuous 0..1 value
    // for every family, not just a binary family switch.
    const surfaceExpression = clamp01(expr.surfaceComplexity);
    // interiorHintExpression: pre-reveal concavity/seam/aperture-suggestion
    // reading (Part 2) — bounded low by EvolutionDirector's
    // interiorHintDepth ceiling, gated by INTERIOR_HINT so it is exactly 0
    // before the pre-rupture compression window even begins.
    const interiorHintExpression = cap.has("INTERIOR_HINT") ? clamp01(expr.interiorHintDepth) : 0;
    // interiorExpression: TRUE navigable-interior reading — gated by
    // INTERIOR_REVEALED (unlocked only at the verified 17:47 rupture), so
    // this is exactly 0 for the entire film before that instant, matching
    // EvolutionDirector.accumulated.interiorDepth being exactly 0 there too.
    const interiorExpression = cap.has("INTERIOR_REVEALED") ? clamp01(expr.interiorDepth) : 0;
    const fieldExpression = cap.has("FIELD") ? clamp01(expr.fieldReach) : 0;
    const memoryExpression = cap.has("ECHO") ? clamp01(expr.memoryDepth) : 0;
    const voidExpression = cap.has("VOID_DOMINANCE") ? clamp01(1 - expr.assembly) * 0.5 : cap.has("VOID_WHISPER") ? 0.05 : 0;

    const psychedelicExpression = clamp01(expr.psychedelicDepth);

    // lightNarrowing / cameraStillness: gathering narrows/stills (Part 10:
    // "narrow/reduce ambient/tighten direction" during build); release
    // opens things back up.
    const lightNarrowing = clamp01(contraction * 0.8 + (musical.breakdown ? 0.3 : 0));
    const cameraStillness = clamp01(contraction * 0.7 + (musical.breakdown ? 0.5 : 0) - expansion * 0.6);

    return {
      visibleComplexity,
      reveal,
      breath,
      assemblyExpression,
      attractionStrength,
      contraction,
      expansion,
      motionScale,
      motionCoherence,
      entropy,
      spatialCompression,
      spatialExpansion,
      symmetryLock,
      surfaceExpression,
      interiorHintExpression,
      interiorExpression,
      fieldExpression,
      memoryExpression,
      voidExpression,
      psychedelicExpression,
      lightNarrowing,
      cameraStillness,
      impact,
      aftershock,
      filmPhase,
      eventTier,
      eventSalience,
      localRecord,
      corroboration: eventStream ? eventStream.corroborationCount(t) : 0,
    };
  }
}
