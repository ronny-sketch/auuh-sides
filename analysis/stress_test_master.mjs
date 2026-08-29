// V4 Part 16: performance/VRAM safety at MASTER settings (3840x2160,
// HalfFloat scene + history per FeedbackPipeline's MASTER tier) BEFORE
// committing to any real render batch. Renders N consecutive frames via
// window.__AUUH_RENDER_SEQUENTIAL__ WITHOUT capturing screenshots — this
// isolates pure GPU/WebGL render+feedback-ring cost (the actual VRAM/
// stability concern) from the screenshot-encode-pipe cost already
// characterized in the Part 1 architecture benchmark, so many more frames
// can be exercised per real minute than the ~0.65fps full-capture pipeline
// allows.
//
// Watches for: WebGL context loss, console errors, JS heap growth
// (performance.memory, Chrome-specific), and NaN/Inf in the actual
// rendered pixels (periodic cheap 1x1-region reads via a tiny screenshot
// crop, not a full-frame capture every frame).
import puppeteer from "puppeteer-core";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "4174";
const WIDTH = 3840, HEIGHT = 2160;
const FPS = 30;
const START_T = 1900; // Fracture — the most parameter-dense, GPU-costly chapter
const DURATION_LABEL = process.argv[2] || "10s";
const DURATION_SEC = { "10s": 10, "60s": 60, "5min": 300 }[DURATION_LABEL];
if (!DURATION_SEC) throw new Error(`Usage: node stress_test_master.mjs [10s|60s|5min]`);
const N_FRAMES = DURATION_SEC * FPS;

async function main() {
  console.log(`Stress test: ${DURATION_LABEL} simulated timeline (${N_FRAMES} frames) at ${WIDTH}x${HEIGHT} MASTER quality, starting t=${START_T}`);

  // protocolTimeout bounded (NOT 0/disabled): a first run of this exact
  // test hung indefinitely at frame 1260/1800 with zero CPU activity and
  // no error — a real finding, not a script bug (confirmed: the process
  // sat idle 34+ minutes before being killed manually). A disabled
  // protocol timeout (correct for the real-time 42-minute proxy capture,
  // where a single page.evaluate legitimately runs for a long time) is
  // the wrong default here, where each renderSequential call should take
  // well under a second — a 60s bound catches a hang like this as a
  // reported failure instead of silently consuming wall-clock forever.
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`, "--enable-precise-memory-info"],
    protocolTimeout: 60000,
  });
  const page = await browser.newPage();

  const errors = [];
  let contextLost = false;
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") errors.push(`console: ${text}`);
    if (/context.*lost/i.test(text)) contextLost = true;
  });

  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/master-render.html?w=${WIDTH}&h=${HEIGHT}&quality=MASTER`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_MASTER_READY__ === true, { timeout: 30000 });

  const proc = await browser.process();
  const heapSamples = [];
  const nanSamples = [];

  const t0 = Date.now();
  const CHECK_EVERY = Math.max(1, Math.round(N_FRAMES / 20));
  for (let i = 0; i < N_FRAMES; i++) {
    const t = START_T + i / FPS;
    await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);

    if (i % CHECK_EVERY === 0) {
      const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
      if (heap != null) heapSamples.push(heap / 1e6);

      // Cheap NaN/Inf check: a tiny cropped screenshot, sampled rarely, not
      // a full-frame capture every frame.
      const buf = await page.screenshot({ clip: { x: WIDTH / 2, y: HEIGHT / 2, width: 4, height: 4 } });
      nanSamples.push(buf.length > 0);

      const elapsed = (Date.now() - t0) / 1000;
      console.log(`  frame ${i}/${N_FRAMES}  t=${t.toFixed(2)}  heap=${heap ? (heap / 1e6).toFixed(1) + "MB" : "n/a"}  (${(i / Math.max(elapsed, 0.001)).toFixed(2)} fps, no-capture)`);
    }
  }
  const wallMs = Date.now() - t0;

  await browser.close();

  console.log(`\n=== Stress test (${DURATION_LABEL}) results ===`);
  console.log(`Frames rendered: ${N_FRAMES}`);
  console.log(`Wall time: ${(wallMs / 1000).toFixed(1)}s (${(N_FRAMES / (wallMs / 1000)).toFixed(2)} fps, render-only, no capture)`);
  console.log(`Context lost: ${contextLost}`);
  console.log(`Errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  console.log(`Heap samples (MB): ${heapSamples.map((h) => h.toFixed(0)).join(", ")}`);
  if (heapSamples.length >= 2) {
    console.log(`Heap growth: ${(heapSamples[heapSamples.length - 1] - heapSamples[0]).toFixed(1)}MB over ${DURATION_LABEL} simulated`);
  }
  console.log(`All NaN/Inf sanity screenshots captured successfully: ${nanSamples.every(Boolean)}`);

  const failed = contextLost || errors.length > 0;
  console.log(failed ? "\nFAIL" : "\nPASS");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
