// The night scene, painted once per resize into four layers that the
// renderer stacks with a little parallax and lights with the fireworks:
//
//   sky       gradient and stars (Diwali falls on amavasya: no moon)
//   far city  silhouettes with a dome and temple towers
//   near city lit windows and the string-light wire
//   floor     a terrace in perspective with a parapet along the back
//
// Diyas and string-light bulbs are live objects: they flicker, and their
// light falls on the floor and the buildings.

import { PALETTE } from '../config.js';
import { clamp, easeOutCubic, lerp, rand } from '../utils.js';

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dome(ctx, x, base, r) {
  ctx.beginPath();
  ctx.rect(x - r * 1.5, base - r * 1.1, r * 3, r * 1.1 + 400);
  ctx.moveTo(x - r, base - r * 1.1);
  ctx.arc(x, base - r * 1.1, r, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - r * 0.05, base - r * 2.5, r * 0.1, r * 0.5);
  for (const dx of [-r * 1.9, r * 1.9]) {
    ctx.fillRect(x + dx - r * 0.18, base - r * 2.1, r * 0.36, r * 2.2 + 400);
    ctx.beginPath();
    ctx.arc(x + dx, base - r * 2.1, r * 0.26, Math.PI, 0);
    ctx.fill();
  }
}

function shikhara(ctx, x, base, wd, ht) {
  ctx.beginPath();
  ctx.moveTo(x - wd / 2, base + 400);
  ctx.lineTo(x - wd / 2, base - ht * 0.18);
  ctx.bezierCurveTo(x - wd * 0.55, base - ht * 0.45, x - wd * 0.28, base - ht * 0.85, x, base - ht);
  ctx.bezierCurveTo(x + wd * 0.28, base - ht * 0.85, x + wd * 0.55, base - ht * 0.45, x + wd / 2, base - ht * 0.18);
  ctx.lineTo(x + wd / 2, base + 400);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, base - ht - wd * 0.06, wd * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 0.6, base - ht - wd * 0.4, 1.2, wd * 0.34);
}

function buildings(ctx, x0, x1, base, S, rnd, { color, minH, maxH, lit }) {
  ctx.fillStyle = color;
  for (let x = x0; x < x1; ) {
    const bw = (18 + rnd() * 46) * S;
    const bh = (minH + rnd() * (maxH - minH)) * S;
    ctx.fillRect(x, base - bh, bw, bh + 400);
    if (lit) {
      ctx.save();
      for (let wy = base - bh + 7 * S; wy < base - 6 * S; wy += 11 * S) {
        for (let wx = x + 5 * S; wx < x + bw - 6 * S; wx += 9 * S) {
          if (rnd() < 0.26) {
            ctx.fillStyle = rnd() < 0.7 ? 'rgba(255,188,92,0.8)' : 'rgba(255,230,170,0.7)';
            ctx.fillRect(wx, wy, 3 * S, 4 * S);
          }
        }
      }
      ctx.restore();
      ctx.fillStyle = color;
    }
    x += bw + rnd() * 5 * S;
  }
}

/**
 * A canvas for the band [y0, y1) of a layer (layer coordinates). Only the
 * rows a layer actually paints are kept: the skyline and the floor cover a
 * fraction of the screen, and full-screen layers cost tens of MB of GPU
 * memory at 2x. Painting still uses layer coordinates.
 */
function layerCanvas(w, y0, y1, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round((y1 - y0) * dpr));
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, -y0 * dpr);
  return [c, ctx];
}

/**
 * Paint the static scene. Each layer is wider and taller than the screen by
 * `margin` on every side so parallax never reveals an edge.
 * Returns { margin, layers: [{ name, canvas, top, height, p, albedo, haze, opaque }] }
 * where top / height give the band of the layer the canvas covers.
 */
export function buildLayers(view, dpr) {
  const { W, H, S } = view;
  const m = Math.ceil(16 * S);
  const w = W + m * 2, h = H + m * 2;
  const base = view.floorTop + m; // skyline foot, in layer coordinates
  const layers = [];

  // Bands each layer paints (layer coordinates). Below the skyline the far
  // layers are hidden by the floor, so they stop a little under its edge
  // (with room for parallax).
  const cityBottom = base + 16 * S + 4;
  const band = (y0, y1) => [Math.max(0, Math.floor(y0)), Math.min(h, Math.ceil(y1))];

  // ---- sky
  {
    const [bandTop, bandEnd] = band(0, h);
    const [c, ctx] = layerCanvas(w, bandTop, bandEnd, dpr);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03020a');
    sky.addColorStop(0.4, '#0b0720');
    sky.addColorStop(0.72, '#24103a');
    sky.addColorStop(0.9, '#4a1a34');
    sky.addColorStop(1, '#5a1d2f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const rnd = rng(2026);
    for (let i = 0, n = Math.round((w * h) / 4200); i < n; i++) {
      const y = rnd() * base * 0.85;
      const bright = rnd();
      ctx.fillStyle = `rgba(255,244,225,${0.12 + bright * 0.6 * (1 - y / base)})`;
      const s = bright > 0.92 ? 1.7 : bright > 0.6 ? 1.1 : 0.8;
      ctx.fillRect(rnd() * w, y, s, s);
    }
    // City glow on the low haze.
    const glowGrad = ctx.createRadialGradient(w / 2, base, 0, w / 2, base, Math.max(w, h) * 0.75);
    glowGrad.addColorStop(0, 'rgba(255,130,40,0.26)');
    glowGrad.addColorStop(1, 'rgba(255,130,40,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
    layers.push({ name: 'sky', canvas: c, top: bandTop, height: bandEnd - bandTop, p: 0.05, albedo: 0.0, haze: 1, opaque: true });
  }

  // ---- far city: towers reach about 190 S above the skyline foot
  {
    const [bandTop, bandEnd] = band(base - 205 * S, cityBottom);
    const [c, ctx] = layerCanvas(w, bandTop, bandEnd, dpr);
    const far = rng(7);
    const col = '#1a0c2e';
    buildings(ctx, -10 * S, w + 10, base, S, far, { color: col, minH: 40, maxH: 120, lit: false });
    ctx.fillStyle = col;
    dome(ctx, w * 0.2, base, 34 * S);
    shikhara(ctx, w * 0.56, base, 62 * S, 150 * S);
    shikhara(ctx, w * 0.84, base, 44 * S, 105 * S);
    // A soft haze line where the city meets the sky.
    const hz = ctx.createLinearGradient(0, base - 140 * S, 0, base);
    hz.addColorStop(0, 'rgba(90,30,60,0)');
    hz.addColorStop(1, 'rgba(90,30,60,0.35)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = hz;
    ctx.fillRect(0, base - 140 * S, w, 140 * S);
    ctx.globalCompositeOperation = 'source-over';
    layers.push({ name: 'far', canvas: c, top: bandTop, height: bandEnd - bandTop, p: 0.45, albedo: 0.03, haze: 0, opaque: false });
  }

  // ---- near city with the string-light wire
  let bulbs;
  {
    const [bandTop, bandEnd] = band(base - 90 * S, cityBottom);
    const [c, ctx] = layerCanvas(w, bandTop, bandEnd, dpr);
    buildings(ctx, -10 * S, w + 10, base, S, rng(11), { color: '#0a0512', minH: 18, maxH: 64, lit: true });
    const y0 = base - 74 * S;
    const sag = 22 * S;
    ctx.strokeStyle = 'rgba(30,16,40,0.95)';
    ctx.lineWidth = Math.max(1, 1.2 * S);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.quadraticCurveTo(w / 2, y0 + sag * 2, w, y0);
    ctx.stroke();
    const n = Math.max(10, Math.round(w / (28 * S)));
    bulbs = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = t * w;
      const y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * (y0 + sag * 2) + t * t * y0;
      bulbs.push({ x: x - m, y: y - m + 2 * S, color: PALETTE[i % PALETTE.length], ph: i * 1.7 });
    }
    layers.push({ name: 'near', canvas: c, top: bandTop, height: bandEnd - bandTop, p: 0.7, albedo: 0.05, haze: 0, opaque: false });
  }

  // ---- terrace floor, from the top of the parapet down
  {
    const [bandTop, bandEnd] = band(view.floorTop + m - view.parapetH - 2, h);
    const [c, ctx] = layerCanvas(w, bandTop, bandEnd, dpr);
    const top = view.floorTop + m;
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, '#120a14');
    g.addColorStop(1, '#251620');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, h - top);

    // Stone slabs: rows get closer together towards the back, joints run to
    // the vanishing point.
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, 1.2 * S);
    const cx = view.cx + m, cy = view.cy + m;
    for (let k = 1; k < 9; k++) {
      const t = Math.pow(k / 9, 1.7);
      const y = lerp(top, h, t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const cols = Math.round(W / (70 * S));
    for (let k = -cols; k <= cols * 2; k++) {
      const xb = (k / cols) * w;
      const xt = cx + (xb - cx) * ((top - cy) / (h - cy));
      ctx.beginPath();
      ctx.moveTo(xt, top);
      ctx.lineTo(xb, h);
      ctx.stroke();
    }

    // A small rangoli in the middle of the floor, flattened by perspective.
    const ry = lerp(top, h, 0.5);
    const rr = Math.min(W * 0.09, view.floorH * 0.9);
    ctx.save();
    ctx.translate(cx, ry);
    ctx.scale(1, view.squash(view.floorZ(0.45)) * 0.9);
    const petals = ['rgba(150,40,60,0.5)', 'rgba(160,100,30,0.5)', 'rgba(40,90,130,0.45)', 'rgba(150,130,100,0.45)'];
    for (let ring = 3; ring >= 0; ring--) {
      ctx.fillStyle = petals[ring];
      const R = rr * (0.3 + ring * 0.2);
      const np = 8 + ring * 4;
      for (let k = 0; k < np; k++) {
        const a = (k / np) * Math.PI * 2 + ring * 0.2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75, R * 0.28, R * 0.12, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(170,140,80,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, rr * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Parapet along the back edge, hiding where far rockets take off.
    const ph = view.parapetH;
    const pg = ctx.createLinearGradient(0, top - ph, 0, top + 2);
    pg.addColorStop(0, '#3a2030');
    pg.addColorStop(0.25, '#1c0f1a');
    pg.addColorStop(1, '#0c060c');
    ctx.fillStyle = pg;
    ctx.fillRect(0, top - ph, w, ph + 2);
    ctx.fillStyle = 'rgba(255,200,140,0.12)';
    ctx.fillRect(0, top - ph, w, Math.max(1, S));
    // Front shadow so the floor reads as receding.
    const sh = ctx.createLinearGradient(0, h - view.floorH * 0.25, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, h - view.floorH * 0.25, w, view.floorH * 0.25);
    layers.push({ name: 'floor', canvas: c, top: bandTop, height: bandEnd - bandTop, p: 0.95, albedo: 0.1, haze: 0, opaque: false });
  }

  return { margin: m, layers, bulbs };
}

/** Coloured bulbs on the string across the skyline. */
export class StringLights {
  constructor() {
    this.bulbs = [];
    this.p = 0.7;
  }

  set(bulbs) {
    this.bulbs = bulbs;
  }

  draw(frame, view, time) {
    const S = view.S;
    const [dx, dy] = view.layerShift(this.p);
    for (const b of this.bulbs) {
      const f = 0.8 + 0.2 * Math.sin(time * 1.3 + b.ph);
      const x = b.x + dx, y = b.y + dy;
      frame.near.glow.add(x, y, x, y, 1.3 * S, 5.5 * S, b.color[0], b.color[1], b.color[2], 0.95 * f);
      frame.lights.add(x, y, 34 * S, 34 * S, (b.color[0] / 255) * 0.18 * f, (b.color[1] / 255) * 0.18 * f, (b.color[2] / 255) * 0.18 * f);
    }
  }
}

/**
 * A row of clay diyas standing on the parapet along the horizon, lighting
 * up one by one. Each flame flickers, lights the wall and the nearby
 * buildings, and lets off a thin wisp of smoke.
 */
export class Diyas {
  constructor(cells) {
    this.cell = cells.diya;
    this.items = [];
    this.t = 0;
    this.lighting = false;
    this.lightT = 0;
    this._p = {};
  }

  resize(view) {
    const { W, S } = view;
    const n = clamp(Math.round(W / (62 * S)), 6, 26);
    // On top of the parapet, at the back edge of the terrace.
    const z = view.floorZ(1);
    const sy = view.floorTop - view.parapetH + 1;
    const prev = this.items;
    this.items = Array.from({ length: n }, (_, i) => {
      const sx = W * (0.03 + (0.94 * i) / (n - 1));
      const wpt = view.unproject(sx, sy, z);
      return {
        x: wpt.x,
        y: wpt.y,
        z,
        ph: Math.random() * 10,
        smoke: Math.random(),
        lit: prev[i] ? prev[i].lit : 0,
      };
    });
  }

  /** Light them left to right; sound is optional (browsers block audio before a tap). */
  ignite(sound) {
    this.lighting = true;
    this.lightT = 0;
    this.sound = sound;
    this.rung = 0;
  }

  update(dt, world) {
    this.t += dt;
    if (world) {
      const S = world.S;
      for (const d of this.items) {
        if (d.lit < 0.5) continue;
        // A thin, slow wisp from the wick.
        d.smoke += dt * rand(0.6, 1.4) * world.density;
        if (d.smoke >= 1) {
          d.smoke -= 1;
          world.puff(d.x + 4 * S, d.y - 16 * S, d.z, {
            vx: rand(-3, 3) * S, vy: -rand(8, 16) * S, size: rand(2, 3.5) * S, grow: 3.2, life: rand(3.5, 5.5), alpha: 0.11, buoy: 14 * S,
          });
        }
      }
    }
    if (!this.lighting) return;
    this.lightT += dt;
    const n = this.items.length;
    this.items.forEach((d, i) => {
      const k = this.lightT - i * 0.1;
      if (k > 0) d.lit = easeOutCubic(clamp(k / 0.6, 0, 1));
    });
    while (this.rung < n && this.lightT >= this.rung * 0.1) {
      if (this.sound) this.sound.ignite(this.rung / Math.max(1, n - 1));
      this.rung++;
    }
    if (this.lightT > n * 0.1 + 0.7) this.lighting = false;
  }

  draw(frame, view) {
    const S = view.S, p = this._p, t = this.t;
    for (const d of this.items) {
      view.project(d.x, d.y, d.z, p);
      const s = p.p * S * 0.85;
      const bw = 34 * s, bh = bw * (this.cell.h / this.cell.w);
      // Anchored at the bowl's base so it sits on the wall.
      frame.sprites.add(p.x, p.y - bh * 0.38, bw, bh, 0, 1, 1, 0, this.cell);
      if (d.lit <= 0) continue;
      const f = 1 + 0.12 * Math.sin(t * 9 + d.ph) + 0.08 * Math.sin(t * 17 + d.ph * 2.3);
      const sway = Math.sin(t * 5 + d.ph) * 0.9 * s;
      const baseX = p.x + 6 * s, baseY = p.y - bh * 0.62 - bh * 0.38 + 1 * s;
      const fh = 15 * s * f * d.lit;
      // Flame: a teardrop built from three capsules that narrow towards the
      // flickering tip, orange outside with a small bright core low down.
      const tipX = baseX + sway, midX = baseX + sway * 0.45;
      frame.near.glow.add(baseX, baseY - fh * 0.05, midX, baseY - fh * 0.35, 2.3 * s, 3.4 * s, 255, 150, 50, 0.9 * d.lit);
      frame.near.glow.add(midX, baseY - fh * 0.35, baseX + sway * 0.8, baseY - fh * 0.7, 1.6 * s, 2.6 * s, 255, 165, 60, 0.85 * d.lit);
      frame.near.glow.add(baseX + sway * 0.8, baseY - fh * 0.7, tipX, baseY - fh, 0.8 * s, 1.8 * s, 255, 130, 40, 0.7 * d.lit);
      frame.near.glow.add(baseX, baseY - fh * 0.08, baseX + sway * 0.3, baseY - fh * 0.3, 1.1 * s, 1.6 * s, 255, 244, 210, 1.2 * d.lit);
      frame.near.glow.add(baseX, baseY, baseX, baseY, 0, 24 * s, 255, 150, 50, 0.16 * d.lit * f);
      // Warm light on the wall, the floor just in front and the nearby buildings.
      const li = 0.3 * d.lit * f;
      frame.lights.add(baseX, baseY, 110 * s, 110 * s, li, li * 0.62, li * 0.25);
      frame.lights.add(baseX, p.y + 4 * s, 80 * s, 80 * s * view.squash(d.z), li * 0.5, li * 0.32, li * 0.12);
    }
  }
}

/**
 * A few thin clouds high in the sky and low on the horizon. Diwali falls on
 * a clear new-moon night, so they stay sparse and faint: they are there to
 * catch the light of the fireworks and the warm city glow from below.
 * They drift very slowly with the breeze and wrap around the screen.
 */
export class Clouds {
  constructor(cells) {
    this.cells = cells;
    this.items = [];
    this.p = 0.12; // parallax depth: almost as far as the stars
    this.rnd = rng(77);
  }

  resize(view) {
    const { W, S, skyH } = view;
    const r = this.rnd;
    const portrait = W < skyH;
    const make = (band, alpha) => {
      const w = W * (portrait ? 0.7 + r() * 0.5 : 0.32 + r() * 0.3);
      return {
        x: W * (0.05 + r() * 0.9),
        y: skyH * (band[0] + r() * (band[1] - band[0])),
        w,
        h: w * (0.16 + r() * 0.1),
        a: alpha[0] + r() * (alpha[1] - alpha[0]),
        speed: (1.5 + r() * 3) * S,
        cell: this.cells[Math.floor(r() * this.cells.length)],
        flip: r() < 0.5,
      };
    };
    // High, thin wisps, and a couple of denser bands low on the horizon
    // (partly behind the skyline). The middle of the sky, where the text
    // forms, is left almost clear.
    this.items = [
      make([0.04, 0.12], [0.3, 0.42]),
      make([0.08, 0.2], [0.26, 0.38]),
      make([0.14, 0.26], [0.2, 0.3]),
      make([0.62, 0.74], [0.34, 0.46]),
      make([0.7, 0.84], [0.4, 0.52]),
    ];
    if (portrait) this.items.splice(2, 1); // narrow screens get one fewer
  }

  update(dt, wind) {
    const W = this.W ?? 0;
    for (const c of this.items) {
      const dir = wind.x >= 0 ? 1 : -1;
      c.x += (c.speed * dir + wind.x * 0.08) * dt;
      if (W) {
        if (c.x - c.w / 2 > W * 1.1) c.x = -c.w / 2 - W * 0.05;
        else if (c.x + c.w / 2 < -W * 0.1) c.x = W + c.w / 2 + W * 0.05;
      }
    }
  }

  draw(frame, view) {
    this.W = view.W;
    const [dx, dy] = view.layerShift(this.p);
    for (const c of this.items) {
      // emissive = how bright the cloud is without any firework light on it
      frame.clouds.add(c.x + dx, c.y + dy, c.flip ? -c.w : c.w, c.h, 0, 1, c.a, 0.3, c.cell);
    }
  }
}
