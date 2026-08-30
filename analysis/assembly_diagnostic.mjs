// V3.9 Part 8 — the most important test before video. uAssembly has only
// been code-verified (main.frag.js's mapSolidBody spread-and-blend); this
// captures the two frame sets the brief asks for so a human can actually
// look and judge "the object is being constructed" vs. "the same object is
// distorted":
//
//   A. Six forced-assembly frames (0.03/0.10/0.25/0.50/0.75/1.00) at the
//      SAME t/camera/light/material (master-render.html?diagPin=1&
//      forceAssembly=X) — isolates exactly what uAssembly does to the
//      geometry, nothing else varies.
//   B. Eight real Journey-state frames at the checkpoints from Part 8
//      (00:30 through 20:00), using the NORMAL pipeline (no pins/forcing)
//      — what assembly actually looks like in the film as authored.
//
// Individual PNGs land in analysis/_assembly_diagnostic/, plus one
// annotated contact-sheet PNG (ffmpeg tile filter) per set for quick
// visual scanning. This does not judge PASS/FAIL itself — Part 8 is
// explicit that a human assesses the images; this script only produces
// them.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "4174";
const OUT_DIR = "analysis/_assembly_diagnostic";
const WIDTH = 960;
const HEIGHT = 540;
const DIAG_T = 1200; // arbitrary — diagPin overrides look/camera/material regardless, so only uAssembly differs across set A

const ASSEMBLY_VALUES = [0.03, 0.1, 0.25, 0.5, 0.75, 1.0];
const JOURNEY_CHECKPOINTS = [
  ["00_30", 30],
  ["03_00", 180],
  ["06_30", 390],
  ["10_30", 630],
  ["13_00", 780],
  ["17_47", 1067.8],
  ["18_10", 1090],
  ["20_00", 1200],
];

async function shoot(page, url, outFile) {
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__AUUH_MASTER_READY__ === true, { timeout: 30000 });
  await page.screenshot({ path: outFile });
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

  console.log("=== Set A: forced assembly, fixed camera/light/material/time ===");
  const setAFiles = [];
  for (const v of ASSEMBLY_VALUES) {
    const outFile = path.join(OUT_DIR, `A_assembly_${v.toFixed(2)}.png`);
    const url = `http://localhost:${PORT}/master-render.html?w=${WIDTH}&h=${HEIGHT}&quality=PREVIEW&diagPin=1&forceAssembly=${v}`;
    await shoot(page, url, outFile);
    setAFiles.push(outFile);
    console.log(`  [${outFile}] uAssembly=${v}`);
  }

  console.log("\n=== Set B: real Journey states, normal pipeline ===");
  const setBFiles = [];
  for (const [label, t] of JOURNEY_CHECKPOINTS) {
    const outFile = path.join(OUT_DIR, `B_journey_${label}.png`);
    const url = `http://localhost:${PORT}/master-render.html?w=${WIDTH}&h=${HEIGHT}&quality=PREVIEW`;
    // navigate once, then step to t via the same sequential hook render_master.mjs uses
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => window.__AUUH_MASTER_READY__ === true, { timeout: 30000 });
    await page.evaluate((tt) => window.__AUUH_RENDER_SEQUENTIAL__(tt), t);
    await page.screenshot({ path: outFile });
    setBFiles.push(outFile);
    console.log(`  [${outFile}] t=${t}s (${label})`);
  }

  await browser.close();

  // Contact sheets via ffmpeg's tile filter — each PNG is a separate input,
  // so they must be concat'd into one stream before tile can lay them out
  // (tile does not accept N separate input streams directly).
  function buildContactSheet(files, grid, outFile) {
    const inputs = files.map((f) => `-i "${f}"`).join(" ");
    const labels = files.map((_, i) => `[${i}:v]`).join("");
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${labels}concat=n=${files.length}:v=1:a=0[c];[c]tile=${grid}[out]" -map "[out]" "${outFile}" -hide_banner -loglevel error`
    );
  }
  const sheetA = path.join(OUT_DIR, "contact_sheet_A_assembly_sweep.png");
  buildContactSheet(setAFiles, "3x2", sheetA);
  const sheetB = path.join(OUT_DIR, "contact_sheet_B_journey_states.png");
  buildContactSheet(setBFiles, "4x2", sheetB);

  console.log(`\nWrote contact sheets:\n  ${sheetA}\n  ${sheetB}`);
  console.log("\nPer Part 8: assess visually. PASS = early state feels genuinely incomplete, separated/incomplete");
  console.log("geometry progressively organizes, later form clearly contains earlier structure. FAIL = recognizable");
  console.log("completed body already exists at .03, assembly mostly looks like warping/noise, nothing appears to");
  console.log("physically join. Do NOT tune uAssembly endlessly on a FAIL — proceed to Part 9 (real fragment assembly).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
