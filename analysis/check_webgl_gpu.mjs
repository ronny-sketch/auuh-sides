// V3.9 Part 7 — hardware GPU check, run before any creative review render.
// Launches the exact same headless Chrome path render_master.mjs uses and
// queries the real WebGL context for its renderer identity. Explicitly
// reports hardware GPU vs SwiftShader/software rather than assuming: a
// software-rendered "benchmark" would silently produce numbers about CPU
// rasterization performance, not the actual GPU pipeline this project's
// creative decisions depend on.
import puppeteer from "puppeteer-core";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.AUUH_PORT || "4174";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--window-size=1280,720"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });

  const info = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { error: "no WebGL context available at all" };

    const dbgExt = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbgExt ? gl.getParameter(dbgExt.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = dbgExt ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const colorBufferFloat = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("WEBGL_color_buffer_float"));
    const floatTextures = !!gl.getExtension("OES_texture_float");

    return {
      isWebGL2: !!canvas.getContext("webgl2"),
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor,
      renderer,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      floatFramebufferSupport: colorBufferFloat,
      floatTextureSupport: floatTextures,
    };
  });

  await browser.close();

  if (info.error) {
    console.error(`FAIL: ${info.error}`);
    process.exit(1);
  }

  const rendererLower = (info.renderer || "").toLowerCase();
  const isSoftware = /swiftshader|software|llvmpipe|softpipe/.test(rendererLower);
  const isANGLE = /angle/.test(rendererLower);
  const angleBackendMatch = info.renderer && info.renderer.match(/ANGLE \(([^)]+)\)/);
  const angleBackend = angleBackendMatch ? angleBackendMatch[1] : isANGLE ? "unknown ANGLE backend" : "N/A (not ANGLE)";

  console.log("=== WebGL / GPU identity ===");
  console.log(`WebGL version:          ${info.isWebGL2 ? "WebGL 2" : "WebGL 1"} (${info.version})`);
  console.log(`GLSL version:           ${info.shadingLanguageVersion}`);
  console.log(`Vendor:                 ${info.vendor}`);
  console.log(`Renderer:               ${info.renderer}`);
  console.log(`ANGLE backend:          ${angleBackend}`);
  console.log(`Float framebuffer:      ${info.floatFramebufferSupport ? "supported" : "NOT supported"}`);
  console.log(`Float textures:         ${info.floatTextureSupport ? "supported" : "NOT supported"}`);
  console.log(`Max texture size:       ${info.maxTextureSize}`);
  console.log(`Max renderbuffer size:  ${info.maxRenderbufferSize}`);
  console.log("");
  if (isSoftware) {
    console.log("VERDICT: SOFTWARE RENDERING (SwiftShader or equivalent CPU rasterizer).");
    console.log("Per Part 7: do NOT perform the creative review benchmark on this path. Stopping.");
    process.exit(2);
  } else {
    console.log("VERDICT: HARDWARE GPU rendering confirmed. Safe to proceed with creative review renders.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
