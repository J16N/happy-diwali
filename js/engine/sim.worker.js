// The simulation in a background thread, so a busy show (thousands of sparks,
// a name forming in the sky) never holds up drawing, input or sound on the
// page. See simClient.js for the other side.
//
// Each step's instance buffers are transferred to the page (no copy) and
// handed back with a later step for reuse. Sounds and screen-reader text
// travel as small messages.

import { Sim } from './sim.js';
import { probeRaster } from '../show/textRaster.js';
import { BATCHES, batchOf } from './batch.js';

let sim = null;
let sounds = [];
const spare = Object.fromEntries(BATCHES.map((k) => [k, []]));

// Sound is played on the page: record each call and send it with the frame.
const sound = new Proxy({}, {
  get: (_, name) => (...args) => { sounds.push([name, args]); },
});

const COMMANDS = new Set(['resize', 'setBulbs', 'setQuality', 'setReduced', 'start', 'stop', 'restartScene', 'fire', 'tapShell', 'look', 'igniteDiyas']);

/** Give every batch a live buffer again: one handed back by the page, or a new one. */
function rearm(frame) {
  for (const key of BATCHES) {
    const b = batchOf(frame, key);
    if (b.data.length) continue; // still ours (never sent)
    const need = b.stride * b.cap;
    const pool = spare[key];
    let data = null;
    while (pool.length && !data) {
      const d = pool.pop();
      if (d.length >= need) data = d;
    }
    b.data = data ?? new Float32Array(need);
    b.cap = b.data.length / b.stride;
  }
}

function send(frame, stepMs) {
  const batches = {};
  const transfer = [];
  for (const key of BATCHES) {
    const b = batchOf(frame, key);
    batches[key] = { data: b.data, n: b.n };
    transfer.push(b.data.buffer);
  }
  const v = sim.view;
  postMessage({ t: 'frame', batches, time: frame.time, shift: [v.ox, v.oy, v.sx, v.sy], sounds, stepMs }, transfer);
  sounds = [];
}

onmessage = ({ data: m }) => {
  if (m.t === 'step') {
    for (const [key, data] of m.back ?? []) spare[key]?.push(data);
    const t0 = performance.now();
    rearm(sim.world.frame);
    let frame;
    try {
      frame = sim.step(m.dt);
    } catch (e) {
      console.error(e);
      frame = sim.collect();
    }
    send(frame, performance.now() - t0);
  } else if (m.t === 'call') {
    if (COMMANDS.has(m.name)) sim[m.name](...m.args);
  } else if (m.t === 'init') {
    let probe = { text: 0, emoji: 0 };
    try {
      probe = probeRaster();
    } catch {
      /* no OffscreenCanvas text here: the page keeps the simulation */
    }
    sim = new Sim({
      sound,
      budget: m.budget,
      cells: m.cells,
      cloudCells: m.cloudCells,
      hooks: {
        announce: (text) => postMessage({ t: 'announce', text }),
        done: () => postMessage({ t: 'done' }),
      },
    });
    postMessage({ t: 'ready', probe });
  }
};
