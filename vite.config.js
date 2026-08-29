import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { port: 5173, host: true },
  build: { outDir: "dist", assetsInlineLimit: 0 },
  assetsInclude: ["**/*.m4a"],
});
