// Runs the simulation (sim.js) in a Web Worker when the browser can, else on
// the page. Both give the page the same small interface:
//
//   view            the camera, for layout, taps and backdrop parallax
//   running         a show has been started
//   resize / setBulbs / setQuality / setReduced / start / stop /
//   restartScene / fire / tapShell / look / igniteDiyas
//   tick(dt)        advance; returns a new frame to draw, or null if none is ready
//   frame           the latest frame (to redraw after a resize or for a snapshot)
//
// In the worker, a step runs while the page draws the previous one: one frame
// of latency, and the page's own frame time shrinks to drawing alone. Each
// step covers the real time since the one before, so the show keeps its pace
// even when steps are slow.

import { View } from './view.js';
import { BATCHES, batchOf } from './batch.js';
import { probeRaster } from '../show/textRaster.js';

const MAX_DT = 0.05;

/** The simulation on the page itself (fallback, and ?worker=0). */
class LocalSim {
  constructor(sim) {
    this.sim = sim;
    this.mode = 'main';
    this.frame = null;
    for (const m of ['resize', 'setBulbs', 'setQuality', 'setReduced', 'start', 'stop', 'restartScene', 'fire', 'tapShell', 'look', 'igniteDiyas']) {
      this[m] = (...args) => sim[m](...args);
    }
  }
  get view() { return this.sim.view; }
  get running() { return this.sim.running; }
  tick(dt) {
    this.frame = this.sim.step(Math.min(dt, MAX_DT));
    return this.frame;
  }
}

/** The simulation in a worker. */
class RemoteSim {
  constructor(worker, { sound, hooks }) {
    this.worker = worker;
    this.mode = 'worker';
    this.view = new View(); // geometry mirrors the worker's; parallax arrives with each frame
    this.running = false;
    this.frame = null; // being shown
    this.fresh = null; // arrived, not shown yet
    this.busy = false; // a step is in flight
    this.lastPost = performance.now();
    this.rafMs = 16.7; // display refresh interval (smoothed)
    this.back = []; // buffers of shown frames, to hand back for reuse
    this.stepMs = 0; // the worker's time for the last step
    worker.onmessage = ({ data: m }) => {
      if (m.t === 'frame') {
        for (const [name, args] of m.sounds) sound[name]?.(...args);
        const f = { time: m.time, shift: m.shift, far: {}, near: {} };
        for (const key of BATCHES) {
          const dot = key.indexOf('.');
          if (dot < 0) f[key] = m.batches[key];
          else f[key.slice(0, dot)][key.slice(dot + 1)] = m.batches[key];
        }
        const waiting = this.fresh;
        if (waiting) this._recycle(waiting); // never shown: a newer one replaces it
        this.fresh = f;
        this.stepMs = m.stepMs;
        this.busy = false;
        // Slow steps (a low-end phone): start the next one right away instead
        // of at the next refresh, so the worker never sits idle. Fast steps
        // keep to the display's pace, and nothing runs while nothing is shown
        // (a hidden tab).
        if (!waiting && m.stepMs > this.rafMs * 0.6) this._post();
      } else if (m.t === 'announce') hooks.announce?.(m.text);
      else if (m.t === 'done') hooks.done?.();
    };
    worker.onerror = (e) => console.error('Simulation worker:', e.message ?? e);
  }

  _recycle(frame) {
    for (const key of BATCHES) this.back.push([key, batchOf(frame, key).data]);
  }

  _post() {
    const now = performance.now();
    this.busy = true;
    this.worker.postMessage({ t: 'step', dt: Math.min((now - this.lastPost) / 1000, MAX_DT), back: this.back }, this.back.map(([, d]) => d.buffer));
    this.lastPost = now;
    this.back = [];
  }

  _call(name, ...args) {
    this.worker.postMessage({ t: 'call', name, args });
  }

  resize(w, h) { this.view.resize(w, h); this._call('resize', w, h); }
  setBulbs(bulbs) { this._call('setBulbs', bulbs); }
  setQuality(level) { this._call('setQuality', level); }
  setReduced() { this.view.parallax = false; this._call('setReduced'); }
  start(name, from, opts) { this.running = true; this._call('start', name, from, opts); }
  stop() { this.running = false; this._call('stop'); }
  restartScene() { this._call('restartScene'); }
  fire(id, x, y) { this._call('fire', id, x, y); }
  tapShell(x, y) { this._call('tapShell', x, y); }
  look(u, v) { this._call('look', u, v); }
  igniteDiyas() { this._call('igniteDiyas'); }

  tick(dt) {
    if (dt > 0 && dt < 0.1) this.rafMs += (dt * 1000 - this.rafMs) * 0.1;
    let out = null;
    if (this.fresh) {
      if (this.frame) this._recycle(this.frame);
      this.frame = out = this.fresh;
      this.fresh = null;
      const v = this.view;
      [v.ox, v.oy, v.sx, v.sy] = out.shift;
    }
    if (!this.busy) this._post();
    return out;
  }
}

function startWorker({ budget, cells, cloudCells }) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./sim.worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(null);
      return;
    }
    const fail = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve(null);
    };
    // Browsers without module workers fail to load it (onerror); a hang is
    // given a generous allowance for slow first visits.
    const timer = setTimeout(fail, 8000);
    worker.onerror = fail;
    worker.onmessage = ({ data: m }) => {
      if (m.t !== 'ready') return;
      clearTimeout(timer);
      // The worker must draw text and emoji as well as the page does.
      const here = probeRaster();
      if (m.probe.text >= here.text * 0.9 && m.probe.emoji >= here.emoji * 0.9 && m.probe.text > 0) resolve(worker);
      else fail();
    };
    worker.postMessage({ t: 'init', budget, cells, cloudCells });
  });
}

/** opts: { sound, budget, cells, cloudCells, hooks, worker = true } */
export async function createSim(opts) {
  if (opts.worker !== false && typeof Worker === 'function' && typeof OffscreenCanvas === 'function') {
    const worker = await startWorker(opts);
    if (worker) return new RemoteSim(worker, opts);
  }
  const { Sim } = await import('./sim.js');
  return new LocalSim(new Sim(opts));
}
