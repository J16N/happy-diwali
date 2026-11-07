// Sky lantern (akash kandil): a paper lantern with a small flame that lifts
// off the terrace, sways and drifts away on the breeze until it is a speck.

import { clamp, rand, TAU } from '../utils.js';

export class SkyLantern {
  constructor(world, { x, z }) {
    this.w = world;
    this.x = x;
    this.y = world.floorY;
    this.z = z;
    this.t = 0;
    this.vy = 0;
    this.ph = rand(TAU);
    this.life = rand(16, 22);
    this.cell = world.cells.lantern;
    this._p = {};
  }

  update(dt) {
    const w = this.w, S = w.S;
    this.t += dt;
    // Hot air needs a moment to lift it, then it climbs at a steady rate.
    const lift = clamp((this.t - 0.6) / 1.5, 0, 1);
    this.vy += (-rand(30, 42) * S * lift - this.vy) * (1 - Math.exp(-dt * 1.2));
    this.y += this.vy * dt;
    this.x += (w.wind.x * 0.9 + Math.sin(this.t * 0.7 + this.ph) * 8 * S) * dt;
    this.z += (w.wind.z * 0.5 + 18 * S * lift) * dt;
    const p = w.view.project(this.x, this.y, this.z, this._p);
    return this.t < this.life && p.y > -60;
  }

  draw(frame) {
    const S = this.w.S;
    const v = this.w.view;
    const fade = clamp((this.life - this.t) / 3, 0, 1) * clamp(this.t / 0.4, 0, 1);
    const p = v.project(this.x, this.y, this.z, this._p);
    const s = 34 * S * p.p;
    const flick = 0.85 + 0.1 * Math.sin(this.t * 13 + this.ph) + 0.05 * Math.sin(this.t * 29);
    const sway = Math.sin(this.t * 1.3 + this.ph) * 0.08;
    const ly = p.y - s * 0.95;
    frame.sprites.add(p.x, ly, s, s * (this.cell.h / this.cell.w), sway, 1, fade, 0.22 * flick, this.cell);
    const glow = this.z > v.zCity ? frame.far.glow : frame.near.glow;
    glow.add(p.x, ly + s * 0.5, p.x, ly + s * 0.45, 1.2 * S * p.p, 3.5 * S * p.p, 255, 220, 150, 1.1 * fade * flick);
    glow.add(p.x, ly, p.x, ly, 0, s * 1.3, 255, 150, 60, 0.07 * fade * flick);
    // Its light falls around it (centred low, at the flame) more than on its own paper.
    const I = 0.3 * fade * flick * p.p;
    frame.lights.add(p.x, ly + s * 0.6, 170 * S * p.p, 170 * S * p.p, I, I * 0.6, I * 0.25);
  }
}
