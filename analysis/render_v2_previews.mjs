import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";
const FPS = 15;
const WIDTH = 1280;
const HEIGHT = 720;
// Efficient sequential rendering: for a contiguous clip, warm up the
// feedback buffer ONCE at the clip start (via __AUUH_RENDER_AT__, which
// resets+warms), then step through every subsequent frame with
// __AUUH_RENDER_SEQUENTIAL__ (no reset/warm-up per frame) — this is what
// "master sequential mode" is for (docs/v2-plan.md Phase 6/10) and avoids
// redoing a ~90-frame warm-up for every single frame of an already-
// contiguous clip, which the original per-frame __AUUH_RENDER_AT__ preview
// renderer did and made this dramatically slower than necessary.
const CLIPS = [
  // one representative window per chapter (Phase 9: "15-30s preview for
  // every major chapter")
  { name: "ch0_emergence", start: 8, dur: 18 },
  { name: "ch1_firstdrive", start: 160, dur: 18 },
  { name: "ch2_contraction_restraint", start: 778, dur: 18 },
  { name: "ch3_reignition", start: 1000, dur: 18 },
  { name: "ch4_seconddrift", start: 1100, dur: 18 },
  { name: "ch5_widening_macro", start: 1700, dur: 18 },
  { name: "ch6_fracture", start: 2000, dur: 18 },
  { name: "ch7_synthesis_bleed", start: 2400, dur: 18 },
  { name: "ch8_departure_climax", start: 2482, dur: 18 },
  // major transitions/events (re-rendered fresh against the v2 stack)
  { name: "transition_flash_1067", start: 1064, dur: 6 },
  { name: "transition_fracture_entry_1980", start: 1977, dur: 6 },
  { name: "transition_climax_2482", start: 2479, dur: 8 },
];

async function renderClip(page, clip, outDir) {
  const { start, dur } = clip;
  const nFrames = Math.round(dur * FPS);
  const frameDir = `${outDir}/${clip.name}_frames`;
  fs.mkdirSync(frameDir, { recursive: true });

  // trigger the reset+warm-up at the clip's actual start time...
  await page.evaluate((t) => window.__AUUH_RENDER_AT__(t), start);
  // ...then continue the SAME (now-warmed) feedback buffer forward frame by
  // frame with the cheap sequential path.
  for (let i = 0; i < nFrames; i++) {
    const t = start + i / FPS;
    if (i > 0) await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);
    await page.screenshot({ path: `${frameDir}/f${String(i).padStart(4, "0")}.png` });
  }

  const outFile = `${outDir}/${clip.name}.mp4`;
  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${frameDir}/f%04d.png" ` +
      `-ss ${start} -t ${dur} -i audio/AUUH.m4a ` +
      `-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${outFile}" -hide_banner -loglevel error`
  );
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`rendered ${outFile} (${nFrames} frames, ${dur}s, start=${start})`);
}

async function main() {
  const outDir = "previews/v2";
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_READY__ === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 300));

  for (const clip of CLIPS) {
    await renderClip(page, clip, outDir);
  }

  await browser.close();
  console.log("all v2 preview clips rendered");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
