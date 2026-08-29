import { defineConfig } from "vite";
import { resolve } from "node:path";

// V3.5: root cause of a real production incident, not a style preference —
// Vite's dev server broadcasts a full-page reload to EVERY connected
// client whenever it can't hot-update a change, including tabs whose own
// module graph never touched the edited file. This destroyed a 42-minute
// real-time proxy recording (analysis/render_director_proxy.mjs) mid-run
// when an unrelated file (src/director-review.js) was edited in a
// different terminal session while the recording page was still connected
// to the dev server's HMR WebSocket. Any long-running Puppeteer automation
// (proxy recording, a future frame-exact master render) MUST run against
// `npm run preview` (this static, non-HMR build) instead of `npm run dev`
// — see docs/v3-5-director-review-guide.md. director.html and proxy-
// record.html need to be listed here or `vite build` silently omits them
// (only index.html is bundled by default).
export default defineConfig({
  root: ".",
  server: { port: 5173, host: true },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        director: resolve(__dirname, "director.html"),
        proxyRecord: resolve(__dirname, "proxy-record.html"),
      },
    },
  },
  assetsInclude: ["**/*.m4a"],
});
