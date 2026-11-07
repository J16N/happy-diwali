// Turns text and emoji into clouds of points. We draw the glyphs onto a hidden
// canvas, read the pixels back and keep one point per grid cell. Those points
// are where firework stars will come to rest.

import { COLORS, font } from '../config.js';
import { clamp, mixColor, rand } from '../utils.js';

// On the page a hidden <canvas>; in the simulation worker an OffscreenCanvas.
const newCanvas = () => (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1));

let work = null;
function workCanvas(w, h) {
  if (!work) work = newCanvas();
  work.width = Math.max(1, Math.ceil(w));
  work.height = Math.max(1, Math.ceil(h));
  return work.getContext('2d', { willReadFrequently: true });
}

/** The region (screen px) where the show happens: centred in the sky above the terrace. */
export function centralBox(view) {
  const { W, skyH } = view;
  const w = Math.min(W * 0.9, 1180);
  const h = Math.min(skyH * 0.62, 560);
  const cy = skyH * 0.47;
  return { x: (W - w) / 2, y: Math.max(8, cy - h / 2), w, h };
}

/** Sample opaque cells; step grows until the point count fits the budget. */
function sample(w, h, startStep, maxPoints, visit) {
  let step = startStep;
  for (let attempt = 0; attempt < 14; attempt++) {
    const pts = [];
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const p = visit(x | 0, y | 0, step);
        if (p) pts.push({ ...p, gx: x, gy: y });
      }
    }
    if (pts.length <= maxPoints || attempt === 13) return { pts, step };
    step *= 1.1;
  }
}

// Text is laid out from the pixels a line really covers, not from the font's
// advance width or a fixed line height. Hindi and Bengali need this: vowel
// signs hang before the first consonant (ি, ि) and above / below the letter
// line (ী ু ৃ, ी ु ृ), and the heavy weight is synthesised for these fonts,
// which widens every stroke. Measured the old way, words spilled out of the
// box and their edges were cut off.
const REF = 120; // px size lines are measured at
let measure = null;

/** Ink bounds of `text` drawn at `px`, relative to (pen x, baseline). */
function inkBounds(text, px) {
  measure ??= newCanvas();
  const mctx = measure.getContext('2d', { willReadFrequently: true });
  mctx.font = font.text(px);
  const adv = mctx.measureText(text).width;
  const pad = Math.ceil(px * 1.2);
  const w = Math.ceil(adv * 1.4 + pad * 2);
  const h = Math.ceil(px * 3.2);
  measure.width = w;
  measure.height = h;
  mctx.font = font.text(px); // resizing the canvas reset the context
  mctx.textAlign = 'left';
  mctx.textBaseline = 'alphabetic';
  mctx.fillStyle = '#fff';
  const ox = pad, oy = Math.round(px * 2);
  mctx.fillText(text, ox, oy);
  const d = mctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { left: 0, right: adv, top: -px * 0.7, bottom: 0 };
  return { left: x0 - ox, right: x1 + 1 - ox, top: y0 - oy, bottom: y1 + 1 - oy };
}

/**
 * lines: [{ text, scale = 1, ramp: [colorA, colorB] }]
 * Returns { points: [{ x, y, r, g, b, size }] } with every line centred in box.
 */
export function rasterLines(lines, box, maxPoints = 1800) {
  // 1. Measure every line's real ink at a reference size.
  const ink = lines.map((l) => inkBounds(l.text, REF * (l.scale ?? 1)));
  const widths = ink.map((b) => b.right - b.left);
  const heights = ink.map((b) => b.bottom - b.top);
  const gaps = lines.map((l, i) => (i ? REF * 0.2 * Math.min(l.scale ?? 1, lines[i - 1].scale ?? 1) : 0));
  const blockH = heights.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);

  // 2. One scale for the whole block so it fits the box (with a little air),
  //    capped so a short word does not become absurdly tall.
  const k = Math.min((box.w * 0.96) / Math.max(...widths), (box.h * 0.96) / blockH, (box.h * 0.5) / REF);
  const base = REF * k; // font size of a scale-1 line

  // 3. Draw each line so its ink is centred horizontally, stacked vertically.
  const ctx = workCanvas(box.w, box.h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  const rows = []; // [yStart, yEnd, xStart, xEnd] of each line's ink
  let y = (ctx.canvas.height - blockH * k) / 2;
  lines.forEach((l, i) => {
    y += gaps[i] * k;
    const b = ink[i];
    const left = (ctx.canvas.width - widths[i] * k) / 2;
    ctx.font = font.text(REF * (l.scale ?? 1) * k);
    ctx.fillText(l.text, left - b.left * k, y - b.top * k);
    rows.push([y, y + heights[i] * k, left, left + widths[i] * k]);
    y += heights[i] * k;
  });

  // 4. Sample. Indic scripts have thin hairlines, so the grid follows the
  //    font size closely and partially covered pixels still count.
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const W = img.width, d = img.data;
  const { pts, step } = sample(img.width, img.height, Math.max(1.6, base / 46), maxPoints, (x, yy) =>
    d[(yy * W + x) * 4 + 3] > 110 ? {} : null,
  );

  const points = pts.map((p) => {
    let li = rows.findIndex((r) => p.gy >= r[0] - step && p.gy < r[1] + step);
    if (li < 0) li = rows.length - 1;
    const [, , x0, x1] = rows[li];
    const ramp = lines[li].ramp;
    const c = mixColor(ramp[0], ramp[1], clamp((p.gx - x0) / Math.max(1, x1 - x0), 0, 1));
    return {
      x: box.x + p.gx + rand(-0.18, 0.18) * step,
      y: box.y + p.gy + rand(-0.18, 0.18) * step,
      r: c[0], g: c[1], b: c[2],
      size: clamp(step * 0.85, 1.6, 9),
    };
  });
  return { points, step };
}

// Emoji are drawn at a moderate size on a generously padded canvas, then
// cropped to the pixels that actually came out. Browsers disagree about
// where an emoji sits relative to its baseline, and some draw very large
// colour glyphs badly, so we never trust the font metrics for placement.
const EMOJI_PX = 150;

/**
 * Emoji keep their own colours: every star takes the colour of the pixel it
 * replaces. Dark pixels (eyes, outlines) are left as gaps and the silhouette
 * edge is brightened so the shape reads clearly.
 */
export function rasterEmoji(emoji, box, maxPoints = 1100) {
  const pad = EMOJI_PX;
  const C = EMOJI_PX + pad * 2;
  const ctx = workCanvas(C, C);
  ctx.font = font.emoji(EMOJI_PX);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.fillText(emoji, C / 2, pad + EMOJI_PX * 0.82);

  const img = ctx.getImageData(0, 0, C, C);
  const d = img.data;
  let x0 = C, y0 = C, x1 = -1, y1 = -1;
  for (let y = 0; y < C; y++) {
    for (let x = 0; x < C; x++) {
      if (d[(y * C + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { points: [], step: 1 };
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= C || y >= C ? 0 : d[(y * C + x) * 4 + 3]);

  // Fit the glyph's real bounds into the show box.
  const side = Math.min(box.w, box.h) * 0.9;
  const scale = side / Math.max(gw, gh);
  const area = gw * gh * 0.62;
  const start = Math.max(0.8, Math.sqrt(area / maxPoints));

  const { pts, step } = sample(gw, gh, start, maxPoints, (lx, ly, st) => {
    const x = lx + x0, y = ly + y0;
    const o = (y * C + x) * 4;
    if (d[o + 3] < 128) return null;
    let r = d[o], g = d[o + 1], b = d[o + 2];
    const m = Math.max(r, g, b);
    if (m < 45) return null; // dark detail becomes a gap
    const s = Math.max(1, Math.round(st));
    const edge = alpha(x - s, y) < 128 || alpha(x + s, y) < 128 || alpha(x, y - s) < 128 || alpha(x, y + s) < 128;
    if (m < 215) {
      const boost = 215 / m;
      r = Math.min(255, r * boost); g = Math.min(255, g * boost); b = Math.min(255, b * boost);
    }
    if (edge) [r, g, b] = mixColor([r, g, b], [255, 255, 255], 0.3);
    return { r, g, b, edge };
  });

  const ox = box.x + (box.w - gw * scale) / 2;
  const oy = box.y + (box.h - gh * scale) / 2;
  const st = step * scale;
  const points = pts.map((p) => ({
    x: ox + p.gx * scale + rand(-0.15, 0.15) * st,
    y: oy + p.gy * scale + rand(-0.15, 0.15) * st,
    r: p.r, g: p.g, b: p.b,
    size: clamp(st * (p.edge ? 0.95 : 0.85), 1.6, 9),
  }));
  return { points, step: st };
}

/**
 * How many points a sample of Latin, Hindi and Bengali text and an emoji
 * give here. The simulation worker compares its result with the page's to
 * check that it can draw every script before taking over (fonts and colour
 * emoji in OffscreenCanvas differ between browsers).
 */
export function probeRaster() {
  const box = { x: 0, y: 0, w: 240, h: 120 };
  const ramp = [COLORS.white, COLORS.gold];
  return {
    text: rasterLines([{ text: 'Aअঅ', ramp }], box, 4000).points.length,
    emoji: rasterEmoji('🪔', box, 4000).points.length,
  };
}
