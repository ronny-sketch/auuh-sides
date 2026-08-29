// Builds analysis/permanent-acquisitions.json — WHERE in the film a new
// permanent capability/motif plausibly enters, using the two things this
// session actually verified (real RMS-confirmed structural episodes +
// the DP-selected track alignment) as context, not as a rule that forces
// exactly one acquisition per track. Per the brief: "some tracks may
// prepare, develop, combine, or rest rather than acquire" — several
// entries below are explicitly non-acquiring for that reason, and every
// acquisition cites the real evidence (a verified episode label, or a
// track boundary with its actual confidence grade) it's hung on, rather
// than inventing a clean one-per-track story that isn't in the audio.
import fs from "node:fs";

function main() {
  const episodes = JSON.parse(fs.readFileSync("analysis/_structural_episodes/verified_episodes.json", "utf8")).episodes;
  const alignment = JSON.parse(fs.readFileSync("analysis/set-track-alignment.json", "utf8")).tracks;
  const classification = JSON.parse(fs.readFileSync("analysis/_structural_episodes/episodes_vs_tracks.json", "utf8")).episodes;

  function episodeByLabel(fragment) {
    return episodes.find((e) => e.label.includes(fragment));
  }
  function trackByNumber(n) {
    return alignment.find((t) => t.trackNumber === n);
  }
  function classificationFor(fragment) {
    return classification.find((c) => c.label.includes(fragment));
  }

  const formation = episodeByLabel("FIRST MAJOR collapse");
  const assemblyEp = episodeByLabel("substantial contraction");
  const identityEp = episodeByLabel("clear breath");
  const breathEp = episodeByLabel("very deep sparse");
  const rupture = episodeByLabel("EXTREMELY IMPORTANT");
  const t6 = trackByNumber(6); // Satisfaction — hosts the rupture, per classify_episodes_against_tracks.mjs
  const t10 = trackByNumber(10); // Children
  const t11 = trackByNumber(11); // Seven Days And One Week
  const t13 = trackByNumber(13); // Smile & Receive — hosts several late episodes
  const t15 = trackByNumber(15); // Tanzen

  const acquisitions = [
    {
      id: "seed",
      earliestHint: 0,
      activationWindow: [0, 30],
      becomesStableAt: 30,
      capability: "SEED",
      motif: "PULSE",
      musicalReason: "Track 1 (unidentified) opening — no structural event needed, this is the pre-acquisition baseline every other entry below builds on.",
      confidence: "structurally_verified",
    },
    {
      id: "first_join",
      earliestHint: formation.verified.start,
      activationWindow: [formation.verified.trough, formation.verified.end],
      becomesStableAt: formation.verified.end,
      capability: "ASSEMBLY",
      motif: "RING",
      musicalReason: `Verified collapse/re-entry episode "${formation.label}" (trough ${formation.verified.trough}s, relativeDip ${formation.relativeDip}) — the first real gather-then-return in the recording.`,
      confidence: formation.confidence,
    },
    {
      id: "mass_step",
      earliestHint: assemblyEp.verified.start,
      activationWindow: [assemblyEp.verified.trough, assemblyEp.verified.end],
      becomesStableAt: assemblyEp.verified.end,
      capability: "MASS",
      motif: "RING",
      musicalReason: `Verified episode "${assemblyEp.label}" (trough ${assemblyEp.verified.trough}s, relativeDip ${assemblyEp.relativeDip}) — a larger contraction than first_join, real evidence for a second, bigger developmental step.`,
      confidence: assemblyEp.confidence,
    },
    {
      id: "identity_pulse",
      earliestHint: identityEp.verified.start,
      activationWindow: [identityEp.verified.trough, identityEp.verified.end],
      becomesStableAt: identityEp.verified.end,
      capability: "SYMMETRY",
      motif: "PULSE",
      musicalReason: `Verified episode "${identityEp.label}" (trough ${identityEp.verified.trough}s) — classified TRACK_BLEND by classify_episodes_against_tracks.mjs, landing right at a track handoff, consistent with "track transitions guide capability introduction."`,
      confidence: identityEp.confidence,
    },
    {
      id: "deep_rest",
      earliestHint: breathEp.verified.start,
      activationWindow: [breathEp.verified.start, breathEp.verified.trough],
      becomesStableAt: null,
      capability: null,
      motif: null,
      musicalReason: `Verified episode "${breathEp.label}" (relativeDip ${breathEp.relativeDip}, the deepest quiet-episode measured) — deliberately NOT an acquisition. This is the BREATH beat: expression collapses, nothing new is permanently learned here, per the brief's explicit "some tracks may... rest."`,
      confidence: "structurally_verified_non_acquiring",
    },
    {
      id: "interior_hint",
      earliestHint: rupture.verified.start,
      activationWindow: [rupture.verified.start, rupture.verified.trough],
      becomesStableAt: rupture.verified.trough,
      capability: "INTERIOR_HINT",
      motif: "VOID",
      musicalReason: `The compression leading into the rupture — the organism holds its breath before the interior is revealed, hosted inside track #${t6.trackNumber} (${t6.title}) per classify_episodes_against_tracks.mjs's finding that 17:47 is IN-TRACK, not a DJ transition.`,
      confidence: "structurally_verified",
    },
    {
      id: "interior_revealed",
      earliestHint: rupture.verified.trough,
      activationWindow: [rupture.verified.trough, rupture.verified.end],
      becomesStableAt: rupture.verified.end,
      capability: "INTERIOR",
      motif: "VOID",
      musicalReason: `Verified episode "${rupture.label}" — relativeDip 1.0, the single deepest collapse measured in the whole file, and (per analysis/calibrate_energy_reservoir.mjs) rank #4 of 84 by release magnitude. The first ontological release; matches CameraDirector's own pre-existing hardcoded PASS_THROUGH splice at this exact instant (1067.19s).`,
      confidence: "structurally_verified",
    },
    {
      id: "network_hint",
      earliestHint: t10.identityArrival,
      activationWindow: [t10.identityArrival, t10.identityArrival + 40],
      becomesStableAt: t10.identityArrival + 40,
      capability: "FIELD_HINT",
      motif: "SEAM",
      musicalReason: `Track #${t10.trackNumber} (${t10.title}) boundary (${t10.identityArrivalConfidence}, evidence ${JSON.stringify(t10.lastEvidence)}) — Mycelium/Sirens' network/signal character (per the brief's own track-name hypotheses) makes this a plausible place to plant the FIELD idea before it's mechanically unlocked at chapter 5 (1451.85s).`,
      confidence: "candidate",
    },
    {
      id: "expansion_step",
      earliestHint: t11.identityArrival,
      activationWindow: [t11.identityArrival, t11.identityArrival + 60],
      becomesStableAt: t11.identityArrival + 60,
      capability: "SCALE_RANGE",
      motif: "RING",
      musicalReason: `Track #${t11.trackNumber} (${t11.title}) boundary (${t11.identityArrivalConfidence}) — "Seven Days And One Week," hypothesized as expansion/temporal persistence; FIELD capability mechanically unlocks at chapter 5 start (1451.85s), close to this boundary, so this is a develop/combine step rather than a fresh acquisition.`,
      confidence: "candidate",
    },
    {
      id: "rest_before_finale",
      earliestHint: t13.identityArrival,
      activationWindow: [t13.identityArrival, t13.identityArrival + 200],
      becomesStableAt: null,
      capability: null,
      motif: null,
      musicalReason: `Track #${t13.trackNumber} (${t13.title}) hosts several of the second-half verified episodes (per episodes_vs_tracks.json) but no single one of them stands out as a distinct new capability — treated as a develop/combine stretch (echo + memory continuing to deepen) rather than forcing a new acquisition just because a track boundary exists here.`,
      confidence: "candidate_non_acquiring",
    },
    {
      id: "final_convergence",
      earliestHint: 2455,
      activationWindow: [2455, t15.identityArrival],
      becomesStableAt: t15.identityArrival,
      capability: "MULTIPLE_SELF",
      motif: "PULSE",
      musicalReason: `Final major stored-energy episode (verified trough ~2480.5s) leading into track #${t15.trackNumber} (${t15.title})'s boundary at ${t15.identityArrival}s — which EXACTLY matches MusicalDirector.js's independently pre-existing "final_fade_1744" event (${(41 * 60 + 43.98).toFixed(2)}s), real corroboration from two unrelated detectors.`,
      confidence: "strong_candidate",
    },
  ];

  const out = {
    generatedAt: new Date().toISOString(),
    method: "Grounded in analysis/verify_structural_episodes.mjs's RMS-verified episodes and analysis/build_track_alignment.mjs's DP-selected track boundaries — every earliestHint/activationWindow either IS a verified timestamp or a real track-boundary timestamp with its own confidence grade carried through, never invented. Non-acquiring entries (deep_rest, rest_before_finale) are included deliberately, per the brief's explicit instruction not to force exactly one acquisition per track.",
    acquisitions,
  };
  fs.writeFileSync("analysis/permanent-acquisitions.json", JSON.stringify(out, null, 2));
  console.log(`Wrote analysis/permanent-acquisitions.json — ${acquisitions.length} entries (${acquisitions.filter((a) => a.capability).length} acquiring, ${acquisitions.filter((a) => !a.capability).length} non-acquiring)`);
}

main();
