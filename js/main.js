// Entry point: picks a renderer (WebGL2, else Canvas 2D), starts the
// simulation (in a worker when possible), wires sound, wheel and UI
// together, and runs the render loop.

import { BUDGET, GREETINGS, HOLD_MS, LIMITS, STORAGE_KEYS } from './config.js';
import { createSim } from './engine/simClient.js';
import { buildAtlas, buildCloudTexture, buildSmokeTexture } from './engine/atlas.js';
import { GLRenderer } from './engine/render/gl.js';
import { CanvasRenderer } from './engine/render/canvas.js';
import { Sound } from './audio/sound.js';
import { centralBox } from './show/textRaster.js';
import { sanitize } from './show/nameParser.js';
import { buildLayers } from './ui/backdrop.js';
import { UI } from './ui/ui.js';
import { Wheel } from './ui/wheel.js';
import { Recorder, canRecord } from './ui/recorder.js';
import { Scanner, warmUpDecoder } from './ui/scanner.js';
import { installMode, isStandalone, promptInstall, watchInstall } from './ui/install.js';
import { clamp, debounce, prefersReducedMotion } from './utils.js';

const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode: ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const params = new URLSearchParams(location.search);

// ---- renderer -----------------------------------------------------------------
function createRenderer() {
  const canvas = document.getElementById('scene');
  if (params.get('renderer') !== '2d') {
    try {
      return new GLRenderer(canvas);
    } catch (e) {
      console.warn('WebGL2 unavailable, falling back to Canvas 2D.', e);
    }
  }
  // A canvas that has tried WebGL cannot give a 2D context: use a fresh one.
  const fresh = canvas.cloneNode();
  canvas.replaceWith(fresh);
  return new CanvasRenderer(fresh);
}

const renderer = createRenderer();
document.documentElement.dataset.renderer = renderer.kind;

// ---- state ------------------------------------------------------------------
const sound = new Sound();
sound.muted = store.get(STORAGE_KEYS.muted) === '1';

const atlas = buildAtlas();
const cloudTex = buildCloudTexture();
renderer.setTextures(atlas.canvas, buildSmokeTexture(), cloudTex.canvas);

const sim = await createSim({
  sound,
  budget: BUDGET[renderer.kind],
  cells: atlas.cells,
  cloudCells: cloudTex.cells,
  worker: params.get('worker') !== '0',
  hooks: {
    announce: (text) => ui.announce(text),
    done: () => {
      ui.showHint();
      // A recording of the show ends a few seconds after the finale.
      if (recorder.active) setTimeout(() => recorder.active && finishRecording(), 3500);
    },
  },
});
document.documentElement.dataset.sim = sim.mode;

// Names. Two different people can be involved:
//   me    the visitor's own name, typed into the welcome dialog. It is the
//         only name remembered in this browser, and the default "from" when
//         they send a greeting.
//   link  ?to=Priya&from=Jishan&msg=...&lang=hi: a greeting someone made
//         for this visitor. It is never stored, so opening a friend's link
//         does not overwrite your own name. (?name= is the older form of ?to=.)
//         Without ?to= but with ?from= or ?msg= it is an open greeting: the
//         visitor types their own name, and the show still carries the
//         sender's wish and signature.
const okLang = (l) => (GREETINGS[l] ? l : '');
let me = sanitize(store.get(STORAGE_KEYS.name) ?? '');
let myLang = okLang(store.get(STORAGE_KEYS.lang)) || 'en';
const link = {
  to: sanitize(params.get('to') ?? params.get('name') ?? ''),
  from: sanitize(params.get('from') ?? ''),
  message: sanitize(params.get('msg') ?? '', LIMITS.messageGraphemes),
  lang: okLang(params.get('lang')),
};
/** An open greeting: from someone, for whoever opens it (asks for their name). */
const isOpenGreeting = () => !link.to && !!(link.from || link.message);
const fromLink = !!link.to || isOpenGreeting();
let name = link.to || me; // the name written in the sky
let from = fromLink ? link.from : ''; // signed at the end of the show
let message = fromLink ? link.message : '';
let lang = (fromLink && link.lang) || myLang;

/** Drop the link's names from the address bar (the visitor is making their own). */
function leaveLink() {
  link.to = link.from = link.message = link.lang = '';
  from = message = '';
  lang = myLang;
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}

const reduced = prefersReducedMotion();
if (reduced) sim.setReduced();

// ---- quality ----------------------------------------------------------------
const coarse = matchMedia('(pointer: coarse)').matches;
let level = coarse ? 1 : 0;
let dpr = 1;
function setLevel(next) {
  level = next;
  sim.setQuality(level);
  renderer.bloom = renderer.kind === 'webgl' && level < 2;
  layout();
}

// ---- layout -----------------------------------------------------------------
let size = { w: 0, h: 0 };
let recording = false;
let redraw = false;
function layout() {
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  dpr = Math.min(devicePixelRatio || 1, [2, 1.5, 1][level]);
  // While recording, keep the video at most 1280 px on its long side so the
  // file stays small enough to send in a chat.
  if (recording) dpr = Math.max(0.5, Math.min(dpr, 1280 / Math.max(w, h)));
  renderer.resize(w, h, dpr);
  sim.resize(w, h);
  const data = buildLayers(sim.view, dpr);
  renderer.setLayers(data);
  sim.setBulbs(data.bulbs);
  redraw = true; // resizing cleared the canvas
  return { w, h };
}

const onResize = debounce(() => {
  // An on-screen keyboard (typing a name or a wish) only makes the window
  // shorter. Ignore that: rebuilding the scene behind a dialog is wasted work
  // and used to restart the current scene.
  const typing = document.activeElement?.matches?.('input, textarea');
  if (typing && innerWidth === size.w && innerHeight < size.h) return;
  const prev = size;
  size = layout();
  if (!sim.running || !prev.w) return;
  const flipped = prev.w < prev.h !== size.w < size.h;
  const big = Math.abs(size.w - prev.w) / prev.w > 0.15 || Math.abs(size.h - prev.h) / prev.h > 0.3;
  if (flipped || big) sim.restartScene(); // re-rasterise the current scene for the new shape
}, 180);

addEventListener('resize', onResize);
// Dragging the window to a screen with a different pixel density.
function watchDensity() {
  const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  mq.addEventListener?.('change', () => {
    onResize();
    watchDensity();
  }, { once: true });
}
watchDensity();
addEventListener('orientationchange', onResize);

// ---- show control -----------------------------------------------------------
let hintTimer = 0;
function startShow() {
  if (sound.available && !sound.muted) sound.unlock();
  cancelPress();
  ui.hideWelcome();
  ui.hideShare();
  sim.start(name, 0, { sender: from, message, lang });
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => ui.showHint(), 4500);
}

/** A link that writes `to` in the sky, signed by `from`. Works on any path (GitHub project pages too). */
function greetingUrl({ to, from: sender, message: msg, lang: l }) {
  const url = new URL(location.pathname, location.origin);
  if (to) url.searchParams.set('to', to);
  if (sender) url.searchParams.set('from', sender);
  if (msg) url.searchParams.set('msg', msg);
  if (l && l !== 'en') url.searchParams.set('lang', l);
  return url.toString();
}

/** Starting from the welcome dialog: an open greeting keeps its wish and sender; anything else is the visitor's own show. */
function keepOpenGreeting(l) {
  if (!isOpenGreeting()) return leaveLink();
  from = link.from;
  message = link.message;
  lang = okLang(l) || link.lang || myLang;
}

function rememberLang(l) {
  myLang = okLang(l) || 'en';
  store.set(STORAGE_KEYS.lang, myLang);
}

// ---- recording a video -------------------------------------------------------
const recorder = new Recorder();
let recTick = 0;

async function toggleRecord() {
  if (recorder.active) return finishRecording();
  sound.unlock();
  recording = true;
  layout();
  try {
    recorder.start(renderer.canvas, sound.captureStream());
  } catch (e) {
    console.warn(e);
    recording = false;
    layout();
    ui.toast('Video recording is not available in this browser.');
    return;
  }
  ui.setRecording(true);
  startShow(); // always record the whole show from the top
  recTick = setInterval(() => {
    ui.setRecTime(recorder.seconds);
    if (recorder.seconds > 150) finishRecording();
  }, 250);
}

async function finishRecording() {
  clearInterval(recTick);
  ui.setRecording(false);
  const blob = await recorder.stop();
  sound.releaseStream();
  recording = false;
  layout();
  if (!blob?.size) return;
  const slug = (name || 'diwali').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30) || 'diwali';
  const fileName = `happy-diwali-${slug}.${recorder.extension}`;
  const file = typeof File === 'function' ? new File([blob], fileName, { type: blob.type }) : null;
  // Phones: hand the video straight to the share sheet. Elsewhere: download it.
  if (coarse && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Happy Diwali' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  ui.toast(`Video saved as ${fileName}`);
}

async function copyText(text) {
  try {
    // Some browsers leave this promise pending (unfocused frame, pending
    // permission prompt): give up after a moment and use the fallback.
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, no) => setTimeout(() => no(new Error('clipboard timeout')), 1500)),
    ]);
    return true;
  } catch {
    // Older browsers / non-secure pages: fall back to a temporary selection.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
    ta.remove();
    return ok;
  }
}

function toggleFullscreen() {
  const doc = document;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
  else {
    const root = doc.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(root)).catch(() => {});
  }
}

const ui = new UI({
  start(raw, l) {
    // The welcome dialog is always about the visitor themself.
    rememberLang(l);
    me = sanitize(raw);
    if (me) store.set(STORAGE_KEYS.name, me);
    else store.remove(STORAGE_KEYS.name);
    keepOpenGreeting(l);
    name = me;
    startShow();
  },
  skip(l) {
    rememberLang(l);
    keepOpenGreeting(l);
    name = '';
    startShow();
  },
  openGift: () => startShow(),
  makeOwn() {
    leaveLink();
    name = me;
    ui.showWelcome({ name: me, lang: myLang });
  },
  replay: () => startShow(),
  changeName() {
    sim.stop();
    cancelPress();
    if (isOpenGreeting()) ui.showWelcome({ name: me, lang, invite: link });
    else ui.showWelcome({ name: link.to ? me : name, lang: myLang });
  },
  toggleSound() {
    const muted = !sound.muted;
    if (!muted) sound.unlock();
    sound.setMuted(muted);
    store.set(STORAGE_KEYS.muted, muted ? '1' : '0');
    ui.setMuted(muted);
  },
  share() {
    cancelPress();
    ui.showShare({ from: me, lang });
  },
  async send({ to: rawTo, from: rawFrom, message: rawMsg, lang: l }) {
    const to = sanitize(rawTo, LIMITS.shareNameGraphemes);
    const sender = sanitize(rawFrom, LIMITS.shareNameGraphemes);
    const msg = sanitize(rawMsg, LIMITS.messageGraphemes);
    // Whoever signs a greeting is telling us their own name: remember it.
    if (sender && sender !== me) {
      me = sender;
      store.set(STORAGE_KEYS.name, me);
    }
    const url = greetingUrl({ to, from: sender, message: msg, lang: okLang(l) });
    ui.showLink(url);
    const text = to
      ? `Happy Diwali, ${to}!${sender ? ` From ${sender}.` : ''} Open this to see your name in fireworks:`
      : `Happy Diwali!${sender ? ` From ${sender}.` : ''} Open this to see your name in fireworks:`;
    // navigator.share must run straight from the tap, before any other await.
    if (navigator.share && coarse) {
      try {
        await navigator.share({ title: 'Happy Diwali', text, url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    if (await copyText(url)) ui.shareNote('Link copied. Paste it into a chat to send your greeting.');
    else ui.shareNote('Copy the link to send it.');
  },
  async copy(url) {
    if (url && (await copyText(url))) ui.shareNote('Link copied.');
  },
  record: toggleRecord,
  scan: openScanner,
  closeScan: closeScanner,
  async scanFile(file) {
    // Put the dialog back as it was if the photo has no greeting in it.
    const before = ui.el.scanStatus.textContent;
    const wasOff = ui.el.scan.querySelector('.viewfinder').classList.contains('off');
    ui.scanStatus('Reading the photo…', { off: true });
    try {
      const { found, text } = await scanner.decodeFile(file);
      if (text) {
        ui.scanStatus('', { off: true });
        handleScanned(text);
      }
      // A QR code that is not a greeting is ignored, like it is by the camera.
      else if (found) ui.scanStatus(before, { off: wasOff });
      else ui.scanStatus('No QR code found in that photo. Try a sharper, closer one.', { off: true });
    } catch {
      ui.scanStatus('That photo could not be read.', { off: true });
    }
  },
  openScanned() {
    if (scanned) location.assign(scanned);
  },
  async install() {
    const mode = installMode();
    if (mode === 'prompt') {
      if (await promptInstall()) ui.toast('Installed. Find Diwali on your home screen.');
    } else if (mode === 'ios') ui.showInstallHelp();
    ui.setInstall(installMode());
  },
  fullscreen: toggleFullscreen,
});
ui.enableRecording(canRecord());

// ---- install as an app ------------------------------------------------------
watchInstall(() => ui.setInstall(installMode()));
ui.setInstall(installMode());

// ---- QR scanner -----------------------------------------------------------------
const scanner = new Scanner(document.getElementById('scan-video'), {
  accept: (text) => !!asGreeting(text), // anything else (a menu, a payment code) is ignored
  onResult: (text) => handleScanned(text),
  onStatus: (text) => ui.scanStatus(text, { off: !!text }),
});
let scanned = '';

function openScanner() {
  cancelPress();
  scanned = '';
  ui.showScan();
  scanner.start();
}

function closeScanner() {
  scanner.stop();
  ui.hideScan();
}

/** A greeting link made by this app (this site, with ?to= / ?name=, or the bare page). */
function asGreeting(text) {
  let url;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const here = new URL(location.pathname, location.origin);
  const samePage = url.origin === here.origin && url.pathname.replace(/index\.html$/, '') === here.pathname.replace(/index\.html$/, '');
  return samePage ? url : null;
}

/** A greeting link was scanned (the scanner only reports those): open it. */
function handleScanned(text) {
  const url = asGreeting(text);
  if (!url) return;
  navigator.vibrate?.(30);
  scanned = url.toString();
  const to = sanitize(url.searchParams.get('to') ?? url.searchParams.get('name') ?? '');
  ui.scanFound(to ? `A greeting for ${to}` : 'A Diwali greeting', { label: 'Open greeting' });
  setTimeout(() => scanned && !ui.el.scan.hidden && location.assign(scanned), 700);
}

// The installed app should scan offline too: on browsers without a built-in
// QR detector it fetches the decoder (131 KB) in the background once. In a
// normal browser tab the decoder is only downloaded when Scan is used.
if (!('BarcodeDetector' in self) && isStandalone()) addEventListener('load', () => setTimeout(warmUpDecoder, 4000));

// ---- the cracker wheel ----------------------------------------------------------
const chargeEl = document.getElementById('charge');
chargeEl.style.setProperty('--hold', `${HOLD_MS}ms`);
const wheel = new Wheel({
  root: document.getElementById('wheel'),
  charge: chargeEl,
  sound,
  announce: (t) => ui.announce(t),
  lastId: store.get(STORAGE_KEYS.cracker),
});

function fireItem(item, x, y) {
  if (!item) return;
  store.set(STORAGE_KEYS.cracker, item.id);
  sim.fire(item.id, x, y);
  ui.hideHint();
}

/** Where a tap launches its rocket: inside the sky, above the terrace. */
function tapAt(x, y) {
  const v = sim.view;
  sound.unlock();
  sim.tapShell(clamp(x, 10, v.W - 10), clamp(y, v.H * 0.06, v.floorTop - 70 * v.S));
  ui.hideHint();
}

// Press handling: a quick tap launches a rocket; holding still opens the
// wheel; moving before it opens counts as a tap where you pressed.
let press = null; // { id, x, y, timer, open }
let lastTap = 0;

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  wheel.hideCharge();
  if (press.open) wheel.close();
  press = null;
}

function blocked(e) {
  return ui.modalOpen || e.target.closest?.('button, a, input, nav, .card');
}

addEventListener('pointerdown', (e) => {
  if (blocked(e)) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  sound.unlock();
  if (press) {
    // A second finger while one is held: just a quick rocket there.
    if (!press.open) tapAt(e.clientX, e.clientY);
    return;
  }
  e.preventDefault();
  try { e.target.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, open: false };
  wheel.showCharge(e.clientX, e.clientY);
  press.timer = setTimeout(() => {
    if (!press) return;
    press.open = true;
    wheel.hideCharge();
    ui.hideHint();
    wheel.open(press.x, press.y);
  }, HOLD_MS);
}, { passive: false });

addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !press && !ui.modalOpen) {
    sim.look((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }
  if (!press || e.pointerId !== press.id) return;
  if (press.open) {
    wheel.point(e.clientX, e.clientY);
  } else if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) {
    const { x, y } = press;
    cancelPress();
    tapAt(x, y);
  }
});

function endPress(e, cancelled) {
  if (!press || e.pointerId !== press.id) return;
  const { x, y, open } = press;
  clearTimeout(press.timer);
  wheel.hideCharge();
  press = null;
  if (open) {
    if (!cancelled) wheel.point(e.clientX, e.clientY);
    const item = wheel.close();
    if (!cancelled) fireItem(item, x, y);
    return;
  }
  if (cancelled) return;
  const now = performance.now();
  if (now - lastTap < 120) return;
  lastTap = now;
  tapAt(x, y);
}

addEventListener('pointerup', (e) => endPress(e, false));
addEventListener('pointercancel', (e) => endPress(e, true));
addEventListener('contextmenu', (e) => {
  if (!blocked(e)) e.preventDefault();
});
addEventListener('blur', cancelPress);

// Phone tilt nudges the camera where the browser offers it without asking.
if (!reduced) {
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    sim.look(clamp(e.gamma / 25, -1, 1), clamp((e.beta - 50) / 25, -1, 1));
  });
}

// ---- keyboard ---------------------------------------------------------------
let keyWheel = false;
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (wheel.isOpen && keyWheel) {
    const k = e.key;
    if (k === 'ArrowLeft') wheel.step(-1, 0);
    else if (k === 'ArrowRight') wheel.step(1, 0);
    else if (k === 'ArrowUp') wheel.step(0, -1);
    else if (k === 'ArrowDown') wheel.step(0, 1);
    else if (k === 'Enter' || k === ' ') {
      const item = wheel.close();
      keyWheel = false;
      fireItem(item, wheel.px, wheel.py);
    } else if (k === 'Escape' || k === 'q' || k === 'Q') {
      wheel.close();
      keyWheel = false;
    } else return;
    e.preventDefault();
    return;
  }
  if (ui.modalOpen) return;
  if (e.key === 'm' || e.key === 'M') ui.h.toggleSound();
  else if (e.key === 'r' || e.key === 'R') startShow();
  else if ((e.key === 'f' || e.key === 'F') && ui.fullscreenUseful) toggleFullscreen();
  else if ((e.key === 'v' || e.key === 'V') && canRecord()) toggleRecord();
  else if (e.key === 'c' || e.key === 'C') openScanner();
  else if ((e.key === 'q' || e.key === 'Q') && !press) {
    sound.unlock();
    const b = centralBox(sim.view);
    keyWheel = true;
    ui.hideHint();
    wheel.open(b.x + b.w / 2, b.y + b.h / 2);
    wheel.step(0, 0);
    e.preventDefault();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelPress();
    sound.suspend();
  } else sound.resume();
});

// ---- render loop ------------------------------------------------------------
let last = performance.now();
let lastShown = last;
let avgMs = 16.7;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(now - last, 100) / 1000;
  last = now;

  const f = sim.tick(dt);
  if (f) {
    // Adaptive quality, judged on how often a new frame is shown (with the
    // simulation in a worker, a slow step shows up here, not as a slow
    // callback). If we keep missing ~40fps, step the quality down. One-off
    // stalls (a dialog opening, a backdrop rebuild, a tab switch) are not a
    // slow device: only sustained slowness lowers the quality. Checked
    // before drawing: a new level clears the canvas, which must not show.
    const shownMs = Math.min(now - lastShown, 100);
    lastShown = now;
    if (shownMs < 80) avgMs = avgMs * 0.94 + shownMs * 0.06;
    if (++frames % 90 === 0 && frames > 180 && avgMs > 27 && level < 2) {
      setLevel(level + 1);
      avgMs = 16.7; // judge the new level on its own frames
    }
  }
  const show = f ?? (redraw ? sim.frame : null);
  if (show) {
    renderer.render(show, sim.view);
    redraw = false;
  }
}

// ---- boot -------------------------------------------------------------------
sim.setQuality(level);
renderer.bloom = renderer.kind === 'webgl' && level < 2;
size = layout();
ui.setMuted(sound.muted);
sim.igniteDiyas(); // light the diyas behind the welcome card
if (link.to) ui.showGift(link, GREETINGS[lang].card);
else if (isOpenGreeting()) ui.showWelcome({ name: me, lang, invite: link });
else ui.showWelcome({ name: me, lang: myLang });

// Home-screen shortcuts (long-press the app icon): ?action=send / ?action=scan.
const action = params.get('action');
if (action === 'send' || action === 'scan') {
  history.replaceState(null, '', location.pathname + location.hash);
  ui.hideWelcome();
  sim.start(name, 0, { lang });
  if (action === 'send') ui.h.share();
  else openScanner();
}
requestAnimationFrame(frame);

// Keep the site fresh after deploys (and usable offline). See sw.js.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}

// Handy for debugging from the console.
window.__diwali = {
  sim, renderer, wheel, sound, recorder,
  /** Render the latest frame and return it as an image (used to make og-image.jpg). */
  snapshot(type = 'image/jpeg') {
    if (sim.frame) renderer.render(sim.frame, sim.view);
    return renderer.canvas.toDataURL(type, 0.92);
  },
};
