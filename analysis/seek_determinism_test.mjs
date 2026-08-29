import puppeteer from "puppeteer-core";
import fs from "node:fs";
import crypto from "node:crypto";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";

// Test: rendering directly at target time T must produce the same frame as
// arriving at T by stepping through many smaller increments from 0 — this
// is the whole point of making params/camera pure functions of t instead
// of frame-accumulators (see core/camera.js comment on azimuthAt()).
const TARGETS = [160.0, 809.82, 1067.19, 1730.0, 2200.0, 2482.0];
const STEP = 0.37; // deliberately not a clean divisor of anything

async function captureBase64(page) {
  // canvas.toDataURL() is unreliable here without preserveDrawingBuffer
  // (WebGL clears/swaps its backbuffer between calls) and produced a false
  // "pass" — every timestamp hashed identically to the same stale buffer.
  // page.screenshot() is a compositor-level capture and is what the QA
  // screenshot script uses successfully, so use the same method here.
  return page.screenshot({ encoding: "base64" });
}

function sha(dataUrl) {
  return crypto.createHash("sha256").update(dataUrl).digest("hex");
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--window-size=640,360"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 200));

  const results = [];
  for (const target of TARGETS) {
    // direct seek
    await page.evaluate((t) => window.__AUUH_RENDER_AT__(t), target);
    await new Promise((r) => setTimeout(r, 30));
    const directHash = sha(await captureBase64(page));

    // stepped arrival
    let t = 0;
    while (t < target) {
      await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), t);
      t = Math.min(target, t + STEP);
    }
    await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), target);
    await new Promise((r) => setTimeout(r, 30));
    const steppedHash = sha(await captureBase64(page));

    const pass = directHash === steppedHash;
    results.push({ target, directHash, steppedHash, pass });
    console.log(`t=${target}  direct=${directHash.slice(0, 12)}  stepped=${steppedHash.slice(0, 12)}  ${pass ? "PASS" : "FAIL"}`);
  }

  await browser.close();
  const allPass = results.every((r) => r.pass);
  fs.writeFileSync("analysis/seek_determinism_result.json", JSON.stringify({ allPass, results }, null, 2));
  console.log(allPass ? "\nALL PASS" : "\nFAILURES DETECTED");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
