"""
AudioFeatureEngine v2 offline analysis.

Loads the original mix + Demucs 4-stem separation (drums/bass/vocals/other)
and derives a compact, time-aligned, smoothed, robustly-normalized feature
timeline for the visual engine to sample by timestamp. See docs/v2-plan.md
Phase 1 for the field table and design rationale.

Output: analysis/audio_features_v2.bin (flat float32, one fixed-stride
record per frame) + analysis/audio_features_v2.schema.json (field order,
hop size, frame count — everything a consumer needs to parse the binary).
"""

import json
import sys

import librosa
import numpy as np

SR = 22050
HOP = 441  # 50 Hz frame rate at SR=22050
STEMS_DIR = "analysis/stems/htdemucs/AUUH"
ORIGINAL = "audio/AUUH_mono_v2.wav"

FIELDS = [
    "rms", "sub", "bass", "lowMid", "mid", "highMid", "high",
    "kick", "snare", "hats", "percussive", "harmonic", "vocalPresence",
    "centroid", "flux", "flatness", "rolloff", "contrast",
    "onsetStrength", "onset", "beatPhase", "barPhase", "downbeat",
    "silence", "energyTrend",
] + [f"chroma{i}" for i in range(12)]

N_FIELDS = len(FIELDS)


def load_mono(path, sr=SR):
    y, _ = librosa.load(path, sr=sr, mono=True)
    return y


def band_energy(y, sr, hop, n_fft, lo, hi):
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    mask = (freqs >= lo) & (freqs < hi if hi is not None else True)
    return S[mask, :].mean(axis=0)


def attack_release(x, frame_rate, attack_s, release_s):
    """Asymmetric one-pole envelope follower: fast-moving attack_s coefficient
    when the signal rises, slower release_s coefficient when it falls."""
    a_att = np.exp(-1.0 / max(attack_s * frame_rate, 1e-6))
    a_rel = np.exp(-1.0 / max(release_s * frame_rate, 1e-6))
    out = np.zeros_like(x)
    prev = 0.0
    for i, v in enumerate(x):
        coef = a_att if v > prev else a_rel
        prev = coef * prev + (1 - coef) * v
        out[i] = prev
    return out


def robust_normalize(x, lo_pct=5, hi_pct=95):
    lo = np.percentile(x, lo_pct)
    hi = np.percentile(x, hi_pct)
    if hi - lo < 1e-8:
        return np.zeros_like(x), float(lo), float(hi)
    out = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return out, float(lo), float(hi)


def resample_to(x, src_times, dst_times):
    return np.interp(dst_times, src_times, x, left=x[0], right=x[-1])


def main():
    print("decoding original mix + stems...", file=sys.stderr)
    y_mix = load_mono(ORIGINAL)
    y_drums = load_mono(f"{STEMS_DIR}/drums.wav")
    y_bass = load_mono(f"{STEMS_DIR}/bass.wav")
    y_vocals = load_mono(f"{STEMS_DIR}/vocals.wav")
    y_other = load_mono(f"{STEMS_DIR}/other.wav")

    duration = librosa.get_duration(y=y_mix, sr=SR)
    n_frames = int(np.floor(duration * 50)) + 1
    frame_times = np.arange(n_frames) / 50.0
    print(f"duration={duration:.2f}s  n_frames={n_frames}", file=sys.stderr)

    n_fft = 2048

    def stft_times(y):
        # librosa's feature functions (rms, spectral_*, onset_strength) and
        # librosa.stft all default to center=True, which produces
        # 1 + len(y)//hop_length frames — NOT the non-centered/"valid"
        # convention (1 + (len(y)-n_fft)//hop) this used before, which
        # under-counted frames and caused an rms/frame-time length
        # mismatch (np.interp "fp and xp are not of the same length").
        n = 1 + len(y) // HOP
        return librosa.frames_to_time(np.arange(n), sr=SR, hop_length=HOP)

    raw = {}

    print("rms + bands...", file=sys.stderr)
    raw["rms"] = librosa.feature.rms(y=y_mix, hop_length=HOP)[0]
    t_mix = stft_times(y_mix)

    raw["sub"] = band_energy(y_bass, SR, HOP, n_fft, 20, 60)
    raw["bass"] = band_energy(y_bass, SR, HOP, n_fft, 60, 250)
    y_lm = y_other + np.pad(y_vocals, (0, max(0, len(y_other) - len(y_vocals))))[: len(y_other)]
    raw["lowMid"] = band_energy(y_lm, SR, HOP, n_fft, 250, 500)
    raw["mid"] = band_energy(y_lm, SR, HOP, n_fft, 500, 2000)
    raw["highMid"] = band_energy(y_mix, SR, HOP, n_fft, 2000, 5000)
    raw["high"] = band_energy(y_mix, SR, HOP, n_fft, 5000, 11000)

    print("percussive envelopes (kick/snare/hats) from drums stem...", file=sys.stderr)
    S_drums = np.abs(librosa.stft(y_drums, n_fft=n_fft, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=n_fft)

    kick_band = S_drums[(freqs < 120), :].mean(axis=0)
    snare_band = S_drums[(freqs >= 150) & (freqs < 4000), :].mean(axis=0)
    hats_band = S_drums[(freqs >= 5000), :].mean(axis=0)
    raw["kick"] = kick_band
    raw["snare"] = snare_band
    raw["hats"] = hats_band

    print("hpss (percussive/harmonic split)...", file=sys.stderr)
    y_harm, y_perc = librosa.effects.hpss(y_mix)
    raw["percussive"] = librosa.feature.rms(y=y_perc, hop_length=HOP)[0]
    raw["harmonic"] = librosa.feature.rms(y=y_harm, hop_length=HOP)[0]

    print("vocal presence...", file=sys.stderr)
    raw["vocalPresence"] = librosa.feature.rms(y=y_vocals, hop_length=HOP)[0]

    print("spectral features (centroid/flux/flatness/rolloff/contrast)...", file=sys.stderr)
    raw["centroid"] = librosa.feature.spectral_centroid(y=y_mix, sr=SR, hop_length=HOP)[0]
    raw["flatness"] = librosa.feature.spectral_flatness(y=y_mix, hop_length=HOP)[0]
    raw["rolloff"] = librosa.feature.spectral_rolloff(y=y_mix, sr=SR, hop_length=HOP)[0]
    contrast = librosa.feature.spectral_contrast(y=y_mix, sr=SR, hop_length=HOP)
    raw["contrast"] = contrast.mean(axis=0)

    onset_env = librosa.onset.onset_strength(y=y_mix, sr=SR, hop_length=HOP)
    raw["onsetStrength"] = onset_env
    raw["flux"] = np.concatenate([[0], np.diff(onset_env)])

    print("beat/bar grid + chroma...", file=sys.stderr)
    with open("analysis/audio_analysis.json") as f:
        prior = json.load(f)
    beat_times = np.array(prior["beat_times"])
    bar_times = np.array(prior["bar_times"])

    # chroma_stft, not chroma_cqt: CQT's constant-Q filterbank is memory-
    # heavy at this hop rate over a 42-minute signal — it drove this
    # machine into deep swap (41GB/42GB used) and stalled for 15+ minutes
    # with no completion in sight. chroma_stft reuses a standard STFT
    # (already computed elsewhere in this pipeline) and is dramatically
    # cheaper; the visual system only needs chroma as a coarse "topological
    # identity" signal, not pitch-perfect harmonic analysis, so the lower
    # frequency resolution is an acceptable tradeoff here.
    chroma = librosa.feature.chroma_stft(y=y_harm, sr=SR, n_fft=n_fft, hop_length=HOP)

    print("resampling all fields to the 50Hz output grid...", file=sys.stderr)
    out = np.zeros((n_frames, N_FIELDS), dtype=np.float32)
    field_idx = {name: i for i, name in enumerate(FIELDS)}
    norm_meta = {}

    def put(name, values, smooth=None, normalize=True):
        # Source times are derived from THIS field's own actual array
        # length, not a single shared t_mix — stems come from Demucs's
        # internal audio loading while the mix is decoded separately via
        # ffmpeg/librosa, and even a few samples' difference between those
        # two decode paths is enough to make a shared time axis wrong for
        # some fields (this caused an np.interp length-mismatch crash).
        src_times = librosa.frames_to_time(np.arange(len(values)), sr=SR, hop_length=HOP)
        vals = resample_to(values.astype(np.float64), src_times, frame_times)
        if smooth is not None:
            attack_s, release_s = smooth
            vals = attack_release(vals, 50.0, attack_s, release_s)
        if normalize:
            vals, lo, hi = robust_normalize(vals)
            norm_meta[name] = {"lo": lo, "hi": hi}
        out[:, field_idx[name]] = vals

    put("rms", raw["rms"], smooth=(0.01, 0.15))
    put("sub", raw["sub"], smooth=(0.005, 0.12))
    put("bass", raw["bass"], smooth=(0.005, 0.15))
    put("lowMid", raw["lowMid"], smooth=(0.01, 0.15))
    put("mid", raw["mid"], smooth=(0.01, 0.15))
    put("highMid", raw["highMid"], smooth=(0.01, 0.1))
    put("high", raw["high"], smooth=(0.01, 0.08))
    put("kick", raw["kick"], smooth=(0.005, 0.08))
    put("snare", raw["snare"], smooth=(0.005, 0.08))
    put("hats", raw["hats"], smooth=(0.003, 0.05))
    put("percussive", raw["percussive"], smooth=(0.01, 0.12))
    put("harmonic", raw["harmonic"], smooth=(0.02, 0.3))
    put("vocalPresence", raw["vocalPresence"], smooth=(0.05, 0.4))
    put("centroid", raw["centroid"], smooth=(0.05, 0.3))
    put("flux", np.clip(raw["flux"], 0, None), smooth=(0.003, 0.06))
    put("flatness", raw["flatness"], smooth=(0.05, 0.3))
    put("rolloff", raw["rolloff"], smooth=(0.05, 0.3))
    put("contrast", raw["contrast"], smooth=(0.05, 0.3))
    put("onsetStrength", raw["onsetStrength"], smooth=(0.003, 0.1))

    # onset trigger: short-decay pulse at local peaks of onsetStrength
    onset_peaks = librosa.onset.onset_detect(
        onset_envelope=raw["onsetStrength"], sr=SR, hop_length=HOP, units="time"
    )
    onset_pulse = np.zeros(len(t_mix))
    peak_idx = np.searchsorted(t_mix, onset_peaks)
    peak_idx = peak_idx[peak_idx < len(onset_pulse)]
    onset_pulse[peak_idx] = 1.0
    put("onset", onset_pulse, smooth=(0.001, 0.09), normalize=False)

    # beat/bar phase + downbeat pulse, computed directly on the output grid
    beat_phase = np.zeros(n_frames)
    bar_phase = np.zeros(n_frames)
    downbeat_pulse = np.zeros(n_frames)
    for i, t in enumerate(frame_times):
        bi = np.searchsorted(beat_times, t, side="right") - 1
        if 0 <= bi < len(beat_times) - 1:
            beat_phase[i] = (t - beat_times[bi]) / (beat_times[bi + 1] - beat_times[bi])
        bj = np.searchsorted(bar_times, t, side="right") - 1
        if 0 <= bj < len(bar_times) - 1:
            bar_phase[i] = (t - bar_times[bj]) / (bar_times[bj + 1] - bar_times[bj])
            if bar_phase[i] < (1.0 / 50.0) / (bar_times[bj + 1] - bar_times[bj]):
                downbeat_pulse[i] = 1.0
    out[:, field_idx["beatPhase"]] = beat_phase
    out[:, field_idx["barPhase"]] = bar_phase
    out[:, field_idx["downbeat"]] = downbeat_pulse

    # silence: RMS below a rolling low percentile (noise floor), 0/1 with a
    # touch of release smoothing so it doesn't flicker at the boundary
    rms_resampled = resample_to(raw["rms"].astype(np.float64), t_mix, frame_times)
    noise_floor = np.percentile(rms_resampled, 10)
    silence_raw = (rms_resampled < noise_floor * 1.5).astype(np.float64)
    out[:, field_idx["silence"]] = attack_release(silence_raw, 50.0, 0.2, 0.2)

    # energyTrend: RMS smoothed over an 8-bar window (~15.6s at 123 BPM),
    # explicitly NOT used as direct brightness — see docs/v2-plan.md Phase 4
    bar_s = float(np.median(np.diff(bar_times))) if len(bar_times) > 1 else 2.0
    win_frames = max(1, int(round(8 * bar_s * 50)))
    kernel = np.ones(win_frames) / win_frames
    energy_trend = np.convolve(rms_resampled, kernel, mode="same")
    et_norm, lo, hi = robust_normalize(energy_trend)
    norm_meta["energyTrend"] = {"lo": lo, "hi": hi}
    out[:, field_idx["energyTrend"]] = et_norm

    for i in range(12):
        vals = resample_to(chroma[i].astype(np.float64), t_mix, frame_times)
        out[:, field_idx[f"chroma{i}"]] = np.clip(vals, 0.0, 1.0)

    print("writing binary + schema...", file=sys.stderr)
    out.tofile("analysis/audio_features_v2.bin")
    schema = {
        "fields": FIELDS,
        "n_fields": N_FIELDS,
        "n_frames": n_frames,
        "hop_hz": 50.0,
        "duration_sec": float(duration),
        "normalization": norm_meta,
    }
    with open("analysis/audio_features_v2.schema.json", "w") as f:
        json.dump(schema, f, indent=2)

    print(f"done: {n_frames} frames x {N_FIELDS} fields -> audio_features_v2.bin", file=sys.stderr)


if __name__ == "__main__":
    main()
