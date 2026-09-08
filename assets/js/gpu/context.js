import { isGpuAmbientAllowed } from './detect.js';

let device = null;
let gpuContext = null;
let canvas = null;
let passes = [];
let rafId = 0;
let lastT = 0;

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  passes = [];
  if (canvas) canvas.remove();
  canvas = null;
  gpuContext = null;
  device = null;
}

function fitCanvas() {
  if (!canvas) return;
  const w = Math.max(1, Math.floor(window.innerWidth * 0.5));
  const h = Math.max(1, Math.floor(window.innerHeight * 0.5));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

function frame(t) {
  rafId = 0;
  if (!device || passes.length === 0) return;
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  try {
    const texture = gpuContext.getCurrentTexture();
    const view = texture.createView();
    for (const pass of passes) pass(device, gpuContext, view, dt);
  } catch (err) {
    console.error('WebGPU frame failed, disabling ambient canvas:', err);
    teardown();
    return;
  }
  rafId = requestAnimationFrame(frame);
}

export function addPass(fn) {
  passes.push(fn);
  if (!rafId && device) {
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

export function getCanvas() { return canvas; }

async function initGpuCanvasOnce() {
  if (!isGpuAmbientAllowed()) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
    if (!device) return null;
  } catch (err) {
    console.error('WebGPU unavailable, using static background:', err);
    return null;
  }
  canvas = document.createElement('canvas');
  canvas.className = 'gpu-canvas';
  canvas.setAttribute('data-testid', 'gpu-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const main = document.querySelector('main');
  if (!main || !main.parentNode) { device.destroy(); device = null; return null; }
  main.parentNode.insertBefore(canvas, main);
  const format = navigator.gpu.getPreferredCanvasFormat();
  gpuContext = canvas.getContext('webgpu');
  try {
    gpuContext.configure({ device, format, alphaMode: 'premultiplied' });
  } catch (err) {
    console.error('WebGPU configure failed, using static background:', err);
    teardown();
    return null;
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  device.lost.then(() => teardown());
  document.addEventListener('visibilitychange', () => {
    if (!device) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (passes.length > 0 && !rafId) {
      lastT = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
  return { device, format };
}

let initPromise = null;

export function initGpuCanvas() {
  if (!initPromise) initPromise = initGpuCanvasOnce();
  return initPromise;
}
