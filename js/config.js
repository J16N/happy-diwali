// Shared constants. Everything tunable lives here.

export const COLORS = {
  gold: [255, 201, 77],
  saffron: [255, 138, 31],
  crimson: [255, 59, 92],
  magenta: [224, 64, 251],
  emerald: [46, 230, 166],
  cyan: [64, 200, 255],
  white: [255, 244, 225],
  violet: [140, 100, 255],
  lime: [190, 255, 90],
  rose: [255, 120, 170],
};

export const PALETTE = Object.values(COLORS);

// Colour ramps used for text lines (left to right gradient).
export const LINE_RAMPS = [
  [COLORS.gold, COLORS.saffron],
  [COLORS.cyan, COLORS.white],
  [COLORS.rose, COLORS.magenta],
  [COLORS.lime, COLORS.emerald],
  [COLORS.saffron, COLORS.crimson],
  [COLORS.white, COLORS.gold],
];

export const STORAGE_KEYS = { name: 'diwali.name', muted: 'diwali.muted', cracker: 'diwali.cracker', lang: 'diwali.lang' };

export const LIMITS = {
  nameGraphemes: 40, // longest name we accept
  linesPerPage: 4, // words shown together before paging to the next scene
  emojiScenes: 10, // emoji shown one by one, extras are ignored
  messageGraphemes: 50, // longest personal wish: it has to fit in the sky on a phone
  shareNameGraphemes: 30, // "To" and "From" in the share dialog (no counter shown)
};

// Pool sizes and text detail per renderer. WebGL draws many more, much finer
// stars, which is what makes the lettering crisp.
export const BUDGET = {
  webgl: { particles: 42000, textStars: 9000, smoke: 1400, debris: 500, textPoints: 5200, emojiPoints: 3800 },
  canvas: { particles: 6500, textStars: 2800, smoke: 300, debris: 160, textPoints: 1800, emojiPoints: 1200 },
};

export const TIMING = {
  hold: 3.2, // seconds text stays lit
  release: 1.6, // time for the text to burn out and fall
  gap: 0.9, // pause between scenes
  sweep: 0.12, // delay between neighbouring shells bursting
};

export const PHYS = {
  gravity: 62, // px/s² per unit of screen scale S (shells: far away, so slow on screen)
  nearGravity: 520, // the same pull for crackers on the terrace, right in front of us
  wind: 14, // strongest breeze, px/s per S
  soundSpeed: 343, // m/s
  metre: 3.8, // px per metre per S (a 60 m shell radius is ~230 px on a 700 px screen)
};

export const HOLD_MS = 350; // press-and-hold time that opens the cracker wheel

// Words written in the sky, per greeting language.
// `word` is the name of the festival on its own, used in "Send a … greeting".
// `digits` are the language's own numerals 0-9, used for the year.
export const GREETINGS = {
  en: { wide: ['Happy Diwali'], tall: ['Happy', 'Diwali'], from: 'with love from', card: 'Happy Diwali', word: 'Diwali', digits: '0123456789' },
  hi: { wide: ['शुभ दीपावली'], tall: ['शुभ', 'दीपावली'], from: 'सप्रेम', card: 'शुभ दीपावली', word: 'दीपावली', digits: '०१२३४५६७८९' },
  bn: { wide: ['শুভ দীপাবলি'], tall: ['শুভ', 'দীপাবলি'], from: 'ভালোবাসা সহ', card: 'শুভ দীপাবলি', word: 'দীপাবলি', digits: '০১২৩৪৫৬৭৮৯' },
};
/** A number written in a greeting language's own numerals (2026 -> २०२६ / ২০২৬). */
export const localDigits = (n, lang) => {
  const d = (GREETINGS[lang] ?? GREETINGS.en).digits;
  return String(n).replace(/[0-9]/g, (c) => d[c]);
};

export const font = {
  // Devanagari and Bengali faces follow the Latin ones so Hindi and Bangla
  // render on every platform.
  text: (px) =>
    `900 ${px}px "Trebuchet MS","Segoe UI","Helvetica Neue",Arial,` +
    `"Kohinoor Devanagari","Devanagari Sangam MN","Noto Sans Devanagari","Mangal",` +
    `"Kohinoor Bangla","Bangla Sangam MN","Bangla MN","Noto Sans Bengali","Vrinda","Nirmala UI",sans-serif`,
  emoji: (px) =>
    `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color",sans-serif`,
};
