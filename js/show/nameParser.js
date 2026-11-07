// Turns whatever the visitor typed into a list of show scenes.
//
//   "Jishan Bhattacharya ❤️"  ->  [ words: Jishan / Bhattacharya ], [ emoji: ❤️ ]
//
// Words go on separate lines, each emoji becomes its own scene. Grapheme
// segmentation keeps multi-codepoint emoji (flags, skin tones, family ZWJ
// sequences, keycaps) together as one unit.

import { LIMITS } from '../config.js';

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

const GLUE = /^[‍️⃣\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
const REGIONAL = /^\p{Regional_Indicator}$/u;

/** Split a string into user-perceived characters. */
export function graphemes(str) {
  if (segmenter) return Array.from(segmenter.segment(str), (s) => s.segment);

  // Fallback for engines without Intl.Segmenter: glue joiners and modifiers to
  // the previous character and pair up regional indicators into flags.
  const out = [];
  let zwj = false;
  for (const ch of Array.from(str)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (zwj || GLUE.test(ch))) {
      out[out.length - 1] = prev + ch;
    } else if (prev !== undefined && REGIONAL.test(ch) && [...prev].length === 1 && REGIONAL.test(prev)) {
      out[out.length - 1] = prev + ch;
    } else {
      out.push(ch);
    }
    zwj = ch === '‍';
  }
  return out;
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const TEXT_SYMBOLS = /^[©®™]$/u; // ©®™ without a variation selector are plain text

export const isEmoji = (g) => EMOJI.test(g) && !TEXT_SYMBOLS.test(g);

// Characters that have no visible form of their own but show up in pasted
// text. Drawn on a canvas, some of them come out as boxes, e.g. U+FFFC, the
// "OBJ" placeholder macOS / iOS leave behind for a Genmoji, sticker or
// attachment. Stripped from words. ZWJ / ZWNJ are kept inside words because
// Indic scripts use them to shape conjuncts.
const INVISIBLE = /[\uFFFC\uFFFD\u00AD\u180E\u200B\u2060-\u2064\uFEFF\uFE00-\uFE0F\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\p{Co}\p{Cn}]/gu;
const EDGE_JOINERS = /^[\u200C\u200D]+|[\u200C\u200D]+$/gu;

/** A grapheme cleaned for display: emoji stay whole, text loses invisible characters. */
function visible(g) {
  if (isEmoji(g)) return g;
  return g.replace(INVISIBLE, '');
}

/** Trim, collapse whitespace, drop control and invisible characters, cap the length. */
export function sanitize(input, max = LIMITS.nameGraphemes) {
  const raw = String(input ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ');
  const words = graphemes(raw)
    .map(visible)
    .join('')
    .split(' ')
    .map((w) => w.replace(EDGE_JOINERS, ''))
    .filter(Boolean)
    .join(' ');
  return graphemes(words).slice(0, max).join('').trim();
}

/** -> [{ type: 'word' | 'emoji', value }] in reading order. */
export function tokenize(input) {
  const tokens = [];
  let word = '';
  const flush = () => {
    word = word.replace(EDGE_JOINERS, '');
    if (word) tokens.push({ type: 'word', value: word });
    word = '';
  };
  for (const raw of graphemes(input)) {
    const g = visible(raw);
    if (!g) continue;
    if (/^\s+$/.test(g)) flush();
    else if (isEmoji(g)) {
      flush();
      tokens.push({ type: 'emoji', value: g });
    } else word += g;
  }
  flush();
  return tokens;
}

/**
 * -> { name, scenes } where scene is
 *    { type: 'words', lines: string[] } or { type: 'emoji', value: string }
 */
export function parseName(input, { linesPerPage = LIMITS.linesPerPage, emojiScenes = LIMITS.emojiScenes } = {}) {
  const name = sanitize(input);
  const scenes = [];
  let lines = [];
  let emojis = 0;
  const flush = () => {
    if (lines.length) scenes.push({ type: 'words', lines });
    lines = [];
  };
  for (const t of tokenize(name)) {
    if (t.type === 'word') {
      lines.push(t.value);
      if (lines.length >= linesPerPage) flush();
    } else {
      flush();
      if (emojis < emojiScenes) {
        scenes.push({ type: 'emoji', value: t.value });
        emojis++;
      }
    }
  }
  flush();
  return { name, scenes };
}

/**
 * A personal message -> up to `maxLines` short lines of words for the sky
 * (emoji are left out: they only show on the greeting card).
 */
export function messageLines(input, { width = 16, maxLines = 4 } = {}) {
  const words = tokenize(sanitize(input, LIMITS.messageGraphemes)).filter((t) => t.type === 'word').map((t) => t.value);
  // Widen the lines when needed so the whole wish fits in maxLines.
  const total = graphemes(words.join(' ')).length;
  width = Math.max(width, Math.ceil(total / maxLines) + 2);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && graphemes(next).length > width) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}
