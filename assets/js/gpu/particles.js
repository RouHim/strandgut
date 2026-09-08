import { addPass, compileProgram } from './context.js';
import { getGlowApi } from './background.js';
import { getUniformLocs, applyUniforms } from './uniforms.js';

const COUNT = 48;

const VS = `#version 300 es
uniform float u_time;
out float v_a;
void main() {
  uint ii = uint(gl_InstanceID);
  uint vi = uint(gl_VertexID);
  float f = fract(sin(float(ii) * 12.9898) * 43758.5453);
  float g = fract(sin(float(ii) * 78.233) * 12543.123);
  float speed = 0.008 + f * 0.014;
  float y = fract(g - u_time * speed);
  float x = fract(f + sin(u_time * 0.05 + f * 6.28) * 0.02);
  float qx = (vi == 1u || vi == 4u || vi == 5u) ? 1.0 : -1.0;
  float qy = (vi == 0u || vi == 1u || vi == 4u) ? -1.0 : 1.0;
  float size = 0.0016 + f * 0.0022;
  vec2 p = vec2((x - 0.5) * 2.0 + qx * size * 2.0, (y - 0.5) * 2.0 + qy * size * 2.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_a = 0.08 * smoothstep(0.0, 0.15, y) * smoothstep(1.0, 0.7, y);
}
`;

const FS = `#version 300 es
precision highp float;
in float v_a;
out vec4 outColor;
void main() {
  outColor = vec4(0.55, 0.65, 0.85, v_a);
}
`;

export function initParticles() {
  const api = getGlowApi();
  if (!api) return;
  window.addEventListener('serviceadded', () => api.fireRipple());
  let prog = null;
  let loc = null;
  addPass((glc, _dt) => {
    if (!prog) {
      prog = compileProgram(glc, VS, FS);
      if (!prog) return;
      loc = getUniformLocs(glc, prog);
      glc.enable(glc.BLEND);
      glc.blendFunc(glc.SRC_ALPHA, glc.ONE_MINUS_SRC_ALPHA);
    }
    const apiNow = getGlowApi();
    if (!apiNow) return;
    glc.useProgram(prog);
    applyUniforms(glc, loc, apiNow);
    glc.drawArraysInstanced(glc.TRIANGLES, 0, 6, COUNT);
  });
}
