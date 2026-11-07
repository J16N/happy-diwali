// The cracker wheel, in the spirit of a GTA weapon wheel. Press and hold on
// the sky: a ring charges, then two rings of crackers open around the press
// point. Inner ring: ground crackers. Outer ring: sky shells.
//
// Selection is by drag, relative to where you pressed: the direction picks
// the slot and the distance picks the ring, so you never have to land
// exactly on an icon (or see under your finger). Releasing near the centre
// cancels. Keyboard: Q opens, arrows move, Enter fires, Esc closes.

import { GROUND, SKY } from './crackers.js';
import { clamp } from '../utils.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

function sector(ri, ro, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M${p(ro, a0)}A${ro} ${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri} ${ri} 0 ${large} 0 ${p(ri, a0)}Z`;
}

export class Wheel {
  /** opts: { root, charge, onPick(item, x, y), sound, announce(text), lastId } */
  constructor(opts) {
    this.o = opts;
    this.root = opts.root;
    this.charge = opts.charge;
    this.isOpen = false;
    this.rings = [GROUND, SKY];
    this.sel = null; // { ring, i }
    this.lastId = opts.lastId ?? null;
    this.R = 0;
  }

  // ---- hold indicator --------------------------------------------------------
  showCharge(x, y) {
    const c = this.charge;
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.classList.remove('on');
    void c.offsetWidth; // restart the CSS animation
    c.classList.add('on');
    c.hidden = false;
  }

  hideCharge() {
    this.charge.classList.remove('on');
    this.charge.hidden = true;
  }

  // ---- open / close ------------------------------------------------------------
  open(px, py) {
    const W = innerWidth, H = innerHeight;
    const R = Math.round(clamp(Math.min(W, H) * 0.42, 118, 215));
    const m = 10;
    this.R = R;
    this.r0 = R * 0.25;
    this.r1 = R * 0.575;
    this.cx = clamp(px, R + m, Math.max(R + m, W - R - m));
    this.cy = clamp(py, R + m, Math.max(R + m, H - R - m - 26)); // room for the ring labels below
    this.px = px;
    this.py = py;
    this._build();
    this.isOpen = true;
    this.sel = null;
    this.root.hidden = false;
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
    this._render();
    this.o.sound?.swoosh();
    navigator.vibrate?.(12);
  }

  /** Close the wheel; returns the picked item (or null if cancelled). */
  close() {
    if (!this.isOpen) return null;
    this.isOpen = false;
    this.root.classList.remove('show');
    this.root.hidden = true;
    const item = this.sel ? this.rings[this.sel.ring][this.sel.i] : null;
    if (item) this.lastId = item.id;
    this.sel = null;
    return item;
  }

  _build() {
    const R = this.R;
    const svg = el('svg', {
      class: 'wheel-svg',
      width: R * 2 + 8,
      height: R * 2 + 8,
      viewBox: `${-R - 4} ${-R - 4} ${R * 2 + 8} ${R * 2 + 8}`,
      'aria-hidden': 'true',
    });
    const defs = el('defs', {}, svg);
    const gr = el('radialGradient', { id: 'wheel-hot', cx: '0', cy: '0', r: R, gradientUnits: 'userSpaceOnUse' }, defs);
    el('stop', { offset: '0.2', 'stop-color': '#ffd36a' }, gr);
    el('stop', { offset: '1', 'stop-color': '#ff8a1f' }, gr);

    el('circle', { class: 'disc', r: R }, svg);
    this.slots = [[], []];
    const bands = [[this.r0 + 3, this.r1 - 2], [this.r1 + 4, R - 3]];
    const iconScale = [R * 0.0062, R * 0.0058];
    this.rings.forEach((items, ring) => {
      const n = items.length;
      const [ri, ro] = bands[ring];
      const step = TAU / n;
      const g = el('g', { class: `ring ring-${ring ? 'sky' : 'ground'}` }, svg);
      items.forEach((item, i) => {
        const a = -Math.PI / 2 + i * step;
        const gap = 2.2 / ((ri + ro) / 2);
        const slot = el('g', { class: 'slot' }, g);
        el('path', { class: 'seg', d: sector(ri, ro, a - step / 2 + gap, a + step / 2 - gap) }, slot);
        const rm = (ri + ro) / 2;
        const ix = rm * Math.cos(a), iy = rm * Math.sin(a);
        const s = iconScale[ring];
        const ico = el('g', { class: 'ico', transform: `translate(${ix.toFixed(1)} ${iy.toFixed(1)}) scale(${s.toFixed(3)}) translate(-12 -12)` }, slot);
        ico.innerHTML = item.icon;
        if (item.id === this.lastId) el('circle', { class: 'last-dot', cx: (ro - 7) * Math.cos(a), cy: (ro - 7) * Math.sin(a), r: 2.2 }, slot);
        this.slots[ring].push(slot);
      });
    });
    el('circle', { class: 'hub', r: this.r0 }, svg);
    const fs = Math.max(10, R * 0.068);
    this.label = el('text', { class: 'hub-label', y: -fs * 0.15, 'font-size': fs.toFixed(1) }, svg);
    this.sub = el('text', { class: 'hub-sub', y: fs * 1.05, 'font-size': (fs * 0.78).toFixed(1) }, svg);
    this.cursor = el('circle', { class: 'cursor', r: 4.5 }, svg);

    this.root.replaceChildren();
    const dim = document.createElement('div');
    dim.className = 'wheel-dim';
    this.root.appendChild(dim);
    const holder = document.createElement('div');
    holder.className = 'wheel-holder';
    holder.style.left = `${this.cx - R - 4}px`;
    holder.style.top = `${this.cy - R - 4}px`;
    holder.appendChild(svg);
    const tag = document.createElement('div');
    tag.className = 'wheel-tags';
    tag.innerHTML = '<span>Ground · inner</span><span>Sky · outer</span>';
    holder.appendChild(tag);
    this.root.appendChild(holder);
    this.holder = holder;
  }

  // ---- selection ---------------------------------------------------------------
  /** Pointer at screen (x, y): select by offset from the press point. */
  point(x, y) {
    if (!this.isOpen) return;
    const dx = x - this.px, dy = y - this.py;
    const d = Math.hypot(dx, dy);
    let sel = null;
    if (d > this.r0 * 0.8) {
      const ring = d < this.r1 ? 0 : 1;
      const n = this.rings[ring].length;
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      const i = ((Math.round(a / (TAU / n)) % n) + n) % n;
      sel = { ring, i };
    }
    this._cursor(clamp(d, 0, this.R - 6), Math.atan2(dy, dx));
    this._select(sel);
  }

  /** Keyboard navigation: dx = -1/+1 around the ring, dy = -1 out (sky) / +1 in (ground). */
  step(dx, dy) {
    if (!this.isOpen) return;
    let sel = this.sel;
    if (!sel) {
      const last = this.lastId;
      const ring = SKY.some((c) => c.id === last) ? 1 : 0;
      const i = Math.max(0, this.rings[ring].findIndex((c) => c.id === last));
      sel = { ring, i };
    } else if (dy) {
      const ring = dy < 0 ? 1 : 0;
      if (ring !== sel.ring) {
        const from = this.rings[sel.ring].length, to = this.rings[ring].length;
        sel = { ring, i: Math.round((sel.i / from) * to) % to };
      }
    } else if (dx) {
      const n = this.rings[sel.ring].length;
      sel = { ring: sel.ring, i: (sel.i + dx + n) % n };
    }
    this._cursor(-1);
    this._select(sel);
  }

  _cursor(d, a = 0) {
    if (d < 0) {
      this.cursor.setAttribute('opacity', '0');
      return;
    }
    this.cursor.setAttribute('opacity', '1');
    this.cursor.setAttribute('cx', (Math.cos(a) * d).toFixed(1));
    this.cursor.setAttribute('cy', (Math.sin(a) * d).toFixed(1));
  }

  _select(sel) {
    const same = (a, b) => (!a && !b) || (a && b && a.ring === b.ring && a.i === b.i);
    if (same(sel, this.sel)) return;
    const up = sel && this.sel && sel.ring > this.sel.ring;
    this.sel = sel;
    this._render();
    if (sel) {
      this.o.sound?.tick(up);
      navigator.vibrate?.(5);
      const item = this.rings[sel.ring][sel.i];
      this.o.announce?.(`${item.label}, ${sel.ring ? 'sky' : 'ground'}`);
    }
  }

  _render() {
    this.slots.forEach((ring, r) => ring.forEach((s, i) => {
      s.classList.toggle('sel', !!this.sel && this.sel.ring === r && this.sel.i === i);
    }));
    if (this.sel) {
      const item = this.rings[this.sel.ring][this.sel.i];
      this.label.textContent = item.label;
      this.sub.textContent = this.sel.ring ? 'Sky' : 'Ground';
      this.holder.classList.add('has-sel');
    } else {
      this.label.textContent = 'Drag to pick';
      this.sub.textContent = 'release to cancel';
      this.holder.classList.remove('has-sel');
    }
  }
}
