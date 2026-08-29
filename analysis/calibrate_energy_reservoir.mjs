// Runs the REAL, full pipeline (AudioFeatureEngine + MusicalDirector +
// TrackContext + StructuralEpisodes + EvolutionDirector/EnergyReservoir)
// end-to-end against the actual 42-minute recording, in Node, via the same
// fetch() shim pattern as analysis/build_review_candidates.mjs — reusing
// the real code, not a parallel reimplementation. Purpose: check the
// journey brief's explicit calibration claim — "the 17:47/18:03 event must
// clearly rank very high; later events may exceed it as the film
// approaches climax" — against actual computed release magnitudes, not by
// assertion.
import fs from "node:fs";

const LOCAL_FILES = {
  "/track-map.json": "analysis/track-map.json",
  "/annotations.json": "analysis/track-map-annotations.json",
  "/audio_features_v2.bin": "analysis/audio_features_v2.bin",
  "/audio_features_v2.schema.json": "analysis/audio_features_v2.schema.json",
  "/set-track-alignment.json": "analysis/set-track-alignment.json",
  "/structural-episodes.json": "analysis/_structural_episodes/verified_episodes.json",
};
globalThis.fetch = async (url) => {
  const localPath = LOCAL_FILES[url];
  if (!localPath || !fs.existsSync(localPath)) {
    return { ok: false, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const isBinary = localPath.endsWith(".bin");
  return {
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(localPath, "utf8")),
    arrayBuffer: async () => {
      const buf = fs.readFileSync(localPath);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
};

async function main() {
  const { MusicalDirector } = await import("../src/core/MusicalDirector.js");
  const { AudioFeatureEngine } = await import("../src/core/AudioFeatureEngine.js");
  const { EvolutionDirector } = await import("../src/core/EvolutionDirector.js");
  const { DURATION } = await import("../src/core/timeline.js");

  const featureEngine = new AudioFeatureEngine();
  await featureEngine.load("/audio_features_v2.bin", "/audio_features_v2.schema.json");

  const md = new MusicalDirector();
  await md.load("/track-map.json", "/annotations.json", featureEngine);

  const ed = new EvolutionDirector();
  await ed.trackContext.load("/set-track-alignment.json");
  await ed.structuralEpisodes.load("/structural-episodes.json", "candidate");

  const STEP = 0.1; // 10Hz — fine enough for release-edge detection, fast enough for a 42-minute full-file pass
  const releases = [];
  let prevReleaseCount = 0;

  for (let t = 0; t < DURATION; t += STEP) {
    const musical = md.sample(t);
    const audio = featureEngine.sample(t);
    ed.update(t, musical, audio);
    const e = ed.energy.sample();
    if (e.releaseCount > prevReleaseCount) {
      prevReleaseCount = e.releaseCount;
      releases.push({ t: Number(t.toFixed(2)), magnitude: Number(e.lastReleaseMagnitude.toFixed(4)), factors: e.lastSalienceFactors });
    }
  }

  releases.sort((a, b) => b.magnitude - a.magnitude);

  const rupture = releases
    .map((r, rank) => ({ ...r, rank }))
    .filter((r) => Math.abs(r.t - 1067.19) < 5 || Math.abs(r.t - 1083) < 5)
    .sort((a, b) => Math.abs(a.t - 1075) - Math.abs(b.t - 1075))[0];

  const out = {
    generatedAt: new Date().toISOString(),
    stepSec: STEP,
    totalReleases: releases.length,
    rankedReleases: releases.map((r, i) => ({ rank: i, ...r })),
    ruptureEventCheck: rupture
      ? { found: true, t: rupture.t, magnitude: rupture.magnitude, rankOutOf: releases.length, factors: rupture.factors }
      : { found: false, note: "No release fired within 5s of 17:47/18:03 — check whether MusicalDirector.build/drop or StructuralEpisodes windows actually cover this timestamp." },
  };

  fs.mkdirSync("analysis/_calibration", { recursive: true });
  fs.writeFileSync("analysis/_calibration/energy_reservoir_calibration.json", JSON.stringify(out, null, 2));

  console.log(`Total releases detected across the film: ${releases.length}`);
  console.log("Top 10 by magnitude:");
  for (let i = 0; i < Math.min(10, releases.length); i++) {
    const r = releases[i];
    console.log(`  #${i} t=${r.t}s (${(r.t / 60).toFixed(2)}min) magnitude=${r.magnitude}`);
  }
  console.log("\n17:47/18:03 rupture check:", out.ruptureEventCheck.found ? `rank ${out.ruptureEventCheck.rankOutOf > 0 ? out.rankedReleases.findIndex(r=>r.t===out.ruptureEventCheck.t) : "?"} of ${out.ruptureEventCheck.rankOutOf}, magnitude ${out.ruptureEventCheck.magnitude}` : out.ruptureEventCheck.note);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
