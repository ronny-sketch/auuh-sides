"""
Phase 2 track/phrase map (v1): derives transition CANDIDATES from the v2
feature timeline — never hallucinated from track names, since none are
known. Scores each candidate against the evidence that fired so a human
(Ronny, via analysis/annotate.html) can confirm/correct/densify rather than
trusting the algorithm blindly.

Signal used per docs/v2-plan.md Phase 2:
  - simultaneous drop in bass + percussive energy (a real crossfade/blend
    signature — a DJ transition usually dips low-end energy briefly even
    during a beatmatched blend)
  - chroma-vector discontinuity (a proxy for a key/harmonic-content change)
  - RMS dip (weaker signal alone, used as a secondary confirmation)

Honest limitation, stated here and in docs/musical-cue-sheet-v2.md: this
does NOT re-run a windowed/local tempo analysis (a tempogram over short
windows) to check whether the piece's single global 123.05 BPM estimate
papers over real tempo changes between source tracks — that's flagged as
an open question in docs/v2-plan.md Phase 2, not resolved here. Treat every
candidate below as exactly that: a candidate, not a confirmed track
boundary.
"""

import json

import numpy as np

SCHEMA_PATH = "analysis/audio_features_v2.schema.json"
BIN_PATH = "analysis/audio_features_v2.bin"


def load_features():
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    data = np.fromfile(BIN_PATH, dtype=np.float32).reshape(schema["n_frames"], schema["n_fields"])
    field_idx = {name: i for i, name in enumerate(schema["fields"])}
    return schema, data, field_idx


def rolling_mean(x, win):
    kernel = np.ones(win) / win
    return np.convolve(x, kernel, mode="same")


def main():
    schema, data, fi = load_features()
    hop_hz = schema["hop_hz"]
    n = schema["n_frames"]
    times = np.arange(n) / hop_hz

    bass = data[:, fi["bass"]]
    percussive = data[:, fi["percussive"]]
    rms = data[:, fi["rms"]]
    chroma = data[:, [fi[f"chroma{i}"] for i in range(12)]]

    # smooth over a ~4-second window to look at structural-scale change,
    # not beat-to-beat wobble
    win = int(4 * hop_hz)
    bass_s = rolling_mean(bass, win)
    perc_s = rolling_mean(percussive, win)
    rms_s = rolling_mean(rms, win)

    # chroma discontinuity: cosine distance between chroma vectors ~8s apart
    lag = int(8 * hop_hz)
    chroma_dist = np.zeros(n)
    for i in range(lag, n):
        a, b = chroma[i - lag], chroma[i]
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na > 1e-6 and nb > 1e-6:
            chroma_dist[i] = 1 - np.dot(a, b) / (na * nb)

    # candidate = local minimum in bass+percussive combined with elevated
    # chroma discontinuity nearby
    combined_low = -(bass_s + perc_s)  # peaks where bass+perc DIP
    # simple local-max detection with a minimum spacing so we don't get a
    # candidate every few frames
    min_spacing = int(20 * hop_hz)  # at least 20s apart
    candidates = []
    i = win
    while i < n - win:
        window_slice = combined_low[i : i + min_spacing]
        local_max_offset = int(np.argmax(window_slice))
        idx = i + local_max_offset
        score = 0.0
        evidence = []
        bass_drop = bass_s[max(0, idx - 100) : idx].mean() - bass_s[idx]
        perc_drop = perc_s[max(0, idx - 100) : idx].mean() - perc_s[idx]
        if bass_drop > 0.05:
            score += bass_drop
            evidence.append("bass_drop")
        if perc_drop > 0.05:
            score += perc_drop
            evidence.append("percussive_drop")
        chroma_local = chroma_dist[max(0, idx - int(2 * hop_hz)) : idx + int(2 * hop_hz)].max()
        if chroma_local > 0.3:
            score += chroma_local * 0.5
            evidence.append("chroma_discontinuity")
        if rms_s[max(0, idx - 100) : idx].mean() - rms_s[idx] > 0.03:
            evidence.append("rms_dip")

        if score > 0.08 and evidence:
            candidates.append(
                {
                    "t": float(times[idx]),
                    "score": float(score),
                    "evidence": evidence,
                }
            )
        i += min_spacing

    candidates.sort(key=lambda c: -c["score"])

    # Tier by score percentile rather than a fixed cutoff: the raw
    # threshold above (0.08) is deliberately permissive so nothing is
    # silently discarded, but with ~126 candidate windows across 42
    # minutes and an expected ~15 source tracks (~14 real transitions),
    # most windows are NOT real boundaries — tiering surfaces the
    # strongest ~15-20 first without hiding the rest.
    scores = [c["score"] for c in candidates]
    p75 = float(np.percentile(scores, 75)) if scores else 0
    p90 = float(np.percentile(scores, 90)) if scores else 0
    for c in candidates:
        if c["score"] >= p90:
            c["tier"] = "high"
        elif c["score"] >= p75:
            c["tier"] = "medium"
        else:
            c["tier"] = "low"

    out = {
        "note": (
            "Candidates only — not hallucinated from track names (none known). "
            "Confirm/correct/densify with analysis/annotate.html. Tempo is a "
            "single global 123.05 BPM estimate from analysis/analyze.py, NOT "
            "re-verified with a windowed tempogram in this pass — see "
            "docs/v2-plan.md Phase 2."
        ),
        "n_candidates": len(candidates),
        "candidates": sorted(candidates, key=lambda c: c["t"]),
    }
    with open("analysis/track-map.json", "w") as f:
        json.dump(out, f, indent=2)
    print(f"wrote {len(candidates)} candidates -> analysis/track-map.json")


if __name__ == "__main__":
    main()
