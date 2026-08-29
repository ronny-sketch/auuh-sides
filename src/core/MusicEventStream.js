// Journey branch. MusicalDirector.js already does real structural
// detection (confidence-graded transitions, human/algorithmic build/drop/
// breakdown, exceptional events, vocal/bass entries, phrase boundaries) —
// this file does NOT re-detect any of that. It only answers the two
// things the journey brief asks for that MusicalDirector's shape doesn't
// yet expose directly:
//
//   1. a single canonical event schema — {type, timestamp, confidence,
//      salience 0..1, hierarchy} — so a caller doesn't need to know which
//      of MusicalDirector's five separate arrays a given moment came from.
//   2. HIERARCHY: a normal kick must never carry the same visual authority
//      as a drop, a track transition, or a hand/objectively verified
//      moment like 17:47 or the RMS-max climax. MusicalDirector's
//      confidence tiers (candidate/strong_candidate/human_confirmed/
//      structurally_verified) answer "how sure are we this happened";
//      hierarchy answers a different question, "how much should the film
//      change because it happened" — this file derives the second from
//      the first plus event type.
//
// TWO REPRESENTATIONS (per the brief): MusicalDirector + AudioFeatureEngine
// together already ARE the continuous (~50Hz) representation — nothing
// new needed there. This file builds ONLY the discrete side, once, from
// already-loaded data (not per-frame), and answers window queries —
// "which events cross THIS frame's time window" — which is how a renderer
// should consume a discrete stream, not by re-deriving "nearest event to
// t" every frame the way MusicalDirector's own sample() still does for
// its continuous outputs (that's correct for those, this is for events).
const HIERARCHY_RANK = { MICRO: 0, PHRASE: 1, SECTION: 2, TRACK: 3, HERO: 4, CLIMAX: 5 };

const CONFIDENCE_SALIENCE = {
  candidate: 0.35,
  strong_candidate: 0.55,
  human_confirmed: 0.85,
  structurally_verified: 1.0,
};

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

export class MusicEventStream {
  /**
   * @param {import('./MusicalDirector').MusicalDirector} musicalDirector must already be .load()ed
   * @param {import('./AudioFeatureEngine').AudioFeatureEngine|null} featureEngine optional — enables MICRO-tier kick onsets
   */
  constructor(musicalDirector, featureEngine = null) {
    this.events = this._build(musicalDirector, featureEngine);
    this.events.sort((a, b) => a.timestamp - b.timestamp);
  }

  _build(md, fe) {
    const events = [];

    for (const tr of md.transitions) {
      const type = "TRACK_TRANSITION";
      events.push({
        type,
        timestamp: tr.t,
        confidence: tr.confidence,
        salience: CONFIDENCE_SALIENCE[tr.confidence] ?? 0.4,
        hierarchy: "TRACK",
      });
    }

    for (const ev of md.humanEvents) {
      // BUILD/DROP/BREAKDOWN markers — human-placed, so confidence is
      // effectively human_confirmed even though MusicalDirector doesn't
      // carry a separate confidence field for these (they're booleans in
      // sample()). SECTION tier: these reshape a section of the film, but
      // are not automatically HERO-grade the way an exceptional event is.
      events.push({
        type: ev.type, // "BUILD" | "DROP" | "BREAKDOWN"
        timestamp: ev.t,
        confidence: "human_confirmed",
        salience: 0.7,
        hierarchy: "SECTION",
      });
    }

    for (const ev of md.exceptionalEvents) {
      // climax_2482 (objective global RMS max) is the one CLIMAX-tier
      // event in this piece by construction — everything else exceptional
      // is HERO, one level down. This mirrors MusicalDirector's own header
      // comment distinguishing "the literal global RMS maximum" from
      // every other, still-real-but-less-absolute exceptional moment.
      const hierarchy = ev.id === "climax_2482" ? "CLIMAX" : "HERO";
      events.push({
        type: "EXCEPTIONAL_" + ev.id.toUpperCase(),
        timestamp: ev.t,
        confidence: ev.confidence,
        salience: CONFIDENCE_SALIENCE[ev.confidence] ?? 0.5,
        hierarchy,
        label: ev.label,
      });
    }

    for (const t of md.phraseBoundaries) {
      events.push({ type: "PHRASE_BOUNDARY", timestamp: t, confidence: "human_confirmed", salience: 0.2, hierarchy: "PHRASE" });
    }
    for (const t of md.vocalEntries) {
      events.push({ type: "VOCAL_ENTRY", timestamp: t, confidence: "candidate", salience: 0.3, hierarchy: "PHRASE" });
    }
    for (const t of md.bassEntries) {
      events.push({ type: "BASSLINE_ENTRY", timestamp: t, confidence: "candidate", salience: 0.3, hierarchy: "PHRASE" });
    }

    if (fe && fe.data) {
      events.push(...this._buildMicroKicks(fe));
    }

    return events;
  }

  // MICRO tier: kick-drum onsets, scanned once from the continuous 50Hz
  // feature stream (not re-scanned per frame). Deliberately the lowest-
  // salience, most numerous event type — per the brief, "a normal kick
  // must never have the same visual authority as a drop."
  _buildMicroKicks(fe) {
    const events = [];
    const THRESHOLD = 0.55;
    const MIN_GAP = 0.15; // avoid double-firing across two adjacent 50Hz frames on one transient
    let below = true;
    let lastT = -Infinity;
    const step = 1 / fe.hopHz;
    for (let t = 0; t <= fe.duration; t += step) {
      const v = fe.sample(t).kick;
      if (below && v >= THRESHOLD && t - lastT >= MIN_GAP) {
        events.push({ type: "KICK", timestamp: t, confidence: "candidate", salience: 0.1, hierarchy: "MICRO" });
        lastT = t;
        below = false;
      } else if (v < THRESHOLD * 0.7) {
        below = true;
      }
    }
    return events;
  }

  /** Every event whose timestamp falls in [startT, endT) — the renderer's actual query shape. */
  eventsInWindow(startT, endT) {
    // Events are sorted by timestamp; a linear scan from a binary-searched
    // start is plenty fast for a 30fps window query even with MICRO kicks
    // included (tens of thousands of events for a 42-minute piece, not
    // millions) — matches DirectorCueSheet's own "counts stay small enough
    // for simple code" judgment call, just with a bisect since this array
    // is much larger than the cue sheet's.
    let lo = 0,
      hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].timestamp < startT) lo = mid + 1;
      else hi = mid;
    }
    const out = [];
    for (let i = lo; i < this.events.length && this.events[i].timestamp < endT; i++) {
      out.push(this.events[i]);
    }
    return out;
  }

  /**
   * The single highest-hierarchy (then highest-salience) event crossing
   * this window, or null. For callers that want "is anything IMPORTANT
   * happening right now" without enumerating every MICRO kick themselves.
   */
  dominantEventInWindow(startT, endT) {
    const evs = this.eventsInWindow(startT, endT);
    if (!evs.length) return null;
    return evs.reduce((best, e) => {
      if (!best) return e;
      const r = HIERARCHY_RANK[e.hierarchy] - HIERARCHY_RANK[best.hierarchy];
      if (r > 0) return e;
      if (r === 0 && e.salience > best.salience) return e;
      return best;
    }, null);
  }

  // Multiple independent signals agreeing, per the brief: "Major visual
  // transformations require multiple independent musical signals
  // agreeing." Counts distinct event types within `withinSeconds` of t at
  // SECTION tier or above (MICRO/PHRASE noise doesn't count as
  // corroboration for a major transformation).
  corroborationCount(t, withinSeconds = 3) {
    const nearby = this.eventsInWindow(t - withinSeconds, t + withinSeconds).filter((e) => HIERARCHY_RANK[e.hierarchy] >= HIERARCHY_RANK.SECTION);
    return new Set(nearby.map((e) => e.type)).size;
  }
}

export { HIERARCHY_RANK };
