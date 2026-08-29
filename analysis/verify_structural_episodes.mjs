// Re-verifies the compression -> trough -> release episode timestamps
// supplied in the journey brief against the repository's actual
// higher-resolution feature data (analysis/audio_features_v2.bin, 50Hz),
// per the brief's own instruction: "Claude must re-verify them using the
// repository's higher-resolution stems/features before hard-coding them."
// Nothing from the brief's timestamp list is trusted as-is; every episode
// below is independently re-derived from real RMS/flux/onset data and
// reported with a confidence grade, using the same
// candidate/strong_candidate/human_confirmed/structurally_verified
// vocabulary MusicalDirector.js already uses elsewhere in this codebase,
// for consistency (no second confidence vocabulary invented here).
//
// Method: smooth RMS over a short window (structural-scale, not
// beat-to-beat — same ~4s smoothing window build_track_map.py already
// uses for the same reason), then for each claimed
// [collapseStart, trough, reEntry] triple, search a tolerance window
// around each of the three claimed times for the ACTUAL local extremum
// (max/min/recovery-crossing) rather than trusting the claimed number.
// Confidence is driven by how deep the real dip is relative to its
// surroundings — a shallow or absent dip means the claimed episode is not
// well supported by RMS alone and is flagged, not silently kept.
import fs from "node:fs";

const SCHEMA_PATH = "analysis/audio_features_v2.schema.json";
const BIN_PATH = "analysis/audio_features_v2.bin";
const SEARCH_TOLERANCE_SEC = 10; // how far from the claimed time to search for the real local extremum
const SMOOTH_WINDOW_SEC = 4;

function loadFeatures() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const buf = fs.readFileSync(BIN_PATH);
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const fieldIndex = {};
  schema.fields.forEach((f, i) => (fieldIndex[f] = i));
  return { schema, data, fieldIndex };
}

function extractField(data, fieldIndex, nFrames, nFields, name) {
  const idx = fieldIndex[name];
  const out = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) out[i] = data[i * nFields + idx];
  return out;
}

function rollingMean(x, winFrames) {
  const out = new Float32Array(x.length);
  let sum = 0;
  const half = Math.floor(winFrames / 2);
  for (let i = 0; i < x.length; i++) {
    sum += x[i];
    if (i >= winFrames) sum -= x[i - winFrames];
    const lo = Math.max(0, i - winFrames + 1);
    out[i] = sum / (i - lo + 1);
  }
  // The causal running-mean above lags by ~win/2; shift for a centered
  // comparison so "local min near t" means near t, not near t+win/2.
  const shifted = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    shifted[i] = out[Math.min(x.length - 1, i + half)];
  }
  return shifted;
}

function tToFrame(t, hopHz) {
  return Math.round(t * hopHz);
}
function frameToT(f, hopHz) {
  return f / hopHz;
}

function findLocalMin(smoothed, centerFrame, toleranceFrames) {
  const lo = Math.max(0, centerFrame - toleranceFrames);
  const hi = Math.min(smoothed.length - 1, centerFrame + toleranceFrames);
  let best = lo,
    bestV = Infinity;
  for (let i = lo; i <= hi; i++) {
    if (smoothed[i] < bestV) {
      bestV = smoothed[i];
      best = i;
    }
  }
  return { frame: best, value: bestV };
}
function findLocalMax(smoothed, centerFrame, toleranceFrames) {
  const lo = Math.max(0, centerFrame - toleranceFrames);
  const hi = Math.min(smoothed.length - 1, centerFrame + toleranceFrames);
  let best = lo,
    bestV = -Infinity;
  for (let i = lo; i <= hi; i++) {
    if (smoothed[i] > bestV) {
      bestV = smoothed[i];
      best = i;
    }
  }
  return { frame: best, value: bestV };
}

// [claimed collapseStart, claimed trough, claimed reEntry, label] — verbatim
// from the journey brief, first-20-minutes list plus second-half list.
const CLAIMED_EPISODES = [
  [47, 61, 69, "small early tension/release"],
  [131, 170, 189, "FIRST MAJOR collapse/re-entry"],
  [359, 394, 429, "substantial contraction / strong return"],
  [619, 654, 680, "clear breath / re-entry"],
  [764, 791, 826, "very deep sparse/breathing region"],
  [1034, 1067, 1083, "EXTREMELY IMPORTANT — strongest large-scale compression/trough/release in first 20 min"],
  [1263, 1294, 1333, "second half region 1"],
  [1429, 1457, 1478, "second half region 2"],
  [1605, 1639, 1646, "second half region 3"],
  [1842, 1878, 1911, "second half region 4"],
  [1968, 1977, 2016, "second half region 5"],
  [2062, 2083, 2111, "second half region 6"],
  [2169, 2204, 2231, "second half region 7"],
  [2258, 2290, 2328, "second half region 8 (outer)"],
  [2275, 2313, 2334, "second half region 8 (nested trough/release)"],
  [2455, 2479, 2492, "final major stored-energy event before ending"],
];

function main() {
  const { schema, data, fieldIndex } = loadFeatures();
  const { n_frames: nFrames, n_fields: nFields, hop_hz: hopHz } = schema;

  const rms = extractField(data, fieldIndex, nFrames, nFields, "rms");
  const flux = extractField(data, fieldIndex, nFrames, nFields, "flux");
  const onsetStrength = extractField(data, fieldIndex, nFrames, nFields, "onsetStrength");
  const bass = extractField(data, fieldIndex, nFrames, nFields, "bass");

  const winFrames = Math.round(SMOOTH_WINDOW_SEC * hopHz);
  const rmsS = rollingMean(rms, winFrames);
  const tolFrames = Math.round(SEARCH_TOLERANCE_SEC * hopHz);

  const results = CLAIMED_EPISODES.map(([claimedStart, claimedTrough, claimedEnd, label]) => {
    const troughFrame = tToFrame(claimedTrough, hopHz);
    const { frame: realTroughFrame, value: troughRms } = findLocalMin(rmsS, troughFrame, tolFrames);

    const startFrame = tToFrame(claimedStart, hopHz);
    const { frame: realStartFrame, value: preRms } = findLocalMax(rmsS, startFrame, tolFrames);

    const endFrame = tToFrame(claimedEnd, hopHz);
    const { frame: realEndFrame, value: postRms } = findLocalMax(rmsS, endFrame, tolFrames);

    const dipDepth = Math.max(0, ((preRms + postRms) / 2 - troughRms));
    const surroundLevel = (preRms + postRms) / 2;
    const relativeDip = surroundLevel > 1e-6 ? dipDepth / surroundLevel : 0;

    // Confidence: a real, meaningfully-relative RMS collapse and recovery
    // is the strongest available objective evidence (mirrors
    // MusicalDirector's own "structurally_verified = objective metric"
    // standard). A shallow or ambiguous dip doesn't get to claim that.
    let confidence;
    if (relativeDip > 0.35) confidence = "structurally_verified";
    else if (relativeDip > 0.15) confidence = "strong_candidate";
    else if (relativeDip > 0.05) confidence = "candidate";
    else confidence = "not_supported_by_rms_alone";

    const flux1 = extractField(data, fieldIndex, nFrames, nFields, "flux");
    void flux1; // already have `flux` above; kept variable name distinct for clarity while reading

    return {
      label,
      claimed: { start: claimedStart, trough: claimedTrough, end: claimedEnd },
      verified: {
        start: Number(frameToT(realStartFrame, hopHz).toFixed(2)),
        trough: Number(frameToT(realTroughFrame, hopHz).toFixed(2)),
        end: Number(frameToT(realEndFrame, hopHz).toFixed(2)),
      },
      driftFromClaimedSec: {
        start: Number((frameToT(realStartFrame, hopHz) - claimedStart).toFixed(2)),
        trough: Number((frameToT(realTroughFrame, hopHz) - claimedTrough).toFixed(2)),
        end: Number((frameToT(realEndFrame, hopHz) - claimedEnd).toFixed(2)),
      },
      relativeDip: Number(relativeDip.toFixed(3)),
      confidence,
      rms: { pre: Number(preRms.toFixed(4)), trough: Number(troughRms.toFixed(4)), post: Number(postRms.toFixed(4)) },
      secondaryEvidence: {
        fluxAtTrough: Number(flux[realTroughFrame].toFixed(3)),
        onsetStrengthAtEnd: Number(onsetStrength[realEndFrame].toFixed(3)),
        bassAtTrough: Number(bass[realTroughFrame].toFixed(3)),
        bassAtEnd: Number(bass[realEndFrame].toFixed(3)),
      },
    };
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    method: `RMS smoothed over ${SMOOTH_WINDOW_SEC}s, local extrema searched within +/-${SEARCH_TOLERANCE_SEC}s of each claimed timestamp`,
    confidenceCounts: results.reduce((acc, r) => ((acc[r.confidence] = (acc[r.confidence] || 0) + 1), acc), {}),
    episodes: results,
  };

  fs.mkdirSync("analysis/_structural_episodes", { recursive: true });
  fs.writeFileSync("analysis/_structural_episodes/verified_episodes.json", JSON.stringify(summary, null, 2));
  console.log(`Wrote ${results.length} verified episodes to analysis/_structural_episodes/verified_episodes.json`);
  console.log("Confidence breakdown:", summary.confidenceCounts);
  for (const r of results) {
    console.log(
      `${r.label.slice(0, 50).padEnd(52)} claimed trough=${r.claimed.trough}s -> verified=${r.verified.trough}s (drift ${r.driftFromClaimedSec.trough}s) relDip=${r.relativeDip} [${r.confidence}]`
    );
  }
}

main();
