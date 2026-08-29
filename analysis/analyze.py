import json
import sys

import librosa
import numpy as np

AUDIO_PATH = "audio/AUUH_mono22k.wav"
SR = 22050
HOP = 512

print("loading audio...", file=sys.stderr)
y, sr = librosa.load(AUDIO_PATH, sr=SR, mono=True)
duration = librosa.get_duration(y=y, sr=sr)
print(f"duration: {duration:.2f}s", file=sys.stderr)

print("tempo/beat tracking...", file=sys.stderr)
onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
tempo, beat_frames = librosa.beat.beat_track(
    onset_envelope=onset_env, sr=sr, hop_length=HOP, tightness=100
)
tempo = float(np.atleast_1d(tempo)[0])
beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP).tolist()

print("downbeat/bar estimate (every 4th beat, phase-fit)...", file=sys.stderr)
# no dedicated downbeat tracker available; approximate bars as groups of 4 beats
bar_times = beat_times[0::4]

print("RMS energy...", file=sys.stderr)
rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=HOP)

print("spectral centroid...", file=sys.stderr)
cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP)[0]

print("spectral flatness (noisiness, for glitch/texture cues)...", file=sys.stderr)
flat = librosa.feature.spectral_flatness(y=y, hop_length=HOP)[0]

print("chroma (for harmonic/color-shift cues)...", file=sys.stderr)
chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)

print("structural segmentation (recurrence + laplacian)...", file=sys.stderr)
# Standard librosa laplacian segmentation, adapted for a long-form piece.
mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=HOP, n_mfcc=13)
chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
mfcc_sync = librosa.util.sync(mfcc, beat_frames, aggregate=np.mean)

# Combine recurrence (chroma) with local timbre continuity (mfcc) per librosa's
# standard multi-feature segmentation recipe.
R_aff = librosa.segment.recurrence_matrix(
    chroma_sync, width=3, mode="affinity", sym=True
)
path_dist = np.sum(np.diff(mfcc_sync, axis=1) ** 2, axis=0)
sigma = float(np.median(path_dist)) if len(path_dist) else 1.0
path_sim = np.exp(-path_dist / (sigma + 1e-8))
R_path_aff = np.diag(path_sim, k=1) + np.diag(path_sim, k=-1)

deg_path = np.sum(R_path_aff, axis=1)
deg_rec = np.sum(R_aff, axis=1)
mu = deg_path.dot(deg_path + deg_rec) / np.sum((deg_path + deg_rec) ** 2)
A = mu * R_aff + (1 - mu) * R_path_aff

from scipy.sparse.csgraph import laplacian as csgraph_laplacian

L = csgraph_laplacian(A, normed=True)

evals, evecs = np.linalg.eigh(L)
k = 12  # target number of structural components to consider
evecs_k = evecs[:, :k]
Cnorm = np.cumsum(evecs_k**2, axis=1) ** 0.5
Xs = evecs_k / (Cnorm[:, -1:] + 1e-8)

from sklearn.cluster import KMeans

n_segments = 14  # oversegment; we'll merge by hand in the creative bible
km = KMeans(n_clusters=n_segments, n_init=10, random_state=0).fit(Xs)
labels = km.labels_

beat_times_sync = librosa.frames_to_time(
    librosa.util.fix_frames(beat_frames), sr=sr, hop_length=HOP
)
bound_beats = 1 + np.flatnonzero(labels[1:] != labels[:-1])
bound_beats = librosa.util.fix_frames(bound_beats, x_min=0)
bound_times = beat_times_sync[bound_beats].tolist() if len(bound_beats) else []
bound_labels = [int(labels[i]) for i in bound_beats] if len(bound_beats) else []

print("writing output...", file=sys.stderr)
out = {
    "duration_sec": float(duration),
    "sample_rate": sr,
    "hop_length": HOP,
    "tempo_bpm": tempo,
    "beat_times": beat_times,
    "bar_times": bar_times,
    "n_beats": len(beat_times),
    "n_bars": len(bar_times),
    "structural_boundaries_sec": bound_times,
    "structural_boundary_labels": bound_labels,
    "rms_curve": {
        "times": rms_times[::4].tolist(),
        "values": rms.astype(float)[::4].tolist(),
    },
    "spectral_centroid_curve": {
        "times": rms_times[::4].tolist(),
        "values": cent.astype(float)[::4].tolist(),
    },
    "spectral_flatness_curve": {
        "times": rms_times[::4].tolist(),
        "values": flat.astype(float)[::4].tolist(),
    },
}

with open("analysis/audio_analysis.json", "w") as f:
    json.dump(out, f)

print(f"tempo estimate: {tempo:.2f} bpm", file=sys.stderr)
print(f"beats: {len(beat_times)}  bars(~4/4 est): {len(bar_times)}", file=sys.stderr)
print(f"structural boundaries: {len(bound_times)}", file=sys.stderr)
print("done -> analysis/audio_analysis.json", file=sys.stderr)
