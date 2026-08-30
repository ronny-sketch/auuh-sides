# AUUH — V4 Quality Critique

Part 15. Ranked by actual, observed perceptual value from looking at real
frames pulled from `reviews/v4_quality_comparison/` (7 excerpts × 3 tiers:
`OLD_PROXY` = extracted directly from the existing V3.5 director-review
proxy, no new render; `HQ_1080P` = 1920×1080, MASTER precision, no
supersample; `MASTER_4K` = 3840×2160, MASTER precision, 1.5x supersample +
Lanczos downsample). No claim below rests on "more pixels" or "16-bit
float" alone — every finding is anchored to a specific frame comparison.

## Finding 1 [dramatic, unambiguous]: geometrically dense scenes (Fracture/OBSIDIAN, the 41:22 climax, Synthesis/ECHO) go from illegible to genuinely striking

`fracture_obsidian` at OLD_PROXY is a blocky, mushy mass — the shattered
facet geometry the piece's own strongest chapter depends on is barely
readable, drowning in compression macroblocking. At MASTER_4K the same
frame shows crisp, individually legible facets with real OBSIDIAN
specular glints on distinct edges — actual dimensional depth to the
fracture instead of a gray smear. The same jump holds for `climax_4122`
(the densest, most parameter-complex moment in the whole piece) and
`synthesis_echo` (the multi-tap ECHO composite genuinely shows separated,
individually-shaped ghost fragments at master quality, where the proxy
shows only an undifferentiated green blob with zero internal structure
legible). **These three are the scenes this mastering pass most
obviously earns its cost for** — the underlying geometry/systems were
always there; the proxy pipeline was hiding them.

## Finding 2 [dramatic, unambiguous]: near-black gradient fidelity — the crushed-blacks doctrine actually holds now

`contraction_restraint` (a NEAR_DARK restraint passage — the deliberately
quietest, darkest material in the piece) shows genuine blocky compression
banding along the body's silhouette curve at OLD_PROXY quality; at
MASTER_4K the same curve is smooth, with the same underlying fine detail
(a hairline fold-seam) still visible but no longer fighting visible
8-bit/low-bitrate banding. This is the single most direct visual
confirmation that Part 2's precision work (RGBA16F scene target,
higher-precision history) and Part 6's grain fix are actually paying off
in exactly the passages the brief was most worried about protecting —
"this artwork depends on black" is a real, checked claim now, not an
assertion.

## Finding 3 [real, but more modest]: soft/low-frequency content (CHAMBER interior, FIELD atmosphere) improves less dramatically

`chamber_1747` and `widening_field` both look cleaner at MASTER_4K
(properly fine, even, photographic grain replacing the proxy's blocky
compression noise; no macroblocking), but the improvement is
**qualitatively smaller** than Findings 1-2. This is expected, not a
shortfall: CHAMBER's interior is deliberately soft/foggy by design
(`docs/creative-critique-v3.md`'s own finding — its payoff is atmospheric,
not high-frequency), and FIELD's whole visual language is a small,
distant, softly-glowing form. There is less fine detail for resolution/AA
to reveal in content that was never meant to be sharp. **Honest
implication**: if a director-notes pass eventually flags CHAMBER or FIELD
passages as still "boring" or "too soft," the fix is a creative/shader
change (per V4's own "do not redesign FIELD" instruction — flag it, don't
silently fix it here), not a mastering-quality one — this pass has already
delivered what better precision/resolution alone can give these passages.

## Finding 4 [confirms the audit, not a new discovery]: `emergence_silhouette` — the AA and precision benefit is real but subtler at 720p→1080p→4K on a single silhouette shot than on dense geometry

The rounded-box silhouette cleans up visibly (edge stair-stepping
softens, grain reads as fine and even rather than blocky) between
OLD_PROXY and HQ_1080P, with a smaller further refinement to MASTER_4K.
Consistent with the Part 4 AA benchmark's own finding (1x→1.5x was the
largest jump, 1.5x→2x smaller, 2x→3x marginal) — a single clean silhouette
against black has less to gain from supersampling than a scene full of
small, thin edges (Fracture's cracks), which is exactly what that
benchmark predicted and this excerpt confirms from a different angle.

## What this does NOT prove

- **Motion-dependent quality** (shimmer, temporal stability, whether ECHO's
  ghosts stay legible while moving) — every comparison above is a single
  still frame per tier. The brief's own Part 5 instruction ("do not judge
  this from still images... render and watch motion") is not satisfied by
  this document; it would require scrubbing the actual `.mp4` files, which
  this review pass did not do frame-by-frame across the full 20s duration
  of each excerpt.
- **Whether 1.5x supersample specifically (vs. 2x, per the Part 4
  benchmark's own "quality sweet spot" finding) was the right call for
  these excerpts** — this reel used 1.5x throughout for render-time
  reasons (see `docs/v4-mastering-audit.md`'s economics table); a
  side-by-side of 1.5x vs. 2x on the SAME excerpt was not re-run here since
  the isolated AA benchmark (Part 4) already answered that question on a
  representative frame.

## Verdict

**The mastering work is justified and should proceed to a full-length
render when creative direction is locked.** The improvement is real,
visible, and — critically — uneven in exactly the way the underlying
content predicts (soft/atmospheric scenes gain less than dense/geometric
ones), which is the signature of a genuine measurement rather than a
uniform "everything automatically looks more expensive" placebo. Nothing
observed suggests the settings are wrong or wasteful; nothing observed
crosses into "glossy CGI" or "over-smoothed" — the grain, the crushed
blacks, and the alien color wash all read as the same artwork, just
photographed with a much better camera, which was the brief's own success
standard.
