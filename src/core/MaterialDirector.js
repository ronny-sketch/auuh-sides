// V3 Phase 6 (docs/v3-creative-direction.md): a small set of highly
// differentiated material states, changed rarely and only when the scene's
// ontological family or dramatic moment actually justifies it — per the
// brief, "material changes must be rare and story-driven," not a texture
// knob to fiddle with per chapter.
//
// Deliberately driven by SceneDirector's family/sceneState output rather
// than its own independent schedule: the material a form is "made of" is
// part of what each family IS (CHAMBER interiors read as membrane, not
// bone; ECHO's temporal ghosting reads through specular highlights, not
// matte diffuse), so tying material directly to family keeps this
// consistent rather than adding a second, competing timeline to author.
export const MATERIAL = Object.freeze({
  BONE: "BONE", // matte, heavy, sculptural — the default, established look
  OBSIDIAN: "OBSIDIAN", // near-black, reflective/specular, form read through highlights
  MEMBRANE: "MEMBRANE", // thin/translucent, internal structure hinted through the surface
  NEGATIVE: "NEGATIVE", // body as absence/mask rather than a conventionally visible surface
});

// mode indices matching the shader's uMaterialMode branching
export const MATERIAL_MODE = Object.freeze({
  [MATERIAL.BONE]: 0,
  [MATERIAL.OBSIDIAN]: 1,
  [MATERIAL.MEMBRANE]: 2,
  [MATERIAL.NEGATIVE]: 3,
});

// Per-material shading recipe: how much of the lit result is diffuse vs.
// specular-only, how dark the base albedo sits, and how much of the
// bump-map grain shows through (MEMBRANE keeps more of the fbm turbulence
// visible through the "skin," per its own translucency logic).
const MATERIAL_RECIPES = {
  [MATERIAL.BONE]: { albedo: 0.85, specular: 0.15, roughness: 0.85, grainMix: 1.0 },
  [MATERIAL.OBSIDIAN]: { albedo: 0.08, specular: 0.85, roughness: 0.12, grainMix: 0.4 },
  [MATERIAL.MEMBRANE]: { albedo: 0.55, specular: 0.3, roughness: 0.55, grainMix: 1.3 },
  [MATERIAL.NEGATIVE]: { albedo: 0.0, specular: 0.05, roughness: 1.0, grainMix: 0.0 },
};

// Chapter-level exceptions where the story overrides the family-implied
// default — Fracture's brutalist facets read stronger in OBSIDIAN than the
// ECHO family's own implied default, per creative-critique-v2.md's
// confirmation that Fracture is already the strongest chapter as-is: give
// it the material that makes that reading sharper, not softer.
const CHAPTER_MATERIAL_OVERRIDE = { 6: MATERIAL.OBSIDIAN };

const FAMILY_DEFAULT_MATERIAL = {
  SHELL: MATERIAL.BONE,
  CHAMBER: MATERIAL.MEMBRANE,
  FIELD: MATERIAL.BONE,
  ECHO: MATERIAL.OBSIDIAN,
  VOID: MATERIAL.NEGATIVE,
};

export class MaterialDirector {
  // `dominantFamily` should be whichever of SceneDirector's primary/
  // secondary families currently has the larger weight (blend > 0.5 picks
  // the secondary) — otherwise a moment like the 17:47 rupture, which is
  // authored as primaryFamily=SHELL/secondaryFamily=CHAMBER/blend=1 (i.e.
  // FULLY CHAMBER), would keep reading as SHELL's default BONE material
  // instead of CHAMBER's MEMBRANE, which is exactly backwards for the one
  // moment this is supposed to look and feel like an interior.
  sample(chapterIndex, dominantFamily, sceneState) {
    let material = CHAPTER_MATERIAL_OVERRIDE[chapterIndex] || FAMILY_DEFAULT_MATERIAL[dominantFamily] || MATERIAL.BONE;

    // RECOGNITION (the final VOID tail into true silence) always resolves
    // to NEGATIVE regardless of chapter override — "true black," not a
    // dark version of whatever material was playing a moment before.
    if (sceneState === "RECOGNITION") material = MATERIAL.NEGATIVE;

    const recipe = MATERIAL_RECIPES[material];
    return { material, mode: MATERIAL_MODE[material], ...recipe };
  }
}

// V3.5 item 3: director cues specify material by name (e.g. "OBSIDIAN") —
// this is the lookup DirectorCueSheet overrides use in main.js. Returns
// the same shape as MaterialDirector.sample().
export function getMaterialRecipe(name) {
  const recipe = MATERIAL_RECIPES[name];
  if (!recipe) return null;
  return { material: name, mode: MATERIAL_MODE[name], ...recipe };
}
