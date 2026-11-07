// Everything that moves: the world (sparks, text stars, smoke, crackers), the
// show script, and the living parts of the backdrop (diyas, string lights,
// clouds). step(dt) advances it all and returns the frame to draw.
//
// It never touches the page, so it runs the same in a Web Worker
// (sim.worker.js, the default) or on the main thread (the fallback).

import { World } from './world.js';
import { Director } from '../show/director.js';
import { Clouds, Diyas, StringLights } from '../ui/backdrop.js';

export class Sim {
  /** opts: { sound, budget, cells, cloudCells, hooks: { announce(text), done() } } */
  constructor({ sound, budget, cells, cloudCells, hooks }) {
    this.world = new World(sound, budget, cells);
    this.director = new Director(this.world, hooks);
    this.diyas = new Diyas(cells);
    this.bulbs = new StringLights();
    this.clouds = new Clouds(cloudCells);
    this.extras = [this.clouds, this.bulbs, this.diyas];
  }

  get view() { return this.world.view; }
  /** A show has been started (and not stopped). */
  get running() { return !!this.director.token; }

  resize(w, h) {
    this.world.resize(w, h);
    this.diyas.resize(this.world.view);
    this.clouds.resize(this.world.view);
  }

  setBulbs(bulbs) { this.bulbs.set(bulbs); }
  setQuality(level) { this.world.setQuality(level); }

  /** prefers-reduced-motion: dimmer flashes, no parallax or shake. */
  setReduced() {
    this.world.flashScale = 0.45;
    this.world.view.parallax = false;
  }

  start(name, from, opts) {
    this.world.clear();
    this.director.start(name, from, opts);
  }

  stop() {
    this.director.stop();
    this.world.clear();
  }

  /** Re-rasterise the current scene for a new screen shape. */
  restartScene() {
    this.world.clear();
    this.director.restartScene();
  }

  fire(id, x, y) { this.director.fire(id, x, y); }
  tapShell(x, y) { this.director.tapShell(x, y); }
  look(u, v) { this.world.view.look(u, v); }
  igniteDiyas() { this.diyas.ignite(null); } // silent: browsers block audio before a tap

  step(dt) {
    const w = this.world;
    this.director.update(dt);
    w.update(dt);
    this.diyas.update(dt, w);
    this.clouds.update(dt, w.wind);
    return w.collect(this.extras);
  }

  /** Redraw without advancing time (screenshots). */
  collect() {
    return this.world.collect(this.extras);
  }
}
