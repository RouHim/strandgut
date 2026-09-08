export const UNIFORM_FLOATS = 8;

export function createUniforms(device) {
  const array = new Float32Array(UNIFORM_FLOATS);
  array[3] = -1;
  array[4] = -1;
  array[6] = -1;
  const buffer = device.createBuffer({
    size: UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const queue = device.queue;
  function flush() { queue.writeBuffer(buffer, 0, array); }
  flush();
  return {
    buffer,
    setSize(w, h) { array[1] = w; array[2] = h; flush(); },
    setGlow(x, y, s) { array[3] = x; array[4] = y; array[5] = s; flush(); },
    clearGlow() { array[5] = 0; flush(); },
    fireRipple() { array[6] = 0; flush(); },
    tick(dt) {
      array[0] += dt;
      if (array[6] >= 0) {
        array[6] += dt;
        if (array[6] > 1.2) array[6] = -1;
      }
      flush();
    },
  };
}
