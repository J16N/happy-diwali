// Aerial shell break patterns. Each receives the World, the burst point in
// world space (x, y, z), a base colour and a power multiplier.
//
// Stars are thrown out fast and slowed by air drag. For every star the drag
// coefficient is chosen as k = c / v0, which makes all stars of a shell decelerate
// on the same schedule: a peony stays round, a heart stays a heart, while the
// whole shell still blooms quickly, hangs, then droops under gravity.
//
// Names follow pyrotechnic terms: peony, chrysanthemum (trailing stars),
// willow (long drooping gold), palm (thick comets), crossette (stars that
// split in four), ring, heart, spiral, crackle (glitter that ends in pops),
// strobe (blinking white) and multi-break (stars that burst again).

import { F } from '../engine/particles.js';
import { COLORS, PHYS, PALETTE } from '../config.js';
import { rand, pick, TAU, mixColor, sphere, randn } from '../utils.js';

const star = (w, k = 1) => Math.max(2.6, 5.4 * w.S) * k;
const count = (w, n) => Math.max(8, Math.round(n * w.density));
const accent = (c) => mixColor(c, COLORS.white, 0.5);
const G = (w) => PHYS.gravity * w.S;

/**
 * Throw one star. (dx, dy, dz) is a direction scaled by how far (in units of
 * R) this star should travel; T is roughly how long the bloom takes.
 */
function throwStar(w, x, y, z, dx, dy, dz, R, T, life, size, color, flags, opts = {}) {
  const c = 7 / T;
  const reach = Math.hypot(dx, dy, dz) || 1e-3;
  const v0 = (0.85 * R * reach * c) / Math.log(8);
  const k = c / Math.max(v0, 1);
  const s = v0 / reach;
  w.pool.spawn(x, y, z, dx * s, dy * s, dz * s, life, size, color, k,
    G(w) * (opts.grav ?? 1) * rand(0.85, 1.15), flags | (z > w.view.zCity ? F.NOFLOOR : 0), opts.aux ?? 0, opts.bright ?? 1.5);
}

const BURSTS = {
  peony(w, x, y, z, c, p) {
    const R = 220 * w.S * p;
    sphere(count(w, 130 * p), (dx, dy, dz) => {
      const j = rand(0.9, 1.06);
      throwStar(w, x, y, z, dx * j, dy * j, dz * j, R, 0.7, rand(1.5, 2.3), star(w), c, F.HOT | F.FLICKER | F.TRAIL);
    });
  },

  chrysanthemum(w, x, y, z, c, p) {
    const R = 235 * w.S * p;
    const c2 = accent(c);
    sphere(count(w, 110 * p), (dx, dy, dz, i) => {
      const j = rand(0.9, 1.06);
      throwStar(w, x, y, z, dx * j, dy * j, dz * j, R, 0.75, rand(2.0, 2.7), star(w), i % 3 ? c : c2,
        F.HOT | F.TRAIL | F.TAIL | F.EMBER, { aux: 9 });
    });
  },

  willow(w, x, y, z, c, p) {
    const R = 200 * w.S * p;
    const gold = mixColor(COLORS.gold, c, 0.12);
    sphere(count(w, 80 * p), (dx, dy, dz, i) => {
      const j = rand(0.85, 1.05);
      throwStar(w, x, y, z, dx * j, dy * j, dz * j, R, 0.9, rand(3.6, 4.8), star(w, 1.05), gold,
        F.TRAIL | F.TAIL | F.EMBER | (i % 3 ? 0 : F.SMOKE), { aux: 20, grav: 0.7, bright: 1.2 });
    });
  },

  palm(w, x, y, z, c, p) {
    const arms = 8;
    const gold = mixColor(COLORS.gold, COLORS.saffron, 0.3);
    const R = 300 * w.S * p;
    for (let k = 0; k < arms; k++) {
      const a = -Math.PI / 2 + (k - (arms - 1) / 2) * 0.42 + rand(-0.06, 0.06);
      throwStar(w, x, y, z, Math.cos(a), Math.sin(a) * 0.9 - 0.15, rand(-0.25, 0.25), R, 0.8, rand(2.2, 2.6), star(w, 1.4), gold,
        F.HOT | F.TRAIL | F.TAIL | F.SMOKE | F.EMBER, { aux: 50, bright: 1.6 });
    }
    sphere(count(w, 30), (dx, dy, dz) => {
      throwStar(w, x, y, z, dx * 0.45, dy * 0.45, dz * 0.45, R, 0.6, rand(1.0, 1.4), star(w, 0.9), accent(c), F.HOT | F.FLICKER);
    });
  },

  crossette(w, x, y, z, c, p) {
    const R = 200 * w.S * p;
    sphere(count(w, 22 * p), (dx, dy, dz) => {
      throwStar(w, x, y, z, dx, dy, dz * 0.6, R, 0.65, rand(1.5, 1.9), star(w, 1.2), c, F.SPLIT | F.TRAIL | F.HOT);
    });
  },

  ring(w, x, y, z, c, p) {
    // A ring tilted towards the viewer so it reads as an ellipse.
    const tilt = rand(-0.6, 0.6), yaw = rand(-0.5, 0.5);
    const R = 200 * w.S * p;
    const n = count(w, 70 * p);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      let dx = Math.cos(t), dy = Math.sin(t) * Math.cos(tilt), dz = Math.sin(t) * Math.sin(tilt);
      const ex = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      dz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      dx = ex;
      throwStar(w, x, y, z, dx, dy, dz, R, 0.7, rand(1.7, 2.1), star(w), c, F.HOT | F.TRAIL | F.TWINKLE);
    }
    const core = accent(c);
    sphere(count(w, Math.random() < 0.5 ? 40 : 18), (dx, dy, dz) => {
      throwStar(w, x, y, z, dx * 0.5, dy * 0.5, dz * 0.5, R, 0.6, rand(1.4, 1.8), star(w, 0.9), core, F.HOT | F.FLICKER);
    });
  },

  heart(w, x, y, z, c, p) {
    const R = 250 * w.S * p;
    const tilt = rand(-0.4, 0.4);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const n = count(w, 90);
    const hot = Math.random() < 0.5 ? COLORS.crimson : COLORS.rose;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const hx = (16 * Math.pow(Math.sin(t), 3)) / 17;
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
      throwStar(w, x, y, z, hx * ct, hy, hx * st, R, 0.7, rand(2.0, 2.3), star(w, 1.1), hot, F.HOT | F.TWINKLE | F.TRAIL,
        { grav: 0.4 });
    }
    sphere(count(w, 24), (dx, dy, dz) => {
      throwStar(w, x, y, z, dx * 0.3, dy * 0.3, dz * 0.3, R, 0.6, rand(1.2, 1.5), star(w, 0.8), COLORS.gold, F.HOT | F.FLICKER);
    });
  },

  spiral(w, x, y, z, c, p) {
    const arms = 3;
    const per = count(w, 24);
    const rot = rand(TAU);
    const c2 = accent(c);
    const tilt = rand(-0.5, 0.5);
    const R = 240 * w.S * p;
    for (let k = 0; k < arms; k++) {
      for (let j = 0; j < per; j++) {
        const ang = rot + (k * TAU) / arms + j * 0.28;
        const r = 0.15 + (j / per) * 0.9;
        const vx = Math.cos(ang) * r, vy = Math.sin(ang) * r;
        throwStar(w, x, y, z, vx, vy * Math.cos(tilt), vy * Math.sin(tilt), R, 0.75, rand(1.9, 2.2), star(w),
          j % 2 ? c : c2, F.HOT | F.TRAIL | F.TWINKLE, { grav: 0.5 });
      }
    }
  },

  crackle(w, x, y, z, c, p) {
    const R = 210 * w.S * p;
    const glitter = mixColor(COLORS.white, COLORS.gold, 0.4);
    sphere(count(w, 90 * p), (dx, dy, dz) => {
      const j = rand(0.8, 1.05);
      throwStar(w, x, y, z, dx * j, dy * j, dz * j, R, 0.7, rand(1.3, 2.0), star(w, 0.95), glitter,
        F.CRACKLE | F.TWINKLE | F.TRAIL, { bright: 1.3 });
    });
  },

  strobe(w, x, y, z, c, p) {
    const R = 210 * w.S * p;
    sphere(count(w, 90 * p), (dx, dy, dz) => {
      const j = rand(0.75, 1.05);
      throwStar(w, x, y, z, dx * j, dy * j, dz * j, R, 0.75, rand(2.6, 3.6), star(w, 1.05), [235, 240, 255],
        F.STROBE | F.HOT, { grav: 0.45, bright: 1.8 });
    });
  },

  multibreak(w, x, y, z, c, p) {
    const R = 170 * w.S * p;
    const n = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2);
      throwStar(w, x, y, z, Math.cos(a), Math.sin(a) * 0.85, randn() * 0.3, R, 0.75, rand(0.75, 1.0), star(w, 1.3),
        mixColor(c, COLORS.white, 0.3), F.BREAK | F.HOT | F.TRAIL | F.TAIL, { aux: 30, bright: 1.6 });
    }
    sphere(count(w, 40), (dx, dy, dz) => {
      throwStar(w, x, y, z, dx * 0.45, dy * 0.45, dz * 0.45, R, 0.6, rand(1.0, 1.4), star(w, 0.8), c, F.HOT | F.FLICKER);
    });
  },
};

export const BURST_NAMES = Object.keys(BURSTS);
// The ones that make sense as random background shells.
export const RANDOM_BURSTS = BURST_NAMES.filter((n) => n !== 'multibreak');

/** Spawn a pattern with its flash, smoke, and boom. Returns the chosen name. */
export function burst(world, type, x, y, z, color, power = 1, { boom = true, smoke = 1, light = 1 } = {}) {
  const name = BURSTS[type] ? type : pick(RANDOM_BURSTS);
  BURSTS[name](world, x, y, z, color, power);
  const S = world.S;
  const far = z > world.view.zCity;
  world.flash(x, y, z, mixColor(color, COLORS.white, 0.35), {
    radius: 650 * S * power, intensity: 1.3 * light * (far ? 0.6 : 1), life: 0.45,
  });
  // The bursting charge: a bright white pop at the centre.
  world.flash(x, y, z, [255, 245, 225], { radius: 160 * S * power, intensity: 1.6 * light, life: 0.12 });
  if (smoke > 0) {
    world.smokeCloud(x, y, z, 9 * smoke, { size: 30 * power, spread: 80 * power, life: [5, 9], alpha: 0.32 * smoke, grow: 1.5, buoy: 3 });
  }
  if (boom) world.boom(x, y, z, power);
  return name;
}

/** A multi-break star went off: a small second shell in a new colour. */
export function subBurst(world, x, y, z, color) {
  const c = Math.random() < 0.5 ? pick(PALETTE) : mixColor(color, pick(PALETTE), 0.6);
  burst(world, pick(['peony', 'crackle', 'chrysanthemum']), x, y, z, c, 0.38, { boom: false, smoke: 0.3, light: 0.5 });
  const h = world.hear(x, y, z);
  world.sound.boom(0.35, h.pan, h.delay, h.far);
}
