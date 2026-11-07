// Ground crackers on the terrace floor: anar (flowerpot), chakra (ground
// spinner), phuljhadi (sparkler), ladi (string of crackers), bijli bomb,
// roman candle and sutli bomb.
//
// Each is placed at a world x and a floor depth z, has a body from the
// sprite atlas, a fuse that sputters before it goes, smoke, and light that
// falls on the floor around it. Interface: update(dt) -> alive, draw(frame).

import { F } from '../engine/particles.js';
import { COLORS, PALETTE, PHYS } from '../config.js';
import { clamp, lerp, rand, randn, pick, TAU, smoothstep, mixColor } from '../utils.js';

const WARM = [255, 190, 90];
const GOLD_SPARK = [255, 206, 120];
const G = (w) => PHYS.gravity * w.S;
// Ground crackers are right in front of us, so a metre covers many more
// pixels than up in the sky: their sparks fall at a correspondingly faster
// on-screen rate. Using sky gravity here made fountains look slow and short.
const GN = (w) => PHYS.nearGravity * w.S;

class Ground {
  constructor(world, { x, z, fuse = 0.7 }) {
    this.w = world;
    this.x = x;
    this.z = z;
    this.y = world.floorY;
    this.t = 0;
    this.fuse = fuse;
    this.fuseAcc = 0;
    this._p = {};
    if (fuse > 0) {
      const h = world.hear(x, this.y, z);
      world.sound.fuse(fuse, h.pan);
    }
  }

  get S() {
    return this.w.S;
  }

  /** Burning fuse: a few tiny sparks and a flicker of light at (x, y). */
  sputter(dt, x, y) {
    const w = this.w, S = w.S;
    this.fuseAcc += dt * 70;
    while (this.fuseAcc >= 1) {
      this.fuseAcc -= 1;
      w.pool.spawn(x, y, this.z, rand(-40, 40) * S, rand(-90, -20) * S, rand(-20, 20) * S,
        rand(0.1, 0.3), Math.max(1.4, 2.4 * S), WARM, 0.03 / S, G(w), F.HOT | F.FLICKER, 0, 1.2);
    }
    if (Math.random() < dt * 12) {
      w.puff(x, y, this.z, { vy: -rand(10, 25) * S, size: 3 * S, grow: 2.4, life: rand(1.5, 3), alpha: 0.16, buoy: 8 * S });
    }
  }

  fuseLight(frame, x, y, k = 1) {
    const v = this.w.view, p = v.project(x, y, this.z, this._p);
    const S = this.S * p.p;
    const f = (0.6 + 0.4 * Math.sin(this.t * 40)) * k;
    frame.near.glow.add(p.x, p.y, p.x, p.y, 1.2 * S, 5 * S, 255, 200, 120, 1.2 * f);
    frame.lights.add(p.x, p.y, 60 * S, 60 * S, 0.25 * f, 0.15 * f, 0.05 * f);
  }

  /** Light on the scene around (x, y) and a pool on the floor beneath it. */
  glowAt(frame, x, y, radius, color, intensity) {
    const v = this.w.view, p = v.project(x, y, this.z, this._p);
    const r = (color[0] / 255) * intensity, g = (color[1] / 255) * intensity, b = (color[2] / 255) * intensity;
    const R = radius * p.p;
    frame.lights.add(p.x, p.y, R, R, r, g, b);
    v.project(x, this.y, this.z, p);
    frame.lights.add(p.x, p.y, R * 0.7, R * 0.7 * v.squash(this.z), r * 0.6, g * 0.6, b * 0.6);
  }

  body(frame, cell, width, { rot = 0, squash = 1, alpha = 1, emissive = 0, x = this.x, y = this.y } = {}) {
    const v = this.w.view, p = v.project(x, y, this.z, this._p);
    const s = width * p.p;
    frame.sprites.add(p.x, p.y, s, s * (cell.h / cell.w), rot, squash, alpha, emissive, cell);
  }
}

/**
 * Anar: a flowerpot fountain. Every pot is a little different (size, how
 * hard it pushes). It catches with a sputter, builds to a roaring column
 * with surges and dips, throws branching "flower" sparks at the top, and
 * dies down shorter and wider as the pressure drops. Lots of smoke.
 */
export class Anar extends Ground {
  /**
   * height: how high this fountain throws, as a share of the sky above it:
   * 0.45 is a medium fountain, 0.85 a tall one. Random per anar by default,
   * so no two look the same, and relative to the screen so phones and
   * landscape screens get the same look.
   */
  constructor(world, { x, z, duration = rand(5, 7), color = null, size = rand(0.75, 1.35), height = rand(0.45, 0.85), fuse = rand(0.5, 0.9) }) {
    super(world, { x, z, fuse });
    this.duration = duration;
    this.color = color;
    this.size = size;
    // Peak height in world units: the share of open sky above the pot,
    // corrected for perspective (a pot further back looks smaller).
    const v = world.view;
    const p = v.scale(z);
    this.sky = (v.floorY - v.H * 0.06) / p;
    this.peak = this.sky * height;
    this.acc = 0;
    this.smokeAcc = 0;
    this.lit = false;
    this.cell = world.cells.anar;
    this.width = 26 * world.S * size;
    this.mouth = this.y - this.width * (this.cell.h / this.cell.w) * 0.9;
    this.ph = rand(TAU);
    this.surge = 0;
  }

  /** Current fountain height for pressure k: surges add a little, never past the top of the sky. */
  height(k) {
    return Math.min(this.peak * Math.min(k, 1.12), this.sky * 0.92);
  }

  /** Pressure: builds up, roars with surges, then gutters out. */
  env(t) {
    const up = smoothstep(0, 1.2, t);
    const down = Math.pow(clamp((this.duration - t) / 2.2, 0, 1), 0.7);
    const wobble = 0.86 + 0.08 * Math.sin(t * 5.3 + this.ph) + 0.06 * Math.sin(t * 13.1 + this.ph * 2);
    return up * down * wobble * (1 + this.surge);
  }

  update(dt) {
    const w = this.w, S = w.S;
    this.t += dt;
    if (this.t < this.fuse) {
      this.sputter(dt, this.x, this.mouth);
      return true;
    }
    const t = this.t - this.fuse;
    if (!this.lit) {
      this.lit = true;
      const h = w.hear(this.x, this.y, this.z);
      w.sound.hiss(this.duration, h.pan, 0.45 + 0.25 * this.size);
    }
    // Now and then the composition surges.
    this.surge *= Math.exp(-dt * 4);
    if (Math.random() < dt * 0.8) this.surge = rand(0.12, 0.3);
    const k = this.env(t);

    // Sparks this close to the camera fall at real speed (GN), and air drag
    // matters, so solve the launch speed that reaches height H with drag:
    // H = ln(1 + k v0^2 / g) / 2k.
    const g = GN(w);
    const drag = 0.0008 / S;
    const H = this.height(k);
    const v0 = Math.sqrt(((Math.exp(2 * drag * Math.max(H, 1)) - 1) * g) / drag);
    // Low pressure makes a shorter, wider spray.
    const spread = 0.09 + 0.12 * (1 - clamp(k, 0, 1));
    this.acc += dt * 320 * Math.min(k, 1.2) * this.size * w.density;
    while (this.acc >= 1) {
      this.acc -= 1;
      const tilt = randn() * spread, az = rand(TAU);
      const sp = v0 * rand(0.55, 1.03);
      const r = Math.random();
      const colored = this.color && r < 0.12;
      const flower = r > 0.72; // branching sparks that bloom near the top
      w.pool.spawn(
        this.x + rand(-2, 2) * S * this.size, this.mouth, this.z,
        Math.sin(tilt) * Math.cos(az) * sp, -Math.cos(tilt) * sp, Math.sin(tilt) * Math.sin(az) * sp,
        rand(1.0, 2.0), Math.max(1.4, (colored ? 3.4 : 2.2) * S * Math.sqrt(this.size)), colored ? this.color : GOLD_SPARK,
        drag, g, (r < 0.3 ? F.HOT : 0) | F.EMBER | F.FLICKER | F.TRAIL | (flower ? F.FORK : 0), 0, colored ? 1.2 : 0.55,
      );
    }
    // A thick, warm column of smoke that billows up and drifts away.
    this.smokeAcc += dt * 16 * Math.min(k, 1) * this.size * w.density;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const up = rand(0, 0.45) * H;
      w.puff(this.x + rand(-6, 6) * S, this.mouth - up, this.z, {
        vx: rand(-12, 12) * S, vy: -rand(40, 90) * S, vz: rand(-10, 10) * S,
        size: rand(9, 16) * S * this.size, grow: 2.4, life: rand(4, 7), alpha: 0.2, buoy: 26 * S,
      });
    }
    return t < this.duration;
  }

  draw(frame) {
    const S = this.S;
    this.body(frame, this.cell, this.width);
    if (this.t < this.fuse) return this.fuseLight(frame, this.x, this.mouth);
    const k = Math.min(this.env(this.t - this.fuse), 1.3);
    const flick = 0.85 + 0.15 * Math.sin(this.t * 31);
    const H = this.height(k);
    this.glowAt(frame, this.x, this.mouth - H * 0.3, (220 + 160 * this.size) * S, [255, 180, 90], 0.6 * k * flick);
    const p = this.w.view.project(this.x, this.mouth, this.z, this._p);
    // The roaring throat of the fountain.
    frame.near.glow.add(p.x, p.y, p.x, p.y - 12 * S * p.p * k, 1.6 * S * p.p * this.size, 6 * S * p.p * this.size, 255, 210, 140, 0.9 * k);
  }
}

/** Chakra: a spinner lying flat, spraying sparks far across the floor as it skitters about. */
export class Chakra extends Ground {
  constructor(world, { x, z, duration = rand(5, 6.5), fuse = rand(0.4, 0.7), colors }) {
    super(world, { x, z, fuse });
    this.duration = duration;
    this.colors = colors ?? [pick([COLORS.saffron, COLORS.gold]), pick([COLORS.crimson, COLORS.emerald, COLORS.cyan]), COLORS.gold];
    this.angle = rand(TAU);
    this.omega = 0;
    this.acc = 0;
    this.R = 18 * world.S;
    this.vx = 0;
    this.vz = 0;
    this.cell = world.cells.chakra;
    this.lit = false;
  }

  ramp(t) {
    return clamp(t / 0.7, 0, 1) * clamp((this.duration - t) / 1.4, 0, 1);
  }

  update(dt) {
    const w = this.w, S = w.S;
    this.t += dt;
    if (this.t < this.fuse) {
      this.sputter(dt, this.x + this.R, this.y);
      return true;
    }
    const t = this.t - this.fuse;
    if (!this.lit) {
      this.lit = true;
      const h = w.hear(this.x, this.y, this.z);
      w.sound.whirr(this.duration, h.pan);
    }
    const ramp = this.ramp(t);
    this.omega = 34 * ramp;
    this.angle += this.omega * dt;

    // Jets push it around: a jittery random walk, with friction, kept on the terrace.
    this.vx += randn() * 380 * S * ramp * dt;
    this.vz += randn() * 560 * S * ramp * dt;
    const fr = Math.exp(-dt * 2);
    this.vx *= fr;
    this.vz *= fr;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const v = w.view;
    const zMin = v.floorZ(0.08), zMax = v.floorZ(0.92);
    if (this.z < zMin || this.z > zMax) { this.vz *= -0.6; this.z = clamp(this.z, zMin, zMax); }
    const sx = v.project(this.x, this.y, this.z, this._p).x;
    if (sx < 30 * S || sx > v.W - 30 * S) { this.vx *= -0.6; this.x += this.vx * dt * 2; }

    // Fast, long-lived sparks with little drag, so the spray reaches far
    // across the floor; they hop and skid when they land.
    this.acc += dt * 360 * ramp * w.density;
    const g = GN(w);
    while (this.acc >= 1) {
      this.acc -= 1;
      const k = Math.floor(Math.random() * 3);
      const a = this.angle + (k * TAU) / 3 + randn() * 0.12;
      const cs = Math.cos(a), sn = Math.sin(a);
      const tang = this.omega * this.R * 0.75 + rand(120, 300) * S;
      const out = rand(10, 70) * S;
      w.pool.spawn(
        this.x + cs * this.R, this.y - 2 * S, this.z + sn * this.R,
        -sn * tang + cs * out + this.vx, -rand(60, 240) * S, cs * tang + sn * out + this.vz,
        rand(0.6, 1.3), Math.max(1.8, 2.8 * S), this.colors[k % this.colors.length],
        0.0022 / S, g, F.TRAIL | F.EMBER | (Math.random() < 0.25 ? F.HOT : 0) | (Math.random() < 0.15 ? F.FORK : 0), 0, 0.9,
      );
    }
    // Smoke swirls off the wheel and trails behind it.
    if (Math.random() < dt * 22 * ramp * w.density) {
      const a = rand(TAU);
      w.puff(this.x + Math.cos(a) * this.R, this.y - 4 * S, this.z + Math.sin(a) * this.R, {
        vx: Math.cos(a) * 30 * S, vy: -rand(10, 30) * S, vz: Math.sin(a) * 30 * S,
        size: rand(8, 13) * S, grow: 2.6, life: rand(3, 5.5), alpha: 0.2, buoy: 12 * S,
      });
    }
    return t < this.duration;
  }

  draw(frame) {
    const S = this.S;
    const sq = this.w.view.squash(this.z);
    this.body(frame, this.cell, 40 * S, { rot: this.angle, squash: sq, y: this.y - 1 * S });
    if (this.t < this.fuse) return this.fuseLight(frame, this.x + this.R, this.y);
    const ramp = this.ramp(this.t - this.fuse);
    const c = mixColor(this.colors[0], [255, 220, 160], 0.5);
    this.glowAt(frame, this.x, this.y - 12 * S, 320 * S, c, 0.7 * ramp);
    const p = this.w.view.project(this.x, this.y - 2 * S, this.z, this._p);
    frame.near.glow.add(p.x - 10 * S * p.p, p.y, p.x + 10 * S * p.p, p.y, 1.6 * S * p.p, 8 * S * p.p, c[0], c[1], c[2], 0.7 * ramp);
  }
}

/** Phuljhadi: a sparkler standing in a little clay stand, burning down. */
export class Sparkler extends Ground {
  constructor(world, { x, z, duration = rand(4.5, 6) }) {
    super(world, { x, z, fuse: 0.25 });
    this.duration = duration;
    this.len = 64 * world.S;
    this.acc = 0;
    this.lit = false;
    this.cells = world.cells;
  }

  tipY() {
    const t = clamp((this.t - this.fuse) / this.duration, 0, 1);
    return this.y - 6 * this.S - this.len * (1 - 0.55 * t);
  }

  update(dt) {
    const w = this.w, S = w.S;
    this.t += dt;
    const ty = this.tipY();
    if (this.t < this.fuse) return true;
    const t = this.t - this.fuse;
    if (!this.lit) {
      this.lit = true;
      const h = w.hear(this.x, this.y, this.z);
      w.sound.hiss(this.duration, h.pan, 0.4, true);
    }
    const k = clamp(t / 0.2, 0, 1) * clamp((this.duration - t) / 0.6, 0, 1);
    this.acc += dt * 200 * k * w.density;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = rand(TAU), el = randn() * 0.6, sp = rand(60, 210) * S;
      w.pool.spawn(this.x, ty, this.z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp - 20 * S, Math.sin(a) * Math.cos(el) * sp,
        rand(0.12, 0.35), Math.max(1.6, 2.8 * S), Math.random() < 0.6 ? [255, 246, 220] : GOLD_SPARK,
        0.012 / S, GN(w) * 0.5, F.TRAIL | F.FORK | F.HOT, 0, 1.5);
    }
    if (Math.random() < dt * 14 * k * w.density) {
      w.puff(this.x + rand(-3, 3) * S, ty, this.z, { vy: -rand(10, 30) * S, size: rand(4, 7) * S, grow: 2.6, life: rand(3, 5), alpha: 0.15, buoy: 16 * S });
    }
    return t < this.duration;
  }

  draw(frame) {
    const S = this.S, v = this.w.view;
    const ty = this.tipY();
    const wire = this.cells.wire;
    // Wire from the stand to the burning tip.
    const p = v.project(this.x, this.y - 4 * S, this.z, {});
    const q = v.project(this.x, ty, this.z, {});
    const h = p.y - q.y;
    frame.sprites.add(p.x, p.y, 3 * S * p.p, h, 0, 1, 1, 0, wire);
    this.body(frame, this.cells.stand, 16 * S);
    if (this.t < this.fuse) return;
    const t = this.t - this.fuse;
    const k = clamp(t / 0.2, 0, 1) * clamp((this.duration - t) / 0.6, 0, 1);
    const f = 0.8 + 0.2 * Math.sin(this.t * 47);
    // Red-hot bead at the tip.
    frame.near.glow.add(q.x, q.y + 5 * S * q.p, q.x, q.y, 1.8 * S * q.p, 7 * S * q.p, 255, 150, 60, 1.6 * k);
    frame.near.glow.add(q.x, q.y, q.x, q.y, 0, 40 * S * q.p, 255, 240, 210, 0.3 * k * f);
    this.glowAt(frame, this.x, ty, 220 * S, [255, 236, 200], 0.5 * k * f);
  }
}

/** Ladi: a string of crackers along the floor popping one after another. */
export class Ladi extends Ground {
  constructor(world, { x0, x1, z, count = 40, interval = 0.055 }) {
    super(world, { x: x0, z, fuse: 0.5 });
    this.x0 = x0;
    this.x1 = x1;
    this.count = count;
    this.interval = interval;
    this.i = 0;
    this.timer = 0;
    this.tail = 1.0;
    this.cell = world.cells.ladi;
    this.wave = rand(TAU);
    this.cracks = Array.from({ length: count }, (_, k) => {
      const u = k / Math.max(1, count - 1);
      return { x: lerp(x0, x1, u), dz: Math.sin(u * 9 + this.wave) * 10 * world.S, rot: rand(-0.6, 0.6) };
    });
  }

  _pop(i) {
    const w = this.w, S = w.S;
    const c = this.cracks[i];
    let x = c.x + rand(-3, 3) * S, y = this.y - 3 * S, z = this.z + c.dz;
    // Some crackers get flung and go off mid-air.
    if (Math.random() < 0.15) {
      x += rand(-30, 30) * S;
      y -= rand(15, 60) * S;
    }
    const h = w.hear(x, y, z);
    w.sound.pop(h.pan);
    w.flash(x, y, z, [255, 214, 150], { radius: 150 * S, intensity: 2.4, life: 0.09, pool: true });
    for (let k = 0; k < 8 * w.density; k++) {
      const a = rand(TAU);
      const sp = rand(80, 260) * S;
      w.pool.spawn(x, y, z, Math.cos(a) * sp, -Math.abs(Math.sin(a)) * sp * 1.2, rand(-1, 1) * sp * 0.6,
        rand(0.08, 0.25), Math.max(1.6, 2.8 * S), pick([GOLD_SPARK, [255, 250, 230]]), 0.02 / S, GN(w), F.TRAIL | F.HOT, 0, 1.8);
    }
    w.debrisBurst(x, y, z, 4, 150, [0, 0, 1]);
    w.puff(x, y - 4 * S, z, { vx: rand(-14, 14) * S, vy: -rand(15, 40) * S, size: rand(8, 13) * S, grow: 2.6, life: rand(4, 6.5), alpha: 0.3, buoy: 10 * S });
  }

  update(dt) {
    this.t += dt;
    if (this.t < this.fuse) {
      this.sputter(dt, this.x0, this.y - 4 * this.S);
      return true;
    }
    if (this.i < this.count) {
      this.timer += dt;
      while (this.timer >= this.interval && this.i < this.count) {
        this.timer -= this.interval * rand(0.5, 1.4);
        this._pop(this.i++);
      }
      return true;
    }
    this.tail -= dt;
    return this.tail > 0;
  }

  draw(frame) {
    const S = this.S, v = this.w.view;
    const p = this._p;
    for (let i = this.i; i < this.count; i++) {
      const c = this.cracks[i];
      v.project(c.x, this.y, this.z + c.dz, p);
      const s = 7 * S * p.p;
      frame.sprites.add(p.x, p.y, s, s * (this.cell.h / this.cell.w), c.rot + Math.PI / 2, 0.55, 1, 0, this.cell);
    }
    if (this.i < this.count) {
      const c = this.cracks[this.i];
      if (this.t < this.fuse) this.fuseLight(frame, this.x0, this.y - 4 * S);
      else {
        v.project(c.x, this.y - 3 * S, this.z + c.dz, p);
        frame.near.glow.add(p.x, p.y, p.x, p.y, 1 * S, 5 * S, 255, 200, 120, 1.2);
      }
    }
  }
}

/** Bijli bomb: a short fuse, then a big bang with a shockwave. */
export class Bomb extends Ground {
  constructor(world, { x, z, fuse = 1.0 }) {
    super(world, { x, z, fuse });
    this.banged = false;
    this.after = 0.4;
    this.cell = world.cells.bomb;
    this.width = 16 * world.S;
  }

  bang() {
    const w = this.w, S = w.S;
    const x = this.x, y = this.y - 10 * S, z = this.z;
    w.flash(x, y, z, [255, 244, 220], { radius: 900 * S, intensity: 4, life: 0.35, pool: true });
    w.ring(x, this.y, z, [255, 220, 170], 380 * S, 0.5);
    const h = w.hear(x, y, z);
    w.sound.thud(1, h.pan);
    w.view.shake = Math.max(w.view.shake, 5 * S * w.flashScale);
    for (let k = 0; k < Math.round(110 * w.density); k++) {
      const a = rand(Math.PI, TAU), sp = rand(150, 520) * S;
      w.pool.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rand(-0.6, 0.6) * sp,
        rand(0.4, 1.0), Math.max(2.2, 3.8 * S), pick([COLORS.white, COLORS.gold, GOLD_SPARK]),
        0.006 / S, GN(w), F.TRAIL | F.HOT | F.EMBER, 0, 1.6);
    }
    w.debrisBurst(x, y, z, 18, 280, [0, 1, 0]);
    w.smokeCloud(x, y - 10 * S, z, 14, { size: 22, spread: 120, life: [5, 9], alpha: 0.34, grow: 2.2, buoy: 7 });
  }

  update(dt) {
    this.t += dt;
    if (!this.banged) {
      const top = this.y - this.width * (this.cell.h / this.cell.w);
      this.sputter(dt, this.x + 3 * this.S, top);
      if (this.t >= this.fuse) {
        this.banged = true;
        this.bang();
      }
      return true;
    }
    this.after -= dt;
    return this.after > 0;
  }

  draw(frame) {
    if (this.banged) return;
    this.body(frame, this.cell, this.width);
    const top = this.y - this.width * (this.cell.h / this.cell.w);
    this.fuseLight(frame, this.x + 3 * this.S, top);
  }
}

/** Sutli bomb: a jute-wrapped ball with a long fuse and the loudest bang of all. */
export class Sutli extends Bomb {
  constructor(world, { x, z }) {
    super(world, { x, z, fuse: rand(1.4, 1.9) });
    this.cell = world.cells.sutli;
    this.width = 20 * world.S;
  }

  bang() {
    const w = this.w, S = w.S;
    const x = this.x, y = this.y - 10 * S, z = this.z;
    w.flash(x, y, z, [255, 252, 240], { radius: 1100 * S, intensity: 5, life: 0.3, pool: true });
    w.flash(x, y, z, [255, 200, 120], { radius: 500 * S, intensity: 2, life: 0.8, halo: false, pool: true });
    w.ring(x, this.y, z, [255, 236, 200], 460 * S, 0.45);
    const h = w.hear(x, y, z);
    w.sound.sutli(h.pan);
    w.view.shake = Math.max(w.view.shake, 9 * S * w.flashScale);
    for (let k = 0; k < Math.round(40 * w.density); k++) {
      const a = rand(Math.PI, TAU), sp = rand(200, 600) * S;
      w.pool.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rand(-0.5, 0.5) * sp,
        rand(0.15, 0.4), Math.max(2, 3.2 * S), [255, 240, 210], 0.01 / S, GN(w), F.TRAIL | F.HOT, 0, 2);
    }
    w.debrisBurst(x, y, z, 30, 320, [2, 2, 0]);
    w.smokeCloud(x, y - 14 * S, z, 22, { size: 26, spread: 150, life: [6, 11], alpha: 0.42, grow: 2.4, buoy: 8 });
  }
}

/** Roman candle: a tube that fires a string of coloured balls into the sky. */
export class RomanCandle extends Ground {
  constructor(world, { x, z, shots = 8, colors = null }) {
    super(world, { x, z, fuse: 0.6 });
    this.shots = shots;
    this.fired = 0;
    this.next = 0;
    this.tilt = rand(-0.12, 0.12);
    this.colors = colors ?? Array.from({ length: shots }, () => pick(PALETTE));
    this.cell = world.cells.candle;
    this.width = 11 * world.S;
    this.flashT = 0;
  }

  mouth() {
    const h = this.width * (this.cell.h / this.cell.w);
    return { x: this.x + Math.sin(this.tilt) * h, y: this.y - Math.cos(this.tilt) * h };
  }

  update(dt) {
    const w = this.w, S = w.S;
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    const m = this.mouth();
    if (this.t < this.fuse) {
      this.sputter(dt, m.x, m.y);
      return true;
    }
    const t = this.t - this.fuse;
    if (this.fired < this.shots && t >= this.next) {
      this.fired++;
      this.next = t + rand(0.45, 0.75);
      const c = this.colors[(this.fired - 1) % this.colors.length];
      const a = -Math.PI / 2 + this.tilt + randn() * 0.05;
      const sp = rand(560, 700) * S;
      w.pool.spawn(m.x, m.y, this.z, Math.cos(a) * sp, Math.sin(a) * sp, randn() * 20 * S,
        rand(1.5, 2.0), Math.max(3.6, 7 * S), c, 0.0016 / S, G(w), F.TRAIL | F.HOT | F.TAIL | F.EMBER, 16, 2);
      w.flash(m.x, m.y, this.z, mixColor(c, [255, 240, 210], 0.5), { radius: 240 * S, intensity: 2, life: 0.15, pool: true });
      w.smokeCloud(m.x, m.y - 6 * S, this.z, 3, { size: 9, spread: 30, life: [4, 6.5], alpha: 0.28, grow: 2.4, buoy: 14 });
      const h = w.hear(m.x, m.y, this.z);
      w.sound.candle(h.pan);
      this.flashT = 0.12;
    }
    return this.fired < this.shots || t < this.next + 0.3;
  }

  draw(frame) {
    this.body(frame, this.cell, this.width, { rot: this.tilt });
    const m = this.mouth();
    if (this.t < this.fuse) return this.fuseLight(frame, m.x, m.y);
    if (this.flashT > 0) {
      const p = this.w.view.project(m.x, m.y, this.z, this._p);
      frame.near.glow.add(p.x, p.y, p.x, p.y - 10 * this.S, 3 * this.S * p.p, 14 * this.S * p.p, 255, 220, 160, 2 * (this.flashT / 0.12));
    }
  }
}
