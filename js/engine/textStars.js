// "Stars" are the burning pellets that spell out text and emoji. Each belongs
// to a group (one shell). While the shell climbs they wait. When it bursts
// they are thrown out like any shell star (fast, scattered, slowed by air),
// and a guidance force that grows over the first half second pulls each one
// into its slot. That force is an underdamped spring, so stars overshoot a
// little and wobble before settling, instead of gliding along rails.
//
// While holding they sag slightly under gravity, shimmer and spit tiny sparks.
// On release they burn out unevenly: some fizzle in place, some drop as
// embers, a few leave glitter or crackle.

import { F } from './particles.js';
import { clamp, rand, randn, smoothstep, TAU } from '../utils.js';
import { PHYS } from '../config.js';

const OMEGA = 8.5; // spring stiffness (rad/s) once fully engaged
const ZETA = 0.5; // damping ratio: < 1 overshoots a little

export class TextStars {
  constructor(max) {
    this.max = max;
    this.count = 0;
    const f32 = () => new Float32Array(max);
    this.x = f32(); this.y = f32(); this.z = f32();
    this.vx = f32(); this.vy = f32(); this.vz = f32();
    this.ox = f32(); this.oy = f32();
    this.tx = f32(); this.ty = f32();
    this.age = f32(); this.delay = f32(); this.rel = f32();
    this.r = new Uint8Array(max); this.g = new Uint8Array(max); this.b = new Uint8Array(max);
    this.size = f32(); this.ph = f32();
    this.state = new Uint8Array(max); // 0 waiting, 1 burning, 2 released (gone)
    this.group = new Uint16Array(max);
    this.groups = 0;
    this.releasing = false;
    this.S = 1;
    this.density = 1;
    this.trails = true;
    this._p = {};
    this._q = {};
  }

  clear() {
    this.count = 0;
    this.groups = 0;
    this.releasing = false;
  }

  /** points: [{x, y, r, g, b, size}] in screen px (z = 0 plane). (ox, oy) is where the shell bursts. */
  addGroup(points, ox, oy) {
    const gid = this.groups++;
    for (const pt of points) {
      if (this.count >= this.max) break;
      const i = this.count++;
      this.ox[i] = ox; this.oy[i] = oy;
      this.x[i] = ox; this.y[i] = oy; this.z[i] = 0;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.tx[i] = pt.x; this.ty[i] = pt.y;
      this.delay[i] = rand(0, 0.06);
      this.age[i] = 0;
      this.r[i] = pt.r; this.g[i] = pt.g; this.b[i] = pt.b;
      this.size[i] = pt.size;
      this.ph[i] = rand(TAU);
      this.state[i] = 0;
      this.group[i] = gid;
    }
    return gid;
  }

  /** The group's shell has burst at (bx, by): throw its stars out. */
  start(gid, bx, by) {
    const S = this.S;
    for (let i = 0; i < this.count; i++) {
      if (this.group[i] !== gid || this.state[i] !== 0) continue;
      const ox = bx ?? this.ox[i], oy = by ?? this.oy[i];
      const dx = this.tx[i] - ox, dy = this.ty[i] - oy;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx) + randn() * 0.28;
      const sp = dist * rand(2.2, 3.4) + rand(40, 110) * S;
      this.x[i] = ox; this.y[i] = oy; this.z[i] = 0;
      this.vx[i] = Math.cos(ang) * sp;
      this.vy[i] = Math.sin(ang) * sp;
      this.vz[i] = randn() * 120 * S;
      this.age[i] = 0;
      this.state[i] = 1;
    }
  }

  update(dt, wind, pool) {
    const S = this.S;
    const g = PHYS.gravity * S;
    const drag = 0.0035 / S;
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      const st = this.state[i];
      if (st === 0) { alive++; continue; }
      if (st === 2) continue;
      alive++;

      if (this.releasing) {
        this.rel[i] -= dt;
        if (this.rel[i] <= 0) {
          this._burnOut(i, pool);
          this.state[i] = 2;
          continue;
        }
      }

      const age = (this.age[i] += dt) - this.delay[i];
      if (age < 0) continue;
      // Guidance ramps in, then slowly tires so the letters sag a touch.
      const ramp = smoothstep(0.04, 0.55, age);
      const tire = 1 - 0.18 * smoothstep(1.6, 5, age);
      const w = OMEGA * tire;
      const kS = w * w * ramp;
      const kD = 2 * ZETA * w * ramp;
      let vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const air = 1 / (1 + drag * sp * dt);
      // A burning star wavers a little: a smooth per-star wobble (cheaper and
      // calmer than fresh random numbers for thousands of stars every frame).
      const ph = this.ph[i];
      const jx = Math.sin(age * 11 + ph * 5) * 40 * S, jy = Math.cos(age * 9 + ph * 3) * 40 * S;
      vx = (vx + (kS * (this.tx[i] - this.x[i]) - kD * vx + jx + wind.x * 0.4 * ramp) * dt) * air;
      vy = (vy + (kS * (this.ty[i] - this.y[i]) - kD * vy + jy + g * 0.9) * dt) * air;
      vz = (vz + (kS * -this.z[i] - kD * vz) * dt) * air;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.x[i] += vx * dt;
      this.y[i] += vy * dt;
      this.z[i] += vz * dt;

      // Spit: the odd tiny spark drips off a holding star.
      if (age > 1 && Math.random() < dt * 0.35 * this.density) {
        pool.spawn(this.x[i], this.y[i], this.z[i], rand(-25, 25) * S, rand(0, 50) * S, 0,
          rand(0.2, 0.5), this.size[i] * 0.4, [this.r[i], this.g[i], this.b[i]], 0.02 / S, g, F.FLICKER | F.EMBER, 0, 1.1);
      }
    }
    if (this.releasing && alive === 0) this.clear();
  }

  collect(view, frame, time) {
    const p = this._p, q = this._q;
    const glow = frame.near.glow;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] !== 1) continue;
      const age = this.age[i] - this.delay[i];
      const ph = this.ph[i];
      let r = this.r[i], g = this.g[i], b = this.b[i];
      // White-hot for a moment after ignition.
      const hot = clamp(1 - age / 0.35, 0, 1);
      if (hot > 0) {
        r += (255 - r) * hot * 0.8; g += (250 - g) * hot * 0.8; b += (235 - b) * hot * 0.8;
      }
      let a = 1.05 + hot * 0.9;
      // A burning pellet never glows evenly.
      a *= 0.86 + 0.1 * Math.sin(time * 6.5 + ph) + 0.06 * Math.sin(time * 23 + ph * 3.1);
      if (this.releasing) a *= clamp(this.rel[i] / 0.15 + 0.6, 0.6, 1);

      view.project(this.x[i], this.y[i], this.z[i], p);
      const size = this.size[i] * p.p;
      let tx = p.x, ty = p.y;
      if (this.trails) {
        const tt = 0.035;
        view.project(this.x[i] - this.vx[i] * tt, this.y[i] - this.vy[i] * tt, this.z[i] - this.vz[i] * tt, q);
        tx = q.x;
        ty = q.y;
      }
      glow.add(tx, ty, p.x, p.y, size * 0.32, size * 0.95, r, g, b, a);
    }
  }

  /** Let the text burn out over ~0.6 s. */
  release() {
    if (!this.count) return;
    this.releasing = true;
    for (let i = 0; i < this.count; i++) {
      // Stars lower in the letters tend to go first, plus plenty of randomness.
      this.rel[i] = rand(0, 0.6);
      if (this.state[i] === 0) this.state[i] = 2;
    }
  }

  _burnOut(i, pool) {
    const S = this.S;
    const g = PHYS.gravity * S;
    const c = [this.r[i], this.g[i], this.b[i]];
    const x = this.x[i], y = this.y[i], z = this.z[i];
    const s = this.size[i];
    const roll = Math.random();
    if (roll < 0.38) {
      // Fizzles out where it hangs.
      pool.spawn(x, y, z, rand(-8, 8) * S, rand(-6, 10) * S, 0, rand(0.18, 0.55), s * 0.95, c,
        0.02 / S, g * 0.3, F.FLICKER, 0, 1.3);
    } else if (roll < 0.8) {
      // Drops as an ember.
      pool.spawn(x, y, z, rand(-22, 22) * S, rand(-18, 8) * S, rand(-10, 10) * S, rand(1.0, 2.2), s * 0.9, c,
        0.009 / S, g, F.TRAIL | F.EMBER | F.TWINKLE, 0, 1.15);
    } else if (roll < 0.93) {
      // Falls trailing glitter.
      pool.spawn(x, y, z, rand(-15, 15) * S, rand(-10, 10) * S, 0, rand(1.2, 2.0), s * 0.9, c,
        0.01 / S, g, F.TRAIL | F.EMBER | F.TAIL, 7, 1.1);
    } else {
      // Pops into glitter.
      pool.spawn(x, y, z, rand(-20, 20) * S, rand(-20, 10) * S, 0, rand(0.25, 0.8), s * 0.8, [255, 236, 200],
        0.015 / S, g * 0.6, F.CRACKLE | F.TWINKLE, 0, 1.2);
    }
  }
}
