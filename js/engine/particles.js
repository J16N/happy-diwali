// Fixed-size particle pool stored in one Float32Array (no per-particle objects,
// so no garbage collection pauses). Live particles occupy [0, count); dead
// ones are removed by copying the last live particle over them.
//
// Physics per particle:
//   - quadratic air drag against the wind: a star leaves the shell fast,
//     slows hard, then sinks at a terminal speed instead of accelerating forever
//   - gravity
//   - bounces on the terrace floor (sparks skitter instead of vanishing)
// Colour follows the burn: white-hot at ignition, then the star's own colour,
// then (for embers) a dimming orange-red before it goes out.

import { rand, randn, TAU, mixColor } from '../utils.js';

export const F = {
  TRAIL: 1, // draw a motion streak behind the head
  TWINKLE: 2, // shimmer
  TAIL: 4, // keeps shedding glitter (willow / palm / comet)
  SPLIT: 8, // crossette: breaks into four at half life
  CRACKLE: 16, // ends in a few tiny white pops
  STROBE: 32, // blinks on and off
  HOT: 64, // starts white-hot
  EMBER: 128, // ends as a dimming orange-red ember
  SMOKE: 256, // leaves a thin smoke trail
  BREAK: 512, // multi-break: bursts into a small shell when it dies
  FORK: 1024, // sparkler spark: branches once into tiny sparks
  FLICKER: 2048, // sputters as it burns out
  NOFLOOR: 4096, // ignores the floor (things far behind the skyline)
};

const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5;
const LIFE = 6, MAX = 7, SIZE = 8, R = 9, G = 10, B = 11;
const DRAG = 12, GRAV = 13, FLAGS = 14, AUX = 15, BRIGHT = 16, PH = 17, ACC = 18;
const STRIDE = 20;

const EMBER_RGB = [255, 84, 24];
const WHITE = [255, 250, 240];
const GLITTER = [255, 214, 140];

export class ParticlePool {
  /** hooks: { crackle(x, y, z), smoke(x, y, z, size), subBurst(x, y, z, rgb) } */
  constructor(max, hooks = {}) {
    this.max = max;
    this.data = new Float32Array(max * STRIDE);
    this.count = 0;
    this.hooks = hooks;
    this.S = 1;
    this.density = 1;
    this.trails = true;
    this._p = { x: 0, y: 0, p: 1 };
    this._q = { x: 0, y: 0, p: 1 };
  }

  clear() {
    this.count = 0;
  }

  /**
   * drag: quadratic coefficient k (1/px). Terminal speed is sqrt(grav / k).
   * size: glow radius at full life (px at z = 0).
   */
  spawn(x, y, z, vx, vy, vz, life, size, color, drag, grav, flags = 0, aux = 0, bright = 1) {
    if (this.count >= this.max) return -1;
    const d = this.data;
    const i = this.count++;
    const o = i * STRIDE;
    d[o + X] = x; d[o + Y] = y; d[o + Z] = z;
    d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
    d[o + LIFE] = life; d[o + MAX] = life;
    d[o + SIZE] = size;
    d[o + R] = color[0]; d[o + G] = color[1]; d[o + B] = color[2];
    d[o + DRAG] = drag; d[o + GRAV] = grav;
    d[o + FLAGS] = flags; d[o + AUX] = aux;
    d[o + BRIGHT] = bright; d[o + PH] = rand(TAU); d[o + ACC] = 0;
    return i;
  }

  _remove(i) {
    const last = --this.count;
    if (i !== last) this.data.copyWithin(i * STRIDE, last * STRIDE, (last + 1) * STRIDE);
  }

  update(dt, wind, floorY) {
    const d = this.data;
    const S = this.S;
    const wx = wind.x, wz = wind.z;
    for (let i = 0; i < this.count; ) {
      const o = i * STRIDE;
      d[o + LIFE] -= dt;
      const flags = d[o + FLAGS] | 0;

      if (d[o + LIFE] <= 0) {
        if (flags & F.CRACKLE) this._crackle(o);
        if (flags & F.BREAK && this.hooks.subBurst) {
          this.hooks.subBurst(d[o + X], d[o + Y], d[o + Z], [d[o + R], d[o + G], d[o + B]]);
        }
        this._remove(i);
        continue;
      }

      // Quadratic drag on the velocity relative to the air.
      const rx = d[o + VX] - wx, ry = d[o + VY], rz = d[o + VZ] - wz;
      const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const f = 1 / (1 + d[o + DRAG] * sp * dt);
      d[o + VX] = wx + rx * f;
      d[o + VY] = ry * f + d[o + GRAV] * dt;
      d[o + VZ] = wz + rz * f;
      d[o + X] += d[o + VX] * dt;
      d[o + Y] += d[o + VY] * dt;
      d[o + Z] += d[o + VZ] * dt;

      if (d[o + Y] > floorY && d[o + VY] > 0 && !(flags & F.NOFLOOR)) {
        d[o + Y] = floorY;
        d[o + VY] *= -rand(0.15, 0.4);
        d[o + VX] *= 0.55;
        d[o + VZ] *= 0.55;
        d[o + LIFE] *= 0.75;
      }

      if (flags & F.TAIL) {
        d[o + ACC] += d[o + AUX] * dt * this.density;
        while (d[o + ACC] >= 1) {
          d[o + ACC] -= 1;
          const c = mixColor([d[o + R], d[o + G], d[o + B]], GLITTER, 0.6);
          this.spawn(
            d[o + X], d[o + Y], d[o + Z],
            d[o + VX] * 0.05 + rand(-12, 12) * S, d[o + VY] * 0.05 + rand(-12, 6) * S, rand(-8, 8) * S,
            rand(0.35, 0.9), d[o + SIZE] * 0.45, c, 0.03 / S, 70 * S, F.TWINKLE | F.EMBER | F.FLICKER, 0, 0.9,
          );
        }
      }

      if (flags & F.SMOKE && this.hooks.smoke && Math.random() < dt * 2.2 * this.density) {
        this.hooks.smoke(d[o + X], d[o + Y], d[o + Z], d[o + SIZE]);
      }

      if (flags & F.FORK && d[o + LIFE] < d[o + MAX] * rand(0.3, 0.75)) {
        this._fork(o);
        this._remove(i);
        continue;
      }

      if (flags & F.SPLIT && d[o + LIFE] < d[o + MAX] * 0.5) {
        this._split(o);
        this._remove(i);
        continue;
      }
      i++;
    }
  }

  _split(o) {
    const d = this.data;
    const S = this.S;
    const a0 = rand(TAU);
    const tilt = rand(-0.5, 0.5);
    const color = mixColor([d[o + R], d[o + G], d[o + B]], WHITE, 0.25);
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * TAU) / 4;
      const sp = 150 * S;
      const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
      this.spawn(
        d[o + X], d[o + Y], d[o + Z],
        vx + d[o + VX] * 0.3, vy * Math.cos(tilt) + d[o + VY] * 0.3, vy * Math.sin(tilt),
        rand(0.6, 0.95), d[o + SIZE] * 0.8, color, 0.012 / S, 60 * S, F.TRAIL | F.HOT | F.FLICKER, 0, 1.4,
      );
    }
    if (this.hooks.crackle) this.hooks.crackle(d[o + X], d[o + Y], d[o + Z], 0.6);
  }

  _fork(o) {
    const d = this.data;
    const S = this.S;
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    const base = Math.atan2(d[o + VY], d[o + VX]);
    for (let k = 0; k < n; k++) {
      const a = base + randn() * 0.7;
      const sp = rand(30, 90) * S;
      this.spawn(
        d[o + X], d[o + Y], d[o + Z], Math.cos(a) * sp, Math.sin(a) * sp, rand(-20, 20) * S,
        rand(0.05, 0.14), d[o + SIZE] * 0.6, WHITE, 0.02 / S, 40 * S, F.TRAIL, 0, 1.6,
      );
    }
  }

  _crackle(o) {
    const d = this.data;
    const S = this.S;
    for (let k = 0; k < 3; k++) {
      this.spawn(
        d[o + X], d[o + Y], d[o + Z], rand(-80, 80) * S, rand(-80, 80) * S, rand(-40, 40) * S,
        rand(0.05, 0.16), d[o + SIZE] * 0.8, WHITE, 0.02 / S, 0, 0, 0, 2.4,
      );
    }
    if (this.hooks.crackle) this.hooks.crackle(d[o + X], d[o + Y], d[o + Z], 1);
  }

  /** Fill the far / near glow batches. */
  collect(view, frame, time) {
    const d = this.data;
    const trails = this.trails;
    const zCity = view.zCity;
    const p = this._p, q = this._q;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      const life = d[o + LIFE], max = d[o + MAX];
      const f = life / max;
      const age = max - life;
      const flags = d[o + FLAGS] | 0;
      const ph = d[o + PH];

      let a = d[o + BRIGHT] * (f > 0.3 ? 1 : f / 0.3);
      if (flags & F.TWINKLE) a *= 0.72 + 0.28 * Math.sin(time * 29 + ph * 7);
      if (flags & F.FLICKER && f < 0.4) a *= Math.sin(time * 61 + ph * 13) > -0.3 ? 1 : 0.15;
      if (flags & F.STROBE) a *= Math.sin(time * 22 + ph * 5) > 0.25 ? 1.3 : 0.02;
      if (a < 0.015) continue;

      let r = d[o + R], g = d[o + G], b = d[o + B];
      if (flags & F.HOT) {
        const h = Math.max(0, 1 - age / 0.16);
        if (h > 0) {
          r += (WHITE[0] - r) * h * 0.85; g += (WHITE[1] - g) * h * 0.85; b += (WHITE[2] - b) * h * 0.85;
          a *= 1 + h * 0.8;
        }
      }
      if (flags & F.EMBER && f < 0.5) {
        const e = (0.5 - f) / 0.5;
        r += (EMBER_RGB[0] - r) * e * 0.85; g += (EMBER_RGB[1] - g) * e * 0.85; b += (EMBER_RGB[2] - b) * e * 0.85;
        a *= 1 - 0.45 * e;
      }

      const x = d[o + X], y = d[o + Y], z = d[o + Z];
      view.project(x, y, z, p);
      const size = d[o + SIZE] * p.p * (0.6 + 0.4 * f);
      let tx = p.x, ty = p.y;
      if (trails) {
        const tt = flags & F.TRAIL ? 0.05 : 0.016;
        view.project(x - d[o + VX] * tt, y - d[o + VY] * tt, z - d[o + VZ] * tt, q);
        tx = q.x;
        ty = q.y;
      }
      const batch = z > zCity ? frame.far.glow : frame.near.glow;
      batch.add(tx, ty, p.x, p.y, size * 0.3, size, r, g, b, a);
    }
  }
}
