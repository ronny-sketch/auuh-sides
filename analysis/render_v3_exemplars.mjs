// V3 Phase 13 (docs/v3-creative-direction.md): "DO NOT render all 42 minutes
// yet. First render: one 20-30s exemplar for SHELL / CHAMBER / FIELD / ECHO
// / a restraint passage / 17:47 pivot / Fracture / 39:14+ Synthesis / 41:22
// climax / ending." Rendered with ?hud=off so composition can be judged
// without the debug overlay (see docs/v3-creative-direction.md §1).
//
// Same efficient-sequential-rendering pattern as render_v2_previews.mjs:
// one reset+warm-up at the clip's start (__AUUH_RENDER_AT__), then step
// forward with __AUUH_RENDER_SEQUENTIAL__ so the feedback ring only warms
// up once per clip, not once per frame.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "5174";
const BASE_URL = `http://localhost:${PORT}/?headless&hud=off`;
const FPS = 15;
const WIDTH = 1280;
const HEIGHT = 720;

const CLIPS = [
  { name: "shell_firstdrive", start: 160, dur: 24 },
  { name: "chamber_rupture_1747", start: 1054, dur: 28 },
  { name: "field_widening", start: 1698, dur: 24 },
  { name: "echo_synthesis", start: 2408, dur: 22 },
  { name: "restraint_R1", start: 752, dur: 24 },
  { name: "fracture_ch6", start: 2010, dur: 24 },
  { name: "synthesis_3914", start: 2356, dur: 24 },
  { name: "climax_4122", start: 2470, dur: 24 },
  { name: "ending", start: 2494, dur: 33 },
];

async function renderClip(page, clip, outDir) {
  const { start, dur } = clip;
  const nFrames = Math.round(dur * FPS);
  const frameDir = `${outDir}/${clip.name}_frames`;
  fs.mkdirSync(frameDir, { recursive: true });

  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  page.on("console", onConsole);

  await page.evaluate((t) => window.__AUUH_RENDER_AT__(t), start);
  for (let i = 0; i < nFrames; i++) {
    const t = start + i / FPS;
    if (i > 0) await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);
    await page.screenshot({ path: `${frameDir}/f${String(i).padStart(4, "0")}.png` });
  }

  page.off("console", onConsole);
  if (consoleErrors.length) {
    console.warn(`[${clip.name}] ${consoleErrors.length} console errors, e.g.: ${consoleErrors[0]}`);
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
  const outDir = "previews/v3";
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

  const only = process.argv[2];
  const clips = only ? CLIPS.filter((c) => c.name === only) : CLIPS;
  if (only && clips.length === 0) {
    console.error(`No clip named "${only}". Options: ${CLIPS.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }

  for (const clip of clips) {
    await renderClip(page, clip, outDir);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
