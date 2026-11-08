// Run with: node tests/nameParser.test.mjs
import assert from 'node:assert/strict';
import { parseName, parseMessage, tokenize, sanitize, isEmoji, messageLines } from '../js/show/nameParser.js';
import { localDigits } from '../js/config.js';
import { encodeGreeting, decodeGreeting, readGreeting } from '../js/linkCode.js';

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

test('message words wrap into short sky lines', () => {
  assert.deepEqual(messageLines('May this Diwali bring you joy, light and laughter 🪔✨'), [
    'May this Diwali', 'bring you joy,', 'light and', 'laughter',
  ]);
  assert.deepEqual(messageLines('🪔🎉'), []);
  assert.ok(messageLines('word '.repeat(60)).length <= 4);
});

test('a wish plays like a name: word lines, then one firework per emoji, in order', () => {
  assert.deepEqual(parseMessage('Happy Diwali 🪔 stay blessed ✨🎉'), [
    { type: 'message', lines: ['Happy Diwali'] },
    { type: 'emoji', value: '🪔' },
    { type: 'message', lines: ['stay blessed'] },
    { type: 'emoji', value: '✨' },
    { type: 'emoji', value: '🎉' },
  ]);
  assert.deepEqual(parseMessage('🪔❤️'), [{ type: 'emoji', value: '🪔' }, { type: 'emoji', value: '❤️' }]);
  assert.deepEqual(parseMessage('👨‍👩‍👧 🇮🇳'), [{ type: 'emoji', value: '👨‍👩‍👧' }, { type: 'emoji', value: '🇮🇳' }]);
  assert.deepEqual(parseMessage(''), []);
  assert.equal(parseMessage('🎆'.repeat(30)).length, 10); // capped like a name's emoji
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

test('greeting links round-trip in every script, with emoji', () => {
  const cases = [
    { to: 'Lakshmi Narayan', from: 'Jishan', message: 'Wishing you a very happy Diwali 🪔✨', lang: 'en' },
    { to: 'लक्ष्मी नारायण', from: 'जिशान', message: 'आपको दीपावली की शुभकामनाएं 🪔', lang: 'hi' },
    { to: 'লক্ষ্মী নারায়ণ', from: 'জিশান', message: 'দীপাবলির শুভেচ্ছা ❤️ 🇮🇳 👨‍👩‍👧', lang: 'bn' },
    { to: 'Zoë and नीता', from: '', message: 'শুভ দীপাবলি — 祝你 😀', lang: 'hi' },
    { to: '', from: 'Asha', message: '', lang: 'en' },
    { to: '', from: '', message: '', lang: 'bn' },
  ];
  for (const c of cases) {
    const code = encodeGreeting(c);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(decodeGreeting(code), c);
  }
});

test('greeting links are short for Hindi and Bengali', () => {
  const c = { to: 'लक्ष्मी नारायण', from: 'जिशान', message: 'आपको और आपके परिवार को दीपावली की शुभकामनाएं 🪔', lang: 'hi' };
  const old = new URLSearchParams({ to: c.to, from: c.from, msg: c.message, lang: c.lang }).toString();
  assert.ok(encodeGreeting(c).length * 5 < old.length);
});

test('broken codes are rejected and old links still read', () => {
  for (const bad of ['', '!!!', 'AAAA', encodeGreeting({ to: 'x' }).replace(/^./, '_'), 'EQE']) assert.equal(decodeGreeting(bad), null);
  assert.deepEqual(readGreeting(new URLSearchParams('name=Priya&lang=hi')), { to: 'Priya', from: '', message: '', lang: 'hi' });
  assert.deepEqual(readGreeting(new URLSearchParams('to=Priya&from=Jishan&msg=Hi')), { to: 'Priya', from: 'Jishan', message: 'Hi', lang: '' });
  assert.equal(readGreeting(new URLSearchParams('g=broken!&renderer=2d')), null);
  assert.equal(readGreeting(new URLSearchParams('action=send')), null);
  const g = encodeGreeting({ to: 'Priya', lang: 'bn' });
  assert.deepEqual(readGreeting(new URLSearchParams(`g=${g}`)), { to: 'Priya', from: '', message: '', lang: 'bn' });
});

console.log(`\n${passed} tests passed`);
