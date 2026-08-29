import { getRestraintFactor, EVENTS as MACRO_EVENTS } from "./timeline.js";

// MESO timescale (V3 Phase 1 — docs/v3-creative-direction.md). Sits between
// MACRO (timeline.js chapter map) and MICRO (AudioFeatureEngine per-frame
// samples): a track/phrase-aware layer answering "what is the music DOING
// right now, structurally" — a build, a drop, a breakdown, a track blend —
// none of which MACRO (fixed chapter boundaries) or MICRO (instantaneous
// band energies) can express on their own.
//
// Source data is `analysis/track-map.json` (algorithmic transition
// candidates, scored + tiered, see docs/musical-cue-sheet-v2.md) plus a
// small hand-verified list of exceptional events actually confirmed by the
// structural analysis in docs/creative-bible.md/cue-sheet.md, plus optional
// manual overrides exported from analysis/annotate.html. Per the brief:
// candidate transitions stay candidates. Only `tier === "high"` track-map
// entries (or an explicit manual annotation) are treated as CONFIRMED and
// allowed to advance `track` / gate hard MESO-level decisions; everything
// else is exposed as `transitionProgress` / `densityState` texture that
// SceneDirector may use for gentle modulation, never as a scene-changing
// trigger on its own.
//
// Like CameraDirector's shot-segment table and AudioFeatureEngine's binary
// sampling, this precomputes once at load() time and answers sample(t) as a
// pure function of t — required for seek-determinism.

// Hand-verified exceptional events (NOT algorithmic candidates) — see
// docs/creative-bible.md §6 and docs/cue-sheet.md's "Singular events" table.
// These are treated as confirmed regardless of the track-map's own scoring
// because they were derived from independent, targeted structural analysis
// (spectral centroid outlier, global RMS max), not the generic 20s-window
// transition detector.
const EXCEPTIONAL_EVENTS = [
  {
    id: "rupture_1747",
    t: 1067.19,
    label: "Spectral flash / 17:47 ontological rupture — also the track-map's own highest-corroborated cluster (17:21-17:48, three candidates in <30s)",
  },
  { id: "climax_2482", t: MACRO_EVENTS.climaxPeak, label: "Global RMS maximum" },
  {
    id: "final_fade_1744",
    t: 41 * 60 + 43.98,
    label: "Highest-scored track-map candidate (0.682, every signal fired) — the mix's final track fading into Departure's collapse",
  },
];

// Merge distance for near-duplicate detections of the same real event, e.g.
// the documented 17:21/17:40/17:48 cluster and the 34:43.30/34:44.48 pair
// (docs/musical-cue-sheet-v2.md calls both out explicitly as one event
// detected twice by adjacent 20s analysis windows, not two events).
const CLUSTER_MERGE_SECONDS = 20;
const TRANSITION_RAMP_SECONDS = 4; // transitionProgress ramps across ±this many seconds
const BUILD_WINDOW_SECONDS = 24; // "the ~20s leading into a confirmed transition reads as a build"
const DROP_WINDOW_SECONDS = 3; // "the first few seconds after a confirmed transition reads as a drop/arrival"
const DENSITY_WINDOW_SECONDS = 30;
const VOCAL_THRESHOLD = 0.5;
const BASS_THRESHOLD = 0.5;
const EVENT_WINDOW_SECONDS = 3;

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// Scans a coarse (1Hz) resampling of a feature-engine field for rising-edge
// threshold crossings, returning a sorted array of crossing times. This is
// an honest v1 (per docs/v3-creative-direction.md §7): a real vocal/bass
// "entry" detector would look at sustained presence, not one sample: a
// short refractory period (`minGapSeconds`) after each crossing keeps a
// single sustained rise from firing dozens of times.
function detectRisingEdges(featureEngine, field, threshold, duration, minGapSeconds) {
  if (!featureEngine || !featureEngine.data) return [];
  const events = [];
  let below = true;
  let lastEventT = -Infinity;
  const STEP = 1.0;
  for (let t = 0; t <= duration; t += STEP) {
    const v = featureEngine.sample(t)[field];
    if (below && v >= threshold && t - lastEventT >= minGapSeconds) {
      events.push(t);
      lastEventT = t;
      below = false;
    } else if (v < threshold * 0.8) {
      below = true; // hysteresis so a value hovering at the threshold doesn't chatter
    }
  }
  return events;
}

export class MusicalDirector {
  constructor() {
    this.ready = false;
    this.transitions = []; // [{t, confidence: 'confirmed'|'candidate', score, evidence}], sorted
    this.exceptionalEvents = [...EXCEPTIONAL_EVENTS].sort((a, b) => a.t - b.t);
    this.vocalEntries = [];
    this.bassEntries = [];
    this.duration = 0;
  }

  // featureEngine is optional — if omitted (or not yet loaded), vocalEntry/
  // bassEntry stay empty and densityState/tensionState fall back to
  // track-map-density-only reasoning, the same graceful-degradation
  // discipline as VisualDirector.sample() when AudioFeatureEngine is absent.
  async load(trackMapUrl = "/track-map.json", annotationsUrl = "/annotations.json", featureEngine = null) {
    const trackMap = await fetch(trackMapUrl).then((r) => r.json());

    let annotations = { markers: [] };
    try {
      const res = await fetch(annotationsUrl);
      if (res.ok) annotations = await res.json();
    } catch {
      // No manual annotation export yet (analysis/annotate.html output) —
      // fine, this pass ships the tool + the consumer, not a completed
      // by-ear pass over all 15 tracks (docs/v2-plan.md's own deferred item).
    }

    this._buildTransitions(trackMap, annotations);

    if (featureEngine && featureEngine.data) {
      this.duration = featureEngine.duration;
      this.vocalEntries = detectRisingEdges(featureEngine, "vocalPresence", VOCAL_THRESHOLD, this.duration, 8);
      this.bassEntries = detectRisingEdges(featureEngine, "bass", BASS_THRESHOLD, this.duration, 8);
    }

    this.ready = true;
  }

  _buildTransitions(trackMap, annotations) {
    const candidates = (trackMap.candidates || [])
      .map((c) => ({ t: c.t, score: c.score, evidence: c.evidence, tier: c.tier }))
      .sort((a, b) => a.t - b.t);

    // Cluster near-duplicate detections of the same event into one, keeping
    // the highest score and the union of evidence (per the doc's own
    // explicit callouts on the 17:47 cluster and the 34:43 pair).
    const clustered = [];
    for (const c of candidates) {
      const prev = clustered[clustered.length - 1];
      if (prev && c.t - prev.t <= CLUSTER_MERGE_SECONDS) {
        if (c.score > prev.score) prev.score = c.score;
        prev.evidence = Array.from(new Set([...prev.evidence, ...c.evidence]));
        prev.tier = prev.tier === "high" || c.tier === "high" ? "high" : prev.tier;
      } else {
        clustered.push({ ...c });
      }
    }

    const manualConfirmed = (annotations.markers || [])
      .filter((m) => m.type === "transition" || m.type === "confirmed_transition")
      .map((m) => ({ t: m.t, score: 1.0, evidence: ["manual_annotation"], tier: "high" }));

    this.transitions = [...clustered, ...manualConfirmed]
      .sort((a, b) => a.t - b.t)
      .map((c) => ({
        t: c.t,
        confidence: c.tier === "high" ? "confirmed" : "candidate",
        score: c.score,
        evidence: c.evidence,
      }));
  }

  _nearestTransition(t, confidenceFilter = null) {
    let best = null;
    let bestDist = Infinity;
    for (const tr of this.transitions) {
      if (confidenceFilter && tr.confidence !== confidenceFilter) continue;
      const d = Math.abs(tr.t - t);
      if (d < bestDist) {
        bestDist = d;
        best = tr;
      }
    }
    return best ? { ...best, dist: bestDist } : null;
  }

  // Number of CONFIRMED transitions strictly before t — this is `track`,
  // an ordinal, not an identity (there are no real track names/titles to
  // assign, per docs/musical-cue-sheet-v2.md's own explicit refusal to
  // hallucinate them).
  _trackIndexAt(t) {
    let n = 0;
    for (const tr of this.transitions) {
      if (tr.confidence === "confirmed" && tr.t <= t) n++;
    }
    return n;
  }

  sample(t) {
    if (!this.ready) {
      return {
        track: 0,
        transitionProgress: 0,
        phrasePosition: 0,
        breakdown: false,
        build: false,
        drop: false,
        vocalEntry: false,
        bassEntry: false,
        densityState: "developing",
        tensionState: "low",
        exceptionalEvent: null,
      };
    }

    const nearestConfirmed = this._nearestTransition(t, "confirmed");
    const transitionProgress = nearestConfirmed
      ? clamp01(1 - nearestConfirmed.dist / TRANSITION_RAMP_SECONDS)
      : 0;

    const build =
      nearestConfirmed != null &&
      nearestConfirmed.t > t &&
      nearestConfirmed.dist <= BUILD_WINDOW_SECONDS;

    const drop =
      nearestConfirmed != null &&
      nearestConfirmed.t <= t &&
      nearestConfirmed.dist <= DROP_WINDOW_SECONDS;

    // breakdown reuses the existing, already-verified restraint doctrine
    // (timeline.js) rather than re-deriving low-energy troughs a second
    // time from a different signal — MusicalDirector's job is structural
    // framing on top of that, not a competing definition of "quiet."
    const breakdown = getRestraintFactor(t) > 0.5;

    // densityState: how many transition candidates (any tier) cluster
    // within DENSITY_WINDOW_SECONDS of t — creative-bible.md §6's own
    // observation that "clustering density itself is signal" (dense
    // candidate clusters = actively developing material; long gaps =
    // stable/undeveloping), applied directly rather than re-derived.
    let nearby = 0;
    for (const tr of this.transitions) {
      if (Math.abs(tr.t - t) <= DENSITY_WINDOW_SECONDS) nearby++;
    }
    const densityState = nearby >= 3 ? "dense" : nearby >= 1 ? "developing" : "sparse";

    // tensionState: proximity to the two authored macro extremes (the
    // climax build and the post-climax collapse) plus local build/drop
    // state — deliberately coarse, matching the mapping table's own
    // instruction that energyTrend is a macro-tension signal, not a
    // per-frame one.
    let tensionState = "low";
    if (t >= MACRO_EVENTS.climaxStart && t < MACRO_EVENTS.climaxPeak) tensionState = "rising";
    else if (t >= MACRO_EVENTS.climaxPeak && t < MACRO_EVENTS.silenceFloor) tensionState = "falling";
    else if (build) tensionState = "rising";
    else if (densityState === "dense") tensionState = "high";

    const nearestVocal = this.vocalEntries.find((vt) => Math.abs(vt - t) <= 1);
    const nearestBass = this.bassEntries.find((bt) => Math.abs(bt - t) <= 1);

    let exceptionalEvent = null;
    for (const ev of this.exceptionalEvents) {
      if (Math.abs(ev.t - t) <= EVENT_WINDOW_SECONDS) {
        exceptionalEvent = ev.id;
        break;
      }
    }

    return {
      track: this._trackIndexAt(t),
      transitionProgress,
      phrasePosition: 0, // no verified bar-level phrase grid yet (bar grid is a 4-beat heuristic per creative-bible.md §9) — reserved, not fabricated
      breakdown,
      build,
      drop,
      vocalEntry: !!nearestVocal,
      bassEntry: !!nearestBass,
      densityState,
      tensionState,
      exceptionalEvent,
    };
  }
}
