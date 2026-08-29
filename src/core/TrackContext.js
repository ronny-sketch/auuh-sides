// Thin runtime loader for analysis/set-track-alignment.json (built by
// analysis/build_track_alignment.mjs) — lets EvolutionDirector/
// EnergyReservoir know "is t near a DJ track transition" as one of the
// EnergyReservoir salience factors ("track-transition context" in the
// journey brief's list). Deliberately minimal: this file does not
// re-derive alignment, it only serves what build_track_alignment.mjs
// already computed. Optional everywhere it's consumed — EvolutionDirector
// works without it (nearTrackTransition just stays false), matching the
// rest of this codebase's graceful-degradation discipline (e.g.
// MusicalDirector's optional featureEngine).
export class TrackContext {
  constructor() {
    this.tracks = [];
    this.ready = false;
  }

  async load(url = "/set-track-alignment.json") {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      this.tracks = (data.tracks || []).filter((t) => t.identityArrival != null);
      this.ready = true;
    } catch {
      // No alignment data staged for this render yet — fine, callers treat
      // an unloaded TrackContext exactly like a null one.
    }
  }

  /** true if t falls within `withinSec` of any track's identityArrival boundary. */
  isNearTransition(t, withinSec = 15) {
    if (!this.ready) return false;
    for (const track of this.tracks) {
      if (Math.abs(track.identityArrival - t) <= withinSec) return true;
    }
    return false;
  }

  /** The track (per set-track-alignment.json) whose identityArrival is at or before t, i.e. currently dominant. */
  trackAt(t) {
    if (!this.ready) return null;
    let best = null;
    for (const track of this.tracks) {
      if (track.identityArrival <= t) best = track;
    }
    return best;
  }
}
