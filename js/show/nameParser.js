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
// attachment. Others are blanks people paste to make a name look empty:
// Hangul fillers (U+3164, U+115F, U+1160, U+FFA0) and the Braille blank
// (U+2800). Also the combining grapheme joiner, the Arabic letter mark and
// Khmer's invisible vowels. Stripped from words. ZWJ / ZWNJ are kept inside
// words because Indic scripts use them to shape conjuncts.
const INVISIBLE =
  /[\uFFFC\uFFFD\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B\u2060-\u2064\u2800\u3164\uFEFF\uFFA0\uFE00-\uFE0F\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\p{Co}\p{Cn}]/gu;
// Joiners at either end of a word, and combining marks at its start (an
// accent or vowel sign with no letter to sit on draws as a dotted circle).
const EDGE_JOINERS = /^[\u200C\u200D\p{M}]+|[\u200C\u200D]+$/gu;

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

/** Words -> up to `maxLines` lines of about `width` characters, never splitting a word. */
function wrapWords(words, { width, maxLines }) {
  // Widen the lines when needed so all the words fit in maxLines.
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

/** The words of a personal message (emoji left out) -> up to `maxLines` short lines for the sky. */
export function messageLines(input, { width = 16, maxLines = 4 } = {}) {
  const words = tokenize(sanitize(input, LIMITS.messageGraphemes)).filter((t) => t.type === 'word').map((t) => t.value);
  return wrapWords(words, { width, maxLines });
}

/**
 * A personal message -> show scenes in reading order, like a name: each run
 * of words is one scene of short lines, each emoji its own firework.
 *
 *   "Happy Diwali 🪔 stay blessed ✨"
 *     -> [ message: Happy Diwali ], [ emoji: 🪔 ], [ message: stay blessed ], [ emoji: ✨ ]
 */
export function parseMessage(input, { width = 16, maxLines = 4, emojiScenes = LIMITS.emojiScenes } = {}) {
  const scenes = [];
  let words = [];
  let emojis = 0;
  const flush = () => {
    if (words.length) scenes.push({ type: 'message', lines: wrapWords(words, { width, maxLines }) });
    words = [];
  };
  for (const t of tokenize(sanitize(input, LIMITS.messageGraphemes))) {
    if (t.type === 'word') words.push(t.value);
    else {
      flush();
      if (emojis < emojiScenes) {
        scenes.push({ type: 'emoji', value: t.value });
        emojis++;
      }
    }
  }
  flush();
  return scenes;
}
