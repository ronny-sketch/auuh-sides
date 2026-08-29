import puppeteer from "puppeteer-core";
import fs from "node:fs";
import crypto from "node:crypto";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";

// v2 note: __AUUH_RENDER_AT__(t) now always does reset() + warmUp(t-3, t)
// + render(t) (see main.js / core/FeedbackPipeline.js) — it is already
// deterministic BY CONSTRUCTION as long as getParams/CameraRig/memoryDrift
// stay pure functions of t, since it never depends on what was rendered
// before the call. The old test simulated "arriving by playing through
// many small steps" and compared that to a direct seek — with warm-up now
// costing ~90 extra render() calls per __AUUH_RENDER_AT__ call, repeating
// that call thousands of times to simulate stepping from t=0 is enormously
// wasteful and doesn't test anything the new construction doesn't already
// guarantee. The meaningful test instead: call __AUUH_RENDER_AT__(t) for
// several timestamps in one order, then again in a DIFFERENT order (with
// unrelated renders interleaved) in a fresh navigation, and confirm each
// t produces byte-identical output regardless of call history — this is
// what would actually catch hidden state leaking between calls.
const TARGETS = [160.0, 809.82, 1067.19, 1730.0, 2200.0, 2482.0];

async function captureBase64(page) {
  return page.screenshot({ encoding: "base64" });
}

function sha(dataUrl) {
  return crypto.createHash("sha256").update(dataUrl).digest("hex");
}

async function renderSequence(page, order) {
  const hashes = {};
  for (const t of order) {
    await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), t);
    await new Promise((r) => setTimeout(r, 30));
    hashes[t] = sha(await captureBase64(page));
  }
  return hashes;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--window-size=640,360"],
  });

  const page1 = await browser.newPage();
  await page1.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
  await page1.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page1.waitForFunction(() => window.__AUUH_READY__ === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 200));
  const forwardOrder = [...TARGETS];
  const hashesForward = await renderSequence(page1, forwardOrder);
  await page1.close();

  // Fresh navigation, reversed call order, with a couple of unrelated
  // renders interleaved — if any state were leaking between calls instead
  // of being fully reset each time, this order would produce different
  // pixels for the same t.
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
  await page2.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page2.waitForFunction(() => window.__AUUH_READY__ === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 200));
  await page2.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), 50.0); // unrelated warm-up noise
  const reverseOrder = [...TARGETS].reverse();
  const hashesReverse = await renderSequence(page2, reverseOrder);
  await browser.close();

  const results = TARGETS.map((t) => ({
    t,
    forward: hashesForward[t].slice(0, 12),
    reverse: hashesReverse[t].slice(0, 12),
    pass: hashesForward[t] === hashesReverse[t],
  }));

  for (const r of results) {
    console.log(`t=${r.t}  forward=${r.forward}  reverse=${r.reverse}  ${r.pass ? "PASS" : "FAIL"}`);
  }

  const allPass = results.every((r) => r.pass);
  fs.writeFileSync("analysis/seek_determinism_result.json", JSON.stringify({ allPass, results }, null, 2));
  console.log(allPass ? "\nALL PASS" : "\nFAILURES DETECTED");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
