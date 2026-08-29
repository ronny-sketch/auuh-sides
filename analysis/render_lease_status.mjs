// Read-only CLI: lists every render-id under a render root with its lease
// status (alive/stale/missing). Never mutates anything — see
// src/render/RenderLease.js for the destructive operations, which require
// explicit ownership confirmation and are never invoked from here.
//
// Usage:
//   node analysis/render_lease_status.mjs [--root analysis/_renders]
import { listRenders } from "../src/render/RenderLease.js";

function parseArgs(argv) {
  const args = { root: "analysis/_renders" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
  }
  return args;
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const renders = listRenders(root);
  if (!renders.length) {
    console.log(`No renders found under ${root}`);
    return;
  }
  console.log(`Renders under ${root}:\n`);
  for (const r of renders) {
    if (r.state === "missing") {
      console.log(`  ${r.renderId}  [NO LEASE FILE — orphaned directory, investigate before touching]`);
      continue;
    }
    const age = r.ageSec.toFixed(0);
    console.log(
      `  ${r.renderId}  [${r.state.toUpperCase()}]  pid=${r.lease.pid} host=${r.lease.hostname} type=${r.lease.renderType} commit=${(r.lease.commit || "?").slice(0, 10)} lastHeartbeat=${age}s ago  output=${r.lease.outputPath || "(none)"}`
    );
  }
}

main();
