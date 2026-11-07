// The World owns every live thing (sparks, text stars, smoke, paper, rockets,
// ground crackers, lanterns, flashes), steps the physics and fills the frame
// for the renderer. It also keeps the breeze and works out how a bang sounds
// from where the viewer stands.

import { ParticlePool } from './particles.js';
import { TextStars } from './textStars.js';
import { SmokePool, DebrisPool } from './smoke.js';
import { View } from './view.js';
import { Frame } from './batch.js';
import { Rocket } from '../crackers/rocket.js';
import { PHYS } from '../config.js';
import { clamp, easeOutCubic, rand, TAU } from '../utils.js';

const MAX_FLASHES = 48;

export class World {
  constructor(sound, budget, cells) {
    this.sound = sound;
    this.budget = budget;
    this.cells = cells;
    this.view = new View();
    this.pool = new ParticlePool(budget.particles, {
      crackle: (x, y, z, k) => this.sound.crackle(this.pan(x, y, z), k, this.hear(x, y, z).delay),
      smoke: (x, y, z, size) => this.puff(x, y, z, { size: size * 1.8, grow: 1.8, life: rand(2.2, 3.6), alpha: 0.14, buoy: 4 * this.S }),
      subBurst: (x, y, z, c) => this.onSubBurst?.(x, y, z, c),
    });
    this.stars = new TextStars(budget.textStars);
    this.smoke = new SmokePool(budget.smoke);
    this.debris = new DebrisPool(budget.debris);
    this.debris.cells = [cells.paper, cells.paperGold, cells.jute];
    this.objects = [];
    this.flashes = [];
    this.frame = new Frame();
    this.time = 0;
    this.wind = { x: 0, z: 0 };
    this.windPh = rand(100);
    this.density = 1;
    this.flashScale = 1;
    this._p = {};
  }

  get W() { return this.view.W; }
  get H() { return this.view.H; }
  get S() { return this.view.S; }
  get floorY() { return this.view.floorY; }

  resize(w, h) {
    this.view.resize(w, h);
    const S = this.view.S;
    this.pool.S = S;
    this.stars.S = S;
    this.debris.S = S;
  }

  /** 0 = full quality, 1 = lighter, 2 = lightest. */
  setQuality(level) {
    this.density = [1, 0.7, 0.5][level] ?? 0.5;
    this.pool.density = this.density;
    this.stars.density = this.density;
    this.smoke.density = this.density;
    this.pool.trails = level < 2;
    this.stars.trails = level < 2;
  }

  clear() {
    this.pool.clear();
    this.stars.clear();
    this.smoke.clear();
    this.debris.clear();
    this.objects.length = 0;
    this.flashes.length = 0;
  }

  add(obj) {
    this.objects.push(obj);
    return obj;
  }

  launchRocket(o) {
    return this.add(new Rocket(this, o));
  }

  // ---- effects ------------------------------------------------------------

  /** A burst of light: lights the scene (light map) and, if halo, glows. */
  flash(x, y, z, color, { radius = 300, intensity = 1, life = 0.3, halo = true, pool = false } = {}) {
    if (this.flashes.length >= MAX_FLASHES) this.flashes.shift();
    this.flashes.push({ x, y, z, color, radius, intensity: intensity * this.flashScale, life, max: life, halo, pool, ring: false });
  }

  /** An expanding shockwave ring. */
  ring(x, y, z, color, radius, life = 0.5) {
    this.flashes.push({ x, y, z, color, radius, intensity: 1, life, max: life, ring: true });
  }

  puff(x, y, z, o) {
    this.smoke.add(x, y, z, o);
  }

  /** A cloud of n puffs pushed outward from (x, y, z). */
  smokeCloud(x, y, z, n, { size = 20, spread = 40, life = [4, 7], alpha = 0.22, grow = 2, buoy = 5, shade = 1 } = {}) {
    const S = this.S;
    n = Math.max(1, Math.round(n * (0.5 + this.density * 0.5)));
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), sp = rand(0.3, 1) * spread * S;
      this.smoke.add(x + rand(-4, 4) * S, y + rand(-4, 4) * S, z, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(-0.5, 0.5) * sp,
        size: size * S * rand(0.7, 1.2), grow, life: rand(life[0], life[1]), alpha: alpha * rand(0.7, 1.1), buoy: buoy * S, shade,
      });
    }
  }

  debrisBurst(x, y, z, n, speed = 160, kinds = [0, 0, 1]) {
    const S = this.S;
    n = Math.round(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.2, 1.2), sp = rand(0.3, 1) * speed * S;
      this.debris.add(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rand(-0.4, 0.4) * sp, kinds[i % kinds.length]);
    }
  }

  // ---- sound placement ------------------------------------------------------

  pan(x, y, z) {
    return clamp(this.view.project(x, y, z, this._p).x / this.W, 0, 1);
  }

  /** How far away a point is, for sound: { pan, delay (s), far 0..1 }. */
  hear(x, y, z) {
    const v = this.view;
    const S = v.S;
    const dx = x - v.cx, dy = y - v.H, dz = z + v.fov * 1.2;
    const metres = Math.hypot(dx, dy, dz) / (PHYS.metre * S);
    return {
      pan: this.pan(x, y, z),
      // Light arrives instantly, sound at 343 m/s: the bang lags the flash.
      // Scaled a little so the show still feels responsive.
      delay: clamp(0.03 + (metres / PHYS.soundSpeed) * 0.6, 0, 1.4),
      far: clamp((metres - 150) / 550, 0, 1),
    };
  }

  boom(x, y, z, power = 1) {
    const h = this.hear(x, y, z);
    this.sound.boom(power, h.pan, h.delay, h.far);
  }

  // ---- loop -------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    const S = this.S;
    // A gusty breeze: two slow waves plus a little flutter.
    const t = this.time + this.windPh;
    const gust = Math.sin(t * 0.13) * 0.6 + Math.sin(t * 0.41 + 1.3) * 0.3 + Math.sin(t * 1.7) * 0.1;
    this.wind.x = (0.35 + gust) * PHYS.wind * S;
    this.wind.z = Math.sin(t * 0.09) * PHYS.wind * 0.4 * S;

    this.view.update(dt, this.time);
    for (let i = this.objects.length - 1; i >= 0; i--) {
      if (!this.objects[i].update(dt)) this.objects.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    this.pool.update(dt, this.wind, this.floorY);
    this.stars.update(dt, this.wind, this.pool);
    this.smoke.update(dt, this.wind);
    this.debris.update(dt, this.wind, this.floorY);
  }

  /** Fill and return the frame. `extras` draw themselves too (diyas, bulbs). */
  collect(extras = []) {
    const f = this.frame;
    const v = this.view;
    f.reset();
    f.time = this.time;
    for (const e of extras) e.draw(f, v, this.time);
    for (const o of this.objects) o.draw?.(f);
    this.debris.collect(v, f);
    this.smoke.collect(v, f);
    this._flashes(f);
    this.pool.collect(v, f, this.time);
    this.stars.collect(v, f, this.time);
    return f;
  }

  _flashes(f) {
    const v = this.view;
    const p = this._p;
    for (const fl of this.flashes) {
      const k = fl.life / fl.max;
      v.project(fl.x, fl.y, fl.z, p);
      const [r, g, b] = fl.color;
      const glow = fl.z > v.zCity ? f.far.glow : f.near.glow;
      if (fl.ring) {
        const rad = fl.radius * p.p * easeOutCubic(1 - k);
        const seg = 36;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
          glow.add(p.x + Math.cos(a0) * rad, p.y + Math.sin(a0) * rad * 0.45,
            p.x + Math.cos(a1) * rad, p.y + Math.sin(a1) * rad * 0.45,
            1.2 * this.S, 7 * this.S * p.p, r, g, b, 0.9 * k);
        }
        continue;
      }
      const e = k * k;
      const I = fl.intensity * e;
      const R = fl.radius * p.p;
      f.lights.add(p.x, p.y, R, R, (r / 255) * I, (g / 255) * I, (b / 255) * I);
      if (fl.pool) {
        const sq = v.squash(fl.z);
        v.project(fl.x, v.floorY, fl.z, p);
        f.lights.add(p.x, p.y, R * 0.6, R * 0.6 * sq, (r / 255) * I * 0.5, (g / 255) * I * 0.5, (b / 255) * I * 0.5);
        v.project(fl.x, fl.y, fl.z, p);
      }
      // The air around the break glows briefly; kept dim so it reads as light, not a disc.
      if (fl.halo) glow.add(p.x, p.y, p.x, p.y, 0, Math.min(R * 0.14, 110 * this.S) * (1 + (1 - k) * 0.5), r, g, b, I * 0.16);
    }
  }
}
