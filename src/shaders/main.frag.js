export const fragmentShader = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFov;

uniform float uFold;
uniform float uFoldBlend;
uniform float uTurbulence;
uniform float uFracture;
uniform float uContrast;
uniform float uColorMix;
uniform float uRestraint;

// BODY family, v2 (Phase 3): blend toward a second primitive pair so
// topology itself changes across the piece, not just fold/turbulence
// amount on one fixed shape — "the object is a body / the body is
// architecture" per creative-bible's SIDES concept needs the underlying
// form to actually change, not just its symmetry and texture.
uniform float uFormBlend;

// v2 Phase 4 (audio mapping): micro-scale modulation from AudioFeatureEngine.
uniform float uGrainBoost; // high/hats -> micro texture intensity

// V3 SceneDirector families (docs/v3-creative-direction.md §6): all five
// families read the SAME map()/mapSolidBody() field — they are different
// TRAVERSAL/ACCUMULATION/SHADING rules over one shared distance field, not
// five separate scenes cross-dissolved. CHAMBER is entered automatically
// when the real camera position sits inside the solid body (computed
// in-shader from uCamPos, not flagged from JS) — this is what makes a
// single continuous exterior-to-interior camera move possible: the
// traversal rule follows the camera through real geometry rather than
// switching on an external cue.
uniform float uWallThickness; // CHAMBER shell thickness
uniform float uFieldWeight; // FIELD family activation (volumetric density / dust)
uniform float uEchoWeight; // ECHO family activation (extra multi-tap history taps)

// V3 LightDirector (Phase 5): a small set of held, authored light states
// instead of one fixed hardcoded direction. INTERNAL_LIGHT (mode 3) is
// positional (radiates from the origin) rather than directional — see main().
uniform int uLightMode;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform float uAmbient;
uniform float uRimAmount;

// V3 MaterialDirector (Phase 6): BONE=0, OBSIDIAN=1, MEMBRANE=2, NEGATIVE=3.
uniform int uMaterialMode;
uniform float uAlbedo;
uniform float uSpecular;
uniform float uRoughness;
uniform float uGrainMix;

// Temporal feedback (Phase 6/7 / MEMORY+ECHO families). uPrevFrame is the
// lag-1 tap (always active, the original v2 "ghost trail"); uHistory1-3
// are additional, longer-lag taps from FeedbackPipeline's ring buffer,
// only visible when uEchoWeight > 0 (ECHO family active) — "delayed
// versions of the same form... separate, occupy different locations...
// fade at different rates" per the V3 brief, achieved by sampling GENUINE
// past-rendered states (which really did have different fold/turbulence/
// camera) at different UV drifts and weights, not by faking topology
// differences synthetically.
uniform sampler2D uPrevFrame;
uniform sampler2D uHistory1;
uniform sampler2D uHistory2;
uniform sampler2D uHistory3;
uniform float uMemoryWeight;
uniform vec2 uMemoryDrift;

// V3 Phase 8 transition grammar: BLACK_CUT. Ramps 0->1 across the piece's
// final silence tail (timeline.js EVENTS.silenceFloor -> DURATION) so the
// ending is a genuine cut to nothing, not a fade tail — per docs/cue-
// sheet.md's own instruction ("no residual bloom/particles... a genuine
// cut to nothing"). Applied as a final multiply so it overrides every
// other family/light/material state rather than competing with them.
uniform float uBlackout;

varying vec2 vUv;

// ---------- noise ----------
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453123); }

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise3(p);
    p *= 2.02;
    a *= 0.5;
  }
  return s;
}

// ---------- sdf primitives ----------
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// second BODY topology (v2, Phase 3): faceted, crystalline — the
// counterpart to the rounded box's soft mass. Exact SDF (Inigo Quilez).
float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 q;
  if (3.0 * p.x < m) q = p.xyz;
  else if (3.0 * p.y < m) q = p.yzx;
  else if (3.0 * p.z < m) q = p.zxy;
  else return m * 0.57735027;
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// Polar fold around the Y axis into N wedges, blended with the raw angle.
// Interpolating the ANGLE (not the xz position) guarantees the result
// always sits at the same radius as the input — mixing two same-length
// vectors that point in different directions instead (the earlier version
// of this function) shrinks the radius by an amount that varies with angle,
// which fabricates false proximity to the body far out in empty space and
// shows up as a large, regular, jagged phantom-geometry artifact filling
// the background at any non-integer foldBlend.
vec3 foldPolar(vec3 p, float n, float blend) {
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  float wedge = 6.2831853 / max(n, 1.0);
  float folded = mod(a + wedge * 0.5, wedge) - wedge * 0.5;
  float finalAngle = mix(a, folded, blend);
  vec2 result = vec2(cos(finalAngle), sin(finalAngle)) * r;
  return vec3(result.x, p.y, result.y);
}

// voronoi edge metric (F2 - F1): near-zero only along thin cell boundaries,
// so it carves cracks rather than round craters when used as a cutting mask.
float voronoiEdge(vec3 p) {
  vec3 ip = floor(p);
  float f1 = 10.0;
  float f2 = 10.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 cell = vec3(float(x), float(y), float(z));
        vec3 pos = cell + vec3(hash3(ip + cell), hash3(ip + cell + 7.1), hash3(ip + cell + 3.3)) - fract(p);
        float d = dot(pos, pos);
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
    }
  }
  return sqrt(f2) - sqrt(f1);
}

float opSmoothSubtraction(float d1, float d2, float k) {
  float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
  return mix(d2, -d1, h) + k * h * (1.0 - h);
}

// Identity field shared by every family (v3, docs/v3-creative-direction.md
// §6): fold + turbulent domain-warp + BODY topology blend. This is exactly
// the pre-fracture-cut body from v2's map(), extracted so CHAMBER's thin
// shell (abs(d) - wallThickness) and the exterior SHELL cut can both read
// the identical underlying shape rather than two similar-but-drifted copies.
float mapSolidBody(vec3 p) {
  // Noise-based warp/fracture must never influence points far from the
  // body: sin()-based hashing loses precision at large coordinates (rays
  // that miss travel out to t=40), which otherwise produces false
  // near-zero "hits" scattered through empty space. Gate all noise
  // contributions by proximity to the origin so distant space stays the
  // exact, unperturbed (and therefore correctly monotonic) primitive
  // distance.
  float distMask = 1.0 - smoothstep(3.5, 7.0, length(p));

  vec3 pf = foldPolar(p, floor(uFold + 0.5), uFoldBlend);

  float warp = fbm(pf * 0.8 + uTime * 0.05) * uTurbulence * distMask;
  vec3 pw = pf + warp * 0.6;

  float bodyA = sdRoundBox(pw, vec3(1.0, 1.4, 1.0), 0.35);
  float ringA = sdTorus(pw, vec2(1.6, 0.35));
  float dA = opSmoothUnion(bodyA, ringA, 0.6);

  float bodyB = sdOctahedron(pw, 1.55);
  float ringB = sdTorus(pw, vec2(1.9, 0.12));
  float dB = opSmoothUnion(bodyB, ringB, 0.35);

  float d = mix(dA, dB, uFormBlend);
  d += (fbm(pf * 2.3 - uTime * 0.03) - 0.5) * uTurbulence * 0.35 * distMask;
  return d;
}

// SHELL/exterior family: mapSolidBody plus the discrete audio-triggered
// FRACTURE cut. Unchanged from v2's map() (same variables, same order of
// operations) — this is the exact code path documented in docs/creative-
// critique-v2.md's Finding 1, and it must keep producing identical results
// across the fracture parameter range that fix was verified against.
float mapExterior(vec3 p) {
  float d = mapSolidBody(p);
  float distMask = 1.0 - smoothstep(3.5, 7.0, length(p));

  if (uFracture > 0.001 && distMask > 0.01) {
    vec3 pf = foldPolar(p, floor(uFold + 0.5), uFoldBlend);
    float edge = voronoiEdge(pf * 2.4 + 0.001);
    float crackWidth = mix(0.4, 0.04, uFracture);
    float gate = smoothstep(0.0, 0.5, uFracture);
    float crack = edge - crackWidth + (1.0 - gate) * 10.0;
    d = opSmoothSubtraction(crack, d, 0.05);
  }
  return d;
}

// CHAMBER interior architecture (V3 Phase 3): a vertical stack of toroidal
// rings sharing the body's own fold symmetry — "repeated polar
// architecture... toroidal chambers... recursive openings," built from the
// same primitive language as SHELL, not a new one. spokeBreak keeps the
// repetition from reading as a perfect screensaver loop (Phase 11's
// psychedelia rule: symmetry allowed to fail, not fail-safe forever).
float mapInteriorArch(vec3 p) {
  vec3 pf = foldPolar(p, floor(uFold + 0.5), uFoldBlend);
  float cell = 0.9;
  float py = mod(pf.y + cell * 0.5, cell) - cell * 0.5;
  vec3 pr = vec3(pf.x, py, pf.z);
  float ring = sdTorus(pr, vec2(0.75, 0.10));
  float spokeAngle = atan(pf.z, pf.x);
  float spokeBreak = abs(sin(spokeAngle * 3.0 + pf.y * 2.0)) * 0.06;
  return ring - spokeBreak;
}

// CHAMBER field: the body treated as a thin hollow shell (abs(d) -
// thickness is solid only in a thin band straddling the original surface,
// empty both far outside AND deep inside) unioned with the interior
// architecture that lives in that hollow. Same sign convention as every
// other primitive here (negative = solid), so it composes with
// opSmoothUnion/min exactly like any other field.
float mapChamber(vec3 p) {
  float dWall = abs(mapSolidBody(p)) - uWallThickness;
  float dArch = mapInteriorArch(p);
  return min(dWall, dArch);
}

float mapScene(vec3 p, bool interior) {
  return interior ? mapChamber(p) : mapExterior(p);
}

vec3 calcNormal(vec3 p, bool interior) {
  vec2 e = vec2(0.001, 0.0);
  vec3 n = normalize(vec3(
    mapScene(p + e.xyy, interior) - mapScene(p - e.xyy, interior),
    mapScene(p + e.yxy, interior) - mapScene(p - e.yxy, interior),
    mapScene(p + e.yyx, interior) - mapScene(p - e.yyx, interior)
  ));

  // Fixed-amplitude material grain, independent of uTurbulence. Restraint
  // windows collapse turbulence to near zero (correctly killing macro-scale
  // form motion), but turbulence was also the ONLY source of surface
  // detail — with it gone, restrained passages went completely flat and
  // plastic-looking instead of reading as a held, quiet moment. Restraint
  // should mean the form stops moving, not that the material loses all
  // presence.
  vec3 bump = vec3(
    hash3(p * 40.0) - 0.5,
    hash3(p * 40.0 + 17.0) - 0.5,
    hash3(p * 40.0 + 31.0) - 0.5
  );
  // v2 Phase 4 + v3 MaterialDirector: high/hats energy boosts micro-texture
  // intensity (uGrainBoost); uGrainMix is the MaterialDirector's per-
  // material multiplier on top (MEMBRANE reads more grain/translucency,
  // NEGATIVE reads none — a masked material has no surface to bump).
  n = normalize(n + bump * 0.05 * uGrainBoost * uGrainMix);
  return n;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  vec3 fwd = normalize(uCamTarget - uCamPos);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  float fovScale = tan(radians(uFov) * 0.5);
  vec3 rd = normalize(fwd + (uv.x * fovScale) * right + (uv.y * fovScale) * up);
  vec3 ro = uCamPos;

  // CHAMBER auto-detection (V3 Phase 3): the raymarcher reads the SHELL
  // field as solid; the moment the real camera position sits deep enough
  // inside it (past the shell's own wall thickness), traversal switches to
  // the interior/hollow field for every pixel this frame. This is driven
  // entirely by actual camera position (set by CameraDirector's PASS_THROUGH
  // shot type), not a separate flag — so a camera move that continuously
  // dollies from outside to inside produces one continuous shot across the
  // exterior/interior boundary, per the brief's "must be possible as one
  // continuous shot" requirement.
  float originSolidD = mapSolidBody(ro);
  bool interior = originSolidD < -uWallThickness * 1.3;

  float t = 0.0;
  float steps = 0.0;
  bool hit = false;
  vec3 p;
  float fieldDensity = 0.0;
  for (int i = 0; i < 100; i++) {
    p = ro + rd * t;
    float d = mapScene(p, interior);
    if (uFieldWeight > 0.001) {
      fieldDensity += uFieldWeight * exp(-abs(d) * 3.0) * 0.045;
    }
    steps += 1.0;
    if (d < 0.001) { hit = true; break; }
    if (t > 40.0) break;
    t += d * 0.85;
  }
  fieldDensity = clamp(fieldDensity, 0.0, 0.6);

  vec3 col;
  if (hit) {
    vec3 n = calcNormal(p, interior);

    // V3 LightDirector: INTERNAL_LIGHT (mode 3) radiates from the origin
    // outward rather than from a fixed direction — "light itself reveals
    // geometry" reads differently once the light is a place inside the
    // form, not a direction outside it. Every other mode is the same
    // directional key light the shading model always had, just authored
    // per-state instead of hardcoded to one fixed vector.
    vec3 lightDir = (uLightMode == 3)
      ? normalize(-p + vec3(0.0001))
      : normalize(uLightDir);

    // INTERNAL_LIGHT (Phase 13 finding, docs/creative-critique-v3.md): a
    // point light at the chamber's own center leaves every surface facing
    // AWAY from the origin (the outer curve of an interior ring, the far
    // side of a corridor wall as the camera weaves past it) essentially
    // black under a standard max(dot,0) key light — in practice this made
    // the whole interior read as a near-featureless dark frame regardless
    // of camera placement, not a legible chamber. Half-Lambert (never fully
    // zero) reads as a light FILLING a room rather than a point source with
    // hard shadow falloff, which is also the more physically apt metaphor
    // for "light radiates from inside the form" in the first place.
    float ndotl = dot(n, lightDir);
    float diff = (uLightMode == 3 ? (0.5 + 0.5 * ndotl) : max(ndotl, 0.0)) * uLightIntensity;
    // Rim term is deliberately weak and steep: at true grazing angles
    // (large flat surfaces like the ring seen edge-on) an unchecked rim
    // term saturates the whole silhouette to flat white, which is what
    // produced the illegible blown-out "phantom plane" panels in the first
    // contact sheet — the geometry was fine, the shading model wasn't.
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * uRimAmount;
    float ao = 1.0 - steps / 100.0;

    // V3 MaterialDirector: a real specular lobe (reflect/pow), not just the
    // existing rim term, so OBSIDIAN can read as "form through highlights
    // against near-black albedo" and BONE can stay matte/diffuse-only.
    vec3 reflDir = reflect(-lightDir, n);
    float specPow = mix(8.0, 90.0, 1.0 - uRoughness);
    float spec = pow(max(dot(reflDir, -rd), 0.0), specPow) * uSpecular * uLightIntensity;

    float lum = diff * uAlbedo * 0.8 + rim * 0.18 + ao * 0.12 * uAlbedo + spec + uAmbient;
    // Soft tonemap instead of a hard clamp: a surface facing the light
    // near head-on pushes lum well past 1.0 across large areas, and a hard
    // clamp(lum,0,1) flattens all of that into solid, textureless white —
    // which is exactly what erased the bump-map grain added above in the
    // brightest parts of the Contraction restraint passage. Reinhard-style
    // compression keeps near-saturated values distinguishable instead of
    // pinning them all to the same ceiling.
    lum = 1.0 - exp(-lum * 1.3);
    lum = pow(clamp(lum, 0.0, 1.0), 1.0 / max(uContrast, 0.05));

    vec3 gray = vec3(lum);

    // NEGATIVE (VOID family's material): the body reads as absence — a
    // mask against the lit space around it — rather than a conventionally
    // shaded surface. Diffuse/albedo/ao are dropped entirely; only the
    // grazing rim and any specular catch survive, so the silhouette is
    // legible only at its edges.
    if (uMaterialMode == 3) {
      gray = vec3(rim * 0.6 + spec * 0.5);
    }

    // Rationed color: a single, unconventional hue wash rather than a
    // lighting-based warm/cool split-tone. A shadow-cool / highlight-warm
    // split is the standard commercial color grade (teal-and-orange) and
    // reads as "the movie briefly turned into a normal color film," which
    // works against the doctrine that these two moments should feel like
    // an alien rupture, not a grading choice. A single narrow hue applied
    // uniformly reads as a wash over the image instead of a lighting
    // effect, and doesn't map to any familiar grading convention.
    vec3 alienHue = vec3(0.55, 0.95, 0.35);
    vec3 toned = gray * alienHue + gray * gray * 0.15;
    col = mix(gray, toned, uColorMix);
  } else {
    float vign = 1.0 - length(uv) * 0.6;
    col = vec3(0.02 * vign);

    // FIELD atmosphere: even open (miss) space carries dim procedural dust
    // when the FIELD family is active, so scale reads ambiguously (the
    // body could be near or far, small or vast) rather than "an object
    // floating in flat black" — the same fbm the surface already uses,
    // sampled along the ray direction so it doesn't swim as the camera
    // translates.
    if (uFieldWeight > 0.001) {
      float dust = fbm(rd * 3.0 + uTime * 0.02);
      col += dust * uFieldWeight * 0.4 * vign;
      fieldDensity = clamp(fieldDensity + uFieldWeight * 0.3, 0.0, 0.6);
    }
  }

  if (uFieldWeight > 0.001) {
    col += fieldDensity * vec3(0.45);
  }

  // Film grain and scanline roll — amplitudes raised from the original
  // pass (0.035/0.02), which was tuned by eye against a single raw
  // screenshot and turned out to be nearly invisible at normal viewing
  // size, let alone after video compression. This is the doctrine's stated
  // "analog decay, not digital glitch" material quality, so it needs to
  // actually survive the export pipeline, not just exist in the shader.
  float grain = hash3(vec3(vUv * uResolution, mod(uTime * 60.0, 1000.0))) - 0.5;
  col += grain * 0.06 * uGrainBoost * uGrainMix;

  float scan = sin((vUv.y + uTime * 0.03) * uResolution.y * 0.9) * 0.035;
  col -= scan;

  // vignette
  float vig = smoothstep(1.0, 0.25, length(vUv - 0.5) * 1.35);
  col *= mix(0.75, 1.0, vig);

  col = clamp(col, 0.0, 1.0);

  // Temporal feedback, lag-1 tap (MEMORY, always available at whatever
  // weight VisualDirector/params.js authors — unchanged from v2). A pure
  // mix() (no warp) would read as motion blur; drifting the sample UV each
  // frame is what makes the trail read as a displaced ghost silhouette
  // rather than smoothing.
  if (uMemoryWeight > 0.001) {
    vec2 driftedUv = vUv + uMemoryDrift;
    vec3 prev = texture2D(uPrevFrame, clamp(driftedUv, 0.001, 0.999)).rgb;
    col = mix(col, max(col, prev * 0.985), uMemoryWeight);
  }

  // V3 ECHO family: three additional, longer-lag taps from
  // FeedbackPipeline's history ring, each drifting in its own slow
  // direction so the ghosts visibly SEPARATE in space rather than sitting
  // as one thicker trail, and each weighted down with lag so they fade at
  // different rates. Because each tap is a genuinely different past
  // rendered frame (real fold/turbulence/camera state from a moment ago),
  // this reads as "temporal selves" with real (not synthetic) topology
  // differences — see docs/v3-creative-direction.md §6/Phase 11.
  if (uEchoWeight > 0.001) {
    vec2 d1 = vec2(sin(uTime * 0.21) * 0.012, cos(uTime * 0.18) * 0.012);
    vec2 d2 = vec2(sin(uTime * 0.09 + 2.0) * 0.022, cos(uTime * 0.07 + 1.0) * 0.022);
    vec2 d3 = vec2(sin(uTime * 0.045 + 4.0) * 0.035, cos(uTime * 0.035 + 3.0) * 0.035);
    vec3 h1 = texture2D(uHistory1, clamp(vUv + d1, 0.001, 0.999)).rgb;
    vec3 h2 = texture2D(uHistory2, clamp(vUv + d2, 0.001, 0.999)).rgb;
    vec3 h3 = texture2D(uHistory3, clamp(vUv + d3, 0.001, 0.999)).rgb;
    col = max(col, h1 * 0.75 * uEchoWeight);
    col = max(col, h2 * 0.55 * uEchoWeight);
    col = max(col, h3 * 0.40 * uEchoWeight);
  }

  col *= (1.0 - uBlackout);

  gl_FragColor = vec4(col, 1.0);
}
`;

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;
