import { initGpuCanvas, addPass, compileProgram } from './context.js';
import { createUniforms, applyUniforms, getUniformLocs } from './uniforms.js';

const VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_glow;
uniform float u_ripple;
void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 uv = v_uv;
  uv.x *= aspect;
  float t = u_time * 0.033;
  float warp = sin(uv.y * 2.1 + t) * 0.5 + sin(uv.x * 1.3 - t * 0.7) * 0.5;
  warp += (sin(uv.y * 4.7 - t * 1.1) + sin((uv.x + uv.y) * 2.3 + t * 0.6)) * 0.5 * 0.3;
  float m = clamp(uv.y * 0.5 + 0.5 + warp * 0.08, 0.0, 1.0);
  vec3 top = vec3(0.10, 0.10, 0.18);
  vec3 mid = vec3(0.09, 0.13, 0.24);
  vec3 bot = vec3(0.05, 0.16, 0.20);
  vec3 col = mix(top, mid, smoothstep(0.0, 0.55, m));
  col = mix(col, bot, smoothstep(0.55, 1.0, m));
  if (u_glow.z > 0.001) {
    vec2 g = vec2(u_glow.x * aspect, 1.0 - u_glow.y);
    float d = distance(uv, g);
    col += vec3(0.10, 0.14, 0.20) * u_glow.z * exp(-d * 4.0);
  }
  if (u_ripple >= 0.0) {
    float d = distance(uv, vec2(0.5 * aspect, 0.5));
    float r = u_ripple * 0.9;
    float ring = exp(-abs(d - r) * 22.0) * (1.0 - u_ripple / 1.2);
    col += vec3(0.12, 0.18, 0.22) * max(ring, 0.0);
  }
  outColor = vec4(col, 1.0);
}
`;

let uniforms = null;

export function getGlowApi() { return uniforms; }

export async function initGpuBackground() {
  const ctx = await initGpuCanvas();
  if (!ctx) return;
  const { gl } = ctx;
  try {
    const u = createUniforms();
    const prog = compileProgram(gl, VS, FS);
    if (!prog) throw new Error('background program failed');
    const loc = getUniformLocs(gl, prog);
    u.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () =>
      u.setSize(window.innerWidth, window.innerHeight));
    uniforms = u;
    addPass((glc, dt) => {
      u.tick(dt);
      glc.viewport(0, 0, glc.drawingBufferWidth, glc.drawingBufferHeight);
      glc.clearColor(0.1, 0.1, 0.18, 1.0);
      glc.clear(glc.COLOR_BUFFER_BIT);
      glc.useProgram(prog);
      applyUniforms(glc, loc, u);
      glc.drawArrays(glc.TRIANGLES, 0, 3);
      window.__gpuPresented = true;
    });
  } catch (err) {
    console.error('WebGL background failed, using static background:', err);
    uniforms = null;
    document.querySelector('[data-testid="gpu-canvas"]')?.remove();
  }
}
