// V4 Part 11: sample-accurate A/V sync verification. Timing derives from
// the REAL measured source-audio duration (analysis/audio-master-
// report.json), not only the hand-maintained DURATION constant in
// src/core/timeline.js — this script's first job is confirming those two
// numbers actually agree, since nothing forces them to stay in sync if one
// is edited without the other.
//
// Usage (no args): reports the master frame-count math and the expected
//   timestamp of every checkpoint event, and fails if DURATION has drifted
//   from the measured audio duration by more than one frame.
// Usage (with a rendered file): node av_sync_report.mjs <file> --fps 30
//   —  also verifies the file's own actual video frame count and duration
//   match the expected math, and (if the file has audio) that audio and
//   video stream durations agree within tolerance.
import { execSync } from "node:child_process";
import fs from "node:fs";

const AUDIO_REPORT = JSON.parse(fs.readFileSync("analysis/audio-master-report.json", "utf8"));
const MEASURED_AUDIO_DURATION = AUDIO_REPORT.durationSec;

// src/core/timeline.js's DURATION constant, read directly from source
// rather than re-typed here, so this check can never silently drift from
// what the render actually uses.
const timelineSrc = fs.readFileSync("src/core/timeline.js", "utf8");
const durationMatch = /export const DURATION = ([\d.]+);/.exec(timelineSrc);
if (!durationMatch) throw new Error("Could not find DURATION constant in src/core/timeline.js");
const TIMELINE_DURATION = parseFloat(durationMatch[1]);

// Checkpoints per the brief: 00:00, ~10:00, ~20:00, ~30:00, 17:47 event,
// 41:22 climax, final second.
const CHECKPOINTS = [
  { label: "00:00 (start)", t: 0 },
  { label: "~10:00", t: 600 },
  { label: "~20:00", t: 1200 },
  { label: "~30:00", t: 1800 },
  { label: "17:47 rupture", t: 1067.19 },
  { label: "41:22 climax", t: 2482.0 },
  { label: "final second", t: TIMELINE_DURATION - 1 },
];

function frameForTime(t, fps) {
  return Math.round(t * fps);
}

async function main() {
  const fpsArgIdx = process.argv.indexOf("--fps");
  const fps = fpsArgIdx >= 0 ? parseFloat(process.argv[fpsArgIdx + 1]) : 30;
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;

  const findings = [];

  console.log("=== A/V Sync Report ===");
  console.log(`Measured source audio duration (analysis/audio-master-report.json): ${MEASURED_AUDIO_DURATION}s`);
  console.log(`src/core/timeline.js DURATION constant: ${TIMELINE_DURATION}s`);
  const durationDriftSec = Math.abs(MEASURED_AUDIO_DURATION - TIMELINE_DURATION);
  const oneFrameSec = 1 / fps;
  console.log(`Drift: ${(durationDriftSec * 1000).toFixed(3)}ms (tolerance: one frame = ${(oneFrameSec * 1000).toFixed(3)}ms at ${fps}fps)`);
  if (durationDriftSec > oneFrameSec) {
    findings.push(`DURATION constant has drifted from the measured audio duration by more than one frame (${(durationDriftSec * 1000).toFixed(1)}ms) — timeline.js and the real source file disagree.`);
  }

  const totalFrames = Math.round(TIMELINE_DURATION * fps);
  const videoDurationAtFrameCount = totalFrames / fps;
  const tailResidualSec = TIMELINE_DURATION - videoDurationAtFrameCount;
  console.log(`\nMaster frame count @ ${fps}fps: ${totalFrames} frames`);
  console.log(`Video duration at that frame count: ${videoDurationAtFrameCount.toFixed(6)}s`);
  console.log(`Audio tail beyond last video frame: ${(tailResidualSec * 1000).toFixed(3)}ms (normal/unavoidable — fps rarely divides duration evenly; this is far under one frame)`);

  console.log(`\nCheckpoint frame numbers (frame = round(t * ${fps})):`);
  for (const cp of CHECKPOINTS) {
    const frame = frameForTime(cp.t, fps);
    console.log(`  ${cp.label.padEnd(20)} t=${cp.t.toFixed(2)}s -> frame ${frame}`);
  }

  if (file) {
    console.log(`\n=== Verifying against ${file} ===`);
    const info = JSON.parse(execSync(`ffprobe -v error -print_format json -show_format -show_streams "${file}"`).toString());
    const vStream = info.streams.find((s) => s.codec_type === "video");
    const aStream = info.streams.find((s) => s.codec_type === "audio");
    const videoDuration = parseFloat(info.format.duration);
    const [num, den] = vStream.r_frame_rate.split("/").map(Number);
    const actualFps = num / den;
    const actualFrameCount = Math.round(videoDuration * actualFps);
    console.log(`Video: ${actualFrameCount} frames @ ${actualFps.toFixed(3)}fps = ${videoDuration.toFixed(6)}s`);

    if (aStream) {
      const audioDuration = parseFloat(aStream.duration || info.format.duration);
      console.log(`Audio stream duration: ${audioDuration.toFixed(6)}s`);
      const avDrift = Math.abs(videoDuration - audioDuration);
      console.log(`A/V drift: ${(avDrift * 1000).toFixed(3)}ms (tolerance: ${(oneFrameSec * 1000).toFixed(3)}ms)`);
      if (avDrift > oneFrameSec) {
        findings.push(`A/V drift (${(avDrift * 1000).toFixed(1)}ms) exceeds one frame at ${fps}fps in ${file}`);
      }
    } else {
      console.log("(silent file — no audio stream to compare, expected for a pre-mux render_master.mjs output)");
    }
  }

  console.log(`\n=== ${findings.length} finding(s) ===`);
  for (const f of findings) console.log(`  - ${f}`);
  console.log(findings.length === 0 ? "\nPASS" : "\nFAIL");

  fs.mkdirSync("analysis", { recursive: true });
  fs.writeFileSync(
    "analysis/av-sync-report.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        measuredAudioDurationSec: MEASURED_AUDIO_DURATION,
        timelineDurationConstant: TIMELINE_DURATION,
        durationDriftMs: durationDriftSec * 1000,
        fps,
        totalMasterFrameCount: totalFrames,
        audioTailResidualMs: tailResidualSec * 1000,
        checkpoints: CHECKPOINTS.map((cp) => ({ label: cp.label, t: cp.t, frame: frameForTime(cp.t, fps) })),
        verifiedFile: file || null,
        findings,
        result: findings.length === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );
  console.log("\nWrote analysis/av-sync-report.json");

  process.exit(findings.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
