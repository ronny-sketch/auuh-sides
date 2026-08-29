import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";
const DURATION = 2526.934785;

// Phase 9: automated visual checks across a dense sample of the timeline.
// These catch classes of failure a 29-frame human contact-sheet review can
// miss. Pixel stats come from ffmpeg's signalstats filter on the actual
// captured PNG (page.screenshot(), a compositor-level capture) — NOT an
// in-page canvas readback (drawImage/getImageData from the WebGL canvas),
// which returned blank/black for every frame here because the renderer
// uses the default preserveDrawingBuffer:false. This is the identical
// gotcha already hit once this session with canvas.toDataURL() in the
// seek-determinism test — same fix applies: read back via the compositor,
// not via in-page JS.
const N_SAMPLES = 150;
const TMP = "analysis/_check_frame.png";

function signalStats(pngPath) {
  // signalstats attaches per-frame metadata but doesn't print it to stderr
  // on its own — it has to be chained with metadata=print, and the keys
  // are lavfi.signalstats.YAVG (not "YAVG:") once printed. Verified
  // against a real captured frame before trusting this in the loop below.
  const out = execSync(`ffmpeg -y -i "${pngPath}" -vf "signalstats,metadata=print" -f null - 2>&1`, {
    encoding: "utf8",
  });
  const yavg = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(out);
  const ymin = /lavfi\.signalstats\.YMIN=([\d.]+)/.exec(out);
  const ymax = /lavfi\.signalstats\.YMAX=([\d.]+)/.exec(out);
  return {
    yavg: yavg ? parseFloat(yavg[1]) : null,
    ymin: ymin ? parseFloat(ymin[1]) : null,
    ymax: ymax ? parseFloat(ymax[1]) : null,
  };
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--window-size=480,270"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 270, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_READY__ === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 200));

  const issues = [];
  const frameTimesMs = [];
  let prevMs = null;
  const frameTimeSpikes = [];

  for (let i = 0; i < N_SAMPLES; i++) {
    const t = (i / N_SAMPLES) * DURATION;
    const start = Date.now();
    await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), t);
    await page.screenshot({ path: TMP });
    const elapsed = Date.now() - start;
    frameTimesMs.push(elapsed);
    if (prevMs !== null && elapsed > prevMs * 3 && elapsed > 800) {
      frameTimeSpikes.push({ t, elapsedMs: elapsed, prevMs });
    }
    prevMs = elapsed;

    const stats = signalStats(TMP);
    if (stats.yavg === null) {
      issues.push({ t, type: "unreadable frame (ffmpeg signalstats failed)", detail: stats });
      continue;
    }
    if (Number.isNaN(stats.yavg)) {
      issues.push({ t, type: "NaN luma (shader NaN propagation)", detail: stats });
    }
    if (stats.yavg < 1.0 && stats.ymax < 2) {
      issues.push({ t, type: "near-all-black frame", detail: stats });
    }
    if (stats.yavg > 250 && stats.ymin > 240) {
      issues.push({ t, type: "excessive white clipping", detail: stats });
    }
  }

  await browser.close();
  fs.rmSync(TMP, { force: true });

  const avgFrameMs = frameTimesMs.reduce((a, b) => a + b, 0) / frameTimesMs.length;
  const report = {
    nSamples: N_SAMPLES,
    avgFrameMs,
    frameTimeSpikes,
    issues,
    pass: issues.length === 0,
  };
  fs.writeFileSync("analysis/automated_checks_result.json", JSON.stringify(report, null, 2));

  console.log(`sampled ${N_SAMPLES} timestamps, avg render+capture ${avgFrameMs.toFixed(0)}ms`);
  console.log(`frame-time spikes (>3x prev, >800ms): ${frameTimeSpikes.length}`);
  console.log(`issues found: ${issues.length}`);
  for (const issue of issues) {
    console.log(`  t=${issue.t.toFixed(1)}  ${issue.type}  ${JSON.stringify(issue.detail)}`);
  }
  console.log(report.pass ? "\nPASS" : "\nISSUES DETECTED — see analysis/automated_checks_result.json");
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
