export const TAU = Math.PI * 2;

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Roughly normal, mean 0, sd ~1 (sum of three uniforms). */
export const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const mixColor = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Evenly spread unit vectors on a sphere (Fibonacci lattice), randomly rotated. */
export function sphere(n, cb) {
  const ga = Math.PI * (3 - Math.sqrt(5));
  const rot = rand(TAU);
  const tilt = rand(-0.6, 0.6);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(1 - y * y);
    const x = Math.cos(ga * i + rot) * r;
    const z = Math.sin(ga * i + rot) * r;
    cb(x, y * ct - z * st, y * st + z * ct, i);
  }
}

export function debounce(fn, ms) {
  let id = 0;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
