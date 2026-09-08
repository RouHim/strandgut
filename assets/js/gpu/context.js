import { isGpuAmbientAllowed } from './detect.js';

let gl = null;
let canvas = null;
let passes = [];
let rafId = 0;
let lastT = 0;
let initPromise = null;

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  passes = [];
  if (canvas) canvas.remove();
  canvas = null;
  gl = null;
}

function fitCanvas() {
  if (!canvas || !gl) return;
  const w = Math.max(1, Math.floor(window.innerWidth * 0.5));
  const h = Math.max(1, Math.floor(window.innerHeight * 0.5));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

function frame(t) {
  rafId = 0;
  if (!gl || passes.length === 0) return;
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  try {
    for (const pass of passes) pass(gl, dt);
  } catch (err) {
    console.error('WebGL frame failed, disabling ambient canvas:', err);
    teardown();
    return;
  }
  rafId = requestAnimationFrame(frame);
}

export function addPass(fn) {
  passes.push(fn);
  if (!rafId && gl) {
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

export function getGL() { return gl; }

export function compileProgram(glc, vsSrc, fsSrc) {
  function shader(type, src) {
    const s = glc.createShader(type);
    glc.shaderSource(s, src);
    glc.compileShader(s);
    if (!glc.getShaderParameter(s, glc.COMPILE_STATUS)) {
      console.error('Shader compile failed:', glc.getShaderInfoLog(s));
      glc.deleteShader(s);
      return null;
    }
    return s;
  }
  const vs = shader(glc.VERTEX_SHADER, vsSrc);
  const fs = shader(glc.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = glc.createProgram();
  glc.attachShader(prog, vs);
  glc.attachShader(prog, fs);
  glc.linkProgram(prog);
  glc.deleteShader(vs);
  glc.deleteShader(fs);
  if (!glc.getProgramParameter(prog, glc.LINK_STATUS)) {
    console.error('Program link failed:', glc.getProgramInfoLog(prog));
    glc.deleteProgram(prog);
    return null;
  }
  return prog;
}

async function initGpuCanvasOnce() {
  if (!isGpuAmbientAllowed()) return null;
  canvas = document.createElement('canvas');
  canvas.className = 'gpu-canvas';
  canvas.setAttribute('data-testid', 'gpu-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const main = document.querySelector('main');
  if (!main || !main.parentNode) { canvas = null; return null; }
  main.parentNode.insertBefore(canvas, main);
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
    });
    if (!gl) { teardown(); return null; }
  } catch (err) {
    console.error('WebGL2 unavailable, using static background:', err);
    teardown();
    return null;
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    teardown();
  });
  document.addEventListener('visibilitychange', () => {
    if (!gl) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (passes.length > 0 && !rafId) {
      lastT = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
  return { gl };
}

export function initGpuCanvas() {
  if (!initPromise) initPromise = initGpuCanvasOnce();
  return initPromise;
}
