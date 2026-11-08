// A greeting packed into one short URL parameter: ?g=<code>.
//
// In a URL, every character outside plain ASCII is percent-encoded from its
// UTF-8 bytes, so one Hindi or Bengali letter costs 9 characters (%E0%A4%B6)
// and an emoji 12. Here those letters cost one byte each, and the bytes are
// written as base64url (4 characters per 3 bytes): a Hindi or Bengali greeting
// is about 5.7 times shorter, which also makes its QR code much smaller.
//
// Bytes:  header (version << 4 | language), then to, from, msg separated by 0x00
//         (trailing empty fields left out). In the text:
//   0x20-0x7E   that ASCII character
//   0x80-0xFF   a character of the current 128-character window
//   0x01 b      move the window to code points b*128 .. b*128+127
//   0x02 hi lo  any BMP character, 0x03 x y z any character (emoji, joiners)
// The window starts at the link language's script (Devanagari otherwise).
// sanitize() removes control characters, so 0x01-0x1F are free for this.
//
// Older links (?to= / ?name=, ?from=, ?msg=, ?lang=) still open: readGreeting.

const VERSION = 1;
const LANGS = ['en', 'hi', 'bn']; // append only: the index is in every link
const WINDOW = { hi: 0x0900, bn: 0x0980 };
const SEP = 0x00;
const MOVE = 0x01;
const BMP = 0x02;
const ANY = 0x03;
const SCRIPTS_END = 0x2000; // below this, letters come in runs: worth a window

const startWindow = (lang) => WINDOW[lang] ?? WINDOW.hi;

function packText(text, out, win) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && cp < 0x7f) out.push(cp);
    else if (cp >= win && cp < win + 0x80) out.push(0x80 + cp - win);
    else if (cp >= 0x80 && cp < SCRIPTS_END) {
      win = cp & ~0x7f;
      out.push(MOVE, win >> 7, 0x80 + cp - win);
    } else if (cp < 0x10000) out.push(BMP, cp >> 8, cp & 0xff);
    else out.push(ANY, cp >> 16, (cp >> 8) & 0xff, cp & 0xff);
  }
  return win;
}

/** { to, from, message, lang } -> the ?g= code (base64url, no padding). */
export function encodeGreeting({ to = '', from = '', message = '', lang = 'en' }) {
  const fields = [to, from, message];
  while (fields.length && !fields[fields.length - 1]) fields.pop();
  const out = [(VERSION << 4) | Math.max(0, LANGS.indexOf(lang))];
  let win = startWindow(lang);
  fields.forEach((f, i) => {
    if (i) out.push(SEP);
    win = packText(f, out, win);
  });
  return btoa(String.fromCharCode(...out)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The ?g= code -> { to, from, message, lang }, or null if it is not one. */
export function decodeGreeting(code) {
  let bin;
  try {
    bin = atob(String(code).replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (!b.length || b[0] >> 4 !== VERSION) return null;
  const lang = LANGS[b[0] & 0x0f];
  if (!lang) return null;
  const fields = [''];
  let win = startWindow(lang);
  for (let i = 1; i < b.length; ) {
    const x = b[i++];
    let cp;
    if (x === SEP) {
      fields.push('');
      continue;
    } else if (x >= 0x80) cp = win + x - 0x80;
    else if (x >= 0x20) cp = x;
    else if (x === MOVE && i + 1 < b.length) {
      win = b[i++] << 7;
      cp = win + b[i++] - 0x80;
    } else if (x === BMP && i + 1 < b.length) {
      cp = (b[i] << 8) | b[i + 1];
      i += 2;
    } else if (x === ANY && i + 2 < b.length) {
      cp = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      i += 3;
    } else return null;
    if (cp > 0x10ffff || (cp >= 0xd800 && cp < 0xe000) || fields.length > 3) return null;
    fields[fields.length - 1] += String.fromCodePoint(cp);
  }
  if (fields.length > 3) return null;
  const [to = '', from = '', message = ''] = fields;
  return { to, from, message, lang };
}

const OLD_PARAMS = ['to', 'name', 'from', 'msg', 'lang'];

/**
 * URL parameters -> the greeting they carry (unsanitized), new or old form, or
 * null when they carry none (a ?g= that does not decode counts as none).
 */
export function readGreeting(params) {
  const g = params.has('g') && decodeGreeting(params.get('g'));
  if (g) return g;
  if (!OLD_PARAMS.some((k) => params.has(k))) return null;
  return {
    to: params.get('to') ?? params.get('name') ?? '',
    from: params.get('from') ?? '',
    message: params.get('msg') ?? '',
    lang: params.get('lang') ?? '',
  };
}
