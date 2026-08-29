// V4 Part 17: automated master/deliverable QA. Verifies a rendered file
// against the properties it's supposed to have — measured via ffprobe/
// ffmpeg filters, not assumed from the render command that produced it
// (the render command could itself be wrong, which is exactly what
// happened with the chunk-naming bug this same session already caught).
//
// Usage: node qa_master_file.mjs <file> --expect-width W --expect-height H
//   --expect-fps FPS --expect-duration SEC [--expect-audio-duration SEC]
//   [--tolerance-frames N]
import { execSync } from "node:child_process";
import fs from "node:fs";

function parseArgs(argv) {
  const args = { toleranceFrames: 1 };
  args.file = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--expect-width") args.width = parseInt(val(), 10);
    else if (a === "--expect-height") args.height = parseInt(val(), 10);
    else if (a === "--expect-fps") args.fps = parseFloat(val());
    else if (a === "--expect-duration") args.duration = parseFloat(val());
    else if (a === "--expect-audio-duration") args.audioDuration = parseFloat(val());
    else if (a === "--tolerance-frames") args.toleranceFrames = parseInt(val(), 10);
    // Silent renders straight out of render_master.mjs have no audio and
    // no final color tags by design — those get added by
    // mux_deliverable.mjs. Without this flag, both are treated as defects
    // (correct for an actual deliverable file, wrong for an intermediate).
    else if (a === "--intermediate") args.intermediate = true;
  }
  if (!args.file) throw new Error("Usage: qa_master_file.mjs <file> --expect-width W --expect-height H --expect-fps FPS --expect-duration SEC");
  return args;
}

function ffprobeJson(file) {
  const out = execSync(`ffprobe -v error -print_format json -show_format -show_streams "${file}"`).toString();
  return JSON.parse(out);
}

function checkFrame(file, tSec, outPath) {
  execSync(`ffmpeg -y -v error -ss ${tSec} -i "${file}" -frames:v 1 "${outPath}"`);
}

function pixelStats(pngPath) {
  const out = execSync(`ffmpeg -v error -i "${pngPath}" -vf "signalstats,metadata=print" -f null - 2>&1`, { encoding: "utf8" });
  const get = (key) => {
    const m = new RegExp(`lavfi\\.signalstats\\.${key}=([\\d.]+)`).exec(out);
    return m ? parseFloat(m[1]) : null;
  };
  return { yavg: get("YAVG"), ymin: get("YMIN"), ymax: get("YMAX") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = [];
  const info = ffprobeJson(args.file);
  const vStream = info.streams.find((s) => s.codec_type === "video");
  const aStream = info.streams.find((s) => s.codec_type === "audio");
  const format = info.format;

  console.log(`=== QA: ${args.file} ===`);

  // --- Resolution ---
  if (args.width && vStream.width !== args.width) findings.push(`Width mismatch: expected ${args.width}, got ${vStream.width}`);
  if (args.height && vStream.height !== args.height) findings.push(`Height mismatch: expected ${args.height}, got ${vStream.height}`);
  console.log(`Resolution: ${vStream.width}x${vStream.height}`);

  // --- FPS ---
  const [num, den] = vStream.r_frame_rate.split("/").map(Number);
  const actualFps = num / den;
  if (args.fps && Math.abs(actualFps - args.fps) > 0.01) findings.push(`FPS mismatch: expected ${args.fps}, got ${actualFps.toFixed(3)}`);
  console.log(`FPS: ${actualFps.toFixed(3)}`);

  // --- Duration / frame count ---
  const duration = parseFloat(format.duration);
  console.log(`Duration: ${duration.toFixed(6)}s`);
  if (args.duration != null) {
    const tolSec = args.toleranceFrames / (args.fps || actualFps);
    if (Math.abs(duration - args.duration) > tolSec) {
      findings.push(`Duration mismatch: expected ${args.duration}s, got ${duration.toFixed(3)}s (tolerance ${tolSec.toFixed(3)}s)`);
    }
  }

  // --- Audio ---
  if (aStream) {
    console.log(`Audio: codec=${aStream.codec_name} sample_rate=${aStream.sample_rate} channels=${aStream.channels}`);
    if (args.audioDuration != null && aStream.duration) {
      const audioDur = parseFloat(aStream.duration);
      if (Math.abs(audioDur - args.audioDuration) > 0.1) {
        findings.push(`Audio duration mismatch: expected ${args.audioDuration}s, got ${audioDur.toFixed(3)}s`);
      }
    }
  } else {
    console.log("Audio: NONE (silent video — expected for render_master.mjs output before muxing)");
  }

  // --- Color metadata ---
  console.log(`Color: range=${vStream.color_range || "unset"} space=${vStream.color_space || "unset"} transfer=${vStream.color_transfer || "unset"} primaries=${vStream.color_primaries || "unset"}`);
  if (!args.intermediate && vStream.color_range == null) {
    findings.push("Color metadata unset (color_range) — see docs/v4-color-pipeline.md (pass --intermediate if this is a pre-mux silent render)");
  }

  // --- Pixel-level checks: black-frame, white-clip, at 5 sampled points ---
  const tmpPng = "/tmp/_qa_frame.png";
  const sampleCount = 5;
  let blackFrames = 0;
  let whiteClipFrames = 0;
  for (let i = 0; i < sampleCount; i++) {
    const t = (duration * (i + 0.5)) / sampleCount;
    checkFrame(args.file, t, tmpPng);
    const stats = pixelStats(tmpPng);
    if (stats.ymax != null && stats.ymax < 2) blackFrames++;
    if (stats.ymin != null && stats.ymin > 253) whiteClipFrames++;
  }
  if (fs.existsSync(tmpPng)) fs.unlinkSync(tmpPng);
  console.log(`Sampled ${sampleCount} frames: ${blackFrames} fully-black, ${whiteClipFrames} fully-white`);
  if (blackFrames === sampleCount) findings.push("ALL sampled frames are fully black — likely a real rendering failure, not intentional (unless this file IS the silence-tail excerpt)");

  console.log(`\n=== ${findings.length} finding(s) ===`);
  for (const f of findings) console.log(`  - ${f}`);
  console.log(findings.length === 0 ? "\nPASS" : "\nFAIL");
  process.exit(findings.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
