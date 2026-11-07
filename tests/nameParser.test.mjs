// Run with: node tests/nameParser.test.mjs
import assert from 'node:assert/strict';
import { parseName, tokenize, sanitize, isEmoji, messageLines } from '../js/show/nameParser.js';
import { localDigits } from '../js/config.js';

let passed = 0;
const test = (label, fn) => {
  fn();
  passed++;
  console.log(`ok  ${label}`);
};

test('words on separate lines, emoji as its own scene', () => {
  const { scenes } = parseName('Jishan Bhattacharya ❤️');
  assert.deepEqual(scenes, [
    { type: 'words', lines: ['Jishan', 'Bhattacharya'] },
    { type: 'emoji', value: '❤️' },
  ]);
});

test('emoji in the middle splits the text scenes in reading order', () => {
  const { scenes } = parseName('Asha 🎉 Rao');
  assert.deepEqual(scenes, [
    { type: 'words', lines: ['Asha'] },
    { type: 'emoji', value: '🎉' },
    { type: 'words', lines: ['Rao'] },
  ]);
});

test('emoji glued to a word still separates', () => {
  assert.deepEqual(tokenize('Priya🪔'), [
    { type: 'word', value: 'Priya' },
    { type: 'emoji', value: '🪔' },
  ]);
});

test('multi-codepoint emoji stay whole (skin tone, ZWJ family, flag, keycap)', () => {
  for (const e of ['👍🏽', '👨‍👩‍👧', '🇮🇳', '1️⃣']) {
    const t = tokenize(`A ${e}`);
    assert.equal(t.length, 2, e);
    assert.equal(t[1].value, e);
  }
});

test('digits and © are text, not emoji', () => {
  assert.equal(isEmoji('7'), false);
  assert.equal(isEmoji('©'), false);
  assert.equal(isEmoji('✨'), true);
});

test('every emoji is its own scene, repeats included, capped', () => {
  const { scenes } = parseName('❤️❤️❤️', { emojiScenes: 2 });
  assert.equal(scenes.length, 2);
});

test('many words are paged', () => {
  const { scenes } = parseName('a b c d e f');
  assert.deepEqual(scenes.map((s) => s.lines.length), [4, 2]);
});

test('sanitize trims, collapses spaces, strips control chars, caps length', () => {
  assert.equal(sanitize('  Ravi \n\t  Kumar  '), 'Ravi Kumar');
  assert.equal(sanitize('x'.repeat(100)).length, 40);
  assert.equal(sanitize(null), '');
});

test('non-Latin names work', () => {
  assert.deepEqual(parseName('জিশান').scenes, [{ type: 'words', lines: ['জিশান'] }]);
});

test('empty input gives no scenes', () => {
  assert.deepEqual(parseName('   ').scenes, []);
});

test('invisible characters from pasted text never become letters', () => {
  // U+FFFC is what macOS / iOS leave for a Genmoji or attachment ("OBJ" box).
  const expected = [
    { type: 'words', lines: ['Ram'] },
    { type: 'emoji', value: '❤️' },
    { type: 'words', lines: ['Sita'] },
  ];
  for (const s of ['Ram\uFFFC ❤️ Sita', 'Ram \uFFFC❤️ Sita', 'Ram\u200B ❤️ Sita', 'Ram \uFFFC ❤️ \uFEFFSita', 'Ram\uE000 ❤️ Sita']) {
    assert.deepEqual(parseName(s).scenes, expected, JSON.stringify(s));
  }
  assert.equal(sanitize('Ram\uFFFC ❤️ Sita'), 'Ram ❤️ Sita');
});

test('Bengali names and wishes keep their conjuncts', () => {
  assert.deepEqual(parseName('অর্পিতা 🪔').scenes, [
    { type: 'words', lines: ['অর্পিতা'] },
    { type: 'emoji', value: '🪔' },
  ]);
  // Counted in visible characters (graphemes), so it fits on one line...
  assert.deepEqual(messageLines('শুভ দীপাবলির অনেক শুভেচ্ছা'), ['শুভ দীপাবলির অনেক শুভেচ্ছা']);
  // ...and wraps on a narrow phone without splitting a word.
  assert.deepEqual(messageLines('শুভ দীপাবলির অনেক শুভেচ্ছা', { width: 8 }), ['শুভ দীপাবলির', 'অনেক শুভেচ্ছা']);
});

test('Indic joiners inside words survive', () => {
  const kshatriya = 'क्\u200Dष'; // ZWJ inside a conjunct
  assert.deepEqual(parseName(kshatriya).scenes, [{ type: 'words', lines: [kshatriya] }]);
});

test('messages wrap into short sky lines, emoji only on the card', () => {
  assert.deepEqual(messageLines('May this Diwali bring you joy, light and laughter 🪔✨'), [
    'May this Diwali', 'bring you joy,', 'light and', 'laughter',
  ]);
  assert.deepEqual(messageLines('🪔🎉'), []);
  assert.ok(messageLines('word '.repeat(60)).length <= 4);
});

test('a full 50-character wish always fits in four sky lines, even on a narrow phone', () => {
  const wish = 'Wishing you a bright and joyful Diwali, dear friend';
  const lines = messageLines(wish, { width: 11 });
  assert.ok(lines.length <= 4, lines.join(' | '));
  assert.equal(lines.join(' '), sanitize(wish, 50));
});

test('messages are capped and cleaned like names', () => {
  assert.equal(sanitize('x'.repeat(200), 70).length, 70);
  assert.equal(sanitize('Shubh\uFFFC Deepavali', 70), 'Shubh Deepavali');
});

test('the year is written in each language\'s own numerals', () => {
  assert.equal(localDigits(2026, 'en'), '2026');
  assert.equal(localDigits(2026, 'hi'), '२०२६');
  assert.equal(localDigits(2026, 'bn'), '২০২৬');
  assert.equal(localDigits(2031, 'xx'), '2031'); // unknown language: plain digits
});

console.log(`\n${passed} tests passed`);
