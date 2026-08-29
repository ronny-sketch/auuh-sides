// V4 Parts 9, 10, 13: combines a SILENT video (from render_master.mjs —
// the master render process must never capture audio itself) with the
// ORIGINAL source audio, applying only the processing actually justified
// by analysis/audio-master-report.json's measurements, and writes the
// explicit Rec.709/full-range color metadata verified in
// docs/v4-color-pipeline.md.
//
// Audio philosophy (docs/audio-master-report.md): no loudness
// normalization anywhere (measured -16.22 LUFS is healthy, preserved as-
// is). A transparent true-peak-safe ceiling (-1.0 dBTP) is applied ONLY
// to the two lossy delivery encodes, because the source's measured +0.11
// dBTP true peak is a real, if minor, risk specifically for lossy
// re-encoding — never on the archival master, which carries the source
// PCM untouched.
//
// Usage:
//   node mux_deliverable.mjs --video <silent.mp4> --type archival|hevc|h264|review
//     --audio-start <sec> --audio-duration <sec> --output <path>
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SOURCE_AUDIO = "audio/AUUH.m4a";

// Verified in docs/v4-color-pipeline.md: -x264opts/-x265-params are
// required IN ADDITION to the container-level -color_* flags — the
// container flags alone left color_transfer/color_primaries at "unknown"
// in a real encode, confirmed by ffprobe, not assumed.
const COLOR_FLAGS_CONTAINER = "-color_range pc -colorspace bt709 -color_primaries bt709 -color_trc bt709";
const X264_VUI = "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=on";
const X265_VUI = "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=full";

// Transparent true-peak ceiling for lossy deliveries only — see
// docs/audio-master-report.md's exact justification (+0.11 dBTP measured
// on source). alimiter only engages on samples actually exceeding the
// ceiling; everything below it passes through unaffected.
const TRUE_PEAK_SAFE_AF = "alimiter=limit=0.891:attack=5:release=50"; // 0.891 linear ~= -1.0 dBTP

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--video") args.video = val();
    else if (a === "--type") args.type = val();
    else if (a === "--audio-start") args.audioStart = parseFloat(val());
    else if (a === "--audio-duration") args.audioDuration = parseFloat(val());
    else if (a === "--output") args.output = val();
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!args.video || !args.type || !args.output) {
    throw new Error("Required: --video <silent.mp4> --type <archival|hevc|h264|review> --output <path> (optional: --audio-start --audio-duration, default 0/full source)");
  }
  return args;
}

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function audioTrimArgs(args) {
  if (args.audioStart == null) return "";
  const dur = args.audioDuration != null ? `-t ${args.audioDuration}` : "";
  return `-ss ${args.audioStart} ${dur}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  const audioTrim = audioTrimArgs(args);

  if (args.type === "archival") {
    // Archival MOV master: ProRes 422 HQ (profile 3) + uncompressed PCM
    // 24-bit at the SOURCE sample rate (44.1kHz — no resample; a MOV
    // container has no 48kHz requirement, and resampling would be an
    // unjustified extra generation per docs/audio-master-report.md).
    //
    // CRITICAL, empirically-verified fix (docs/v4-color-pipeline.md): a
    // naive `-color_range pc` on prores_ks/mov does NOT actually produce
    // full-range output — ffprobe confirmed the muxer always tags the
    // stream `tv` (limited) regardless of that flag, and because the
    // pixel VALUES were left as full-range (0-255 stored as literal luma
    // codes) while the file claims limited range, any decoder that
    // correctly honors the tag (ffmpeg's own decoder, and by convention
    // every real NLE/colorist tool) expands assuming limited range and
    // CRUSHES near-black detail to zero while clipping highlights — a
    // measured, real corruption (verified via the uTestPattern round-trip:
    // 1%/2%/5% steps all crushed to 0, 90% clipped high) that would have
    // silently destroyed this piece's crushed-blacks doctrine in the one
    // deliverable meant to be the permanent, uncompressed reference.
    // Fix: perform a REAL, correct full->legal range conversion
    // (`scale=in_range=pc:out_range=tv`) so the stored values are properly
    // legalized 10-bit codes, and tag the file `tv` to MATCH what's
    // actually stored (also matching ProRes's own universal real-world
    // convention, rather than fighting it) — verified round-trip: max
    // ±1 code value across all 9 test steps, no crushing, no clipping.
    run(
      `ffmpeg -y -i "${args.video}" ${audioTrim} -i "${SOURCE_AUDIO}" ` +
        `-map 0:v -map 1:a ` +
        `-vf "scale=in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv422p10le" ` +
        `-c:v prores_ks -profile:v 3 -vendor apl0 ` +
        `-c:a pcm_s24le ` +
        `-color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 ` +
        `"${args.output}"`
    );
  } else if (args.type === "hevc") {
    // HEVC Main10 delivery. Audio: stream-copy if the source is already
    // AAC-compatible with the mp4 container (verified lossless in
    // docs/audio-master-report.md); the true-peak ceiling REQUIRES
    // decoding, so when audioStart/audioDuration trim is used (comparison-
    // reel excerpts) we re-encode through the limiter; a full-length
    // delivery with no measured need to trim could stream-copy instead
    // (documented, not auto-detected here — this script always applies
    // the measured-necessary limiter for correctness on any excerpt).
    run(
      `ffmpeg -y -i "${args.video}" ${audioTrim} -i "${SOURCE_AUDIO}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx265 -pix_fmt yuv420p10le -crf 16 -preset slow ` +
        `-x265-params "${X265_VUI}" ` +
        `-af "${TRUE_PEAK_SAFE_AF}" -c:a aac -b:a 256k ` +
        `${COLOR_FLAGS_CONTAINER} ` +
        `"${args.output}"`
    );
  } else if (args.type === "h264") {
    run(
      `ffmpeg -y -i "${args.video}" ${audioTrim} -i "${SOURCE_AUDIO}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 14 -preset slow ` +
        `-x264opts "${X264_VUI}" ` +
        `-af "${TRUE_PEAK_SAFE_AF}" -c:a aac -b:a 256k ` +
        `${COLOR_FLAGS_CONTAINER} ` +
        `"${args.output}"`
    );
  } else if (args.type === "review") {
    run(
      `ffmpeg -y -i "${args.video}" ${audioTrim} -i "${SOURCE_AUDIO}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium ` +
        `-x264opts "${X264_VUI}" ` +
        `-af "${TRUE_PEAK_SAFE_AF}" -c:a aac -b:a 192k ` +
        `${COLOR_FLAGS_CONTAINER} ` +
        `"${args.output}"`
    );
  } else {
    throw new Error(`Unknown --type ${args.type}`);
  }

  console.log(`\nWrote ${args.output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
