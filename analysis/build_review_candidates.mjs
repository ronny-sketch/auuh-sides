// Prepopulates the director-review tool (analysis/annotate.html's
// "critique" mode) with likely structural events, so Ronny confirms/
// corrects rather than annotates a 42-minute film from a blank timeline —
// exactly the brief's "automatic analysis should PREPOPULATE... human
// review confirms/corrects only important decisions."
//
// Deliberately reuses the REAL, already-shipped detection code
// (MusicalDirector.js + MusicEventStream.js) rather than re-implementing
// transition-clustering/confidence-tiering a second time in Node — that
// would be exactly the kind of duplicated-logic drift MusicEventStream.js's
// own header comment warns against. Both files are written as
// browser ES modules that call fetch(); this script's only job is to make
// fetch() resolve to local files instead of a dev server, then run the
// exact same code path master-render.js will eventually run in-browser.
import fs from "node:fs";
import path from "node:path";

const LOCAL_FILES = {
  "/track-map.json": "analysis/track-map.json",
  "/annotations.json": "analysis/track-map-annotations.json", // Ronny's exported annotate.html output, once it exists — not required to be present
  "/audio_features_v2.bin": "analysis/audio_features_v2.bin",
  "/audio_features_v2.schema.json": "analysis/audio_features_v2.schema.json",
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
  const { MusicEventStream } = await import("../src/core/MusicEventStream.js");

  const featureEngine = new AudioFeatureEngine();
  let feReady = true;
  try {
    await featureEngine.load("/audio_features_v2.bin", "/audio_features_v2.schema.json");
  } catch (err) {
    feReady = false;
    console.warn("AudioFeatureEngine failed to load locally, continuing without MICRO/vocal/bass candidates:", err.message);
  }

  const md = new MusicalDirector();
  await md.load("/track-map.json", "/annotations.json", feReady ? featureEngine : null);

  const stream = new MusicEventStream(md, feReady ? featureEngine : null);

  // Prepopulation candidates: SECTION tier and above only. MICRO/PHRASE
  // events (kicks, vocal/bass entries, phrase boundaries) are real and
  // stay queryable via MusicEventStream at render time, but reviewing
  // thousands of them by hand is exactly what the brief says NOT to ask
  // Ronny to do — only "important decisions" get a review row.
  const REVIEW_TIERS = new Set(["SECTION", "TRACK", "HERO", "CLIMAX"]);
  const TAG_GUESS = {
    BUILD: "BUILD_START",
    DROP: "DROP",
    BREAKDOWN: "BREAKDOWN",
    TRACK_TRANSITION: "TRACK_BLEND_START",
  };

  const candidates = stream.events
    .filter((e) => REVIEW_TIERS.has(e.hierarchy))
    .map((e) => ({
      t: e.timestamp,
      suggestedTag: TAG_GUESS[e.type] || null, // null for exceptional/HERO/CLIMAX events — no safe default guess, Ronny picks (likely WOW, but that's a judgment call this script shouldn't make for him)
      sourceType: e.type,
      hierarchy: e.hierarchy,
      confidence: e.confidence,
      salience: e.salience,
      label: e.label || null,
      confirmed: false,
    }));

  const out = {
    generatedAt: new Date().toISOString(),
    generatedFromCommit: null, // filled in by create_render_plan.mjs's commit-pinning discipline if this is ever run as part of that pipeline; standalone runs leave it null rather than guess
    totalMusicEventStreamEvents: stream.events.length,
    reviewCandidateCount: candidates.length,
    candidates,
  };

  const outPath = "analysis/_review_candidates.json";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${candidates.length} review candidates (of ${stream.events.length} total events) to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
