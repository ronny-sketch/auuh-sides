// V4 Part 1: benchmarks feasible master-render capture architectures on a
// 10s representative section at MASTER settings (3840x2160, 30fps).
//
// Architecture B (WebCodecs VideoEncoder) was eliminated at the feasibility
// gate before this script was written: `typeof VideoEncoder` is
// `"undefined"` in this Puppeteer-driven headless Chrome (Chrome 151,
// checked both with and without GPU/feature flags) — not a config-support
// failure, a hard API absence. Not benchmarked further; see docs/v4-
// mastering-audit.md.
//
// A) direct framebuffer capture: gl.readPixels() in-page -> fetch() POST
//    to a local Node HTTP sink -> piped straight into ffmpeg's stdin as
//    rawvideo. No image encode/decode generation.
// B) (eliminated, see above)
// C) deterministic screenshot pipe: page.screenshot({encoding:'binary'})
//    -> ffmpeg's stdin via the image2pipe/png demuxer. No PNGs ever
//    touch disk (the anti-pattern this brief explicitly rejects), but
//    every frame still pays a PNG encode (in Chrome) + decode (in ffmpeg).
import puppeteer from "puppeteer-core";
import http from "node:http";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import fs from "node:fs";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "4174"; // static preview server — see docs/v3-5-director-review-guide.md's HMR-reload incident
const WIDTH = 3840;
const HEIGHT = 2160;
const FPS = 30;
const START = 1060.0; // 17:47 rupture approach — a "difficult" scene per the brief's own list
const DURATION_S = 10.0;
const N_FRAMES = Math.round(DURATION_S * FPS);
const OUT_DIR = "analysis/_benchmark_output";

function sampleProcess(pid) {
  try {
    const out = execSync(`ps -o rss=,pcpu= -p ${pid}`).toString().trim();
    const [rssKb, pcpu] = out.split(/\s+/).map(Number);
    return { rssMb: rssKb / 1024, cpuPct: pcpu };
  } catch {
    return null;
  }
}

async function benchArchitectureA() {
  console.log("\n=== Architecture A: gl.readPixels -> HTTP POST -> ffmpeg stdin (rawvideo) ===");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = `${OUT_DIR}/arch_a.mp4`;

  const ffmpeg = spawn("ffmpeg", [
    "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${WIDTH}x${HEIGHT}`, "-r", String(FPS),
    "-i", "pipe:0",
    "-vf", "vflip", // gl.readPixels rows are bottom-up
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    outFile,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffmpegErr = "";
  ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));

  let framesReceived = 0;
  const server = http.createServer((req, res) => {
    // CORS: the page is served from the preview server's origin
    // (localhost:PORT); this sink listens on a different port, so a raw
    // fetch() POST is cross-origin and needs explicit CORS headers or
    // Chrome blocks it with "Failed to fetch" before the request ever
    // leaves the page (confirmed empirically — not assumed).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      ffmpeg.stdin.write(buf);
      framesReceived++;
      res.writeHead(200);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sinkPort = server.address().port;

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
    protocolTimeout: 0,
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.warn("[pageerror]", err.message));
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/master-render.html?w=${WIDTH}&h=${HEIGHT}&quality=MASTER`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_MASTER_READY__ === true, { timeout: 30000 });

  const proc = await browser.process();
  const samples = [];
  const sampleTimer = setInterval(() => {
    const s = sampleProcess(proc.pid);
    if (s) samples.push(s);
  }, 500);

  const t0 = Date.now();
  for (let i = 0; i < N_FRAMES; i++) {
    const t = START + i / FPS;
    await page.evaluate((tt, url) => window.__AUUH_RENDER_AND_SEND__(tt, url), t, `http://127.0.0.1:${sinkPort}/`);
  }
  const wallMs = Date.now() - t0;
  clearInterval(sampleTimer);

  await browser.close();
  server.close();
  ffmpeg.stdin.end();
  await new Promise((resolve) => ffmpeg.on("close", resolve));

  const outSize = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const outDuration = outSize > 0 ? execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outFile}"`).toString().trim() : "N/A";

  return {
    architecture: "A (readPixels -> HTTP -> ffmpeg rawvideo)",
    framesRequested: N_FRAMES,
    framesReceivedBySink: framesReceived,
    wallTimeMs: wallMs,
    fps: (N_FRAMES / (wallMs / 1000)).toFixed(2),
    avgRssMb: samples.length ? (samples.reduce((a, s) => a + s.rssMb, 0) / samples.length).toFixed(0) : null,
    peakRssMb: samples.length ? Math.max(...samples.map((s) => s.rssMb)).toFixed(0) : null,
    avgCpuPct: samples.length ? (samples.reduce((a, s) => a + s.cpuPct, 0) / samples.length).toFixed(0) : null,
    outputFileSizeMb: (outSize / 1e6).toFixed(1),
    outputDurationSec: outDuration,
    ffmpegErrors: ffmpegErr.slice(-2000) || null,
  };
}

async function benchArchitectureC() {
  console.log("\n=== Architecture C: page.screenshot() -> ffmpeg stdin (image2pipe/png) ===");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = `${OUT_DIR}/arch_c.mp4`;

  const ffmpeg = spawn("ffmpeg", [
    "-y", "-f", "image2pipe", "-c:v", "png", "-r", String(FPS),
    "-i", "pipe:0",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    outFile,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffmpegErr = "";
  ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
    protocolTimeout: 0,
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.warn("[pageerror]", err.message));
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/master-render.html?w=${WIDTH}&h=${HEIGHT}&quality=MASTER`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_MASTER_READY__ === true, { timeout: 30000 });

  const proc = await browser.process();
  const samples = [];
  const sampleTimer = setInterval(() => {
    const s = sampleProcess(proc.pid);
    if (s) samples.push(s);
  }, 500);

  let framesReceived = 0;
  const t0 = Date.now();
  for (let i = 0; i < N_FRAMES; i++) {
    const t = START + i / FPS;
    await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);
    const png = await page.screenshot({ encoding: "binary" });
    ffmpeg.stdin.write(png);
    framesReceived++;
  }
  const wallMs = Date.now() - t0;
  clearInterval(sampleTimer);

  await browser.close();
  ffmpeg.stdin.end();
  await new Promise((resolve) => ffmpeg.on("close", resolve));

  const outSize = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const outDuration = outSize > 0 ? execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outFile}"`).toString().trim() : "N/A";

  return {
    architecture: "C (page.screenshot PNG -> ffmpeg image2pipe)",
    framesRequested: N_FRAMES,
    framesReceivedBySink: framesReceived,
    wallTimeMs: wallMs,
    fps: (N_FRAMES / (wallMs / 1000)).toFixed(2),
    avgRssMb: samples.length ? (samples.reduce((a, s) => a + s.rssMb, 0) / samples.length).toFixed(0) : null,
    peakRssMb: samples.length ? Math.max(...samples.map((s) => s.rssMb)).toFixed(0) : null,
    avgCpuPct: samples.length ? (samples.reduce((a, s) => a + s.cpuPct, 0) / samples.length).toFixed(0) : null,
    outputFileSizeMb: (outSize / 1e6).toFixed(1),
    outputDurationSec: outDuration,
    ffmpegErrors: ffmpegErr.slice(-2000) || null,
  };
}

async function main() {
  const resultA = await benchArchitectureA();
  console.log(JSON.stringify(resultA, null, 2));
  const resultC = await benchArchitectureC();
  console.log(JSON.stringify(resultC, null, 2));

  fs.writeFileSync(
    `${OUT_DIR}/benchmark_results.json`,
    JSON.stringify({ generatedAt: new Date().toISOString(), width: WIDTH, height: HEIGHT, fps: FPS, testSection: { start: START, durationSec: DURATION_S }, results: [resultA, resultC] }, null, 2)
  );
  console.log(`\nWrote ${OUT_DIR}/benchmark_results.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
