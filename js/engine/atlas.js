// Painted once at start-up: one atlas with every solid object (cracker
// bodies, diyas, the sky lantern, paper bits) and one texture of smoke puffs.
// Both renderers use them; WebGL lights the bodies with the frame's light map.

const K = 2; // drawn at 2x so bodies stay sharp on high-DPI screens

// name: [x, y, w, h, anchorX, anchorY] in 1x atlas units
const LAYOUT = {
  anar: [2, 2, 64, 72, 0.5, 1],
  bomb: [70, 2, 48, 72, 0.5, 1],
  sutli: [122, 2, 72, 76, 0.5, 1],
  diya: [198, 2, 96, 52, 0.5, 0.62],
  lantern: [298, 2, 72, 100, 0.5, 0.55],
  chakra: [374, 2, 100, 100, 0.5, 0.5],
  candle: [2, 106, 34, 130, 0.5, 1],
  wire: [40, 106, 10, 130, 0.5, 1],
  ladi: [54, 106, 16, 36, 0.5, 1],
  paper: [74, 106, 16, 12, 0.5, 0.5],
  paperGold: [94, 106, 16, 12, 0.5, 0.5],
  jute: [114, 106, 16, 12, 0.5, 0.5],
  stand: [134, 106, 40, 16, 0.5, 1],
};
const AW = 480, AH = 240;

function cylinder(ctx, x, y, w, h, light, mid, dark) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.35, light);
  g.addColorStop(0.6, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

const PAINT = {
  anar(ctx, w, h) {
    // Clay cone with a paper label and a fuse nipple.
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#5a2210'); g.addColorStop(0.35, '#c46a35'); g.addColorStop(0.65, '#9a4620'); g.addColorStop(1, '#4a1a0c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.1);
    ctx.lineTo(w * 0.64, h * 0.1);
    ctx.lineTo(w * 0.96, h);
    ctx.lineTo(w * 0.04, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8b04a';
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h * 0.52); ctx.lineTo(w * 0.76, h * 0.52); ctx.lineTo(w * 0.83, h * 0.7); ctx.lineTo(w * 0.17, h * 0.7);
    ctx.fill();
    ctx.fillStyle = '#b8232c';
    ctx.fillRect(w * 0.3, h * 0.58, w * 0.4, h * 0.06);
    ctx.fillStyle = '#2a0e06';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.1, w * 0.14, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  bomb(ctx, w, h) {
    cylinder(ctx, w * 0.12, h * 0.22, w * 0.76, h * 0.78, '#e8444c', '#b8232c', '#5e0e14');
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(w * 0.12, h * 0.5, w * 0.76, h * 0.08);
    ctx.fillStyle = '#7a1018';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.22, w * 0.38, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8c9a8';
    ctx.lineWidth = 2.2 * K;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.22);
    ctx.quadraticCurveTo(w * 0.72, h * 0.1, w * 0.62, h * 0.01);
    ctx.stroke();
  },
  sutli(ctx, w, h) {
    // A jute-wrapped ball.
    const r = w * 0.4, cx = w / 2, cy = h - r - 1;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#d9b47a'); g.addColorStop(0.7, '#9a7038'); g.addColorStop(1, '#4e3618');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(60,38,14,0.55)';
    ctx.lineWidth = 1.4 * K;
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, Math.abs(k) * r * 0.16 + 1, 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#d8c9a8';
    ctx.lineWidth = 2 * K;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 1.4, cx + r * 0.2, 2);
    ctx.stroke();
  },
  diya(ctx, w, h) {
    // Clay lamp: bowl, rim and oil, with a pinched spout on the right.
    const g = ctx.createLinearGradient(0, h * 0.3, 0, h);
    g.addColorStop(0, '#d9843a'); g.addColorStop(1, '#5e2410');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.42);
    ctx.quadraticCurveTo(w * 0.1, h * 0.98, w * 0.5, h * 0.98);
    ctx.quadraticCurveTo(w * 0.9, h * 0.98, w * 0.98, h * 0.36);
    ctx.lineTo(w * 0.8, h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0a85c';
    ctx.beginPath();
    ctx.ellipse(w * 0.45, h * 0.42, w * 0.41, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a1608';
    ctx.beginPath();
    ctx.ellipse(w * 0.45, h * 0.42, w * 0.33, h * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,150,0.5)';
    ctx.fillRect(w * 0.18, h * 0.62, w * 0.6, h * 0.04);
  },
  lantern(ctx, w, h) {
    // Paper sky lantern, glowing from inside (the renderer adds emission).
    const g = ctx.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.5, h * 0.6);
    g.addColorStop(0, '#f2c27a'); g.addColorStop(0.45, '#c8642a'); g.addColorStop(1, '#6e2810');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.04);
    ctx.quadraticCurveTo(w * 0.5, 0, w * 0.78, h * 0.04);
    ctx.quadraticCurveTo(w * 0.98, h * 0.45, w * 0.82, h * 0.86);
    ctx.lineTo(w * 0.18, h * 0.86);
    ctx.quadraticCurveTo(w * 0.02, h * 0.45, w * 0.22, h * 0.04);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,60,20,0.45)';
    ctx.lineWidth = 1.2 * K;
    for (const u of [0.36, 0.5, 0.64]) {
      ctx.beginPath();
      ctx.moveTo(w * u, h * 0.03);
      ctx.quadraticCurveTo(w * (0.5 + (u - 0.5) * 1.6), h * 0.45, w * u, h * 0.86);
      ctx.stroke();
    }
    ctx.fillStyle = '#5a2a10';
    ctx.fillRect(w * 0.2, h * 0.86, w * 0.6, h * 0.025);
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.93, w * 0.07, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  chakra(ctx, w, h) {
    // Seen from above: a coiled paper tube on a bamboo cross.
    const cx = w / 2, cy = h / 2, R = w * 0.46;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = ['#d8452a', '#2f8a4a', '#e8b04a'][k];
      ctx.lineWidth = 5.5 * K;
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.02) {
        const a = k * 0.18 + t * Math.PI * 4.2;
        const r = R * (0.2 + 0.78 * t);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#6a3a18';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
    ctx.fill();
  },
  candle(ctx, w, h) {
    cylinder(ctx, w * 0.14, h * 0.03, w * 0.72, h * 0.97, '#4f7fe0', '#2a52b8', '#101f4e');
    ctx.fillStyle = '#e8b04a';
    for (const v of [0.22, 0.5, 0.78]) ctx.fillRect(w * 0.14, h * v, w * 0.72, h * 0.03);
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.03, w * 0.3, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  wire(ctx, w, h) {
    ctx.fillStyle = '#8f8f98';
    ctx.fillRect(w * 0.35, h * 0.55, w * 0.3, h * 0.45);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#3a3438'); g.addColorStop(0.5, '#6e646a'); g.addColorStop(1, '#3a3438');
    ctx.fillStyle = g;
    ctx.fillRect(w * 0.1, 0, w * 0.8, h * 0.58);
  },
  ladi(ctx, w, h) {
    cylinder(ctx, w * 0.12, h * 0.12, w * 0.76, h * 0.88, '#f05058', '#c4262e', '#5e0e14');
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(w * 0.12, h * 0.45, w * 0.76, h * 0.1);
    ctx.strokeStyle = '#d8c9a8';
    ctx.lineWidth = 1.4 * K;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.12);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
  },
  paper(ctx, w, h) {
    ctx.fillStyle = '#d0242e';
    ctx.fillRect(0, h * 0.1, w, h * 0.8);
  },
  paperGold(ctx, w, h) {
    ctx.fillStyle = '#e0a83c';
    ctx.fillRect(0, h * 0.15, w, h * 0.7);
  },
  jute(ctx, w, h) {
    ctx.fillStyle = '#8a6430';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h * 0.32, 0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  stand(ctx, w, h) {
    // A little clay stand that holds a sparkler upright.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9a5a32'); g.addColorStop(1, '#3e1a0a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.6, w / 2, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** Returns { canvas, cells: { name: { u0, v0, u1, v1, ax, ay, w, h } } } */
export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = AW * K;
  canvas.height = AH * K;
  const ctx = canvas.getContext('2d');
  const cells = {};
  for (const [name, [x, y, w, h, ax, ay]] of Object.entries(LAYOUT)) {
    ctx.save();
    ctx.translate(x * K, y * K);
    ctx.beginPath();
    ctx.rect(0, 0, w * K, h * K);
    ctx.clip();
    PAINT[name](ctx, w * K, h * K);
    ctx.restore();
    cells[name] = { u0: x / AW, v0: y / AH, u1: (x + w) / AW, v1: (y + h) / AH, ax, ay, w, h };
  }
  return { canvas, cells };
}

/** Four soft, lumpy smoke puffs in a 2x2 grid (white on transparent). */
export function buildSmokeTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * 2;
  const ctx = canvas.getContext('2d');
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * size, oy = Math.floor(v / 2) * size;
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.pow(rnd(), 0.8) * size * 0.24;
      const x = ox + size / 2 + Math.cos(a) * d;
      const y = oy + size / 2 + Math.sin(a) * d;
      const r = size * (0.1 + rnd() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const al = 0.12 + rnd() * 0.12;
      g.addColorStop(0, `rgba(255,255,255,${al})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, size, size);
    }
  }
  // Normalise each puff so its densest point is fully opaque; the puff's own
  // alpha then decides how thick the smoke looks.
  const img = ctx.getImageData(0, 0, size * 2, size * 2);
  const d = img.data;
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * size, oy = Math.floor(v / 2) * size;
    let max = 1;
    for (let y = oy; y < oy + size; y++) for (let x = ox; x < ox + size; x++) max = Math.max(max, d[(y * size * 2 + x) * 4 + 3]);
    const k = 255 / max;
    for (let y = oy; y < oy + size; y++) {
      for (let x = ox; x < ox + size; x++) {
        const o = (y * size * 2 + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = 255;
        d[o + 3] = Math.min(255, d[o + 3] * k);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Four thin, wispy cloud bands in a 2x2 grid. Tinted cool lilac on top and
 * warm underneath, where the city's glow lights them from below. The
 * renderer adds the light of the fireworks on top of that.
 * -> { canvas, cells: [{ u0, v0, u1, v1, ax, ay, w, h }] }
 */
export function buildCloudTexture(cw = 512, ch = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = cw * 2;
  canvas.height = ch * 2;
  const ctx = canvas.getContext('2d');
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cells = [];
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * cw, oy = Math.floor(v / 2) * ch;
    const cell = document.createElement('canvas');
    cell.width = cw;
    cell.height = ch;
    const c = cell.getContext('2d');
    // Overlapping flat blobs, denser in the middle: a stretched, ragged band.
    for (let k = 0; k < 46; k++) {
      const t = (rnd() + rnd() + rnd()) / 3;
      const x = cw * (0.08 + 0.84 * t);
      const y = ch * (0.5 + (rnd() - 0.5) * 0.32 * (1 - Math.abs(t - 0.5)));
      const rx = cw * (0.06 + rnd() * 0.16);
      const ry = rx * (0.22 + rnd() * 0.22);
      c.save();
      c.translate(x, y);
      c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255,255,255,${0.1 + rnd() * 0.12})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    }
    // Tear a few holes so it reads as wisps, not a blob.
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 10; k++) {
      const x = cw * (0.1 + rnd() * 0.8), y = ch * (0.35 + rnd() * 0.3), r = cw * (0.03 + rnd() * 0.06);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Normalise density, fade the edges to nothing, then colour.
    const img = c.getImageData(0, 0, cw, ch);
    const d = img.data;
    let max = 1;
    for (let i = 3; i < d.length; i += 4) max = Math.max(max, d[i]);
    for (let y = 0; y < ch; y++) {
      const fy = Math.min(1, Math.min(y, ch - 1 - y) / (ch * 0.18));
      const top = y / ch;
      const r = 120 + 95 * top, g = 112 + 30 * top, b = 165 - 40 * top; // lilac above, warm below
      for (let x = 0; x < cw; x++) {
        const fx = Math.min(1, Math.min(x, cw - 1 - x) / (cw * 0.12));
        const o = (y * cw + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b;
        d[o + 3] = Math.min(255, (d[o + 3] / max) * 235 * fx * fy);
      }
    }
    ctx.putImageData(img, ox, oy);
    cells.push({ u0: ox / (cw * 2), v0: oy / (ch * 2), u1: (ox + cw) / (cw * 2), v1: (oy + ch) / (ch * 2), ax: 0.5, ay: 0.5, w: cw, h: ch });
  }
  return { canvas, cells };
}
