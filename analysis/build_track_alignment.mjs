// Constrained track aligner. Per the journey brief: we now know the exact
// ASCENDING PLAY ORDER of all 15 tracks (screenshots are authoritative) —
// this is NOT a "detect tracks from scratch" problem any more, it's
// "place 14 known boundaries onto the timeline using real evidence,
// respecting the known order." Solves exactly that, nothing more:
//
//   - candidate boundary times + evidence + score come from the EXISTING,
//     already-reviewed analysis/track-map.json (124 candidates, built by
//     build_track_map.py from real chroma/bass/percussive/RMS features —
//     not re-detected here, reused).
//   - the known sequence supplies a hard ordering constraint: boundary i
//     must precede boundary i+1, and there are EXACTLY 14 of them (15
//     tracks).
//   - a soft segment-length prior (mean = total duration / 15 tracks)
//     breaks ties among evidence-similar candidates in favor of DJ-set-
//     plausible track lengths, WITHOUT ever summing claimed Spotify
//     durations to predict exact timing (the brief explicitly forbids
//     that — tracks are pitched/looped/shortened in the mix).
//
// Confidence uses the same four-tier vocabulary MusicalDirector.js
// already established (candidate / strong_candidate / human_confirmed /
// structurally_verified) for consistency, plus one new tier this file
// introduces for values that are NOT independently evidenced at all —
// "estimated" — used only for the blend-envelope edges (blendInStart),
// which are a heuristic offset from an evidenced center point, not
// themselves detected from anything. Never silently upgrades a heuristic
// into a confidence grade that implies real evidence.
import fs from "node:fs";

const SCHEMA_PATH = "analysis/audio_features_v2.schema.json";
const BIN_PATH = "analysis/audio_features_v2.bin";
const TRACK_MAP_PATH = "analysis/track-map.json";

// Authoritative sequence, per the journey brief's screenshots. Track 1 is
// deliberately left with title/artist: null — "DO NOT hallucinate it."
const TRACKS = [
  { n: 1, title: null, artist: null, tempo: null },
  { n: 2, title: "Take Me To The Music", artist: "Pancratio", tempo: 123.981 },
  { n: 3, title: "Bien Pacheco", artist: "Antaares, Kon Faber", tempo: 121.006 },
  { n: 4, title: "SOL", artist: "Pryda", tempo: 127.011 },
  { n: 5, title: "Chipie", artist: "Blu:sh", tempo: 134.997 },
  { n: 6, title: "Satisfaction - Tuccillo Vocal Radio Mix", artist: "AKA Adeline", tempo: 127.025 },
  { n: 7, title: "July", artist: "Sydka", tempo: 124.017 },
  { n: 8, title: "Mycelium", artist: "Kebin van Reeken", tempo: 121.995 },
  { n: 9, title: "Sirens of the Gumtrees", artist: "Dark Design", tempo: 122.02 },
  { n: 10, title: "Children", artist: "Fabrication", tempo: 122.0 },
  { n: 11, title: "Seven Days And One Week - Yotto Remix", artist: "BBE, YOTTO", tempo: 125.003 },
  { n: 12, title: "La Ka Rubà", artist: "NenaHalena, Akil", tempo: 122.008 },
  { n: 13, title: "Smile & Receive", artist: "Swayzak", tempo: null }, // no confident CSV match — brief explicit
  { n: 14, title: "The Cure & The Cause - Radio Edit", artist: "Fish Go Deep, Tracey K", tempo: null }, // no confident CSV match — brief explicit
  { n: 15, title: "Tanzen - Paula Tape Remix", artist: "Hidden Spheres, Paula Tape, INA", tempo: 123.011 },
];
const N_BOUNDARIES = TRACKS.length - 1; // 14

const TIER_WEIGHT = { low: 1.0, medium: 1.6, high: 2.4 };
const BLEND_LEAD_SECONDS = 20; // heuristic estimated blend-in duration — NOT evidenced, see header
const DOMINANT_LAG_SECONDS = 6; // heuristic — time after the evidenced center before the new track is assumed fully in control

function loadFeatures() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const buf = fs.readFileSync(BIN_PATH);
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const fieldIndex = {};
  schema.fields.forEach((f, i) => (fieldIndex[f] = i));
  return { schema, data, fieldIndex };
}

// Rough local-tempo estimate from downbeat-pulse spacing in a window
// around t. Deliberately advertised as rough: build_track_map.py's own
// header already flags that this pipeline has never run a real windowed
// tempogram (only one global 123.05 BPM estimate exists) — this is
// informational corroboration for the aligner's output, not a scoring
// input, and not claimed as more precise than it is.
function localTempoEstimate(data, fieldIndex, nFields, hopHz, t, windowSec = 20) {
  const idx = fieldIndex.downbeat;
  const startF = Math.max(0, Math.round((t - windowSec) * hopHz));
  const endF = Math.round((t + windowSec) * hopHz);
  const pulses = [];
  let wasHigh = false;
  for (let f = startF; f <= endF; f++) {
    const v = data[f * nFields + idx];
    if (v > 0.5 && !wasHigh) pulses.push(f / hopHz);
    wasHigh = v > 0.5;
  }
  if (pulses.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < pulses.length; i++) gaps.push(pulses[i] - pulses[i - 1]);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return meanGap > 0 ? Number((240 / meanGap).toFixed(2)) : null; // 4 beats/bar assumption, same as the rest of this codebase's beat grid
}

function main() {
  const { schema, data, fieldIndex } = loadFeatures();
  const { n_fields: nFields, hop_hz: hopHz, duration_sec: duration } = schema;
  const trackMap = JSON.parse(fs.readFileSync(TRACK_MAP_PATH, "utf8"));
  const candidates = trackMap.candidates.slice().sort((a, b) => a.t - b.t);

  const meanSegment = duration / TRACKS.length;
  // Soft penalty, not a hard bound — DJ segments vary a lot; this only
  // breaks ties/nudges among evidence-comparable candidates, never
  // overrides a much stronger evidence score. sigma wide on purpose.
  const sigma = meanSegment * 0.9;
  function segPenalty(len) {
    const d = len - meanSegment;
    return (d * d) / (2 * sigma * sigma);
  }
  function candScore(c) {
    return c.score * (TIER_WEIGHT[c.tier] || 1.0) + (c.evidence?.length || 0) * 0.05;
  }

  // DP over candidates x boundary-count, choosing exactly N_BOUNDARIES
  // monotonically increasing candidates maximizing
  // sum(candScore) - sum(segPenalty(segment length)).
  // dp[k][i] = best total score using i-th candidate (0-indexed) as the
  // k-th boundary (k=0..N_BOUNDARIES-1), having come from the best j<i.
  const C = candidates.length;
  const NEG_INF = -Infinity;
  const dp = Array.from({ length: N_BOUNDARIES }, () => new Float64Array(C).fill(NEG_INF));
  const back = Array.from({ length: N_BOUNDARIES }, () => new Int32Array(C).fill(-1));

  for (let i = 0; i < C; i++) {
    const segLen = candidates[i].t - 0; // first boundary: segment 1 length = candidate.t - trackStart(0)
    dp[0][i] = candScore(candidates[i]) - segPenalty(segLen);
  }
  for (let k = 1; k < N_BOUNDARIES; k++) {
    for (let i = 0; i < C; i++) {
      if (candidates[i].t <= 0) continue;
      let best = NEG_INF,
        bestJ = -1;
      for (let j = 0; j < i; j++) {
        if (dp[k - 1][j] === NEG_INF) continue;
        const segLen = candidates[i].t - candidates[j].t;
        if (segLen <= 5) continue; // two boundaries essentially on top of each other isn't a real segment
        const v = dp[k - 1][j] + candScore(candidates[i]) - segPenalty(segLen);
        if (v > best) {
          best = v;
          bestJ = j;
        }
      }
      dp[k][i] = best;
      back[k][i] = bestJ;
    }
  }

  // Pick the best final candidate for the last boundary, accounting for
  // the final segment (last boundary -> duration) penalty too.
  let bestFinal = NEG_INF,
    bestI = -1;
  for (let i = 0; i < C; i++) {
    if (dp[N_BOUNDARIES - 1][i] === NEG_INF) continue;
    const finalSeg = duration - candidates[i].t;
    if (finalSeg <= 5) continue;
    const v = dp[N_BOUNDARIES - 1][i] - segPenalty(finalSeg);
    if (v > bestFinal) {
      bestFinal = v;
      bestI = i;
    }
  }
  if (bestI === -1) throw new Error("DP failed to find a valid boundary assignment — check track-map.json candidate density");

  const chosenIdx = new Array(N_BOUNDARIES);
  let cur = bestI;
  for (let k = N_BOUNDARIES - 1; k >= 0; k--) {
    chosenIdx[k] = cur;
    cur = back[k][cur];
  }
  const boundaries = chosenIdx.map((i) => candidates[i]);

  // Confidence per boundary, honestly graded: this is still algorithmic
  // selection (no human has confirmed any of these track identities), so
  // the ceiling is strong_candidate, never human_confirmed/
  // structurally_verified, no matter how good the evidence looks — same
  // discipline MusicalDirector.js already enforces for its own
  // transitions. Ronny confirming via analysis/annotate.html is what
  // would actually earn the higher grades.
  function gradeConfidence(c) {
    const nEvidence = c.evidence?.length || 0;
    if (c.tier === "high" && nEvidence >= 2) return "strong_candidate";
    if (c.tier === "high" || nEvidence >= 2) return "candidate";
    return "candidate"; // never below candidate for a DP-selected, ordering-constrained boundary — it IS real evidence, just not corroborated
  }

  const alignment = TRACKS.map((track, i) => {
    const boundaryBefore = i === 0 ? null : boundaries[i - 1];
    const boundaryAfter = i < N_BOUNDARIES ? boundaries[i] : null;

    const identityArrival = boundaryBefore ? boundaryBefore.t : 0;
    const dominantFrom = i === 0 ? 0 : Number((identityArrival + DOMINANT_LAG_SECONDS).toFixed(2));
    const blendInStart = i === 0 ? 0 : Number(Math.max(0, identityArrival - BLEND_LEAD_SECONDS).toFixed(2));
    const blendOutStart = boundaryAfter ? Number(Math.max(identityArrival, boundaryAfter.t - BLEND_LEAD_SECONDS).toFixed(2)) : null;
    const trackEnd = boundaryAfter ? boundaryAfter.t : duration;

    const localTempo = boundaryBefore ? localTempoEstimate(data, fieldIndex, nFields, hopHz, boundaryBefore.t) : null;
    const tempoNote =
      i === 0
        ? null
        : track.tempo != null && localTempo != null
        ? Math.abs(localTempo - track.tempo) > 6 && Math.abs(localTempo - track.tempo * 2) > 6 && Math.abs(localTempo * 2 - track.tempo) > 6
          ? `local tempo estimate (${localTempo} BPM, rough — this pipeline has no verified windowed tempogram) diverges from Spotify prior (${track.tempo} BPM) by more than a plausible pitch-shift/half-time reading — worth a human listen`
          : `local tempo estimate (${localTempo} BPM, rough) roughly consistent with Spotify prior (${track.tempo} BPM)`
        : "no Spotify tempo prior available for this track";

    return {
      trackNumber: track.n,
      title: track.title,
      artist: track.artist,
      spotifyTempoPrior: track.tempo,
      blendInStart: i === 0 ? 0 : blendInStart,
      blendInStartConfidence: i === 0 ? null : "estimated", // heuristic offset, not evidenced — see header
      identityArrival: Number(identityArrival.toFixed(2)),
      identityArrivalConfidence: i === 0 ? "unknown_do_not_infer" : gradeConfidence(boundaryBefore),
      dominantFrom,
      blendOutStart,
      trackEndEstimate: Number(trackEnd.toFixed(2)),
      lastEvidence: boundaryBefore ? boundaryBefore.evidence : null,
      boundaryScore: boundaryBefore ? Number(boundaryBefore.score.toFixed(4)) : null,
      boundaryTier: boundaryBefore ? boundaryBefore.tier : null,
      localTempoEstimateBPM: localTempo,
      tempoNote,
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    method: "Constrained DP: 14 monotonic boundaries selected from analysis/track-map.json's 124 evidence-scored candidates, maximizing evidence score minus a soft DJ-set-plausible-segment-length penalty (mean segment = totalDuration/15, NOT derived from summed Spotify track durations, per the brief's explicit prohibition on that).",
    disclaimer:
      "No track identity here is human-confirmed. identityArrival timestamps are real, evidenced candidate boundaries; blendInStart/blendOutStart are heuristic estimates around that center, not independently evidenced. Track 1's identity is genuinely unknown and must not be inferred. Verify/correct via analysis/annotate.html before treating any single boundary as certain.",
    totalDurationSec: duration,
    meanSegmentSecForReference: Number(meanSegment.toFixed(1)),
    tracks: alignment,
  };

  fs.writeFileSync("analysis/set-track-alignment.json", JSON.stringify(out, null, 2));
  console.log(`Wrote analysis/set-track-alignment.json — ${N_BOUNDARIES} boundaries selected from ${C} candidates.`);
  for (const t of alignment) {
    console.log(
      `#${t.trackNumber} ${t.title || "(unknown)"} — identityArrival=${t.identityArrival}s [${t.identityArrivalConfidence}] evidence=${JSON.stringify(t.lastEvidence)} tempo=${t.localTempoEstimateBPM ?? "n/a"}`
    );
  }
}

main();
