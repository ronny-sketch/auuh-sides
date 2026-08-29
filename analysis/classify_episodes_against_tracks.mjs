// Joins the two independently-built artifacts (verify_structural_episodes
// .mjs's real RMS-verified compression/trough/release episodes, and
// build_track_alignment.mjs's DP-selected track boundaries) to answer the
// brief's explicit question for each episode: "is this within one track,
// a track blend, or something else?" — never assumed, always checked
// against the actual boundary list. "novelty peak = new track" is
// exactly the false equivalence the brief warns against; this script
// checks proximity, it doesn't assume it.
import fs from "node:fs";

const BLEND_PROXIMITY_SEC = 25; // within this of a boundary's identityArrival => plausibly the same event as the transition

function main() {
  const episodesData = JSON.parse(fs.readFileSync("analysis/_structural_episodes/verified_episodes.json", "utf8"));
  const alignment = JSON.parse(fs.readFileSync("analysis/set-track-alignment.json", "utf8"));

  const boundaries = alignment.tracks
    .filter((t) => t.identityArrival != null && t.trackNumber > 1)
    .map((t) => ({ t: t.identityArrival, trackNumber: t.trackNumber, title: t.title, confidence: t.identityArrivalConfidence }));

  function trackAt(t) {
    for (let i = alignment.tracks.length - 1; i >= 0; i--) {
      if (alignment.tracks[i].identityArrival <= t) return alignment.tracks[i];
    }
    return alignment.tracks[0];
  }

  const classified = episodesData.episodes.map((ep) => {
    const troughT = ep.verified.trough;
    const nearestBoundary = boundaries.reduce((best, b) => (best == null || Math.abs(b.t - troughT) < Math.abs(best.t - troughT) ? b : best), null);
    const distToBoundary = nearestBoundary ? Math.abs(nearestBoundary.t - troughT) : Infinity;
    const isBlend = distToBoundary <= BLEND_PROXIMITY_SEC;

    const hostTrack = trackAt(troughT);

    return {
      label: ep.label,
      verified: ep.verified,
      confidence: ep.confidence,
      classification: isBlend ? "TRACK_BLEND" : "WITHIN_TRACK",
      nearestBoundary: nearestBoundary ? { t: nearestBoundary.t, toTrack: nearestBoundary.trackNumber, title: nearestBoundary.title, distanceSec: Number(distToBoundary.toFixed(1)) } : null,
      hostTrack: { trackNumber: hostTrack.trackNumber, title: hostTrack.title },
      note: isBlend
        ? `Within ${BLEND_PROXIMITY_SEC}s of the evidenced boundary into track #${nearestBoundary.trackNumber} (${nearestBoundary.title || "unknown"}) — this compression/release likely IS the DJ transition, not a separate in-track event.`
        : `${BLEND_PROXIMITY_SEC}s+ from any track boundary — an in-track build/breakdown/drop inside "${hostTrack.title || "unknown"}" (#${hostTrack.trackNumber}), not a track change.`,
    };
  });

  const out = { generatedAt: new Date().toISOString(), blendProximitySec: BLEND_PROXIMITY_SEC, episodes: classified };
  fs.writeFileSync("analysis/_structural_episodes/episodes_vs_tracks.json", JSON.stringify(out, null, 2));

  console.log(`Classified ${classified.length} episodes:`);
  for (const c of classified) {
    console.log(`${c.label.slice(0, 45).padEnd(47)} trough=${c.verified.trough}s  ${c.classification.padEnd(12)} host=#${c.hostTrack.trackNumber} ${c.hostTrack.title || "unknown"}`);
  }
}

main();
