// A sky rocket (the Diwali "aasman tara"). It kicks off the stick, burns
// for a moment (accelerating), then coasts, slowing towards the top of its
// arc where the shell breaks. It sheds hot sparks and a thin smoke trail and
// lights its own smoke from inside.
//
// style:
//   straight  barely a wobble
//   wobble    a bent stick: a slow wander that settles
//   zigzag    a cheap rocket: jerks left and right all the way up
// Text shells always fly straight so the letters land where they should.

import { F } from '../engine/particles.js';
import { PHYS } from '../config.js';
import { clamp, lerp, rand, TAU } from '../utils.js';

// Normalised height-vs-time for thrust then coast: speed ramps up over the
// first ~12 %, then decays to almost nothing at the apex.
const PROFILE = (() => {
  const n = 96;
  const v = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    v.push(clamp(u / 0.12, 0, 1) * Math.pow(1 - u, 1.15) + 0.02);
  }
  const out = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) out[i + 1] = out[i] + v[i];
  for (let i = 0; i <= n; i++) out[i] /= out[n];
  return out;
})();

function ease(u) {
  const f = clamp(u, 0, 1) * (PROFILE.length - 1);
  const i = Math.floor(f);
  if (i >= PROFILE.length - 1) return 1;
  return lerp(PROFILE[i], PROFILE[i + 1], f - i);
}

const SPARK = [255, 186, 96];
const HEAD = [255, 226, 170];

export class Rocket {
  /** o: { x0, y0, z0, x1, y1, z1, rise, onBurst(x, y, z), style, whistle } */
  constructor(world, o) {
    this.w = world;
    this.x0 = o.x0; this.y0 = o.y0; this.z0 = o.z0 ?? 0;
    this.x1 = o.x1; this.y1 = o.y1; this.z1 = o.z1 ?? this.z0;
    this.rise = o.rise;
    this.onBurst = o.onBurst;
    this.style = o.style ?? 'straight';
    this.t = 0;
    this.x = this.x0; this.y = this.y0; this.z = this.z0;
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.ph = rand(TAU);
    this.acc = 0;
    this.smokeAcc = 0;
    // Lateral drift state for wobble / zigzag.
    this.lx = 0; this.lvx = 0; this.lz = 0;
    this.kick = 0;
    this.wander = rand(-1, 1);
    const h = world.hear(this.x0, this.y0, this.z0);
    world.sound.launch(h.pan, this.rise, {
      whistle: o.whistle ?? Math.random() < 0.3,
      far: h.far,
      zigzag: this.style === 'zigzag',
    });
    // Ignition: a puff of smoke at the stick.
    world.smokeCloud(this.x0, this.y0, this.z0, 3, { size: 9, spread: 30, life: [2, 3.5], alpha: 0.2, buoy: 3 });
  }

  /** Returns false once the shell has burst. */
  update(dt) {
    const w = this.w;
    const S = w.S;
    this.t += dt;
    const u = Math.min(1, this.t / this.rise);
    const e = ease(u);

    // Lateral motion on top of the planned path.
    if (this.style === 'zigzag') {
      this.kick -= dt;
      if (this.kick <= 0) {
        this.kick = rand(0.08, 0.2);
        const side = this.lx > 0 ? -1 : 1;
        this.lvx = side * rand(240, 460) * S * (Math.random() < 0.2 ? -1 : 1);
      }
      this.lvx *= Math.exp(-dt * 3);
      this.lx += this.lvx * dt;
    } else {
      const amp = (this.style === 'wobble' ? 26 : 3) * S;
      const settle = 1 - u * u;
      this.lx = (Math.sin(u * 9 + this.ph) * 0.4 + this.wander * Math.sin(u * Math.PI)) * amp * settle;
    }

    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.x = lerp(this.x0, this.x1, e) + this.lx;
    this.y = lerp(this.y0, this.y1, e);
    this.z = lerp(this.z0, this.z1, e);
    if (dt > 0) {
      this.vx = (this.x - this.px) / dt;
      this.vy = (this.y - this.py) / dt;
      this.vz = (this.z - this.pz) / dt;
    }

    // Thrust is strongest early; sparks pour out of the motor while it burns.
    const burn = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    this.acc += dt * 170 * w.density * (0.3 + 0.7 * burn);
    const nozzle = Math.max(1e-3, Math.hypot(this.vx, this.vy, this.vz));
    while (this.acc >= 1) {
      this.acc -= 1;
      const k = rand(0.15, 0.35);
      const back = rand(60, 160) * S * burn;
      w.pool.spawn(
        this.x + rand(-1, 1) * S, this.y, this.z,
        -this.vx * k - (this.vx / nozzle) * back + rand(-22, 22) * S,
        -this.vy * k - (this.vy / nozzle) * back + rand(-10, 10) * S,
        -this.vz * k + rand(-15, 15) * S,
        rand(0.25, 0.65), Math.max(1.8, 3.2 * S), SPARK, 0.02 / S, PHYS.gravity * S,
        F.HOT | F.EMBER | F.FLICKER, 0, 1.1,
      );
    }

    this.smokeAcc += dt * 18 * w.density;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      w.puff(this.x, this.y, this.z, {
        vx: rand(-6, 6) * S, vy: rand(-4, 4) * S, size: rand(4, 6) * S, grow: 2.4,
        life: rand(2.6, 4.2), alpha: 0.2 * (0.4 + 0.6 * burn), buoy: 3 * S,
      });
    }

    if (u >= 1) {
      this.onBurst(this.x, this.y, this.z);
      return false;
    }
    return true;
  }

  draw(frame) {
    const v = this.w.view;
    const S = this.w.S;
    const p = v.project(this.x, this.y, this.z, {});
    const q = v.project(this.px - this.vx * 0.03, this.py - this.vy * 0.03, this.pz - this.vz * 0.03, {});
    const glow = this.z > v.zCity ? frame.far.glow : frame.near.glow;
    const u = Math.min(1, this.t / this.rise);
    const burn = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    glow.add(q.x, q.y, p.x, p.y, 1.4 * S * p.p, 5 * S * p.p, HEAD[0], HEAD[1], HEAD[2], 1.1 + burn * 0.8);
    const I = 0.32 * (0.4 + burn) * p.p;
    frame.lights.add(p.x, p.y, 150 * S * p.p, 150 * S * p.p, I, I * 0.7, I * 0.35);
  }
}
