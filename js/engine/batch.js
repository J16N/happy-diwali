// Flat Float32Array instance lists that the simulation fills every frame and
// the renderer (WebGL or Canvas 2D) draws. No per-frame allocation.

class Batch {
  constructor(stride, cap = 1024) {
    this.stride = stride;
    this.cap = cap;
    this.data = new Float32Array(stride * cap);
    this.n = 0;
  }
  reset() {
    this.n = 0;
  }
  _slot() {
    if (this.n >= this.cap) {
      this.cap *= 2;
      const next = new Float32Array(this.stride * this.cap);
      next.set(this.data);
      this.data = next;
    }
    return this.n++ * this.stride;
  }
  get view() {
    return this.data.subarray(0, this.n * this.stride);
  }
}

/**
 * A glowing star or streak: capsule from tail (x0, y0) to head (x1, y1).
 * core = radius of the white-hot centre, halo = radius of the coloured glow.
 * rgb 0..255, i = intensity (can exceed 1, the renderer keeps HDR).
 */
export class GlowBatch extends Batch {
  constructor(cap) {
    super(10, cap);
  }
  add(x0, y0, x1, y1, core, halo, r, g, b, i) {
    const d = this.data, o = this._slot();
    d[o] = x0; d[o + 1] = y0; d[o + 2] = x1; d[o + 3] = y1;
    d[o + 4] = core; d[o + 5] = halo;
    d[o + 6] = r; d[o + 7] = g; d[o + 8] = b; d[o + 9] = i;
  }
}

/** A smoke puff: centre, radius, rotation, base colour (0..255), alpha, variant 0..3. */
export class SmokeBatch extends Batch {
  constructor(cap) {
    super(9, cap);
  }
  add(x, y, size, rot, r, g, b, a, v) {
    const d = this.data, o = this._slot();
    d[o] = x; d[o + 1] = y; d[o + 2] = size; d[o + 3] = rot;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = v;
  }
}

/**
 * A textured body from the sprite atlas (cracker shells, diyas, paper bits).
 * The quad is rotated, then squashed vertically (a disc lying on the floor).
 */
export class SpriteBatch extends Batch {
  constructor(cap) {
    super(14, cap);
  }
  add(x, y, w, h, rot, squash, alpha, emissive, cell) {
    const d = this.data, o = this._slot();
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = rot; d[o + 5] = squash; d[o + 6] = alpha; d[o + 7] = emissive;
    d[o + 8] = cell.u0; d[o + 9] = cell.v0; d[o + 10] = cell.u1; d[o + 11] = cell.v1;
    d[o + 12] = cell.ax; d[o + 13] = cell.ay;
  }
}

/** A light: centre, radii (an ellipse for pools on the floor), rgb * intensity. */
export class LightBatch extends Batch {
  constructor(cap) {
    super(7, cap);
  }
  add(x, y, rx, ry, r, g, b) {
    const d = this.data, o = this._slot();
    d[o] = x; d[o + 1] = y; d[o + 2] = rx; d[o + 3] = ry;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b;
  }
}

/** Every batch of a Frame by name, for sending frames between threads. */
export const BATCHES = ['far.glow', 'far.smoke', 'near.glow', 'near.smoke', 'sprites', 'clouds', 'lights'];
export const batchOf = (frame, key) => {
  const dot = key.indexOf('.');
  return dot < 0 ? frame[key] : frame[key.slice(0, dot)][key.slice(dot + 1)];
};

/** Everything the renderer needs for one frame. */
export class Frame {
  constructor() {
    this.far = { glow: new GlowBatch(4096), smoke: new SmokeBatch(256) };
    this.near = { glow: new GlowBatch(16384), smoke: new SmokeBatch(512) };
    this.sprites = new SpriteBatch(256);
    this.clouds = new SpriteBatch(16);
    this.lights = new LightBatch(128);
    this.time = 0;
  }
  reset() {
    this.far.glow.reset();
    this.far.smoke.reset();
    this.clouds.reset();
    this.near.glow.reset();
    this.near.smoke.reset();
    this.sprites.reset();
    this.lights.reset();
  }
}
