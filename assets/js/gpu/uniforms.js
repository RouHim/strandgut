export function createUniforms() {
  const u = {
    time: 0, w: 0, h: 0,
    glowX: -1, glowY: -1, glow: 0,
    rippleT: -1,
    setSize(w, h) { u.w = w; u.h = h; },
    setGlow(x, y, s) { u.glowX = x; u.glowY = y; u.glow = s; },
    clearGlow() { u.glow = 0; },
    fireRipple() { u.rippleT = 0; },
    tick(dt) {
      u.time += dt;
      if (u.rippleT >= 0) {
        u.rippleT += dt;
        if (u.rippleT > 1.2) u.rippleT = -1;
      }
    },
  };
  return u;
}

export function applyUniforms(gl, loc, u) {
  gl.uniform1f(loc.time, u.time);
  gl.uniform2f(loc.res, u.w, u.h);
  gl.uniform3f(loc.glow, u.glowX, u.glowY, u.glow);
  gl.uniform1f(loc.ripple, u.rippleT);
}

export function getUniformLocs(gl, prog) {
  return {
    time: gl.getUniformLocation(prog, 'u_time'),
    res: gl.getUniformLocation(prog, 'u_res'),
    glow: gl.getUniformLocation(prog, 'u_glow'),
    ripple: gl.getUniformLocation(prog, 'u_ripple'),
  };
}
