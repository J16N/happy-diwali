// The Director scripts the whole show: greeting, name, one scene per emoji,
// a finale, then an endless idle loop. It runs on a simulation clock that is
// advanced by the render loop, so the show pauses with the tab and never
// drifts out of sync with the animation. It also fires whatever the visitor
// picks from the cracker wheel.

import { COLORS, GREETINGS, LINE_RAMPS, PALETTE, TIMING, localDigits } from '../config.js';
import { burst, subBurst, RANDOM_BURSTS } from '../crackers/shells.js';
import { Anar, Chakra, Sparkler, Ladi, Bomb, Sutli, RomanCandle } from '../crackers/ground.js';
import { SkyLantern } from '../crackers/lantern.js';
import { graphemes, parseMessage, parseName, tokenize } from './nameParser.js';
import { centralBox } from './textRaster.js';
import { raster } from './rasterAsync.js';
import { clamp, lerp, pick, rand } from '../utils.js';

class Clock {
  constructor() {
    this.t = 0;
    this.jobs = [];
  }
  after(sec, fn) {
    this.jobs.push({ at: this.t + sec, fn });
  }
  wait(sec) {
    return new Promise((res) => this.after(sec, res));
  }
  tick(dt) {
    this.t += dt;
    for (let i = 0; i < this.jobs.length; ) {
      if (this.jobs[i].at <= this.t) {
        const [job] = this.jobs.splice(i, 1);
        job.fn();
      } else i++;
    }
  }
  reset() {
    this.jobs.length = 0;
  }
}

// Ground decoration rotates per scene so every scene feels different.
const DECOR = ['anars', 'candles', 'chakras', 'sparklers'];

// Text rockets per scene at most (a long wish on a wide screen).
const MAX_TEXT_ROCKETS = 22;

/** Split an array into n runs of nearly equal length (in order). */
const chunks = (arr, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const part = arr.slice(Math.round((i * arr.length) / n), Math.round(((i + 1) * arr.length) / n));
    if (part.length) out.push(part);
  }
  return out;
};

const avgColor = (pts) => {
  let r = 0, g = 0, b = 0;
  for (const p of pts) { r += p.r; g += p.g; b += p.b; }
  const n = Math.max(1, pts.length);
  return [r / n, g / n, b / n];
};

export class Director {
  /** hooks: { announce(text), done() } */
  constructor(world, hooks = {}) {
    this.world = world;
    this.hooks = hooks;
    this.clock = new Clock();
    this.token = null;
    this.plan = [];
    this.sceneIndex = 0;
    world.onSubBurst = (x, y, z, c) => subBurst(world, x, y, z, c);
  }

  update(dt) {
    this.clock.tick(dt);
  }

  stop() {
    if (this.token) this.token.cancelled = true;
    this.token = null;
    this.clock.reset();
  }

  /**
   * (Re)start the show. `from` lets a resize resume at the current scene.
   * opts (from a greeting link): { sender, message, lang }. A message is
   * written after the name, the sender signs the show off before the finale.
   */
  start(name, from = 0, opts = this.opts ?? {}) {
    this.stop();
    this.name = name;
    this.opts = opts;
    this.lang = GREETINGS[opts.lang] ? opts.lang : 'en';
    this.plan = [{ type: 'greeting' }, ...parseName(name).scenes];
    // The wish follows the name: its words as lines, each emoji its own firework.
    this.plan.push(...parseMessage(opts.message ?? '', { width: this.world.W / this.world.view.skyH < 1.05 ? 11 : 18 }));
    const signature = tokenize(opts.sender ?? '').filter((t) => t.type === 'word').map((t) => t.value).slice(0, 3);
    if (signature.length) this.plan.push({ type: 'from', lines: signature });
    this.sceneIndex = from;
    const token = { cancelled: false };
    this.token = token;
    this.run(token, from).catch((e) => console.error(e));
  }

  restartScene() {
    if (this.token) this.start(this.name, this.sceneIndex, this.opts);
  }

  async run(tok, from) {
    const wait = (s) => this.clock.wait(s);
    if (from === 0) {
      await wait(0.5);
      if (tok.cancelled) return;
      this.opening();
      await wait(2.6);
    }
    for (let i = from; i < this.plan.length; i++) {
      if (tok.cancelled) return;
      this.sceneIndex = i;
      const scene = this.plan[i];
      const decor = DECOR[i % DECOR.length];
      if (scene.type === 'greeting') {
        this.hooks.announce?.(`${GREETINGS[this.lang].card} ${localDigits(new Date().getFullYear(), this.lang)}`);
        await this.playLines(this.greetingLines(), decor, tok);
      } else if (scene.type === 'message') {
        this.hooks.announce?.(scene.lines.join(' '));
        await this.playLines(this.messageLines(scene.lines), decor, tok);
      } else if (scene.type === 'from') {
        this.hooks.announce?.(`${GREETINGS[this.lang].from} ${scene.lines.join(' ')}`);
        await this.playLines(this.fromLines(scene.lines), decor, tok);
      } else if (scene.type === 'words') {
        this.hooks.announce?.(scene.lines.join(' '));
        await this.playLines(this.nameLines(scene.lines, i), decor, tok);
      } else {
        this.hooks.announce?.(scene.value);
        await this.playEmoji(scene.value, decor, tok);
      }
      if (tok.cancelled) return;
      await wait(TIMING.gap);
    }
    if (tok.cancelled) return;
    await this.finale(tok);
    if (tok.cancelled) return;
    this.hooks.done?.();
    this.idle(tok);
  }

  // ---- scene content -------------------------------------------------------

  greetingLines() {
    const year = localDigits(new Date().getFullYear(), this.lang); // never hard-coded; in the language's own numerals
    const yearRamp = [COLORS.white, COLORS.gold];
    const g = GREETINGS[this.lang];
    const { W, skyH } = this.world.view;
    if (W / skyH < 1.05) {
      return [
        { text: g.tall[0], ramp: [COLORS.gold, COLORS.saffron] },
        { text: g.tall[1], ramp: [COLORS.saffron, COLORS.crimson] },
        { text: year, scale: 0.7, ramp: yearRamp },
      ];
    }
    return [{ text: g.wide[0], ramp: [COLORS.gold, COLORS.crimson] }, { text: year, scale: 0.62, ramp: yearRamp }];
  }

  messageLines(lines) {
    return lines.map((text, i) => ({ text, ramp: i % 2 ? [COLORS.rose, COLORS.gold] : [COLORS.gold, COLORS.rose] }));
  }

  fromLines(words) {
    return [
      { text: GREETINGS[this.lang].from, scale: 0.42, ramp: [COLORS.white, COLORS.gold] },
      ...words.map((text) => ({ text, ramp: [COLORS.gold, COLORS.rose] })),
    ];
  }

  nameLines(words, sceneIdx) {
    return words.map((text, i) => ({ text, ramp: LINE_RAMPS[(sceneIdx + i) % LINE_RAMPS.length] }));
  }

  async playLines(lines, decor, tok) {
    const w = this.world;
    const { points } = await raster('lines', lines, centralBox(w.view), Math.round(w.budget.textPoints * w.density));
    if (tok.cancelled) return;
    // One rocket per character of each line, so shells break all along it.
    return this.play(points, decor, tok, TIMING.sweep, lines.map((l) => graphemes(l.text).length));
  }

  async playEmoji(emoji, decor, tok) {
    const w = this.world;
    const { points } = await raster('emoji', emoji, centralBox(w.view), Math.round(w.budget.emojiPoints * w.density));
    if (tok.cancelled) return;
    if (points.length < 12) {
      // No glyph available on this device: bloom instead of showing a blank.
      const b = centralBox(w.view);
      this.shell(b.x + b.w / 2, b.y + b.h / 2, 'chrysanthemum', COLORS.gold, 1.2, { z: 0 });
      await this.clock.wait(2.5);
      return;
    }
    // An emoji is one picture: all its shells break together so it never
    // shows up half-formed.
    await this.play(points, decor, tok, 0.02);
  }

  /**
   * Split points into patches, one rocket each. Patches are rows, then
   * columns, so the shells break at different heights: one row per line of
   * text, and bands for an emoji. Splitting only into vertical slices put
   * every break on one level, in the middle, which looked staged.
   */
  partition(points, chars) {
    const n = points.length;
    const k = clamp(Math.round(n / 500), 3, 9); // rockets in all (emoji)
    if (points[0]?.line !== undefined) {
      // Text: a row per line, a rocket per character (at most 10 per line and
      // MAX_TEXT_ROCKETS in all), so the whole width of every line is covered
      // by shells and no letter appears out of nowhere.
      const lines = [];
      for (const p of points) (lines[p.line] ??= []).push(p);
      // Rockets per line: one per character, or one per letter-width of ink
      // (about 0.55 of the line's height), whichever is more. Hindi and
      // Bengali characters are whole syllables, often wide conjuncts (क्ष्मी),
      // so counting characters alone gave them too few rockets.
      const want = Array.from(lines, (row, i) => {
        if (!row) return 0;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of row) {
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
          y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        const byWidth = Math.round((x1 - x0) / Math.max(1, (y1 - y0) * 0.55));
        return clamp(Math.max(chars?.[i] ?? 0, byWidth), 1, 10);
      });
      const total = want.reduce((a, b) => a + b, 0);
      const f = Math.min(1, MAX_TEXT_ROCKETS / Math.max(1, total));
      const groups = [];
      lines.forEach((row, i) => {
        if (row) groups.push(...chunks(row.sort((a, b) => a.x - b.x), Math.max(1, Math.round(want[i] * f))));
      });
      return groups;
    }
    // Emoji: up to 3 bands by height, each split into columns.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const r = clamp(Math.round(Math.sqrt((k * (y1 - y0)) / Math.max(1, x1 - x0))), 1, 3);
    const rows = chunks([...points].sort((a, b) => a.y - b.y), r);
    const groups = [];
    for (const row of rows) {
      const cols = Math.max(1, Math.round((k * row.length) / n));
      groups.push(...chunks([...row].sort((a, b) => a.x - b.x), cols));
    }
    return groups;
  }

  async play(points, decor, tok, sweep, chars) {
    const w = this.world;
    const v = w.view;
    const groups = this.partition(points, chars);
    // Many rockets: keep the whole sweep short, and each break a little
    // smaller and dimmer, so the scene costs about the same to draw.
    sweep = Math.min(sweep, 1.6 / Math.max(1, groups.length - 1));
    const many = Math.sqrt(Math.max(1, groups.length / 6));
    const specs = groups.map((g, i) => {
      const cx = g.reduce((s, p) => s + p.x, 0) / g.length;
      // Break somewhere in the patch's height, not exactly at its middle.
      let top = Infinity, bottom = -Infinity, sy = 0;
      for (const p of g) { top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); sy += p.y; }
      const cy = sy / g.length + rand(-0.3, 0.3) * (bottom - top);
      const rise = clamp(0.9 + 1.0 * ((v.floorY - cy) / v.H) + rand(-0.06, 0.06), 1, 1.9);
      return { g, cx, cy, rise, burstAt: i * sweep, color: avgColor(g) };
    });
    const lead = Math.max(...specs.map((s) => s.rise - s.burstAt));

    for (const s of specs) {
      const gid = w.stars.addGroup(s.g, s.cx, s.cy);
      this.clock.after(lead - s.rise + s.burstAt, () => {
        if (tok.cancelled) return;
        w.launchRocket({
          x0: clamp(s.cx + rand(-0.05, 0.05) * w.W, 10, w.W - 10),
          y0: v.floorY,
          z0: 0,
          x1: s.cx,
          y1: s.cy,
          rise: s.rise,
          style: 'straight',
          whistle: false,
          onBurst: (x, y) => {
            if (tok.cancelled) return;
            w.stars.start(gid, x, y);
            burst(w, 'peony', x, y, 0, s.color, 0.32 / Math.sqrt(many), { boom: false, smoke: 0.35 / many, light: 0.7 / many });
            w.boom(x, y, 0, 0.85 / Math.sqrt(many));
          },
        });
      });
    }

    const lastBurst = lead + (specs.length - 1) * sweep;
    const total = lastBurst + 1.5 + TIMING.hold;
    this.decorate(decor, total, tok);
    await this.clock.wait(total);
    if (tok.cancelled) return;

    w.stars.release();
    w.sound.crackle(0.5, 1.5);
    await this.clock.wait(TIMING.release);
  }

  // ---- placing things ------------------------------------------------------

  /** A floor spot at screen x and floor depth d (0 front .. 1 back). */
  floorSpot(sx, d) {
    const v = this.world.view;
    const z = v.floorZ(d);
    return { x: v.floorX(sx, z), z };
  }

  /** A point away from the centred text (screen coords). */
  freeSpot() {
    const { W, skyH } = this.world.view;
    if (W / skyH >= 1.1 && Math.random() < 0.6) {
      const left = Math.random() < 0.5;
      return [W * (left ? rand(0.06, 0.2) : rand(0.8, 0.94)), skyH * rand(0.15, 0.55)];
    }
    return [W * rand(0.12, 0.88), skyH * rand(0.07, 0.2)];
  }

  /**
   * Launch a rocket that bursts into `type` so that the burst appears at
   * screen point (sx, sy). opts.z picks the distance (random if omitted).
   */
  shell(sx, sy, type, color, power = 1, { z, style, onBurst } = {}) {
    const w = this.world;
    const v = w.view;
    if (z === undefined) {
      const r = Math.random();
      z = r < 0.3 ? rand(1.15, 2.1) * v.fov : r < 0.85 ? rand(-0.05, 0.6) * v.fov : rand(-0.22, -0.05) * v.fov;
    }
    const far = z > v.zCity;
    if (far) power *= 1.25; // distant shells are bigger ones
    const target = v.unproject(sx, sy, z);
    const height = v.floorY - target.y;
    const rise = clamp(0.85 + 1.1 * (height / (v.H * (far ? 1.6 : 1))), 0.9, 2.2);
    style ??= Math.random() < 0.08 ? 'zigzag' : Math.random() < 0.25 ? 'wobble' : 'straight';
    w.launchRocket({
      x0: target.x + rand(-0.06, 0.06) * v.W,
      y0: v.floorY,
      z0: z,
      x1: target.x,
      y1: target.y,
      z1: z,
      rise,
      style,
      onBurst: onBurst ?? ((bx, by, bz) => burst(w, type, bx, by, bz, color, power)),
    });
  }

  /** A tap or click: random pattern at that spot. */
  tapShell(sx, sy) {
    const z = rand(-0.1, 0.4) * this.world.view.fov;
    this.shell(sx, sy, pick(RANDOM_BURSTS), pick(PALETTE), rand(0.85, 1.15), { z });
  }

  /** Fire a cracker picked from the wheel at screen point (sx, sy). */
  fire(id, sx, sy) {
    const w = this.world;
    const v = w.view;
    const S = w.S;
    const sky = clamp(sy, v.H * 0.06, v.floorTop - 60 * S);
    const groundSx = clamp(sx, 30 * S, v.W - 30 * S);
    // Ground crackers go on the floor under the press, a little way back.
    const spot = () => this.floorSpot(groundSx, sy > v.floorTop ? clamp((v.H - sy) / v.floorH * 1.2 - 0.25, 0.1, 0.85) : rand(0.3, 0.7));
    const color = pick(PALETTE);
    const zNear = rand(-0.05, 0.35) * v.fov;
    switch (id) {
      case 'anar': return w.add(new Anar(w, { ...spot(), color, duration: rand(5, 6.5) }));
      case 'chakra': return w.add(new Chakra(w, spot()));
      case 'phuljhadi': return w.add(new Sparkler(w, spot()));
      case 'ladi': {
        const { z } = spot();
        const half = Math.min(v.W * 0.3, 260 * S);
        const x0 = v.floorX(clamp(groundSx - half, 20, v.W - 20), z);
        const x1 = v.floorX(clamp(groundSx + half, 20, v.W - 20), z);
        return w.add(new Ladi(w, { x0, x1, z, count: Math.round(clamp(half / (7 * S), 20, 60)), interval: 0.05 }));
      }
      case 'bijli': return w.add(new Bomb(w, spot()));
      case 'candle': return w.add(new RomanCandle(w, spot()));
      case 'sutli': return w.add(new Sutli(w, spot()));
      case 'lantern': return w.add(new SkyLantern(w, spot()));
      case 'zigzag':
        return this.shell(sx, sky, pick(['crackle', 'peony', 'strobe']), color, 0.75, { z: zNear, style: 'zigzag' });
      default:
        return this.shell(sx, sky, id, color, rand(0.95, 1.15), { z: zNear, style: 'straight' });
    }
  }

  // ---- crackers used around and between scenes -----------------------------

  decorate(kind, dur, tok) {
    const w = this.world;
    const W = w.W;
    const sides = [0.1, 0.9];
    switch (kind) {
      case 'anars':
        sides.forEach((u) => w.add(new Anar(w, { ...this.floorSpot(W * u, 0.55), duration: dur - 0.8, color: pick(PALETTE) })));
        break;
      case 'candles':
        sides.forEach((u, i) => this.clock.after(0.6 + i * 0.3, () => {
          if (!tok.cancelled) w.add(new RomanCandle(w, { ...this.floorSpot(W * u, 0.5), shots: 6 }));
        }));
        break;
      case 'chakras':
        [0.16, 0.84].forEach((u) => w.add(new Chakra(w, { ...this.floorSpot(W * u, 0.5), duration: Math.min(dur, 5.5) })));
        break;
      case 'sparklers':
        [0.06, 0.12, 0.88, 0.94].forEach((u, i) => w.add(new Sparkler(w, { ...this.floorSpot(W * u, 0.25 + (i % 2) * 0.35), duration: Math.min(dur, 5.5) })));
        break;
      default:
        break;
    }
    // Background shells around the text, at all distances.
    for (let t = 0.5; t < dur - 0.8; t += rand(0.7, 1.2)) {
      this.clock.after(t, () => {
        if (tok.cancelled) return;
        const [x, y] = this.freeSpot();
        const z = Math.random() < 0.55 ? rand(1.2, 2.1) * w.view.fov : rand(0.1, 0.5) * w.view.fov;
        this.shell(x, y, pick(RANDOM_BURSTS), pick(PALETTE), 0.7, { z });
      });
    }
  }

  opening() {
    const w = this.world;
    const v = w.view;
    const z = v.floorZ(0.45);
    const n = clamp(Math.round(w.W / 18), 22, 56);
    w.add(new Ladi(w, { x0: v.floorX(w.W * 0.08, z), x1: v.floorX(w.W * 0.92, z), z, count: n, interval: 0.05 }));
    this.clock.after(1.1, () => this.shell(w.W * 0.5, v.skyH * 0.32, 'chrysanthemum', COLORS.gold, 1.1, { z: 0.2 * v.fov }));
  }

  async finale(tok) {
    const w = this.world;
    const v = w.view;
    const W = w.W;
    const z = v.floorZ(0.4);
    const n = clamp(Math.round(W / 16), 26, 64);
    w.add(new Ladi(w, { x0: v.floorX(W * 0.05, z), x1: v.floorX(W * 0.95, z), z, count: n, interval: 0.045 }));
    [0.2, 0.8].forEach((u) => w.add(new RomanCandle(w, { ...this.floorSpot(W * u, 0.65), shots: 7 })));
    for (let i = 0; i < 12; i++) {
      this.clock.after(0.3 + i * 0.24, () => {
        if (tok.cancelled) return;
        this.shell(W * lerp(0.12, 0.88, Math.random()), v.skyH * rand(0.12, 0.5), pick(RANDOM_BURSTS), pick(PALETTE), rand(0.9, 1.25));
      });
    }
    this.clock.after(2.2, () => {
      if (tok.cancelled) return;
      this.shell(W * 0.5, v.skyH * 0.3, 'multibreak', pick(PALETTE), 1.1, { z: 0.3 * v.fov });
    });
    this.clock.after(3.2, () => !tok.cancelled && w.add(new Bomb(w, this.floorSpot(W * 0.5, 0.55))));
    this.clock.after(4.6, () => {
      if (tok.cancelled) return;
      for (let i = 0; i < 5; i++) {
        this.shell(W * lerp(0.15, 0.85, i / 4), v.skyH * rand(0.18, 0.3), 'willow', COLORS.gold, 1.15, { z: rand(0.1, 0.4) * v.fov, style: 'straight' });
      }
    });
    await this.clock.wait(8);
  }

  /** After the show: a calm, endless trickle. Taps and the wheel add more. */
  idle(tok) {
    const w = this.world;
    const v = w.view;
    const tick = () => {
      if (tok.cancelled) return;
      this.shell(w.W * rand(0.1, 0.9), v.skyH * rand(0.1, 0.55), pick(RANDOM_BURSTS), pick(PALETTE), rand(0.8, 1.2));
      const r = Math.random();
      if (r < 0.1) w.add(new Anar(w, { ...this.floorSpot(w.W * rand(0.15, 0.85), rand(0.3, 0.8)), duration: 4, color: pick(PALETTE) }));
      else if (r < 0.16) w.add(new SkyLantern(w, this.floorSpot(w.W * rand(0.15, 0.85), rand(0.3, 0.8))));
      else if (r < 0.2) w.add(new Chakra(w, this.floorSpot(w.W * rand(0.2, 0.8), rand(0.3, 0.7))));
      this.clock.after(rand(1.1, 2.3), tick);
    };
    tick();
  }
}
