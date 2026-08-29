// Trivial full-screen blit: Three.js can't render-to-target and
// render-to-screen in the same draw call, so the scene pass writes to an
// offscreen render target and this second, cheap pass copies it to the
// visible canvas.
export const presentFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}
`;

export const presentVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;
