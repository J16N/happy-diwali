// Smoke and paper debris. Both are slow, soft things that ride the breeze,
// so they live in their own small pools separate from the sparks.
//
// Smoke puffs grow as they spread, rise a little (warm), drift with the wind
// and fade over several seconds. Their colour is a dim grey; the renderer
// lights them from the frame's light map, so a burst glows inside its smoke.

import { clamp, rand, TAU } from '../utils.js';

const SX = 0, SY = 1, SZ = 2, SVX = 3, SVY = 4, SVZ = 5, SAGE = 6, SLIFE = 7;
const SSIZE = 8, SGROW = 9, SALPHA = 10, SROT = 11, SROTV = 12, SVAR = 13, SBUOY = 14, SHADE = 15;
const SSTRIDE = 16;

export class SmokePool {
  constructor(max) {
    this.max = max;
    this.data = new Float32Array(max * SSTRIDE);
    this.count = 0;
    this.density = 1;
    this._p = {};
  }

  clear() {
    this.count = 0;
  }

  /**
   * o: { vx, vy, vz, size, grow, life, alpha, buoy, shade }
   * size is the starting radius, grow how many times bigger it gets per sqrt(second).
   */
  add(x, y, z, o = {}) {
    if (this.count >= this.max) {
      // Recycle the oldest-looking puff rather than drop new smoke.
      this._remove(Math.floor(Math.random() * this.count));
    }
    const d = this.data, k = this.count++ * SSTRIDE;
    d[k + SX] = x; d[k + SY] = y; d[k + SZ] = z;
    d[k + SVX] = o.vx ?? 0; d[k + SVY] = o.vy ?? 0; d[k + SVZ] = o.vz ?? 0;
    d[k + SAGE] = 0; d[k + SLIFE] = o.life ?? 4;
    d[k + SSIZE] = o.size ?? 10; d[k + SGROW] = o.grow ?? 1.5;
    d[k + SALPHA] = o.alpha ?? 0.2;
    d[k + SROT] = rand(TAU); d[k + SROTV] = rand(-0.4, 0.4);
    d[k + SVAR] = Math.floor(Math.random() * 4);
    d[k + SBUOY] = o.buoy ?? 6;
    d[k + SHADE] = o.shade ?? 1;
  }

  _remove(i) {
    const last = --this.count;
    if (i !== last) this.data.copyWithin(i * SSTRIDE, last * SSTRIDE, (last + 1) * SSTRIDE);
  }

  update(dt, wind) {
    const d = this.data;
    const k = 1 - Math.exp(-dt * 1.1);
    for (let i = 0; i < this.count; ) {
      const o = i * SSTRIDE;
      d[o + SAGE] += dt;
      if (d[o + SAGE] >= d[o + SLIFE]) {
        this._remove(i);
        continue;
      }
      d[o + SVX] += (wind.x - d[o + SVX]) * k;
      d[o + SVY] += (-d[o + SBUOY] - d[o + SVY]) * k;
      d[o + SVZ] += (wind.z - d[o + SVZ]) * k;
      d[o + SX] += d[o + SVX] * dt;
      d[o + SY] += d[o + SVY] * dt;
      d[o + SZ] += d[o + SVZ] * dt;
      d[o + SROT] += d[o + SROTV] * dt;
      i++;
    }
  }

  collect(view, frame) {
    const d = this.data;
    const p = this._p;
    for (let i = 0; i < this.count; i++) {
      const o = i * SSTRIDE;
      const age = d[o + SAGE], life = d[o + SLIFE];
      const env = clamp(age / 0.3, 0, 1) * Math.pow(1 - age / life, 1.1);
      const a = d[o + SALPHA] * env;
      if (a < 0.004) continue;
      view.project(d[o + SX], d[o + SY], d[o + SZ], p);
      const size = d[o + SSIZE] * (1 + d[o + SGROW] * Math.sqrt(age)) * p.p;
      const s = d[o + SHADE];
      const batch = d[o + SZ] > view.zCity ? frame.far.smoke : frame.near.smoke;
      // Thinning: a puff gets more transparent as it spreads.
      batch.add(p.x, p.y, size, d[o + SROT], 74 * s, 68 * s, 84 * s, a, d[o + SVAR]);
    }
  }
}

// ---- paper bits ----------------------------------------------------------------
const DX = 0, DY = 1, DZ = 2, DVX = 3, DVY = 4, DVZ = 5, DAGE = 6, DLIFE = 7;
const DROT = 8, DROTV = 9, DSIZE = 10, DPH = 11, DCELL = 12;
const DSTRIDE = 13;

/** Bits of red paper and jute that flutter down and settle on the floor. */
export class DebrisPool {
  constructor(max) {
    this.max = max;
    this.data = new Float32Array(max * DSTRIDE);
    this.count = 0;
    this.S = 1;
    this.cells = [];
    this._p = {};
  }

  clear() {
    this.count = 0;
  }

  add(x, y, z, vx, vy, vz, cellIndex = 0) {
    if (this.count >= this.max) this._remove(0);
    const d = this.data, k = this.count++ * DSTRIDE;
    d[k + DX] = x; d[k + DY] = y; d[k + DZ] = z;
    d[k + DVX] = vx; d[k + DVY] = vy; d[k + DVZ] = vz;
    d[k + DAGE] = 0; d[k + DLIFE] = rand(4, 7);
    d[k + DROT] = rand(TAU); d[k + DROTV] = rand(-12, 12);
    d[k + DSIZE] = rand(3, 5.5) * this.S;
    d[k + DPH] = rand(TAU);
    d[k + DCELL] = cellIndex;
  }

  _remove(i) {
    const last = --this.count;
    if (i !== last) this.data.copyWithin(i * DSTRIDE, last * DSTRIDE, (last + 1) * DSTRIDE);
  }

  update(dt, wind, floorY) {
    const d = this.data, S = this.S;
    const k = 1 - Math.exp(-dt * 2.6);
    for (let i = 0; i < this.count; ) {
      const o = i * DSTRIDE;
      d[o + DAGE] += dt;
      if (d[o + DAGE] >= d[o + DLIFE]) {
        this._remove(i);
        continue;
      }
      if (d[o + DY] < floorY) {
        // Paper is light: strong drag towards the wind, a flutter, a slow fall.
        const flutter = Math.sin(d[o + DAGE] * 9 + d[o + DPH]) * 40 * S;
        d[o + DVX] += (wind.x + flutter - d[o + DVX]) * k;
        d[o + DVZ] += (wind.z - d[o + DVZ]) * k;
        d[o + DVY] += (55 * S - d[o + DVY]) * k * 0.6 + 120 * S * dt * 0.3;
        d[o + DX] += d[o + DVX] * dt;
        d[o + DY] += d[o + DVY] * dt;
        d[o + DZ] += d[o + DVZ] * dt;
        d[o + DROT] += d[o + DROTV] * dt;
      } else {
        d[o + DY] = floorY;
        d[o + DROTV] = 0;
      }
      i++;
    }
  }

  collect(view, frame) {
    const d = this.data, p = this._p;
    for (let i = 0; i < this.count; i++) {
      const o = i * DSTRIDE;
      const age = d[o + DAGE], life = d[o + DLIFE];
      const a = clamp((life - age) / 1.2, 0, 1);
      view.project(d[o + DX], d[o + DY], d[o + DZ], p);
      const s = d[o + DSIZE] * p.p;
      // Spinning paper shows its edge every half turn.
      const flip = 0.25 + 0.75 * Math.abs(Math.cos(d[o + DROT] * 0.7));
      frame.sprites.add(p.x, p.y, s * 1.6, s * flip, d[o + DROT], 1, a, 0, this.cells[d[o + DCELL] | 0]);
    }
  }
}
