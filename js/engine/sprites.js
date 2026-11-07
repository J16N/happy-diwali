// Pre-rendered glow sprites for the Canvas 2D fallback renderer. Drawing a
// cached sprite with additive blending is far cheaper than building gradients
// per particle every frame.

const SIZE = 48;
const cache = new Map();

/** Returns { img, css } for a colour, quantised to 5 bits per channel. */
export function glow(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r;
  g = g < 0 ? 0 : g > 255 ? 255 : g;
  b = b < 0 ? 0 : b > 255 ? 255 : b;
  const qr = (r >> 3) & 31;
  const qg = (g >> 3) & 31;
  const qb = (b >> 3) & 31;
  const key = (qr << 10) | (qg << 5) | qb;
  let sprite = cache.get(key);
  if (sprite) return sprite;

  const cr = (qr << 3) | 4;
  const cg = (qg << 3) | 4;
  const cb = (qb << 3) | 4;
  const img = document.createElement('canvas');
  img.width = img.height = SIZE;
  const c = img.getContext('2d');
  const grad = c.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  const hot = `rgb(${(cr + 255) >> 1},${(cg + 255) >> 1},${(cb + 255) >> 1})`;
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, hot);
  grad.addColorStop(0.32, `rgba(${cr},${cg},${cb},0.55)`);
  grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, SIZE, SIZE);

  sprite = { img, css: `rgb(${cr},${cg},${cb})` };
  cache.set(key, sprite);
  return sprite;
}
