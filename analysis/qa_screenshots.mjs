import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";
const OUT_DIR = "screenshots";
const WIDTH = 1920;
const HEIGHT = 1080;

// QA timestamps: chapter starts/mids/ends, restraint windows, singular
// events. Derived from docs/cue-sheet.md and docs/creative-bible.md — not
// arbitrary round numbers.
const QA_TIMES = [
  { label: "ch1_emergence_arrival", t: 1.0 },
  { label: "ch1_emergence_transform", t: 60.0 },
  { label: "ch1_emergence_departure_dip", t: 140.0 },
  { label: "ch2_firstdrive_arrival", t: 160.0 },
  { label: "ch2_firstdrive_transform_peak", t: 380.0 },
  { label: "ch2_firstdrive_departure", t: 495.0 },
  { label: "ch3_contraction_arrival", t: 520.0 },
  { label: "ch3_contraction_R1_restraint_mid", t: 780.0 },
  { label: "ch3_contraction_departure", t: 805.0 },
  { label: "ch4_reignition_arrival", t: 830.0 },
  { label: "ch4_reignition_transform", t: 1000.0 },
  { label: "ch4_flash_event_before", t: 1067.1 },
  { label: "ch4_flash_event_peak", t: 1067.19 },
  { label: "ch4_flash_event_after", t: 1067.3 },
  { label: "ch5_seconddrift_arrival", t: 1090.0 },
  { label: "ch5_seconddrift_dip", t: 1290.0 },
  { label: "ch5_seconddrift_departure", t: 1440.0 },
  { label: "ch6_widening_arrival", t: 1470.0 },
  { label: "ch6_widening_macro_insert", t: 1730.0 },
  { label: "ch6_widening_departure_wide", t: 1960.0 },
  { label: "ch7_fracture_arrival", t: 2000.0 },
  { label: "ch7_fracture_R2_restraint", t: 2200.0 },
  { label: "ch7_fracture_R3_restraint", t: 2300.0 },
  { label: "ch7_fracture_departure", t: 2345.0 },
  { label: "ch8_synthesis_arrival", t: 2360.0 },
  { label: "ch8_synthesis_bleed_mid", t: 2420.0 },
  { label: "ch8_synthesis_climax_peak", t: 2482.0 },
  { label: "ch9_departure_collapse", t: 2495.0 },
  { label: "ch9_departure_silence", t: 2523.0 },
];

// v2 Phase 9: "create a new contact sheet with many more samples" — the
// curated list above targets specific documented events; this dense grid
// (every ~85s) catches chapter-internal variety (shot-type changes, form-
// blend progression, audio-driven micro modulation) the curated list isn't
// specifically aimed at.
const DENSE_GRID_STEP = 85.0;
const DURATION_APPROX = 2526.93;
for (let t = 20; t < DURATION_APPROX; t += DENSE_GRID_STEP) {
  QA_TIMES.push({ label: `dense_t${Math.round(t)}`, t });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_READY__ === true, { timeout: 30000 });
  // let the shader/GL context settle
  await new Promise((r) => setTimeout(r, 300));

  const manifest = [];
  for (const { label, t } of QA_TIMES) {
    const state = await page.evaluate((tt) => {
      window.__AUUH_RENDER_AT__(tt);
      return true;
    }, t);
    await new Promise((r) => setTimeout(r, 60)); // settle a frame
    const hud = await page.evaluate(() => document.getElementById("hud").textContent);
    const file = path.join(OUT_DIR, `${label}_t${t.toFixed(2)}.png`);
    await page.screenshot({ path: file });
    manifest.push({ label, t, file, hud });
    console.log(`captured ${label} @ ${t}s -> ${file}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`done: ${manifest.length} screenshots`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
