import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compareText } from '../scripts/port-check.mjs';

const fails = (a, b) => assert.notEqual(compareText(a, b).errors.length, 0);
const passes = (a, b) => assert.deepEqual(compareText(a, b).errors, []);

test('whitespace inside string literals is compared verbatim', () => {
  fails(`const s = 'a b';`, `const s = 'ab';`);
  fails(`const s = "a  b";`, `const s = "a b";`);
});

test('whitespace inside regex literals is compared verbatim', () => {
  fails(`const r = /a b/;`, `const r = /ab/;`);
  fails(`x = s.replace(/ +/g, '');`, `x = s.replace(/+/g, '');`);
});

test('template literals keep blank lines, // lines and inner whitespace', () => {
  fails('const t = `a\n\nb`;', 'const t = `a\nb`;');
  fails('const t = `a\n// x\nb`;', 'const t = `a\nb`;');
  fails('const t = `a b`;', 'const t = `ab`;');
  fails('const t = `${x} y`;', 'const t = `${x}y`;');
});

test('code between two block comments on one line is not dropped', () => {
  fails('/* a */ steal(); /* b */', '/* a */ /* b */');
});

test('an empty expected side fails', () => {
  fails('// only a comment\n\n', '');
  assert.match(compareText('// c', '').errors.join('\n'), /empty|zero|no code/i);
});

test('a difference reports userscript and module line numbers', () => {
  const r = compareText('a();\nb();', 'a();\nc();', { expectedMap: [10, 11], portedMap: [3, 4], file: 'm.ts' });
  assert.match(r.errors.join('\n'), /userscript line 11/);
  assert.match(r.errors.join('\n'), /m\.ts line 4/);
});

test('comments, whitespace and a leading export still pass', () => {
  passes(
    `// hi\nconst f = (a) => {\n  return a + 1; // tail\n};\n/* block */\nconst s = 'x y';`,
    `export const   f=(a)=>{\n\n return a+1;\n};\nconst s = 'x y'; /* z */`,
  );
  passes('const t = `a\n\n  // b ${x} c`;', 'const t = `a\n\n  // b ${x} c`;');
});
