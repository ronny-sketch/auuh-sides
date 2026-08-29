// V3.5 item 8: "generate a timestamped shot/event manifest beside" the
// director-review proxy. Uses director.html's introspection hooks
// (__AUUH_SHOT_SEGMENTS__/__AUUH_META__/__AUUH_STATE_AT__ — see the end of
// src/director-review.js's init()) rather than rendering anything: the
// shot list is already a precomputed, deterministic table
// (CameraDirector.shotSegments), so this just evaluates the FULL state at
// each segment's start instant and serializes it, plus the restraint
// windows and exceptional events pulled directly from timeline.js/
// MusicalDirector. No screenshots, no video — this runs in seconds, not
// minutes.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "5173";
const BASE_URL = `http://localhost:${PORT}/director.html`;
const OUT_PATH = process.env.AUUH_MANIFEST_OUT || "reviews/AUUH_v3_5_director_proxy.manifest.json";

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: "new", args: ["--window-size=800,600"] });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.warn("[pageerror]", err.message));
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_DIRECTOR_READY__ === true, { timeout: 30000 });

  const segments = await page.evaluate(() => window.__AUUH_SHOT_SEGMENTS__());
  const meta = await page.evaluate(() => window.__AUUH_META__());

  const shots = [];
  for (const seg of segments) {
    const evalT = Math.min(seg.start + 0.05, seg.end - 0.001);
    const state = await page.evaluate((t) => window.__AUUH_STATE_AT__(t), evalT);
    shots.push({
      start: Number(seg.start.toFixed(2)),
      end: Number(seg.end.toFixed(2)),
      durationSec: Number((seg.end - seg.start).toFixed(2)),
      shot: state.shot,
      transition: state.transition,
      chapter: state.chapter,
      scene: state.scene,
      sceneState: state.sceneState,
      light: state.light,
      material: state.material,
      chamberInteriorActive: state.chamberInteriorActive,
      meso: state.meso
        ? {
            track: state.meso.track,
            tensionState: state.meso.tensionState,
            densityState: state.meso.densityState,
            exceptionalEvent: state.meso.exceptionalEvent,
            exceptionalEventConfidence: state.meso.exceptionalEventConfidence,
          }
        : null,
    });
  }

  await browser.close();

  const events = [
    ...meta.restraintWindows.map((w) => ({ type: "RESTRAINT", id: w.id, start: w.start, end: w.end })),
    ...meta.exceptionalEvents.map((e) => ({ type: "EXCEPTIONAL_EVENT", id: e.id, t: e.t, confidence: e.confidence, label: e.label })),
  ].sort((a, b) => (a.start ?? a.t) - (b.start ?? b.t));

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalShots: shots.length,
    shots,
    events,
  };

  fs.mkdirSync("reviews", { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${OUT_PATH} (${shots.length} shots, ${events.length} events)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
