// Part 19 — prints (does NOT run) the exact commands for the six 1080p
// creative-review windows, re-centered on this session's VERIFIED
// structural-episode timestamps (analysis/_structural_episodes/
// verified_episodes.json) rather than the journey brief's original rough
// mm:ss estimates — see docs/journey-v38-plan.md's re-anchored table.
//
// Uses analysis/_renders/<render-id>/ (src/render/RenderLease.js's
// convention), never a shared directory, so running these later — even
// several at once, even while something else is rendering elsewhere —
// can't repeat the incident in docs/render-concurrency-safety.md.
//
// GPU is occupied elsewhere this session; these commands are NOT
// executed here.
import { generateRenderId } from "../src/render/RenderLease.js";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const QUALITY = "PREVIEW";

// [label, start, end] — start/end padded a few seconds around each
// verified trough for pre-roll + settle, per Part 19's "20-45 sec
// depending on episode."
const WINDOWS = [
  ["01_first_assembly_release", 145, 195], // brackets verified FORMATION trough 170.58s
  ["02_mass_step_release", 375, 430], // brackets verified ASSEMBLY trough 394.86s
  ["03_identity_release", 630, 685], // brackets verified IDENTITY trough 654.0s (exact match to claimed)
  ["04_deep_breath_section", 755, 830], // brackets verified BREATH trough 791.94s, the deepest measured
  ["05_rupture", 1035, 1092], // brackets verified 17:47.8 trough, rank #4/84 by release magnitude
  ["06_changed_normal", 1092, 1152], // post-rupture — no verified episode here by design, this window tests the AFTER state
];

function main() {
  console.log("Journey v38 — 1080p review window commands (NOT executed — GPU is busy elsewhere this session)\n");
  console.log("render_master.mjs now acquires its own analysis/_renders/<render-id>/chunks/ directory per");
  console.log("invocation (RenderLease) — safe to run concurrently with any other render, anywhere.\n");

  for (const [label, start, end] of WINDOWS) {
    const renderId = generateRenderId();
    const outDir = `analysis/_renders/${renderId}`;
    const silent = `${outDir}/${label}_silent.mp4`;
    const final = `analysis/_review_windows/${label}.mp4`;
    console.log(`--- ${label} (${start}s-${end}s, ${end - start}s) ---`);
    console.log(`node analysis/render_master.mjs --start ${start} --end ${end} --fps ${FPS} --width ${WIDTH} --height ${HEIGHT} --quality ${QUALITY} --render-id ${renderId} --render-type review_window --output ${silent}`);
    console.log(`node analysis/mux_deliverable.mjs --video ${silent} --audio audio/AUUH.m4a --output ${final} --codec h264`);
    console.log("");
  }

  console.log("After all six render: compare against the pre-journey baseline (git stash the journey-specific");
  console.log("uniform/wiring changes, or check out the commit before this branch's shader edit, and re-render");
  console.log("the same six windows) — see docs/journey-v38-plan.md Part 20 (\"old vs new A/B\").");
}

main();
