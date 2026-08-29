import puppeteer from "puppeteer-core";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173/?headless";
const DURATION = 2526.9;
const STEPS = 3000; // simulates a full 42-minute run's worth of frame updates

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--window-size=960,540", "--enable-precise-memory-info"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));

  const readings = [];
  for (let i = 0; i < STEPS; i++) {
    const t = (i / STEPS) * DURATION;
    await page.evaluate((tt) => window.__AUUH_RENDER_AT__(tt), t);
    if (i % 200 === 0) {
      const mem = await page.evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          };
        }
        return null;
      });
      readings.push({ i, t: t.toFixed(1), ...mem });
      console.log(`step ${i}/${STEPS}  t=${t.toFixed(1)}s  heap=${mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + "MB" : "n/a"}`);
    }
  }

  await browser.close();

  if (readings.length > 2 && readings[0].usedJSHeapSize) {
    const first = readings[0].usedJSHeapSize;
    const last = readings[readings.length - 1].usedJSHeapSize;
    const growthMB = (last - first) / 1048576;
    console.log(`\nHeap growth over ${STEPS} renders (~42min simulated): ${growthMB.toFixed(2)} MB`);
    console.log(growthMB < 50 ? "PASS (no significant unbounded growth)" : "FAIL (possible leak)");
  } else {
    console.log("\nperformance.memory unavailable in this Chrome build — cannot verify heap growth numerically.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
