// Thin wrapper around the page's DOM controls. It knows nothing about the show;
// it only reports what the visitor did through the handlers it is given.

import { qrSvg } from './qr.js';
import { graphemes } from '../show/nameParser.js';
import { GREETINGS, LIMITS } from '../config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  /**
   * handlers: { start(name, lang), skip(lang), openGift(), makeOwn(), replay(), toggleSound(),
   *             changeName(), share(), send({ to, from, message, lang }), copy(url), record(),
   *             scan(), closeScan(), scanFile(file), openScanned(), install(), fullscreen() }
   */
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      welcome: $('welcome'),
      form: $('welcome-form'),
      text: $('welcome-text'),
      input: $('name-input'),
      start: $('btn-start'),
      gift: $('gift'),
      giftTitle: $('gift-title'),
      giftText: $('gift-text'),
      open: $('btn-open'),
      share: $('share'),
      shareForm: $('share-form'),
      shareTo: $('share-to'),
      shareFrom: $('share-from'),
      shareMsg: $('share-msg'),
      shareQr: $('share-qr'),
      shareStatus: $('share-status'),
      giftMsg: $('gift-msg'),
      welcomeMsg: $('welcome-msg'),
      rec: $('btn-rec'),
      recBadge: $('rec'),
      recTime: $('rec-time'),
      shareResult: $('share-result'),
      shareLink: $('share-link'),
      send: $('btn-send'),
      toolbar: $('toolbar'),
      sound: $('btn-sound'),
      full: $('btn-full'),
      hint: $('hint'),
      toast: $('toast'),
      live: $('live'),
      more: $('btn-more'),
      menu: $('menu'),
      msgCount: $('msg-count'),
      install: $('btn-install'),
      installHelp: $('install-help'),
      scan: $('scan'),
      scanVideo: $('scan-video'),
      scanStatus: $('scan-status'),
      scanResult: $('scan-result'),
      scanText: $('scan-text'),
      scanOpen: $('btn-scan-open'),
      scanFile: $('scan-file'),
      recLabel: $('rec-label'),
    };
    this.toastTimer = 0;
    this.hintTimer = 0;

    this.el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.h.start(this.el.input.value, this.lang('welcome'));
    });
    $('btn-skip').addEventListener('click', () => this.h.skip(this.lang('welcome')));
    for (const seg of document.querySelectorAll('.seg')) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-lang]');
        if (!b) return;
        this.setLang(seg.dataset.group, b.dataset.lang);
        if (seg.dataset.group === 'share') this._shareDirty();
      });
    }
    this.el.rec.addEventListener('click', () => this.h.record());
    this.el.recBadge.addEventListener('click', () => this.h.record());

    // "More" menu.
    this.el.more.addEventListener('click', () => (this.el.menu.hidden ? this.openMenu() : this.closeMenu()));
    this.el.menu.addEventListener('click', (e) => {
      if (e.target.closest('button')) this.closeMenu(false); // the item's own handler runs too
    });
    this.el.menu.addEventListener('keydown', (e) => {
      const items = [...this.el.menu.querySelectorAll('button:not([hidden])')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus();
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus();
      else if (e.key === 'Home') items[0].focus();
      else if (e.key === 'End') items[items.length - 1].focus();
      else if (e.key === 'Tab') this.closeMenu(false);
      else return;
      e.preventDefault();
    });
    addEventListener('pointerdown', (e) => {
      if (!this.el.menu.hidden && !e.target.closest('#menu, #btn-more')) {
        this.closeMenu(false);
        e.stopPropagation(); // this tap only closes the menu; it must not launch a rocket too
      }
    }, true);

    // Scanner and install help.
    $('btn-scan').addEventListener('click', () => this.h.scan());
    $('btn-scan-close').addEventListener('click', () => this.h.closeScan());
    this.el.scan.addEventListener('pointerdown', (e) => {
      if (e.target === this.el.scan) this._outside(e, () => this.h.closeScan());
    });
    this.el.scanOpen.addEventListener('click', () => this.h.openScanned());
    this.el.scanFile.addEventListener('change', () => {
      const f = this.el.scanFile.files?.[0];
      this.el.scanFile.value = '';
      if (f) this.h.scanFile(f);
    });
    this.el.install.addEventListener('click', () => this.h.install());
    $('btn-install-close').addEventListener('click', () => this.hideInstallHelp());
    this.el.installHelp.addEventListener('pointerdown', (e) => {
      if (e.target === this.el.installHelp) this._outside(e, () => this.hideInstallHelp());
    });
    this.el.open.addEventListener('click', () => this.h.openGift());
    $('btn-own').addEventListener('click', () => this.h.makeOwn());
    this.el.sound.addEventListener('click', () => this.h.toggleSound());
    $('btn-replay').addEventListener('click', () => this.h.replay());
    $('btn-name').addEventListener('click', () => this.h.changeName());
    $('btn-share').addEventListener('click', () => this.h.share());

    // Share dialog.
    this.el.shareForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.h.send({
        to: this.el.shareTo.value,
        from: this.el.shareFrom.value,
        message: this.el.shareMsg.value,
        lang: this.lang('share'),
      });
    });
    for (const f of [this.el.shareTo, this.el.shareFrom, this.el.shareMsg]) f.addEventListener('input', () => this._shareDirty());
    // The wish has a hard limit (it must fit in the sky), counted in visible
    // characters so an emoji counts as one.
    this.el.shareMsg.addEventListener('input', () => this._limitMessage());
    // "To" and "From" are capped too, silently.
    for (const f of [this.el.shareTo, this.el.shareFrom]) {
      f.addEventListener('input', () => this._limit(f, LIMITS.shareNameGraphemes));
    }
    $('btn-share-close').addEventListener('click', () => this.hideShare());
    $('btn-copy').addEventListener('click', () => this.h.copy(this.el.shareLink.value));
    this.el.share.addEventListener('pointerdown', (e) => {
      if (e.target === this.el.share) this._outside(e, () => this.hideShare());
    });
    this.el.shareLink.addEventListener('focus', () => this.el.shareLink.select());

    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.el.menu.hidden) this.closeMenu();
      else if (!this.el.installHelp.hidden) this.hideInstallHelp();
      else if (!this.el.scan.hidden) this.h.closeScan();
      else if (!this.el.share.hidden) this.hideShare();
    });

    const full = this.el.full;
    const canFull = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    this.canFull = !!canFull;
    if (canFull) {
      full.addEventListener('click', () => this.h.fullscreen());
      // The app already filling the screen (installed on Android, or the
      // browser's own full screen such as F11) makes the button pointless,
      // so it hides; it comes back as soon as there is something to gain.
      const shown = matchMedia('(display-mode: fullscreen)');
      const sync = () => {
        const ours = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.setFullscreen(ours);
        full.hidden = shown.matches && !ours; // when we went full screen ourselves, keep "exit"
      };
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync);
      shown.addEventListener?.('change', sync);
      sync();
    } else full.hidden = true; // iPhone Safari has no page fullscreen
  }

  /** Whether the full screen button (and the F key) does anything right now. */
  get fullscreenUseful() {
    return this.canFull && !this.el.full.hidden;
  }

  /** A tap outside a dialog's card closes it, and does nothing else (no rocket). */
  _outside(e, close) {
    e.stopPropagation();
    e.preventDefault();
    close();
  }

  get welcomeOpen() {
    return !this.el.welcome.hidden || !this.el.gift.hidden;
  }

  /** Any dialog in front of the sky (taps should not launch rockets). */
  get modalOpen() {
    return this.welcomeOpen || !this.el.share.hidden || !this.el.scan.hidden || !this.el.installHelp.hidden || !this.el.menu.hidden;
  }

  openMenu() {
    this.el.menu.hidden = false;
    this.el.more.setAttribute('aria-expanded', 'true');
    this.hideHint();
    this.el.menu.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
  }

  closeMenu(refocus = true) {
    if (this.el.menu.hidden) return;
    this.el.menu.hidden = true;
    this.el.more.setAttribute('aria-expanded', 'false');
    if (refocus) this.el.more.focus({ preventScroll: true });
  }

  /** Install item: 'prompt' | 'ios' | '' (hidden). */
  setInstall(mode) {
    this.el.install.hidden = !mode;
  }

  showInstallHelp() {
    this.el.installHelp.hidden = false;
  }

  hideInstallHelp() {
    this.el.installHelp.hidden = true;
  }

  showScan() {
    this.el.scanResult.hidden = true;
    this.el.scanStatus.textContent = '';
    this.el.scan.querySelector('.viewfinder').classList.remove('off');
    this.el.scan.hidden = false;
    this.hideHint();
  }

  hideScan() {
    this.el.scan.hidden = true;
  }

  scanStatus(text, { off = false } = {}) {
    this.el.scanStatus.textContent = text;
    this.el.scan.querySelector('.viewfinder').classList.toggle('off', off);
  }

  /** A scanned code: what it is and whether it can be opened here. */
  scanFound(text, { label = 'Open greeting' } = {}) {
    this.el.scanText.textContent = text;
    this.el.scanOpen.textContent = label;
    this.el.scanOpen.hidden = !label;
    this.el.scanResult.hidden = false;
    this.el.scan.querySelector('.viewfinder').classList.add('off');
  }

  /** Trim a field to `max` visible characters (an emoji counts as one). -> characters before trimming */
  _limit(input, max) {
    const g = graphemes(input.value);
    if (g.length > max) {
      const caret = input.selectionStart;
      input.value = g.slice(0, max).join('');
      const at = Math.min(caret ?? input.value.length, input.value.length);
      input.setSelectionRange(at, at);
    }
    return g.length;
  }

  _limitMessage() {
    const max = LIMITS.messageGraphemes;
    const n = Math.min(this._limit(this.el.shareMsg, max), max);
    this.el.msgCount.textContent = `${n}/${max}`;
    this.el.msgCount.classList.toggle('full', n >= max);
  }

  /** The language picked in a dialog's English / Hindi switch. */
  lang(group) {
    return document.querySelector(`.seg[data-group="${group}"] [aria-pressed="true"]`)?.dataset.lang ?? 'en';
  }

  setLang(group, lang) {
    const g = GREETINGS[lang] ? lang : 'en';
    for (const b of document.querySelectorAll(`.seg[data-group="${group}"] button`)) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === g));
    }
    // The card's own wording follows the toggle straight away.
    const text = group === 'welcome' ? $('welcome-title') : $('share-word');
    text.textContent = group === 'welcome' ? GREETINGS[g].card : GREETINGS[g].word;
    text.lang = g;
  }

  /**
   * invite: an open greeting ({ from, message }) that asks the visitor for their name.
   * langChoice: show the language switch (not on a shared link: the sender chose).
   */
  showWelcome({ name = '', lang = 'en', invite = null, langChoice = true } = {}) {
    this.setLang('welcome', lang);
    this.el.welcome.querySelector('.lang').hidden = !langChoice;
    // An open greeting shows its wish, as the gift card does.
    const wish = invite?.message ?? '';
    this.el.welcomeMsg.textContent = wish ? `“${wish}”` : '';
    this.el.welcomeMsg.hidden = !wish;
    this.el.gift.hidden = true;
    this.el.text.textContent = invite
      ? `${invite.from || 'Someone'} sent you a Diwali greeting. ${name ? 'Check your name and start the show' : 'Type your name'} to see it in fireworks.`
      : name
        ? `Welcome back, ${name}! Ready for your show?`
        : 'Tell us your name and we will write it across the sky in fireworks.';
    this.el.input.value = name;
    this.el.start.textContent = name ? 'Start the show' : 'Light it up';
    this.el.toolbar.hidden = true;
    this.el.welcome.hidden = false;
    this.hideHint();
    setTimeout(() => this.el.input.focus({ preventScroll: true }), 60);
  }

  /** Someone opened a greeting link that was made for them. */
  showGift({ to, from, message, lang }, cardTitle = 'Happy Diwali') {
    this.el.welcome.hidden = true;
    // The name gets its own line in solid colour: inside the gradient
    // heading an emoji would turn into a flat silhouette.
    const who = document.createElement('span');
    who.className = 'to';
    who.textContent = `${to}!`;
    this.el.giftTitle.replaceChildren(`${cardTitle},`, who);
    this.el.giftTitle.lang = GREETINGS[lang] ? lang : 'en';
    this.el.giftMsg.textContent = message ? `“${message}”` : '';
    this.el.giftMsg.hidden = !message;
    this.el.giftText.textContent = from
      ? `${from} sent you a sky full of fireworks.`
      : 'Someone sent you a sky full of fireworks.';
    this.el.toolbar.hidden = true;
    this.el.gift.hidden = false;
    this.hideHint();
    setTimeout(() => this.el.open.focus({ preventScroll: true }), 60);
  }

  hideWelcome() {
    this.el.welcome.hidden = true;
    this.el.gift.hidden = true;
    this.el.toolbar.hidden = false;
    this.el.input.blur();
  }

  showShare({ from = '', lang = 'en' } = {}) {
    this.el.shareTo.value = '';
    this.el.shareFrom.value = graphemes(from).slice(0, LIMITS.shareNameGraphemes).join('');
    this.el.shareMsg.value = '';
    this._limitMessage();
    this.setLang('share', lang);
    this._shareDirty();
    this.el.share.hidden = false;
    this.hideHint();
    setTimeout(() => this.el.shareTo.focus({ preventScroll: true }), 60);
  }

  hideShare() {
    this.el.share.hidden = true;
    document.activeElement?.blur?.();
  }

  /** Show the finished link in the dialog. */
  showLink(url) {
    this.el.shareLink.value = url;
    try {
      this.el.shareQr.innerHTML = qrSvg(url); // generated locally from our own URL
    } catch {
      this.el.shareQr.replaceChildren();
    }
    this.el.shareResult.hidden = false;
    this.el.send.textContent = 'Share again';
  }

  _shareDirty() {
    this.el.shareResult.hidden = true;
    this.el.shareStatus.textContent = '';
    this.el.send.textContent = 'Share link';
  }

  announce(text) {
    this.el.live.textContent = text;
  }

  setMuted(muted) {
    this.el.sound.setAttribute('aria-pressed', String(muted));
    this.el.sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  /** Recording controls: show the button only where recording works. */
  enableRecording(on) {
    this.el.rec.hidden = !on;
  }

  setRecording(on) {
    this.el.recLabel.textContent = on ? 'Stop and save the video' : 'Save a video';
    this.el.recBadge.hidden = !on;
    if (on) this.setRecTime(0);
  }

  setRecTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    this.el.recTime.textContent = `REC ${m}:${String(s).padStart(2, '0')}`;
  }

  setFullscreen(on) {
    const b = this.el.full;
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    b.title = on ? 'Exit full screen (F)' : 'Full screen (F)';
  }

  /** Feedback about the link: inside the share dialog when it is open. */
  shareNote(message) {
    if (this.el.share.hidden) return this.toast(message);
    this.el.shareStatus.textContent = message;
  }

  toast(message) {
    clearTimeout(this.toastTimer);
    this.el.toast.textContent = message;
    this.el.toast.classList.add('show');
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
  }

  showHint() {
    clearTimeout(this.hintTimer);
    this.el.hint.hidden = false;
    this.hintTimer = setTimeout(() => this.hideHint(), 7000);
  }

  hideHint() {
    this.el.hint.hidden = true;
  }
}
