// Turns text and emoji into points for the simulation worker, on a thread of
// its own, so the animation never pauses while a new scene is prepared. See
// rasterAsync.js.

import { packPoints, rasterEmoji, rasterLines } from './textRaster.js';

onmessage = ({ data: { id, kind, args } }) => {
  let out;
  try {
    out = kind === 'lines' ? rasterLines(...args) : rasterEmoji(...args);
  } catch (e) {
    postMessage({ id, error: String(e) });
    return;
  }
  const packed = packPoints(out.points);
  postMessage({ id, packed, step: out.step }, [packed.buffer]);
};
