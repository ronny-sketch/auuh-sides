// V3.5 item 8: drives proxy-record.html to capture the director-review
// PROXY in real time (audio + rAF playback + MediaRecorder), NOT via the
// expensive deterministic per-frame screenshot pipeline used for exemplar
// clips. See src/proxy-record.js's header comment for the full reasoning.
//
// Usage:
//   node analysis/render_director_proxy.mjs                 # full 42:06.9
//   node analysis/render_director_proxy.mjs <start> <end>    # validation range
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "5173";
const BASE_URL = `http://localhost:${PORT}/proxy-record.html`;
const DL_DIR = path.resolve("analysis/_proxy_download");
const OUT_DIR = "reviews";
const OUT_NAME = process.env.AUUH_PROXY_NAME || "AUUH_v3_5_director_proxy";

const startArg = process.argv[2] != null ? parseFloat(process.argv[2]) : null;
const endArg = process.argv[3] != null ? parseFloat(process.argv[3]) : null;

function waitForStableFile(filePath, { pollMs = 1000, stableChecks = 3, timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let lastSize = -1;
    let stableCount = 0;
    const start = Date.now();
    const iv = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error(`Timed out waiting for ${filePath} to appear/stabilize`));
        return;
      }
      if (!fs.existsSync(filePath)) return;
      const size = fs.statSync(filePath).size;
      if (size === lastSize && size > 0) {
        stableCount++;
        if (stableCount >= stableChecks) {
          clearInterval(iv);
          resolve();
        }
      } else {
        stableCount = 0;
        lastSize = size;
      }
    }, pollMs);
  });
}

async function main() {
  fs.rmSync(DL_DIR, { recursive: true, force: true });
  fs.mkdirSync(DL_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    protocolTimeout: 0, // defensive: __START_PROXY_RECORDING__ itself no longer blocks a CDP call for 42 minutes (see its comment), but this removes the whole class of "long automation vs. Puppeteer's default ~3min protocol timeout" risk for any other CDP interaction during a long run
    args: [
      "--window-size=1280,720",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream", // no-op here but harmless; avoids any permission prompt path
    ],
  });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.warn("[page console error]", msg.text());
  });
  page.on("pageerror", (err) => console.warn("[pageerror]", err.message));

  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DL_DIR });

  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__PROXY_READY__ === true, { timeout: 30000 });

  const start = startArg ?? 0;
  const wallMinutesEstimate = endArg != null ? (endArg - start) / 60 : "~42";
  console.log(`Recording ${start}s -> ${endArg ?? "DURATION"} (real-time, ~${wallMinutesEstimate} min wall clock)...`);

  await page.evaluate(
    (s, e) => window.__START_PROXY_RECORDING__(s, e ?? undefined),
    start,
    endArg
  );
  await page.waitForFunction(() => window.__PROXY_DONE__ === true, { timeout: 0 });

  const rawPath = path.join(DL_DIR, "director_proxy_raw.webm");
  await waitForStableFile(rawPath);
  console.log(`Raw capture complete: ${rawPath} (${(fs.statSync(rawPath).size / 1e6).toFixed(1)} MB)`);

  await browser.close();

  const outPath = path.join(OUT_DIR, `${OUT_NAME}.mp4`);
  execSync(
    `ffmpeg -y -i "${rawPath}" -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k "${outPath}" -hide_banner -loglevel error`
  );
  console.log(`Transcoded: ${outPath}`);

  const probe = execSync(
    `ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "${outPath}"`
  ).toString();
  console.log(probe);

  fs.rmSync(DL_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
