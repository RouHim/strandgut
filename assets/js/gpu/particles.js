import { addPass } from './context.js';
import { getGlowApi } from './background.js';

const COUNT = 48;

const SHADER = /* wgsl */ `
struct U {
  time: f32, width: f32, height: f32,
  glowX: f32, glowY: f32, glow: f32,
  rippleT: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> u: U;
struct VSOut { @builtin(position) pos: vec4f, @location(0) a: f32 };
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  let f = fract(sin(f32(ii) * 12.9898) * 43758.5453);
  let g = fract(sin(f32(ii) * 78.233) * 12543.123);
  let speed = 0.008 + f * 0.014;
  var y = fract(g - u.time * speed);
  var x = fract(f + sin(u.time * 0.05 + f * 6.28) * 0.02);
  let quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let size = 0.0016 + f * 0.0022;
  var o: VSOut;
  o.pos = vec4f((x - 0.5) * 2.0 + quad[vi].x * size * 2.0, (y - 0.5) * 2.0 + quad[vi].y * size * 2.0, 0.0, 1.0);
  o.a = 0.08 * smoothstep(0.0, 0.15, y) * smoothstep(1.0, 0.7, y);
  return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(0.55, 0.65, 0.85, in.a);
}
`;

export function initParticles() {
  const api = getGlowApi();
  if (!api) return;
  window.addEventListener('serviceadded', () => api.fireRipple());
  let pipeline = null;
  let bindGroup = null;
  addPass((dev, _ctx, view, _dt) => {
    if (!pipeline) {
      const module = dev.createShaderModule({ code: SHADER });
      pipeline = dev.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });
      bindGroup = dev.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: api.buffer } }],
      });
    }
    const encoder = dev.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, COUNT);
    pass.end();
    dev.queue.submit([encoder.finish()]);
  });
}
