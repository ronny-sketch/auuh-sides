// V4 Part 15: quality comparison reel. Renders the SAME excerpts at
// multiple quality settings so the improvement can be judged from actual
// moving footage, not asserted from settings names. Per the brief: do NOT
// commit to a 42-minute 4K master until this proves the settings are
// genuinely better.
//
// Tiers rendered:
//   OLD_PROXY   — extracted directly from the existing V3.5 director
//                 review proxy (reviews/AUUH_v3_5_director_proxy.mp4),
//                 NO new rendering — this IS what "old quality" means,
//                 not a re-creation of it.
//   HQ_1080P    — 1920x1080, MASTER precision tier, no supersampling
//                 (fast enough that supersampling isn't needed for a
//                 comparison at this size).
//   MASTER_4K   — 3840x2160, MASTER precision tier, 1.5x supersample +
//                 Lanczos downsample (docs/v4-mastering-audit.md's chosen
//                 practical default from the Part 4 AA benchmark).
//
// Uses 20-second excerpts as single chunks (analysis/render_master.mjs's
// own --chunk-seconds), matching the Part 16 stress-test finding that a
// single browser session is reliably stable up to ~40s of continuous
// rendering — 20s keeps real margin below the observed 42-65s failure
// window without needing to invoke chunking machinery for a single-chunk
// excerpt.
import { execSync } from "node:child_process";
import fs from "node:fs";

const EXCERPTS = [
  { name: "emergence_silhouette", start: 20, dur: 20 },
  { name: "contraction_restraint", start: 770, dur: 20 },
  { name: "chamber_1747", start: 1057, dur: 20 },
  { name: "widening_field", start: 1700, dur: 20 },
  { name: "fracture_obsidian", start: 2005, dur: 20 },
  { name: "synthesis_echo", start: 2410, dur: 20 },
  { name: "climax_4122", start: 2472, dur: 20 },
];

const OUT_DIR = "reviews/v4_quality_comparison";
const PROXY_SOURCE = "reviews/AUUH_v3_5_director_proxy.mp4";
const PORT = process.env.AUUH_PORT || "4174";

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv[2];
  const excerpts = only ? EXCERPTS.filter((e) => e.name === only) : EXCERPTS;

  for (const ex of excerpts) {
    console.log(`\n=== ${ex.name} (t=${ex.start}-${ex.start + ex.dur}) ===`);

    const oldProxyOut = `${OUT_DIR}/${ex.name}_OLD_PROXY.mp4`;
    if (!fs.existsSync(oldProxyOut)) {
      console.log("-- OLD_PROXY (extracted, no new render) --");
      run(`ffmpeg -y -ss ${ex.start} -t ${ex.dur} -i "${PROXY_SOURCE}" -c:v libx264 -crf 18 -pix_fmt yuv420p -an "${oldProxyOut}" -hide_banner -loglevel error`);
    } else {
      console.log(`-- OLD_PROXY already exists, skipping --`);
    }

    const hq1080Out = `${OUT_DIR}/${ex.name}_HQ_1080P.mp4`;
    if (!fs.existsSync(hq1080Out)) {
      console.log("-- HQ_1080P (1920x1080, MASTER precision, no SS) --");
      run(
        `AUUH_PORT=${PORT} node analysis/render_master.mjs --start ${ex.start} --end ${ex.start + ex.dur} --fps 30 --width 1920 --height 1080 --quality MASTER --output "${hq1080Out}"`
      );
    } else {
      console.log(`-- HQ_1080P already exists, skipping --`);
    }

    const master4kOut = `${OUT_DIR}/${ex.name}_MASTER_4K.mp4`;
    if (!fs.existsSync(master4kOut)) {
      console.log("-- MASTER_4K (3840x2160, MASTER precision, 1.5x SS+Lanczos) --");
      run(
        `AUUH_PORT=${PORT} node analysis/render_master.mjs --start ${ex.start} --end ${ex.start + ex.dur} --fps 30 --width 3840 --height 2160 --quality MASTER --ss 1.5 --output "${master4kOut}"`
      );
    } else {
      console.log(`-- MASTER_4K already exists, skipping --`);
    }
  }

  console.log(`\nDone. Outputs in ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
