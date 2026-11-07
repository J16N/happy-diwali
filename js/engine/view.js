// The 2.5D camera. World units are CSS pixels on the focal plane (z = 0);
// larger z is further away. Everything is perspective-projected towards a
// vanishing point at eye level, so far shells look smaller and higher-up
// floor positions read as "further back".
//
//   screen
//   ┌──────────────────────────────┐
//   │            sky               │  shells: z from -0.25 fov (close) to 2.2 fov (far)
//   │   . . vanishing point . .    │  cy
//   │ ▟▙ ▟█▙  skyline  ▟▙ ▟██▙ ▟▙  │  z ≈ zCity: things beyond it are hidden behind
//   ├──────── parapet ─────────────┤  floorTop
//   │   terrace floor (perspective)│  ground crackers stand here
//   │ 🪔   🪔   🪔   🪔   🪔   🪔   │  diyas on the front edge
//   └──────────────────────────────┘

import { clamp, lerp } from '../utils.js';

export class View {
  constructor() {
    this.W = 1;
    this.H = 1;
    this.S = 1;
    this.ox = 0; // parallax offset (px), eased towards tx / ty
    this.oy = 0;
    this.tx = 0;
    this.ty = 0;
    this.shake = 0;
    this.sx = 0; // shake offset
    this.sy = 0;
    this.parallax = true;
  }

  resize(w, h) {
    this.W = w;
    this.H = h;
    this.S = Math.max(0.45, Math.min(w, h) / 700);
    this.fov = 900 * this.S;
    this.cx = w / 2;
    this.cy = h * 0.42;
    this.floorH = clamp(h * 0.15, 54, 170);
    this.floorTop = h - this.floorH; // screen y of the parapet
    this.parapetH = Math.max(6, 11 * this.S); // the low wall along the back of the terrace
    this.frontY = h - this.floorH * 0.3; // screen y of the z = 0 floor row
    this.backY = this.floorTop + this.floorH * 0.14;
    this.floorY = this.frontY; // world y of the floor plane
    this.zCity = this.fov * 1.0; // beyond this a particle is behind the skyline
    this.skyH = this.floorTop; // usable sky height
  }

  /** p for a depth. */
  scale(z) {
    return this.fov / (this.fov + Math.max(z, -0.7 * this.fov));
  }

  /** World -> screen. Writes into out = { x, y, p } and returns it. */
  project(x, y, z, out = {}) {
    const p = this.scale(z);
    const ox = this.ox + this.sx, oy = this.oy + this.sy;
    out.x = this.cx + ox + (x - this.cx - ox) * p;
    out.y = this.cy + oy + (y - this.cy - oy) * p;
    out.p = p;
    return out;
  }

  /** Screen point at depth z -> world { x, y }. */
  unproject(sx, sy, z) {
    const p = this.scale(z);
    return {
      x: (sx - this.cx - this.ox) / p + this.cx + this.ox,
      y: (sy - this.cy - this.oy) / p + this.cy + this.oy,
    };
  }

  /**
   * Depth of a floor row. d = 0 is the front row, 1 the back (by the
   * parapet); negative values sit in front of the front row (diyas).
   */
  floorZ(d) {
    const sy = lerp(this.frontY, this.backY, d);
    const p = (sy - this.cy) / (this.floorY - this.cy);
    return this.fov * (1 / p - 1);
  }

  /** World x on the floor at depth z under screen x. */
  floorX(sx, z) {
    return this.unproject(sx, this.floorY, z).x;
  }

  /** How flat a horizontal disc looks at depth z (for chakras, light pools). */
  squash(z) {
    const p = this.scale(z);
    const sy = this.cy + (this.floorY - this.cy) * p;
    return clamp(((sy - this.cy) / this.H) * 1.1, 0.18, 0.6);
  }

  update(dt, time) {
    const k = 1 - Math.exp(-dt * 2.5);
    const tx = this.parallax ? this.tx : 0;
    const ty = this.parallax ? this.ty : 0;
    this.ox += (tx - this.ox) * k;
    this.oy += (ty - this.oy) * k;
    if (this.shake > 0.05) {
      this.sx = Math.sin(time * 71) * this.shake;
      this.sy = Math.cos(time * 53) * this.shake * 0.7;
      this.shake *= Math.exp(-dt * 9);
    } else {
      this.shake = this.sx = this.sy = 0;
    }
  }

  /** Point the camera (pointer at u, v in -1..1). */
  look(u, v) {
    const m = 10 * this.S;
    this.tx = -u * m;
    this.ty = -v * m * 0.5;
  }

  /** Horizontal shift of a backdrop layer that sits at projection scale p. */
  layerShift(p) {
    const ox = this.ox + this.sx, oy = this.oy + this.sy;
    return [ox * (1 - p), oy * (1 - p)];
  }
}
