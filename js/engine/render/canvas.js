// Canvas 2D backup renderer for devices without WebGL2. It draws the same
// frame data with cached glow sprites: no bloom and simpler lighting, but
// the same show.

import { glow } from '../sprites.js';

export class CanvasRenderer {
  constructor(canvas) {
    this.kind = 'canvas';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D unavailable');
    this.layers = [];
    this.margin = 0;
    this.bloom = false;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  setLayers(data) {
    this.layers = data.layers;
    this.margin = data.margin;
  }

  setTextures(atlas, smoke, clouds) {
    this.atlas = atlas;
    this.cloudImg = clouds;
    // One tinted copy per smoke variant, so puffs are a single drawImage.
    const size = smoke.width / 2;
    this.puffs = [0, 1, 2, 3].map((v) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.drawImage(smoke, (v % 2) * size, Math.floor(v / 2) * size, size, size, 0, 0, size, size);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = 'rgb(70,64,80)';
      x.fillRect(0, 0, size, size);
      return c;
    });
  }

  _layer(l, view) {
    const [dx, dy] = view.layerShift(l.p);
    const m = this.margin;
    this.ctx.drawImage(l.canvas, -m + dx, -m + dy + l.top, this.w + m * 2, l.height);
  }

  _glow(batch) {
    const ctx = this.ctx;
    const d = batch.data;
    for (let i = 0, o = 0; i < batch.n; i++, o += 10) {
      const x0 = d[o], y0 = d[o + 1], x1 = d[o + 2], y1 = d[o + 3];
      const core = d[o + 4], halo = d[o + 5];
      const a = d[o + 9];
      if (a < 0.02) continue;
      const sprite = glow(d[o + 6] | 0, d[o + 7] | 0, d[o + 8] | 0);
      const dx = x1 - x0, dy = y1 - y0;
      if (dx * dx + dy * dy > 3 && core > 0) {
        ctx.globalAlpha = Math.min(1, a * 0.6);
        ctx.strokeStyle = sprite.css;
        ctx.lineWidth = Math.max(1, core * 2.2);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const r = Math.max(1.2, halo * 1.5);
      ctx.globalAlpha = Math.min(1, a * (core > 0 ? 0.85 : 0.5));
      ctx.drawImage(sprite.img, x1 - r, y1 - r, r * 2, r * 2);
    }
  }

  _smoke(batch) {
    const ctx = this.ctx;
    const d = batch.data;
    for (let i = 0, o = 0; i < batch.n; i++, o += 9) {
      const s = d[o + 2];
      ctx.globalAlpha = Math.min(1, d[o + 7] * 1.4);
      ctx.drawImage(this.puffs[d[o + 8] | 0], d[o] - s, d[o + 1] - s, s * 2, s * 2);
    }
  }

  _sprites(batch, A = this.atlas) {
    const ctx = this.ctx;
    const d = batch.data;
    const AW = A.width, AH = A.height;
    for (let i = 0, o = 0; i < batch.n; i++, o += 14) {
      const w = d[o + 2], h = d[o + 3];
      const u0 = d[o + 8] * AW, v0 = d[o + 9] * AH, u1 = d[o + 10] * AW, v1 = d[o + 11] * AH;
      ctx.globalAlpha = d[o + 6];
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(d[o], d[o + 1]);
      ctx.scale(1, d[o + 5]);
      ctx.rotate(d[o + 4]);
      ctx.drawImage(A, u0, v0, u1 - u0, v1 - v0, -d[o + 12] * w, -d[o + 13] * h, w, h);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _lights(batch, scale) {
    const ctx = this.ctx;
    const d = batch.data;
    for (let i = 0, o = 0; i < batch.n; i++, o += 7) {
      const r = d[o + 4], g = d[o + 5], b = d[o + 6];
      const m = Math.max(r, g, b);
      if (m < 0.02) continue;
      const sprite = glow((r / m) * 255, (g / m) * 255, (b / m) * 255);
      ctx.globalAlpha = Math.min(0.6, m * scale);
      ctx.drawImage(sprite.img, d[o] - d[o + 2], d[o + 1] - d[o + 3], d[o + 2] * 2, d[o + 3] * 2);
    }
  }

  render(frame, view) {
    if (!this.layers.length) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const [sky, far, near, floor] = this.layers;
    this._layer(sky, view);

    ctx.globalCompositeOperation = 'lighter';
    this._lights(frame.lights, 0.18);
    ctx.globalCompositeOperation = 'source-over';
    this._smoke(frame.far.smoke);
    ctx.globalCompositeOperation = 'lighter';
    this._glow(frame.far.glow);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.cloudImg) this._sprites(frame.clouds, this.cloudImg);
    ctx.globalAlpha = 1; // clouds leave their own alpha behind
    this._layer(far, view);
    this._layer(near, view);
    this._layer(floor, view);
    this._sprites(frame.sprites);
    this._smoke(frame.near.smoke);

    ctx.globalCompositeOperation = 'lighter';
    this._glow(frame.near.glow);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
