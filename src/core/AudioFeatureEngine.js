// Consumes analysis/audio_features_v2.bin (produced by analysis/analyze_v2.py)
// — a flat Float32Array, one fixed-stride record per frame at 50Hz. sample(t)
// linearly interpolates between the two nearest frames and is a pure
// function of t (same discipline as getParams/CameraDirector — required for
// seek-determinism).
export class AudioFeatureEngine {
  constructor() {
    this.fields = null;
    this.nFields = 0;
    this.nFrames = 0;
    this.hopHz = 50;
    this.data = null; // Float32Array, length nFrames * nFields
    this.fieldIndex = {};
  }

  async load(binUrl, schemaUrl) {
    const [schema, buf] = await Promise.all([
      fetch(schemaUrl).then((r) => r.json()),
      fetch(binUrl).then((r) => r.arrayBuffer()),
    ]);
    this.fields = schema.fields;
    this.nFields = schema.n_fields;
    this.nFrames = schema.n_frames;
    this.hopHz = schema.hop_hz;
    this.duration = schema.duration_sec;
    this.data = new Float32Array(buf);
    this.fields.forEach((name, i) => (this.fieldIndex[name] = i));
  }

  // Returns a plain object with every field, linearly interpolated at t.
  sample(t) {
    const idx = Math.min(Math.max(t, 0), this.duration) * this.hopHz;
    const i0 = Math.min(Math.floor(idx), this.nFrames - 1);
    const i1 = Math.min(i0 + 1, this.nFrames - 1);
    const frac = idx - i0;

    const out = {};
    const base0 = i0 * this.nFields;
    const base1 = i1 * this.nFields;
    for (let i = 0; i < this.nFields; i++) {
      const a = this.data[base0 + i];
      const b = this.data[base1 + i];
      out[this.fields[i]] = a + (b - a) * frac;
    }
    return out;
  }
}
