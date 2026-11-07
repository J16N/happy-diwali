// Synthesised cracker sounds with the Web Audio API. No audio files are
// shipped, so the site stays tiny and nothing needs to be downloaded.
//
// Signal path: voices -> bus -> dry
//                             -> convolution reverb (open air)
//                             -> slap-back echo off the buildings
//              -> compressor -> master gain.
// Distant bangs arrive late (the World works out the delay), quieter and
// duller, because air soaks up the highs.

import { rand } from '../utils.js';

const MASTER_LEVEL = 0.85;
const MAX_VOICES = 56;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voices = 0;
    this.lastCrackle = 0;
  }

  get available() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  /** Must be called from a user gesture (tap / click / key). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** A MediaStream carrying everything the show plays (for recording). */
  captureStream() {
    if (!this.ctx) return null;
    if (!this.tap) {
      this.tap = this.ctx.createMediaStreamDestination();
      this.master.connect(this.tap);
    }
    return this.tap.stream;
  }

  /** Stop feeding the recorder (it costs a little CPU for as long as it is connected). */
  releaseStream() {
    if (!this.tap) return;
    this.master.disconnect(this.tap);
    this.tap = null;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted) this.ctx.resume();
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_LEVEL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(this.master).connect(ctx.destination);

    this.bus = ctx.createGain();
    this.bus.connect(comp);

    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    const conv = ctx.createConvolver();
    conv.buffer = this._impulse(2.4);
    this.bus.connect(conv).connect(wet).connect(comp);

    // Slap-back echo off the buildings across the street.
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.36;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1600;
    const echoGain = ctx.createGain();
    echoGain.gain.value = 0.2;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    this.bus.connect(echo);
    echo.connect(echoTone).connect(echoGain).connect(comp);
    echoTone.connect(feedback).connect(echo);

    // A separate quiet bus for interface ticks: no reverb, no echo.
    this.ui = ctx.createGain();
    this.ui.gain.value = 0.5;
    this.ui.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  _impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  get _ready() {
    return this.ctx && !this.muted && this.ctx.state === 'running';
  }

  /** Last nodes of a voice: distance filter, stereo pan, then the bus. */
  _out(pan01, far = 0) {
    const ctx = this.ctx;
    let node = this.bus;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, (pan01 - 0.5) * 1.6));
      p.connect(node);
      node = p;
    }
    if (far > 0.02) {
      const air = this._filter('lowpass', 9000 * Math.pow(1 - far, 2) + 700, 0.5);
      const g = ctx.createGain();
      g.gain.value = 1 - far * 0.55;
      air.connect(g).connect(node);
      node = air;
    }
    return node;
  }

  _track(src) {
    this.voices++;
    src.onended = () => this.voices--;
  }

  _noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    // Always loop: every voice starts at a random point in the 2 s noise
    // buffer, so without looping a long sound (a boom's rumble, a rocket's
    // whoosh) could run off the end and be cut short.
    src.loop = true;
    src.start(t, rand(0, 1.5));
    src.stop(t + dur);
    this._track(src);
    return src;
  }

  _filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  _env(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  _osc(type, t, f0, f1, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    this._track(o);
    return o;
  }

  /** Rocket leaving the stick: a rushing whoosh, sometimes with a whistle. */
  launch(pan, rise = 1, { whistle = false, far = 0, zigzag = false } = {}) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pan, far * 0.7);
    const lvl = 1 - far * 0.5;

    // Ignition "fft" then a rush that thins out as the motor burns down.
    const n = this._noiseSrc(t, rise + 0.1);
    const bp = this._filter('bandpass', 700, 0.8);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + rise * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * lvl, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.06 * lvl, t + rise * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rise);
    n.connect(bp).connect(g).connect(out);

    if (zigzag) {
      // An erratic, sputtering motor.
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = rand(7, 11);
      const lg = ctx.createGain();
      lg.gain.value = 0.05 * lvl;
      lfo.connect(lg).connect(g.gain);
      lfo.start(t);
      lfo.stop(t + rise);
      this._track(lfo);
    }

    if (whistle) {
      const o = this._osc('sine', t, rand(700, 900), rand(2200, 2800), rise);
      const vib = ctx.createOscillator();
      vib.frequency.value = rand(14, 22);
      const vg = ctx.createGain();
      vg.gain.value = 40;
      vib.connect(vg).connect(o.frequency);
      vib.start(t);
      vib.stop(t + rise);
      this._track(vib);
      o.connect(this._env(t, 0.06 * lvl, 0.12, rise)).connect(out);
    }
  }

  /** Shell break: sharp crack, a rolling body and a low thump. */
  boom(power = 1, pan = 0.5, delay = 0, far = 0) {
    if (!this._ready || this.voices > MAX_VOICES + 8) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const out = this._out(pan, far);
    const k = 0.55 + 0.45 * power;

    const crack = this._noiseSrc(t, 0.12);
    crack.connect(this._filter('highpass', 1500)).connect(this._env(t, 0.55 * k, 0.002, 0.07)).connect(out);

    const body = this._noiseSrc(t, 1.8);
    const lp = this._filter('lowpass', 2400, 0.5);
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + 1.3);
    body.connect(lp).connect(this._env(t, 0.9 * k, 0.004, 1.4 + power * 0.3)).connect(out);

    const thump = this._osc('sine', t, 90 * (1.2 - power * 0.2), 30, 0.5);
    thump.connect(this._env(t, 0.85 * k, 0.005, 0.45)).connect(out);
  }

  /** Glitter going off: a scatter of tiny pops. k scales how many. */
  crackle(pan = 0.5, k = 1, delay = 0) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCrackle < 0.06) return;
    this.lastCrackle = now;
    const out = this._out(pan);
    const n = Math.round((4 + Math.random() * 4) * k);
    for (let i = 0; i < n; i++) {
      const t = now + delay + rand(0, 0.5) * Math.sqrt(k);
      const s = this._noiseSrc(t, 0.03);
      s.connect(this._filter('highpass', 2500 + rand(0, 3500))).connect(this._env(t, rand(0.08, 0.2), 0.001, rand(0.008, 0.025))).connect(out);
    }
  }

  /** One string-cracker "tak". */
  pop(pan = 0.5) {
    if (!this._ready || this.voices > MAX_VOICES + 8) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pan);
    const s = this._noiseSrc(t, 0.08);
    s.connect(this._filter('bandpass', 1800 + rand(-600, 800), 0.8)).connect(this._env(t, rand(0.45, 0.65), 0.001, 0.04)).connect(out);
    const o = this._osc('sine', t, 170, 55, 0.06);
    o.connect(this._env(t, 0.35, 0.001, 0.06)).connect(out);
  }

  /** Bijli bomb: huge low bang. */
  thud(power = 1, pan = 0.5) {
    if (!this._ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pan);
    const crack = this._noiseSrc(t, 0.2);
    crack.connect(this._filter('highpass', 1200)).connect(this._env(t, 0.9, 0.002, 0.12)).connect(out);
    const body = this._noiseSrc(t, 1.4);
    const lp = this._filter('lowpass', 1400, 0.5);
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 1.0);
    body.connect(lp).connect(this._env(t, 1.0 * power, 0.003, 1.0)).connect(out);
    const o = this._osc('sine', t, 75, 26, 0.55);
    o.connect(this._env(t, 1.0 * power, 0.004, 0.6)).connect(out);
  }

  /** Sutli bomb: the loudest, sharpest bang, ringing off the buildings. */
  sutli(pan = 0.5) {
    if (!this._ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pan);
    const crack = this._noiseSrc(t, 0.25);
    crack.connect(this._filter('highpass', 900)).connect(this._env(t, 1.2, 0.001, 0.16)).connect(out);
    const body = this._noiseSrc(t, 2.2);
    const lp = this._filter('lowpass', 3000, 0.4);
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(50, t + 1.8);
    body.connect(lp).connect(this._env(t, 1.3, 0.002, 1.9)).connect(out);
    const o = this._osc('sine', t, 64, 22, 0.8);
    o.connect(this._env(t, 1.2, 0.003, 0.8)).connect(out);
  }

  /** Roman candle shot: a hollow "phoomp". */
  candle(pan = 0.5) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pan);
    const o = this._osc('sine', t, rand(150, 190), 60, 0.12);
    o.connect(this._env(t, 0.55, 0.004, 0.14)).connect(out);
    const n = this._noiseSrc(t, 0.3);
    n.connect(this._filter('lowpass', 900, 0.7)).connect(this._env(t, 0.4, 0.004, 0.22)).connect(out);
  }

  /** A burning fuse: a crackly sizzle. */
  fuse(dur, pan = 0.5) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc(t, dur + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
    g.gain.setValueAtTime(0.06, t + Math.max(0.06, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const am = ctx.createOscillator();
    am.type = 'square';
    am.frequency.value = rand(23, 31);
    const ag = ctx.createGain();
    ag.gain.value = 0.03;
    am.connect(ag).connect(g.gain);
    am.start(t);
    am.stop(t + dur);
    this._track(am);
    n.connect(this._filter('highpass', 4200)).connect(g).connect(this._out(pan));
  }

  /** Anar / sparkler: a fizzing hiss that fades in and out. */
  hiss(dur, pan = 0.5, level = 0.5, bright = false) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc(t, dur + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * level, t + 0.35);
    g.gain.setValueAtTime(0.14 * level, t + Math.max(0.4, dur - 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = bright ? 31 : 17;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05 * level;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    this._track(lfo);
    n.connect(this._filter('bandpass', bright ? 5200 : 3000, 0.6)).connect(g).connect(this._out(pan));
  }

  /** Ground spinner: rising and falling whirr with sparks. */
  whirr(dur, pan = 0.5) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pan);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.8);
    osc.frequency.setValueAtTime(330, t + Math.max(0.9, dur - 1.1));
    osc.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.6);
    g.gain.setValueAtTime(0.07, t + Math.max(0.7, dur - 0.9));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(this._filter('lowpass', 900)).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this._track(osc);
    this.hiss(dur, pan, 0.8);
  }

  /** A diya catching light: tiny soft whoosh. */
  ignite(pan = 0.5) {
    if (!this._ready || this.voices > MAX_VOICES) return;
    const t = this.ctx.currentTime;
    const n = this._noiseSrc(t, 0.4);
    const f = this._filter('bandpass', 500, 0.8);
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
    n.connect(f).connect(this._env(t, 0.1, 0.05, 0.3)).connect(this._out(pan));
  }

  /** Wheel: a soft tick when the selection moves. */
  tick(up = false) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const o = this._osc('triangle', t, up ? 1900 : 1500, up ? 1900 : 1500, 0.03);
    o.connect(this._env(t, 0.12, 0.001, 0.03)).connect(this.ui);
  }

  /** Wheel opening: a short airy swell. */
  swoosh() {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const n = this._noiseSrc(t, 0.25);
    const f = this._filter('bandpass', 900, 1.2);
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    n.connect(f).connect(this._env(t, 0.12, 0.06, 0.16)).connect(this.ui);
  }
}
