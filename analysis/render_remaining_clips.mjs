import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";
const FPS = 15;
const WIDTH = 1280;
const HEIGHT = 720;

const CLIPS = [
  { name: "restraint_R1_entry_750", center: 750.17, before: 3.0, after: 3.0 },
  { name: "climax_2482", center: 2482.0, before: 3.0, after: 3.0 },
];

async function renderClip(page, clip, outDir) {
  const start = Math.max(0, clip.center - clip.before);
  const end = clip.center + clip.after;
  const nFrames = Math.round((end - start) * FPS);
  const frameDir = `${outDir}/${clip.name}_frames`;
  fs.mkdirSync(frameDir, { recursive: true });

  for (let i = 0; i < nFrames; i++) {
    const t = start + i / FPS;
    await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), t);
    await page.screenshot({ path: `${frameDir}/f${String(i).padStart(4, "0")}.png` });
  }

  const outFile = `${outDir}/${clip.name}.mp4`;
  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${frameDir}/f%04d.png" ` +
      `-ss ${start} -t ${end - start} -i audio/AUUH.m4a ` +
      `-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${outFile}" -hide_banner -loglevel error`
  );
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`rendered ${outFile} (${nFrames} frames, ${(end - start).toFixed(1)}s, center=${clip.center})`);
}

async function main() {
  const outDir = "previews";
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));

  for (const clip of CLIPS) {
    await renderClip(page, clip, outDir);
  }

  await browser.close();
  console.log("remaining preview clips rendered");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
