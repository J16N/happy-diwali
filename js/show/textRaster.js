// Turns text and emoji into clouds of points. We draw the glyphs onto a hidden
// canvas, read the pixels back and keep one point per grid cell. Those points
// are where firework stars will come to rest.

import { COLORS, font } from '../config.js';
import { clamp, mixColor, rand } from '../utils.js';

// On the page a hidden <canvas>; in the simulation worker an OffscreenCanvas.
const newCanvas = () => (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1));

// Canvases only ever grow: resizing one reallocates it, which cost more than
// the drawing. Each use clears and reads just the region it needs.
let work = null;
/** A cleared w x h drawing area (the canvas may be larger). */
function workCanvas(w, h) {
  work ??= newCanvas();
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  if (work.width < w || work.height < h) {
    work.width = Math.max(work.width, w);
    work.height = Math.max(work.height, h);
  }
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** The region (screen px) where the show happens: centred in the sky above the terrace. */
export function centralBox(view) {
  const { W, skyH } = view;
  const w = Math.min(W * 0.9, 1180);
  const h = Math.min(skyH * 0.62, 560);
  const cy = skyH * 0.47;
  return { x: (W - w) / 2, y: Math.max(8, cy - h / 2), w, h };
}

/**
 * Sample opaque cells; the step grows until the point count fits the budget.
 * The count falls with the square of the step, so each retry jumps straight
 * to the step that should fit (usually one or two passes, not a dozen).
 */
function sample(w, h, startStep, maxPoints, visit) {
  let step = startStep;
  for (let attempt = 0; attempt < 8; attempt++) {
    const pts = [];
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const p = visit(x | 0, y | 0, step);
        if (p) {
          p.gx = x;
          p.gy = y;
          pts.push(p);
        }
      }
    }
    if (pts.length <= maxPoints || attempt === 7) return { pts, step };
    step *= Math.max(1.03, Math.sqrt(pts.length / maxPoints) * 1.01);
  }
}

/**
 * Bounding box of the pixels with alpha above `min`, scanning in from each
 * edge (much less work than visiting every pixel). -> [x0, y0, x1, y1] or null
 */
function inkBox(data, w, h, min) {
  const a = (x, y) => data[(y * w + x) * 4 + 3] > min;
  const rowHas = (y) => { for (let x = 0; x < w; x++) if (a(x, y)) return true; return false; };
  let y0 = 0;
  while (y0 < h && !rowHas(y0)) y0++;
  if (y0 === h) return null;
  let y1 = h - 1;
  while (y1 > y0 && !rowHas(y1)) y1--;
  const colHas = (x) => { for (let y = y0; y <= y1; y++) if (a(x, y)) return true; return false; };
  let x0 = 0;
  while (!colHas(x0)) x0++;
  let x1 = w - 1;
  while (x1 > x0 && !colHas(x1)) x1--;
  return [x0, y0, x1, y1];
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
  if (measure.width < w || measure.height < h) {
    measure.width = Math.max(measure.width, w);
    measure.height = Math.max(measure.height, h);
    mctx.font = font.text(px); // resizing the canvas reset the context
  }
  mctx.clearRect(0, 0, w, h);
  mctx.textAlign = 'left';
  mctx.textBaseline = 'alphabetic';
  mctx.fillStyle = '#fff';
  const ox = pad, oy = Math.round(px * 2);
  mctx.fillText(text, ox, oy);
  const ink = inkBox(mctx.getImageData(0, 0, w, h).data, w, h, 24);
  if (!ink) return { left: 0, right: adv, top: -px * 0.7, bottom: 0 };
  const [x0, y0, x1, y1] = ink;
  return { left: x0 - ox, right: x1 + 1 - ox, top: y0 - oy, bottom: y1 + 1 - oy };
}

/**
 * lines: [{ text, scale = 1, ramp: [colorA, colorB] }]
 * Returns { points: [{ x, y, r, g, b, size, line }] } with every line centred in box
 * (line: the index of the line the point belongs to).
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
  const cw = Math.max(1, Math.ceil(box.w)), ch = Math.max(1, Math.ceil(box.h));
  const ctx = workCanvas(cw, ch);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  const rows = []; // [yStart, yEnd, xStart, xEnd] of each line's ink
  let y = (ch - blockH * k) / 2;
  lines.forEach((l, i) => {
    y += gaps[i] * k;
    const b = ink[i];
    const left = (cw - widths[i] * k) / 2;
    ctx.font = font.text(REF * (l.scale ?? 1) * k);
    ctx.fillText(l.text, left - b.left * k, y - b.top * k);
    rows.push([y, y + heights[i] * k, left, left + widths[i] * k]);
    y += heights[i] * k;
  });

  // 4. Sample. Indic scripts have thin hairlines, so the grid follows the
  //    font size closely and partially covered pixels still count.
  const img = ctx.getImageData(0, 0, cw, ch);
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
      line: li,
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
  const ink = inkBox(d, C, C, 40);
  if (!ink) return { points: [], step: 1 };
  const [x0, y0, x1, y1] = ink;
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= C || y >= C ? 0 : d[(y * C + x) * 4 + 3]);

  // Fit the glyph's real bounds into the show box.
  const side = Math.min(box.w, box.h) * 0.9;
  const scale = side / Math.max(gw, gh);
  const area = gw * gh * 0.62;
  const start = Math.max(0.8, Math.sqrt(area / maxPoints));

  // Contrast. Faces are read from their dark details (eyes, mouth, brows,
  // outlines), so a small dark spot or line inside a lighter area is left as
  // a gap. Two checks against the pixel's surroundings decide it: it must be
  // much darker than them, and darkness must cover only a small part of
  // them. That keeps dark shading (the shadowed foot of a diya, the deep red
  // tip of a heart: as dark as their neighbours) and large dark regions
  // beside light ones (the green stripe of 🇮🇳 beside the white one), which
  // stay as dimmer stars. The whole
  // picture is brightened by one gain, so lighter and darker parts keep
  // their difference. (Lifting every pixel to the same brightness made brown
  // eyes and lips look like the face.)
  const lum = (o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  const ls = [];
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const o = (y * C + x) * 4;
      if (d[o + 3] >= 128) ls.push(lum(o));
    }
  }
  ls.sort((a, b) => a - b);
  const typical = ls[Math.floor(ls.length / 2)] ?? 128;
  const gain = clamp(205 / Math.max(typical, 1), 1, 3.5);
  // Mean brightness of the opaque pixels around each point, from summed-area
  // tables over the glyph's bounds (one pass, then O(1) per point).
  const R = Math.max(5, Math.round(Math.max(gw, gh) * 0.12));
  const darkBelow = typical * 0.6;
  const tw = gw + 1;
  const size = tw * (gh + 1);
  const sumL = new Float64Array(size), sumA = new Float64Array(size), sumD = new Float64Array(size);
  for (let y = 0; y < gh; y++) {
    let rowL = 0, rowA = 0, rowD = 0;
    for (let x = 0; x < gw; x++) {
      const o = ((y + y0) * C + x + x0) * 4;
      if (d[o + 3] >= 128) {
        const L = lum(o);
        rowL += L; rowA++;
        if (L < darkBelow) rowD++;
      }
      const t = (y + 1) * tw + x + 1;
      sumL[t] = sumL[t - tw] + rowL;
      sumA[t] = sumA[t - tw] + rowA;
      sumD[t] = sumD[t - tw] + rowD;
    }
  }
  /** Surroundings of a point: { mean brightness, share that is dark }. */
  const near = { mean: 0, dark: 0 };
  const around = (lx, ly) => {
    const ax = Math.max(0, lx - R), bx = Math.min(gw, lx + R + 1);
    const ay = Math.max(0, ly - R), by = Math.min(gh, ly + R + 1);
    const area = (t) => t[by * tw + bx] - t[ay * tw + bx] - t[by * tw + ax] + t[ay * tw + ax];
    const n = area(sumA) || 1;
    near.mean = area(sumL) / n;
    near.dark = area(sumD) / n;
    return near;
  };

  const { pts, step } = sample(gw, gh, start, maxPoints, (lx, ly, st) => {
    const x = lx + x0, y = ly + y0;
    const o = (y * C + x) * 4;
    if (d[o + 3] < 128) return null;
    const L = lum(o);
    if (L < darkBelow) {
      const a = around(lx, ly);
      if (L < 0.55 * a.mean && a.dark < 0.4) return null; // a dark detail: a gap
    }
    const m = Math.max(1, d[o], d[o + 1], d[o + 2]);
    // One gain for all, capped per pixel so the brightest channel reaches 255
    // at most (the colour keeps its hue instead of clipping to white), and a
    // floor so dark shading still shows as dimmer stars.
    const k = Math.min(255 / m, Math.max(gain, 115 / m));
    let r = d[o] * k, g = d[o + 1] * k, b = d[o + 2] * k;
    const s = Math.max(1, Math.round(st));
    const edge = alpha(x - s, y) < 128 || alpha(x + s, y) < 128 || alpha(x, y - s) < 128 || alpha(x, y + s) < 128;
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
    // A little smaller than text stars, so their glow does not fill the gaps.
    size: clamp(st * (p.edge ? 0.85 : 0.72), 1.6, 9),
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

// Points as one flat array, for sending between threads in a single cheap
// transfer: x, y, r, g, b, size, line (-1 for emoji).
const STRIDE = 7;

export function packPoints(points) {
  const a = new Float32Array(points.length * STRIDE);
  points.forEach((p, i) => {
    const o = i * STRIDE;
    a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.r; a[o + 3] = p.g; a[o + 4] = p.b; a[o + 5] = p.size;
    a[o + 6] = p.line ?? -1;
  });
  return a;
}

export function unpackPoints(a) {
  const points = [];
  for (let o = 0; o < a.length; o += STRIDE) {
    const p = { x: a[o], y: a[o + 1], r: a[o + 2], g: a[o + 3], b: a[o + 4], size: a[o + 5] };
    if (a[o + 6] >= 0) p.line = a[o + 6];
    points.push(p);
  }
  return points;
}
