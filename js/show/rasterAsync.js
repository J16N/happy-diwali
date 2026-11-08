// Text and emoji rasterising without holding up the animation.
//
// Drawing a scene's glyphs and sampling them takes a few milliseconds on a
// laptop and can take a tenth of a second on a low-end phone: done in the
// middle of a simulation step, every scene change stuttered. Inside the
// simulation worker the work goes to a helper worker (raster.worker.js) and
// the show waits for the result while everything keeps moving. On the page
// (the fallback simulation), or if the helper cannot start, it is done
// directly, as before.

import { rasterEmoji, rasterLines, unpackPoints } from './textRaster.js';

const TIMEOUT_MS = 3000;
let helper = null;
let broken = false;
let seq = 0;
const pending = new Map();

const direct = (kind, args) => (kind === 'lines' ? rasterLines : rasterEmoji)(...args);

function finish(id, result) {
  const job = pending.get(id);
  if (!job) return;
  pending.delete(id);
  clearTimeout(job.timer);
  job.resolve(result ?? direct(job.kind, job.args));
}

function giveUp() {
  broken = true;
  helper?.terminate();
  helper = null;
  for (const id of [...pending.keys()]) finish(id, null);
}

function getHelper() {
  if (helper || broken) return helper;
  // Only from the simulation worker: on the page, text is drawn right there.
  if (typeof document !== 'undefined' || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') {
    broken = true;
    return null;
  }
  try {
    helper = new Worker(new URL('./raster.worker.js', import.meta.url), { type: 'module' });
  } catch {
    broken = true;
    return null;
  }
  helper.onmessage = ({ data: m }) => finish(m.id, m.error ? null : { points: unpackPoints(m.packed), step: m.step });
  helper.onerror = giveUp;
  return helper;
}

/** kind 'lines' -> rasterLines(...args), 'emoji' -> rasterEmoji(...args); resolves to { points, step }. */
export function raster(kind, ...args) {
  const h = getHelper();
  if (!h) return Promise.resolve(direct(kind, args));
  return new Promise((resolve) => {
    const id = ++seq;
    // A helper that never answers must not stall the show.
    const timer = setTimeout(giveUp, TIMEOUT_MS);
    pending.set(id, { resolve, kind, args, timer });
    h.postMessage({ id, kind, args });
  });
}
