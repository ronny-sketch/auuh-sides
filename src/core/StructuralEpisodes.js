// Runtime loader for public/structural-episodes.json (built by
// analysis/verify_structural_episodes.mjs from the REAL RMS-derived
// compression/trough/release episodes, re-verified against
// audio_features_v2.bin — not the journey brief's rough mm:ss estimates).
//
// WHY THIS EXISTS SEPARATELY FROM MusicalDirector's build/drop: those are
// keyed to track-map.json's chroma/percussive-based TRANSITION candidates
// — real signal, but a different phenomenon. Cross-checking with
// analysis/classify_episodes_against_tracks.mjs shows most of these
// verified breathing episodes are WITHIN a single track (a breakdown/
// build inside one song), not near any track-map candidate at all — e.g.
// the 17:47 rupture sits inside "Satisfaction," nowhere near a track
// boundary. MusicalDirector's build/drop would largely miss these, so
// EnergyReservoir needs this as an independent, additional signal — see
// EvolutionDirector.update(), which ORs this with MusicalDirector's own
// build/drop rather than replacing it (both are legitimate, complementary
// evidence, same discipline MusicalDirector.js itself uses for merging
// human/algorithmic evidence).
const DROP_WINDOW_SECONDS = 3; // matches MusicalDirector's own DROP_WINDOW_SECONDS convention, for consistency
const MIN_CONFIDENCE_RANK = { not_supported_by_rms_alone: 0, candidate: 1, strong_candidate: 2, human_confirmed: 3, structurally_verified: 4 };

export class StructuralEpisodes {
  constructor() {
    this.episodes = [];
    this.ready = false;
  }

  async load(url = "/structural-episodes.json", minConfidence = "candidate") {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const minRank = MIN_CONFIDENCE_RANK[minConfidence] ?? 1;
      this.episodes = (data.episodes || []).filter((e) => (MIN_CONFIDENCE_RANK[e.confidence] ?? 0) >= minRank);
      this.ready = true;
    } catch {
      // No verified episode data staged for this render — degrade to
      // "no additional build/drop signal from this source," same pattern
      // as every other optional data source in this codebase.
    }
  }

  /** true if t is inside [verified.start, verified.trough) of any loaded episode — the gathering/compression phase. */
  isBuilding(t) {
    if (!this.ready) return false;
    return this.episodes.some((e) => t >= e.verified.start && t < e.verified.trough);
  }

  /** true if t is within DROP_WINDOW_SECONDS after the trough (release/re-entry window). */
  isReleasing(t) {
    if (!this.ready) return false;
    return this.episodes.some((e) => t >= e.verified.trough && t <= e.verified.trough + DROP_WINDOW_SECONDS);
  }

  /** The episode object (if any) whose window currently contains t — for callers that want the confidence/label, not just a boolean. */
  episodeAt(t) {
    if (!this.ready) return null;
    return this.episodes.find((e) => t >= e.verified.start && t <= e.verified.trough + DROP_WINDOW_SECONDS) || null;
  }
}
