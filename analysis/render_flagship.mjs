import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";
const FPS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

// Flagship preview: Synthesis's climb into the true climax, through the
// collapse to silence — the strongest single span to judge finding
// "does the ending transform the meaning of the opening" against, since
// it contains the piece's global RMS peak (2482.0s), the full color
// arrival/drain, and the final return to near-silence.
const START = 2460.0;
const END = 2510.0;

async function main() {
  const outDir = "previews";
  const frameDir = `${outDir}/flagship_frames`;
  fs.mkdirSync(frameDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));

  const nFrames = Math.round((END - START) * FPS);
  for (let i = 0; i < nFrames; i++) {
    const t = START + i / FPS;
    await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), t);
    await page.screenshot({ path: `${frameDir}/f${String(i).padStart(5, "0")}.png` });
    if (i % 100 === 0) console.log(`frame ${i}/${nFrames}  t=${t.toFixed(2)}`);
  }
  await browser.close();

  const outFile = `${outDir}/flagship_climax_to_silence.mp4`;
  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${frameDir}/f%05d.png" ` +
      `-ss ${START} -t ${END - START} -i audio/AUUH.m4a ` +
      `-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest "${outFile}" -hide_banner -loglevel error`
  );
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`rendered ${outFile} (${nFrames} frames, ${(END - START).toFixed(1)}s @ ${FPS}fps, ${WIDTH}x${HEIGHT})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
