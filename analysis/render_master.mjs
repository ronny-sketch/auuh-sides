// V4 Part 1 — the true offline master renderer. SILENT video only (Part 9:
// audio is never captured from the browser; a separate muxing step —
// analysis/mux_deliverable.mjs — combines this output with the original
// source audio). Frame-exact: frame i corresponds to exactly t = i/fps,
// requested via master-render.js's window.__AUUH_RENDER_SEQUENTIAL__ in
// strictly increasing order, with no dependence on real-time performance,
// requestAnimationFrame, or MediaRecorder — see docs/v4-mastering-audit.md
// for why (the proxy's MediaRecorder path is explicitly disqualified from
// ever being the master).
//
// Capture architecture: page.screenshot() -> ffmpeg image2pipe (Architecture
// C from the benchmark in docs/v4-mastering-audit.md — measured ~2x faster
// and lower peak RAM than direct gl.readPixels+HTTP at 4K, and simpler).
// No PNG ever touches disk.
//
// Chunked + restartable: --chunk-seconds splits [start,end) into
// independently-renderable segments, each written to its own temp file
// under analysis/_master_chunks/ and skipped on a re-run if it already
// exists with the expected duration (ffprobe-verified, not just
// file-exists) — a crashed or interrupted run resumes without re-rendering
// completed chunks. Chunk boundaries preserve temporal-feedback history via
// PREROLL_SECONDS of warm-up rendering (discarded, not captured) before
// each chunk's first real frame — the "warm up with sufficient preroll and
// discard the preroll" option from the brief, chosen over serializing GPU
// render-target state because it reuses the same warmUp() mechanism
// already proven correct by the seek-determinism test suite, rather than
// inventing a new, unverified state-serialization path.
import puppeteer from "puppeteer-core";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RenderLease } from "../src/render/RenderLease.js";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const args = {
    fps: 30, width: 3840, height: 2160, quality: "MASTER", ss: 1, chunkSeconds: null,
    port: process.env.AUUH_PORT || "4174", renderRoot: "analysis/_renders", renderType: "cli_master",
    renderId: null, forceStaleLock: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--start") args.start = parseFloat(val());
    else if (a === "--end") args.end = parseFloat(val());
    else if (a === "--fps") args.fps = parseFloat(val());
    else if (a === "--width") args.width = parseInt(val(), 10);
    else if (a === "--height") args.height = parseInt(val(), 10);
    else if (a === "--quality") args.quality = val();
    else if (a === "--ss") args.ss = parseFloat(val());
    else if (a === "--output") args.output = val();
    else if (a === "--chunk-seconds") args.chunkSeconds = parseFloat(val());
    else if (a === "--port") args.port = val();
    else if (a === "--render-root") args.renderRoot = val();
    else if (a === "--render-type") args.renderType = val();
    else if (a === "--render-id") args.renderId = val();
    else if (a === "--force-stale-lock") args.forceStaleLock = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (args.start == null || args.end == null || !args.output) {
    throw new Error("Required: --start <sec> --end <sec> --output <path> (optional: --fps --width --height --quality --ss --chunk-seconds --port --render-root --render-type --render-id --force-stale-lock)");
  }
  return args;
}

const PREROLL_SECONDS = 4.0;

async function renderChunk({ globalStart, chunkStart, chunkEnd, fps, width, height, quality, ss, port }, outFile) {
  const renderW = Math.round(width * ss);
  const renderH = Math.round(height * ss);
  const nFrames = Math.round((chunkEnd - chunkStart) * fps);

  const scaleFilter = ss !== 1 ? `,scale=${width}:${height}:flags=lanczos` : "";
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y", "-f", "image2pipe", "-c:v", "png", "-r", String(fps),
      "-i", "pipe:0",
      "-vf", `format=yuv420p${scaleFilter}`.replace(/^,/, ""),
      "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
      outFile,
    ],
    { stdio: ["pipe", "ignore", "pipe"] }
  );
  let ffmpegErr = "";
  ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));
  const ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffmpegErr.slice(-2000)}`))));
  });

  // Bounded, not disabled (docs/v4-mastering-audit.md Part 16): a
  // synthetic stress-test pattern reproducibly hung a CDP call
  // indefinitely at 4K MASTER settings with zero CPU activity — a real,
  // confirmed hang risk in this environment, not a hypothetical. A single
  // frame legitimately renders in well under a second even at 4K/MASTER
  // (measured ~1.5s/frame worst case in the Part 1 benchmark), so 90s per
  // call is generous headroom for a slow frame while still catching a
  // genuine hang within a bounded time instead of consuming wall-clock
  // forever the way the first stress-test attempt did.
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${renderW},${renderH}`],
    protocolTimeout: 90000,
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text());
  });
  await page.setViewport({ width: renderW, height: renderH, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/master-render.html?w=${renderW}&h=${renderH}&quality=${quality}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_MASTER_READY__ === true, { timeout: 30000 });

  // Preroll: warm the feedback ring with discarded frames from
  // (chunkStart - PREROLL_SECONDS) up to chunkStart, at the SAME fps, so
  // the ring's pixel content is plausible by the first real captured
  // frame. Skipped entirely for the very first chunk of the whole render
  // (globalStart === chunkStart), which correctly starts from a blank ring
  // — there is no "before the beginning" to warm up from.
  if (chunkStart > globalStart) {
    const preStart = Math.max(globalStart, chunkStart - PREROLL_SECONDS);
    const preFrames = Math.round((chunkStart - preStart) * fps);
    for (let i = 0; i < preFrames; i++) {
      const t = preStart + i / fps;
      await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);
    }
  }

  const t0 = Date.now();
  for (let i = 0; i < nFrames; i++) {
    const t = chunkStart + i / fps;
    await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);
    const png = await page.screenshot({ encoding: "binary" });
    ffmpeg.stdin.write(png);
    if (i % 150 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      console.log(`  frame ${i}/${nFrames}  t=${t.toFixed(2)}  (${(i / Math.max(elapsed, 0.001)).toFixed(2)} fps)`);
    }
  }

  await browser.close();
  ffmpeg.stdin.end();
  await ffmpegDone;

  if (pageErrors.length) {
    console.warn(`  WARNING: ${pageErrors.length} page error(s)/console error(s) during this chunk:`);
    for (const e of pageErrors.slice(0, 10)) console.warn(`    ${e}`);
  }
}

function chunkIsComplete(outFile, expectedDurationSec, fps) {
  if (!fs.existsSync(outFile)) return false;
  try {
    const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outFile}"`).toString().trim());
    // A completed chunk's duration must be within one frame of expected —
    // anything else means a previous run was interrupted mid-chunk.
    return Math.abs(dur - expectedDurationSec) < 1.5 / fps;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { start, end, fps, width, height, quality, ss, output, port, renderRoot, renderType, forceStaleLock } = args;
  const chunkSeconds = args.chunkSeconds || end - start;

  // Every invocation gets its OWN chunk directory (analysis/_renders/<render-id>/chunks)
  // instead of the old shared analysis/_master_chunks — see
  // docs/render-concurrency-safety.md for the incident this fixes. Pass
  // --render-id to resume a previous (crashed) render's chunks rather than
  // starting over from an empty directory.
  const lease = new RenderLease({ renderRoot, renderId: args.renderId, renderType, outputPath: output });
  if (args.renderId && fs.existsSync(lease.dir)) {
    lease.attach({ forceStale: forceStaleLock });
    console.log(`Resuming render ${lease.renderId} (dir: ${lease.dir})`);
  } else {
    lease.acquire();
    console.log(`Render ID: ${lease.renderId} (dir: ${lease.dir}) — pass --render-id ${lease.renderId} to resume if interrupted.`);
  }
  const CHUNK_DIR = lease.chunksDir;
  const commit = (execSync("git rev-parse HEAD").toString().trim() || "nocommit").slice(0, 10);

  fs.mkdirSync(path.dirname(output), { recursive: true });

  const chunks = [];
  for (let s = start; s < end; s += chunkSeconds) {
    chunks.push({ chunkStart: s, chunkEnd: Math.min(s + chunkSeconds, end) });
  }

  console.log(`Rendering ${chunks.length} chunk(s), ${width}x${height}@${fps}fps, quality=${quality}, ss=${ss}, total ${(end - start).toFixed(1)}s`);

  const chunkFiles = [];
  for (let i = 0; i < chunks.length; i++) {
    const { chunkStart, chunkEnd } = chunks[i];
    // Filename MUST encode every setting that changes the actual pixels
    // (commit, time range, resolution, fps, quality tier, supersample) — a
    // real bug caught here during the Part 15 comparison-reel render: two
    // calls covering the SAME time range at 1080p and at 4K/1.5x-SS
    // produced byte-identical "4K" output because the old filename (time
    // range only) matched an existing chunk file from the 1080p run, and
    // chunkIsComplete() only checks duration, not resolution — it happily
    // "restarted" from a completely wrong cached file. Directory isolation
    // (one dir per render-id) already prevents cross-render collisions;
    // this filename additionally makes a single render-id's chunks
    // self-describing.
    const chunkFile = path.join(
      CHUNK_DIR,
      `chunk_${String(i).padStart(4, "0")}_${commit}_${chunkStart.toFixed(1)}-${chunkEnd.toFixed(1)}_${width}x${height}_${fps}fps_${quality}_ss${ss}.mp4`
    );
    chunkFiles.push(chunkFile);
    const expectedDur = chunkEnd - chunkStart;

    if (chunkIsComplete(chunkFile, expectedDur, fps)) {
      console.log(`[${i + 1}/${chunks.length}] SKIP (already rendered): ${chunkFile}`);
      continue;
    }
    console.log(`[${i + 1}/${chunks.length}] rendering ${chunkStart.toFixed(2)}s -> ${chunkEnd.toFixed(2)}s -> ${chunkFile}`);
    await renderChunk({ globalStart: start, chunkStart, chunkEnd, fps, width, height, quality, ss, port }, chunkFile);
    lease.heartbeat();
  }

  if (chunkFiles.length === 1) {
    fs.copyFileSync(chunkFiles[0], output);
  } else {
    const listFile = path.join(CHUNK_DIR, "concat_list.txt");
    fs.writeFileSync(listFile, chunkFiles.map((f) => `file '${path.resolve(f)}'`).join("\n"));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}" -hide_banner -loglevel error`);
  }

  const finalDur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${output}"`).toString().trim();
  console.log(`\nDone: ${output} (duration ${finalDur}s, expected ${(end - start).toFixed(3)}s)`);

  // Only release on success — a crash leaves the lease in place so it goes
  // stale (see checkLeaseStatus) instead of silently vanishing, which is
  // what lets --render-id resume find it and --force-stale-lock take it
  // over deliberately rather than by accident.
  lease.release();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
