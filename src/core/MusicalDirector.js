import { getRestraintFactor, EVENTS as MACRO_EVENTS } from "./timeline.js";

// MESO timescale (V3 Phase 1). Sits between MACRO (timeline.js chapter map)
// and MICRO (AudioFeatureEngine per-frame samples): a track/phrase-aware
// layer answering "what is the music DOING right now, structurally."
//
// V3.5 CONFIDENCE MODEL (this file's central fix — see docs/v3-creative-
// direction.md's own admission that "algorithmic candidates stay
// candidates" was violated in practice: v3 silently promoted track-map
// tier==="high" to confidence: "confirmed", which is not true — a high
// algorithmic score is not the same claim as "Ronny listened and confirmed
// this by ear." Four explicit levels, weakest to strongest:
//
//   candidate            — algorithmic detection, low/medium score tier.
//   strong_candidate      — algorithmic detection, high score tier (was
//                           mislabeled "confirmed" in V3).
//   human_confirmed       — a marker Ronny placed in analysis/annotate.html
//                           and exported to /annotations.json.
//   structurally_verified — confirmed by an OBJECTIVE, non-thresholded
//                           metric (the literal global RMS maximum) or by
//                           TWO INDEPENDENT analysis pipelines agreeing
//                           (the 17:47 rupture: v1's spectral-centroid
//                           outlier detector AND v2's track-map transition
//                           detector both independently flag the same
//                           instant as exceptional).
//
// Only human_confirmed or structurally_verified events may trigger HARD
// editorial decisions (SceneDirector forcing a family, CameraDirector
// splicing a shot) by default. strong_candidate/candidate may only
// influence continuous, soft tension/density signals — see sample()'s
// build/drop/transitionProgress, which deliberately do NOT filter by
// confidence tier (any algorithmic candidate is fine for a soft nudge),
// versus `exceptionalEvent`/`exceptionalEventConfidence`, which callers
// (SceneDirector) MUST check before treating an event as license for a
// hard cut. No transition-analysis data is discarded by this change — the
// full scored/tiered candidate list from analysis/track-map.json is still
// all present in `transitions`, just labeled honestly.

// Hand-verified exceptional events — see docs/creative-bible.md §6 and
// docs/cue-sheet.md's "Singular events" table. `confidence` here is NOT a
// blanket "these are all confirmed" — each is reasoned individually:
//   rupture_1747: structurally_verified — TWO independent pipelines agree
//     (v1's spectral-centroid-outlier reading AND v2's track-map cluster).
//   climax_2482: structurally_verified — the literal global RMS maximum is
//     an objective fact about the waveform, not a scored/thresholded guess.
//   final_fade_1744: strong_candidate ONLY — it is the single highest-
//     scored entry from ONE detector (the same 20s-window transition
//     scorer as every other track-map candidate), not independently
//     corroborated and not yet confirmed by ear. V3 incorrectly treated
//     this as license to force a hard SceneDirector VOID pulse; V3.5 keeps
//     the event (real signal, worth knowing about) but no longer lets it
//     trigger a hard decision until Ronny confirms it by ear (at which
//     point it should be re-tagged human_confirmed, not have new code
//     written for it).
const EXCEPTIONAL_EVENTS = [
  {
    id: "rupture_1747",
    t: 1067.19,
    confidence: "structurally_verified",
    label: "Spectral flash / 17:47 ontological rupture — also the track-map's own highest-corroborated cluster (17:21-17:48, three candidates in <30s)",
  },
  {
    id: "climax_2482",
    t: MACRO_EVENTS.climaxPeak,
    confidence: "structurally_verified",
    label: "Global RMS maximum",
  },
  {
    id: "final_fade_1744",
    t: 41 * 60 + 43.98,
    confidence: "strong_candidate",
    label: "Highest-scored track-map candidate (0.682, every signal fired) — the mix's final track fading into Departure's collapse. NOT independently corroborated; not yet confirmed by ear.",
  },
];

// V3.5 Phase 6: normalizes both the pre-existing analysis/annotate.html
// marker vocabulary (kebab-case, shipped with the tool before any
// consumer existed for it) and this brief's canonical UPPER_SNAKE vocabulary
// onto one internal set, so extending the tool's <select> options (adding
// only the genuinely missing "BUILD") is enough — no rebuild of the
// annotation workflow itself.
const TYPE_ALIASES = {
  "track-transition": "TRACK_BLEND_START",
  "blend": "TRACK_BLEND_START",
  "transition": "TRACK_BLEND_START", // legacy V3 manual-override marker name
  "confirmed_transition": "TRACK_BLEND_START", // legacy V3 manual-override marker name
  "return": "TRACK_RESOLVES",
  "new-bassline": "BASSLINE_ENTRY",
  "vocal-arrival": "VOCAL_ENTRY",
  "breakdown": "BREAKDOWN",
  "build": "BUILD",
  "drop": "DROP",
  "phrase-boundary": "PHRASE_BOUNDARY",
  "timbral-event": "EXCEPTIONAL_SOUND",
  "exceptional-event": "EXCEPTIONAL_SOUND",
};
function normalizeMarkerType(raw) {
  return TYPE_ALIASES[raw] || raw;
}

// Merge distance for near-duplicate detections of the same real event, e.g.
// the documented 17:21/17:40/17:48 cluster and the 34:43.30/34:44.48 pair
// (docs/musical-cue-sheet-v2.md calls both out explicitly as one event
// detected twice by adjacent 20s analysis windows, not two events).
const CLUSTER_MERGE_SECONDS = 20;
const TRANSITION_RAMP_SECONDS = 4; // transitionProgress ramps across ±this many seconds
const BUILD_WINDOW_SECONDS = 24; // "the ~20s leading into a transition reads as a build"
const DROP_WINDOW_SECONDS = 3; // "the first few seconds after a transition reads as a drop/arrival"
const DENSITY_WINDOW_SECONDS = 30;
const VOCAL_THRESHOLD = 0.5;
const BASS_THRESHOLD = 0.5;
const EVENT_WINDOW_SECONDS = 3;
const HUMAN_EVENT_WINDOW_SECONDS = 10; // window around a human BUILD/DROP/BREAKDOWN marker

const CONFIRMED_GRADE = new Set(["human_confirmed", "structurally_verified"]);

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// Scans a coarse (1Hz) resampling of a feature-engine field for rising-edge
// threshold crossings, returning a sorted array of crossing times. This is
// an honest v1: a real vocal/bass "entry" detector would look at sustained
// presence, not one sample: a short refractory period (`minGapSeconds`)
// after each crossing keeps a single sustained rise from firing dozens of
// times. Human VOCAL_ENTRY/BASSLINE_ENTRY annotations (when present) are
// merged with these algorithmic detections in _buildTransitions/load, not
// used to replace this detector — both are legitimate, complementary
// evidence.
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
    this.transitions = []; // [{t, confidence, score, evidence}], sorted — confidence in candidate|strong_candidate|human_confirmed
    this.exceptionalEvents = [...EXCEPTIONAL_EVENTS].sort((a, b) => a.t - b.t);
    this.vocalEntries = [];
    this.bassEntries = [];
    this.phraseBoundaries = []; // ONLY human-confirmed PHRASE_BOUNDARY marker times — never inferred
    this.humanEvents = []; // [{t, type: 'BREAKDOWN'|'BUILD'|'DROP'}] from manual annotation
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
      // by-ear pass over all 15 tracks. Do NOT invent missing annotations.
    }

    const markers = (annotations.markers || []).map((m) => ({ ...m, type: normalizeMarkerType(m.type) }));

    this._buildTransitions(trackMap, markers);
    this._buildHumanEvents(markers);

    if (featureEngine && featureEngine.data) {
      this.duration = featureEngine.duration;
      this.vocalEntries = detectRisingEdges(featureEngine, "vocalPresence", VOCAL_THRESHOLD, this.duration, 8);
      this.bassEntries = detectRisingEdges(featureEngine, "bass", BASS_THRESHOLD, this.duration, 8);
    }

    // Human VOCAL_ENTRY / BASSLINE_ENTRY markers are merged in (union, not
    // replacement) with the algorithmic threshold-crossing detection above
    // — either kind of evidence is legitimate.
    const humanVocal = markers.filter((m) => m.type === "VOCAL_ENTRY").map((m) => m.t);
    const humanBass = markers.filter((m) => m.type === "BASSLINE_ENTRY").map((m) => m.t);
    this.vocalEntries = [...this.vocalEntries, ...humanVocal].sort((a, b) => a - b);
    this.bassEntries = [...this.bassEntries, ...humanBass].sort((a, b) => a - b);

    // PHRASE_BOUNDARY: exclusively human-sourced. No algorithmic bar-count
    // heuristic here — the bar grid itself is a 4-beat heuristic (creative-
    // bible.md §9, not verified against audible downbeats), so deriving
    // phrases from it would compound one unverified assumption on another.
    this.phraseBoundaries = markers
      .filter((m) => m.type === "PHRASE_BOUNDARY")
      .map((m) => m.t)
      .sort((a, b) => a - b);

    // EXCEPTIONAL_SOUND: a human-flagged singular moment not already in the
    // hardcoded EXCEPTIONAL_EVENTS list — appended at human_confirmed grade
    // (a human specifically marked this as exceptional, which is a stronger
    // claim than any algorithmic score).
    markers
      .filter((m) => m.type === "EXCEPTIONAL_SOUND")
      .forEach((m, i) => {
        this.exceptionalEvents.push({
          id: `human_exceptional_${i}_${Math.round(m.t)}`,
          t: m.t,
          confidence: "human_confirmed",
          label: m.text || m.label || "Human-flagged exceptional sound",
        });
      });
    this.exceptionalEvents.sort((a, b) => a.t - b.t);

    this.ready = true;
  }

  _buildTransitions(trackMap, markers) {
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

    // ONLY human markers produce human_confirmed transitions. Algorithmic
    // tier "high" is labeled strong_candidate, never "confirmed" — see this
    // file's header comment. TRACK_BLEND_START and TRACK_RESOLVES both mark
    // a real transition boundary from the human's perspective (the start of
    // a blend and the point it resolves are both "a transition happened
    // here" for editorial purposes); they are not collapsed into one paired
    // event because a manual annotation pass may only mark one side.
    const humanConfirmed = markers
      .filter((m) => m.type === "TRACK_BLEND_START" || m.type === "TRACK_RESOLVES")
      .map((m) => ({ t: m.t, score: 1.0, evidence: ["human_annotation"], tier: null, confidence: "human_confirmed" }));

    const algorithmic = clustered.map((c) => ({
      ...c,
      confidence: c.tier === "high" ? "strong_candidate" : "candidate",
    }));

    this.transitions = [...algorithmic, ...humanConfirmed]
      .sort((a, b) => a.t - b.t)
      .map((c) => ({ t: c.t, confidence: c.confidence, score: c.score, evidence: c.evidence }));
  }

  _buildHumanEvents(markers) {
    this.humanEvents = markers
      .filter((m) => m.type === "BREAKDOWN" || m.type === "BUILD" || m.type === "DROP")
      .map((m) => ({ t: m.t, type: m.type }))
      .sort((a, b) => a.t - b.t);
  }

  // Any-tier lookup — used ONLY for continuous soft signals (transition
  // Progress/build/drop), where the brief explicitly allows algorithmic
  // candidates to contribute. Never use this for a hard editorial decision.
  _nearestTransition(t) {
    let best = null;
    let bestDist = Infinity;
    for (const tr of this.transitions) {
      const d = Math.abs(tr.t - t);
      if (d < bestDist) {
        bestDist = d;
        best = tr;
      }
    }
    return best ? { ...best, dist: bestDist } : null;
  }

  // Number of CONFIRMED-GRADE (human_confirmed or structurally_verified)
  // transitions strictly before t — this is `track`, an ordinal, not an
  // identity (there are no real track names/titles to assign). Until
  // Ronny annotates real transitions, this stays 0 for nearly the whole
  // piece — that's correct/honest, not a bug: an algorithmic strong_
  // candidate is not the same claim as a confirmed track boundary.
  _trackIndexAt(t) {
    let n = 0;
    for (const tr of this.transitions) {
      if (CONFIRMED_GRADE.has(tr.confidence) && tr.t <= t) n++;
    }
    return n;
  }

  _nearestHumanEvent(t, type) {
    let best = null;
    let bestDist = Infinity;
    for (const ev of this.humanEvents) {
      if (ev.type !== type) continue;
      const d = Math.abs(ev.t - t);
      if (d < bestDist) {
        bestDist = d;
        best = ev;
      }
    }
    return best && bestDist <= HUMAN_EVENT_WINDOW_SECONDS ? best : null;
  }

  // Real phrasePosition — ONLY meaningful once at least two PHRASE_BOUNDARY
  // markers exist around t. No bar-count fallback (see load()'s comment on
  // why): returns 0 (not fabricated) when there isn't enough human data to
  // answer honestly.
  _phrasePositionAt(t) {
    let prev = null;
    let next = null;
    for (const b of this.phraseBoundaries) {
      if (b <= t) prev = b;
      else if (next == null) next = b;
    }
    if (prev == null || next == null || next <= prev) return 0;
    return clamp01((t - prev) / (next - prev));
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
        exceptionalEventConfidence: null,
      };
    }

    const nearest = this._nearestTransition(t);
    const transitionProgress = nearest ? clamp01(1 - nearest.dist / TRANSITION_RAMP_SECONDS) : 0;

    // build/drop: soft signals, deliberately NOT confidence-filtered — any
    // algorithmic candidate is legitimate evidence for "tension is rising
    // near here" even if it's never confirmed as a real track boundary.
    // Human BUILD/DROP markers (when present) take priority over the
    // generic transition-proximity heuristic.
    const humanBuild = this._nearestHumanEvent(t, "BUILD");
    const humanDrop = this._nearestHumanEvent(t, "DROP");
    const build = humanBuild != null || (nearest != null && nearest.t > t && nearest.dist <= BUILD_WINDOW_SECONDS);
    const drop = humanDrop != null || (nearest != null && nearest.t <= t && nearest.dist <= DROP_WINDOW_SECONDS);

    // breakdown: the restraint doctrine (timeline.js) is the primary,
    // already-verified signal; a human BREAKDOWN marker can additionally
    // flag a breakdown the fixed restraint windows didn't happen to cover.
    const breakdown = getRestraintFactor(t) > 0.5 || this._nearestHumanEvent(t, "BREAKDOWN") != null;

    // densityState: how many transition candidates (any tier) cluster
    // within DENSITY_WINDOW_SECONDS of t — creative-bible.md §6's own
    // observation that "clustering density itself is signal."
    let nearby = 0;
    for (const tr of this.transitions) {
      if (Math.abs(tr.t - t) <= DENSITY_WINDOW_SECONDS) nearby++;
    }
    const densityState = nearby >= 3 ? "dense" : nearby >= 1 ? "developing" : "sparse";

    let tensionState = "low";
    if (t >= MACRO_EVENTS.climaxStart && t < MACRO_EVENTS.climaxPeak) tensionState = "rising";
    else if (t >= MACRO_EVENTS.climaxPeak && t < MACRO_EVENTS.silenceFloor) tensionState = "falling";
    else if (build) tensionState = "rising";
    else if (densityState === "dense") tensionState = "high";

    const nearestVocal = this.vocalEntries.find((vt) => Math.abs(vt - t) <= 1);
    const nearestBass = this.bassEntries.find((bt) => Math.abs(bt - t) <= 1);

    let exceptionalEvent = null;
    let exceptionalEventConfidence = null;
    for (const ev of this.exceptionalEvents) {
      if (Math.abs(ev.t - t) <= EVENT_WINDOW_SECONDS) {
        exceptionalEvent = ev.id;
        exceptionalEventConfidence = ev.confidence;
        break;
      }
    }

    return {
      track: this._trackIndexAt(t),
      transitionProgress,
      phrasePosition: this._phrasePositionAt(t),
      breakdown,
      build,
      drop,
      vocalEntry: !!nearestVocal,
      bassEntry: !!nearestBass,
      densityState,
      tensionState,
      exceptionalEvent,
      exceptionalEventConfidence,
    };
  }
}
