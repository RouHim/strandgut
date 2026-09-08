import { initGpuCanvas, addPass } from './context.js';
import { createUniforms } from './uniforms.js';

const SHADER = /* wgsl */ `
struct U {
  time: f32, width: f32, height: f32,
  glowX: f32, glowY: f32, glow: f32,
  rippleT: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> u: U;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = p[i] * 0.5 + 0.5;
  return o;
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let aspect = u.width / max(u.height, 1.0);
  var uv = in.uv;
  uv.x *= aspect;
  let t = u.time * 0.033;
  let warp = sin(uv.y * 2.1 + t) * 0.5 + sin(uv.x * 1.3 - t * 0.7) * 0.5;
  let m = clamp(uv.y * 0.5 + 0.5 + warp * 0.08, 0.0, 1.0);
  let top = vec3f(0.10, 0.10, 0.18);
  let mid = vec3f(0.09, 0.13, 0.24);
  let bot = vec3f(0.05, 0.16, 0.20);
  var col = mix(top, mid, smoothstep(0.0, 0.55, m));
  col = mix(col, bot, smoothstep(0.55, 1.0, m));
  if (u.glow > 0.001) {
    var g = vec2f(u.glowX * aspect, 1.0 - u.glowY);
    let d = distance(uv, g);
    col += vec3f(0.10, 0.14, 0.20) * u.glow * exp(-d * 4.0);
  }
  if (u.rippleT >= 0.0) {
    let d = distance(uv, vec2f(0.5 * aspect, 0.5));
    let r = u.rippleT * 0.9;
    let ring = exp(-abs(d - r) * 22.0) * (1.0 - u.rippleT / 1.2);
    col += vec3f(0.12, 0.18, 0.22) * max(ring, 0.0);
  }
  col += (hash(in.uv * vec2f(u.width, u.height) + fract(u.time)) - 0.5) * 0.035;
  return vec4f(col, 1.0);
}
`;

let uniforms = null;

export function getGlowApi() { return uniforms; }

export async function initGpuBackground() {
  const ctx = await initGpuCanvas();
  if (!ctx) return;
  const { device, format } = ctx;
  try {
    uniforms = createUniforms(device);
    const module = device.createShaderModule({ code: SHADER });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    uniforms.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () =>
      uniforms.setSize(window.innerWidth, window.innerHeight));
    addPass((dev, _ctx, view, dt) => {
      uniforms.tick(dt);
      const encoder = dev.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view, loadOp: 'clear', storeOp: 'store',
          clearValue: { r: 0.1, g: 0.1, b: 0.18, a: 1 },
        }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      dev.queue.submit([encoder.finish()]);
      window.__gpuPresented = true;
    });
  } catch (err) {
    console.error('WebGPU background failed, using static background:', err);
    document.querySelector('[data-testid="gpu-canvas"]')?.remove();
  }
}
