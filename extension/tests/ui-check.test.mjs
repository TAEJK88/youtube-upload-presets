import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canary, check, extractPairs, pairKey, smallText, sourceFiles, userscriptPairs } from '../scripts/ui-check.mjs';

const us = extractPairs([
  "L('ตกลง', 'OK')",
  'L(`ลบ ${n} รายการ`, `Delete ${n} items`)',
  "L('ไฟล์\\'s', \"File's\")",
  "L('ลาก', 'Drag')",
].join('\n')).map((p) => ({ ...p, line: 3000 }));

describe('extractPairs', () => {
  it('reads both literals, any quote style, and blanks template expressions', () => {
    expect(extractPairs("x = L(`ลบ ${it.n + 1} ไฟล์`, `Delete ${it.n + 1} file(s)`) + L('ก', \"Don't\")")).toEqual([
      { th: 'ลบ ${} ไฟล์', en: 'Delete ${} file(s)', line: 1 },
      { th: 'ก', en: "Don't", line: 1 },
    ]);
  });

  it('ignores L() pairs inside comments', () => {
    expect(extractPairs("// L('ก', 'A')\n/*\n * L('ข', 'B')\n */\nx(); // L('ค', 'C')\nL('ง', 'D')")).toEqual([{ th: 'ง', en: 'D', line: 6 }]);
  });

  it('skips L() with a non-literal argument and other functions ending in L', () => {
    expect(extractPairs('L(a, b); URL("x", "y"); obj.L("a", "b")')).toEqual([]);
  });
});

describe('check', () => {
  const file = (text) => ({ path: 'entrypoints/sidepanel/X.tsx', text });

  it('accepts userscript pairs whatever the expression inside ${}', () => {
    expect(check({ files: [file('L(`ลบ ${count} รายการ`, `Delete ${count} items`)')], us, extOnly: [], dropped: [] })).toEqual([]);
  });

  it('flags a pair the userscript never had, unless it is listed with a reason', () => {
    const f = [file("L('ใหม่', 'New thing')")];
    expect(check({ files: f, us, extOnly: [], dropped: [] })).toEqual([
      'entrypoints/sidepanel/X.tsx:1 not in the userscript: L("ใหม่", "New thing") — add it to scripts/strings/extension-only.mjs with a reason, or use the userscript\'s pair',
    ]);
    expect(check({ files: f, us, extOnly: [{ th: 'ใหม่', en: 'New thing', why: 'test' }], dropped: [] })).toEqual([]);
  });

  it('flags a listed pair nothing uses any more', () => {
    expect(check({ files: [], us, extOnly: [{ th: 'ใหม่', en: 'New thing', why: 'test' }], dropped: [] })).toEqual([
      'scripts/strings/extension-only.mjs lists a pair no source uses: L("ใหม่", "New thing")',
    ]);
  });

  it('with coverage, every drawer pair is used or dropped with a reason', () => {
    const files = [file("L('ตกลง', 'OK'); L('ไฟล์\\'s', \"File's\"); L(`ลบ ${x} รายการ`, `Delete ${x} items`)")];
    expect(check({ coverage: true, files, us, extOnly: [], dropped: [] })).toEqual([
      'userscript:3000 drawer pair not in the panel: L("ลาก", "Drag") — use it, or add it to scripts/strings/dropped.mjs with a reason',
    ]);
    expect(check({ coverage: true, files, us, extOnly: [], dropped: [{ th: 'ลาก', en: 'Drag', why: 'test' }] })).toEqual([]);
  });

  it('flags text below 12px', () => {
    expect(smallText('a { font: 600 11px system-ui } <b class="text-[10px] text-[12px]">').map((s) => s.px)).toEqual([11, 10]);
    expect(check({ files: [file('<i className="text-[11px]" />')], us, extOnly: [], dropped: [] })).toEqual([
      'entrypoints/sidepanel/X.tsx:1 text is 11px: the minimum is 12px',
    ]);
  });

  it('pairKey is th and en joined', () => {
    expect(pairKey({ th: 'a', en: 'b' })).toBe('a\u0000b');
  });
});

// Holes a review found: each of these printed `ui-check: ok`.
describe('extractPairs is a parser, not a regex', () => {
  it('finds calls after a block comment, inside template placeholders and in JSX text with //', () => {
    expect(extractPairs("/* c */ L('ก', 'A')")).toEqual([{ th: 'ก', en: 'A', line: 1 }]);
    expect(extractPairs("const s = `see // ${L('ก', 'A')}`")).toEqual([{ th: 'ก', en: 'A', line: 1 }]);
    expect(extractPairs("const x = <p>a // b {L('ก', 'A')}</p>", 'x.tsx')).toEqual([{ th: 'ก', en: 'A', line: 1 }]);
  });

  it('does not count calls inside a mid-line block comment', () => {
    expect(extractPairs("x(/* L('ข', 'B') */ 1)")).toEqual([]);
  });

  it('reads plain JS with regex literals and multi-line templates (the userscript)', () => {
    expect(extractPairs("var r = /'/;\nvar t = L(`ก\n${a}`, `A\n${b}`); L('ง', 'D') // L('x', 'y')", 'u.js')).toEqual([
      { th: 'ก\n${}', en: 'A\n${}', line: 2 },
      { th: 'ง', en: 'D', line: 4 },
    ]);
  });
});

describe('check: every L( call is two literals', () => {
  const file = (text, path = 'entrypoints/sidepanel/X.tsx') => ({ path, text });
  const run = (text, more = {}) => check({ files: [file(text)], us, extOnly: [], dropped: [], ...more });

  it('flags concatenation, variables, ternaries and spaced calls', () => {
    expect(run("L('ก' + 'ข', 'A' + 'B')")).toEqual(["entrypoints/sidepanel/X.tsx:1 L() needs two string literals: L('ก' + 'ข', 'A' + 'B')"]);
    expect(run("\nL(msg, 'A')")).toEqual(["entrypoints/sidepanel/X.tsx:2 L() needs two string literals: L(msg, 'A')"]);
    expect(run("L(a ? 'ก' : 'ข', 'A')")).toEqual(["entrypoints/sidepanel/X.tsx:1 L() needs two string literals: L(a ? 'ก' : 'ข', 'A')"]);
    expect(run("L('ตกลง')")).toEqual(["entrypoints/sidepanel/X.tsx:1 L() needs two string literals: L('ตกลง')"]);
    expect(run("L ('ใหม่', 'A')")[0]).toMatch(/^entrypoints\/sidepanel\/X\.tsx:1 not in the userscript: L\("ใหม่", "A"\)/);
  });

  it('accepts a dynamic call on the reviewed allowlist, and flags a stale entry', () => {
    const dynamicCalls = [{ file: 'entrypoints/sidepanel/X.tsx', line: 1, call: 'L(msg, "A")', why: 'test' }];
    expect(run('L(msg,  "A")', { allow: { dynamicCalls, sizes: [] } })).toEqual([]);
    expect(run('', { allow: { dynamicCalls, sizes: [] } })).toEqual([
      'scripts/ui-allow.mjs dynamicCalls lists a call no source has: entrypoints/sidepanel/X.tsx:1 L(msg, "A")',
    ]);
    expect(run('L(msg, "A")', { allow: { dynamicCalls: [{ ...dynamicCalls[0], why: ' ' }], sizes: [] } })).toEqual([
      'scripts/ui-allow.mjs dynamicCalls entry needs a reason (why): entrypoints/sidepanel/X.tsx:1 L(msg, "A")',
    ]);
    // the entry covers its own line only, not the same call elsewhere in the file
    expect(run('L(msg, "A")\nL(msg, "A")', { allow: { dynamicCalls, sizes: [] } })).toEqual([
      'entrypoints/sidepanel/X.tsx:2 L() needs two string literals: L(msg, "A")',
    ]);
  });

  it('does not count the definition of L in lib/i18n.ts or other identifiers', () => {
    const def = "export const L = (th: string, en: string): string => (current === 'en' ? en : th);\nURL(a, b); xL(c); x.Lx(); const o = { a: 1 };";
    expect(check({ files: [file(def, 'lib/i18n.ts')], us, extOnly: [], dropped: [] })).toEqual([]);
    expect(run(def)).toEqual(["entrypoints/sidepanel/X.tsx:1 L is used other than as a direct call L('…', '…'): export const L = (th: string, en: string): string => (current === 'en' ? en : th);"]);
  });

  it('a pair only inside a block comment is not "used"', () => {
    expect(run("x(/* L('ใหม่', 'New') */ 1)", { extOnly: [{ th: 'ใหม่', en: 'New', why: 't' }] })).toEqual([
      'scripts/strings/extension-only.mjs lists a pair no source uses: L("ใหม่", "New")',
    ]);
  });

  it('checks .js, .mjs and .jsx files too', () => {
    for (const path of ['lib/a.js', 'lib/a.mjs', 'lib/a.jsx']) {
      expect(check({ files: [file('L(msg, "A")', path)], us, extOnly: [], dropped: [] })).toEqual([`${path}:1 L() needs two string literals: L(msg, "A")`]);
    }
  });
});

describe('check: the allowlists are validated', () => {
  const files = [{ path: 'lib/a.ts', text: "L('ใหม่', 'New'); L('ตกลง', 'OK')" }];
  const run = (extOnly, dropped = []) => check({ files, us, extOnly, dropped });

  it('extension-only entries need a reason, appear once, and are not userscript pairs', () => {
    expect(run([{ th: 'ใหม่', en: 'New' }])).toEqual(['scripts/strings/extension-only.mjs: L("ใหม่", "New") needs a reason (why)']);
    expect(run([{ th: 'ใหม่', en: 'New', why: '' }])).toEqual(['scripts/strings/extension-only.mjs: L("ใหม่", "New") needs a reason (why)']);
    expect(run([{ th: 'ใหม่', en: 'New', why: 'a' }, { th: 'ใหม่', en: 'New', why: 'b' }])).toEqual(['scripts/strings/extension-only.mjs lists L("ใหม่", "New") twice']);
    expect(run([{ th: 'ใหม่', en: 'New', why: 'a' }, { th: 'ตกลง', en: 'OK', why: 'b' }])).toEqual([
      'scripts/strings/extension-only.mjs: L("ตกลง", "OK") is a userscript pair — remove it',
    ]);
  });

  it('dropped entries need a reason, appear once, and are userscript pairs', () => {
    const ok = [{ th: 'ใหม่', en: 'New', why: 'a' }];
    expect(run(ok, [{ th: 'ลาก', en: 'Drag', why: ' ' }])).toEqual(['scripts/strings/dropped.mjs: L("ลาก", "Drag") needs a reason (why)']);
    expect(run(ok, [{ th: 'ลาก', en: 'Drag', why: 'a' }, { th: 'ลาก', en: 'Drag', why: 'a' }])).toEqual(['scripts/strings/dropped.mjs lists L("ลาก", "Drag") twice']);
    expect(run(ok, [{ th: 'ไม่มี', en: 'Nope', why: 'a' }])).toEqual(['scripts/strings/dropped.mjs: L("ไม่มี", "Nope") is not a userscript pair']);
  });
});

describe('smallText: every way to set a font size', () => {
  const sizes = (t) => smallText(t).map((s) => [s.line, s.value, s.px]);

  it('resolves rem/em at 16px, %, pt; 0.75rem is exactly 12px', () => {
    expect(sizes('a{font-size:0.7rem}\nb{font-size:0.75rem}\nc{font-size:.7em}\nd{font-size:70%}\ne{font-size:8pt}\nf{font-size:9pt}')).toEqual([
      [1, '0.7rem', 11.2], [3, '.7em', 11.2], [4, '70%', 11.2], [5, '8pt', 10.67],
    ]);
  });

  it('fails small keywords, and sizes it cannot verify', () => {
    expect(sizes('a{font-size:x-small}b{font-size:SMALLER}c{font-size:xx-small}d{font-size:small}e{font-size:medium}f{font-size:inherit}').map((s) => s[1]))
      .toEqual(['x-small', 'smaller', 'xx-small', 'small']);
    expect(sizes('a{font-size:calc(1rem - 5px)}b{font-size:clamp(10px, 2vw, 14px)}c{font-size:var(--fs)}d{font-size:min(1em, 11px)}e{font-size:max(1em,11px)}f{font-size:2vw}').map((s) => [s[1], s[2]]))
      .toEqual([['calc(1rem - 5px)', undefined], ['clamp(10px, 2vw, 14px)', undefined], ['var(--fs)', undefined], ['min(1em, 11px)', undefined], ['max(1em,11px)', undefined], ['2vw', undefined]]);
  });

  it('reads the font shorthand with any keywords before the size', () => {
    expect(sizes([
      'a{font:bold 11px x}', 'b{font:italic small-caps 600 11px/1.2 "A B",x}', 'c{font: normal normal 400 0.6rem x}',
      'd{font:600 12px x}', 'e{font:inherit}', 'f{font: 500 12px/1.4 Roboto}', 'g{font:var(--f)}', 'h{font:small-caps small x}',
    ].join('\n'))).toEqual([[1, '11px', 11], [2, '11px', 11], [3, '0.6rem', 9.6], [7, 'var(--f)', undefined], [8, 'small', undefined]]);
  });

  it('normalises case and joins values across newlines', () => {
    expect(sizes('a{FONT-SIZE:11PX}\nb{font-size:\n  10px}\nc{FONT:\n BOLD\n 9px x}')).toEqual([[1, '11px', 11], [2, '10px', 10], [4, '9px', 9]]);
  });

  it('reads Tailwind arbitrary values, hints and variants', () => {
    expect(sizes('<b class="text-[11PX] text-[0.7rem] text-[.7rem] text-[calc(1rem-5px)] text-[length:11px] font-[11px] sm:text-[10px] hover:font-[length:9px]">'))
      .toEqual([[1, '11px', 11], [1, '0.7rem', 11.2], [1, '.7rem', 11.2], [1, 'calc(1rem-5px)', undefined], [1, '11px', 11], [1, '11px', 11], [1, '10px', 10], [1, '9px', 9]]);
    expect(sizes('<b class="text-[#fff] text-[12px] font-[600] text-[color:var(--x)] font-[family-name:x] text-xs">')).toEqual([]);
  });

  it('reads inline JS styles', () => {
    expect(sizes("h('i', { style: { fontSize: 11 } });\nx = { fontSize: '11px' };\nel.style.fontSize = '10px';\nel.style.setProperty('font-size', '9px');\ny = { fontSize: 12 };\nz = { fontSize: size };\nctx.font = '600 10px sans-serif';"))
      .toEqual([[1, '11', 11], [2, '11px', 11], [3, '10px', 10], [4, '9px', 9], [6, 'size', undefined], [7, '10px', 10]]);
  });

  it('flags theme tokens below 12px', () => {
    expect(sizes('@theme { --text-tiny: 10px; --text-tiny--line-height: 1; --text-xs: 0.75rem; }')).toEqual([[1, '10px', 10]]);
  });
});

describe('check: sizes', () => {
  const run = (files, sizes = []) => check({ files, us, extOnly: [], dropped: [], allow: { dynamicCalls: [], sizes } });

  it('reports file:line for rem and unverifiable sizes', () => {
    expect(run([{ path: 'entrypoints/sidepanel/a.css', text: '\n.a{font-size:0.7rem}\n.b{font-size:calc(1rem + 1px)}' }])).toEqual([
      'entrypoints/sidepanel/a.css:2 text is 0.7rem (11.2px): the minimum is 12px',
      'entrypoints/sidepanel/a.css:3 text size calc(1rem + 1px) cannot be verified as at least 12px — use a fixed size, or list it in scripts/ui-allow.mjs sizes with a reason',
    ]);
  });

  it('accepts a reviewed size, and flags a stale or unexplained entry', () => {
    const files = [{ path: 'lib/a.css', text: '.b{font-size:calc(1rem + 1px)}' }];
    const entry = { file: 'lib/a.css', line: 1, value: 'calc(1rem + 1px)', why: 'at least 17px' };
    expect(run(files, [entry])).toEqual([]);
    expect(run([], [entry])).toEqual(['scripts/ui-allow.mjs sizes lists a size no source has: lib/a.css:1 calc(1rem + 1px)']);
    expect(run(files, [{ ...entry, why: undefined }])).toEqual(['scripts/ui-allow.mjs sizes entry needs a reason (why): lib/a.css:1 calc(1rem + 1px)']);
  });

  it('a reviewed size covers its own line only', () => {
    const files = [{ path: 'lib/a.css', text: '.b{font-size:calc(1rem + 1px)}\n.c{font-size:calc(1rem + 1px)}' }];
    expect(run(files, [{ file: 'lib/a.css', line: 1, value: 'calc(1rem + 1px)', why: 'x' }])).toEqual([
      'lib/a.css:2 text size calc(1rem + 1px) cannot be verified as at least 12px — use a fixed size, or list it in scripts/ui-allow.mjs sizes with a reason',
    ]);
    expect(run([{ path: 'lib/a.css', text: '.b{font-size:calc(1rem + 1px)}' }], [{ file: 'lib/a.css', line: 2, value: 'calc(1rem + 1px)', why: 'x' }])).toEqual([
      'lib/a.css:1 text size calc(1rem + 1px) cannot be verified as at least 12px — use a fixed size, or list it in scripts/ui-allow.mjs sizes with a reason',
      'scripts/ui-allow.mjs sizes lists a size no source has: lib/a.css:2 calc(1rem + 1px)',
    ]);
  });

  it('flags a class that uses a theme token below 12px', () => {
    expect(run([
      { path: 'assets/theme.css', text: '@theme {\n  --text-tiny: 0.6rem;\n}' },
      { path: 'entrypoints/sidepanel/X.tsx', text: 'const a = 1;\nh("b", { class: "sm:text-tiny" })' },
    ])).toEqual([
      'assets/theme.css:2 text is 0.6rem (9.6px): the minimum is 12px',
      'entrypoints/sidepanel/X.tsx:2 text-tiny is 9.6px (assets/theme.css): the minimum is 12px',
    ]);
  });
});

describe('sourceFiles', () => {
  it('scans scripts in .ts/.tsx/.js/.mjs/.jsx and sizes in assets/ and public/, skipping scripts/ and tests/', () => {
    const root = mkdtempSync(join(tmpdir(), 'ui-check-'));
    const put = (p) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), ''); };
    ['lib/a.ts', 'lib/b.js', 'lib/c.mjs', 'lib/d.jsx', 'lib/e.d.ts', 'lib/tests/f.ts', 'entrypoints/x/g.tsx', 'entrypoints/x/h.css',
      'assets/i.css', 'public/j.svg', 'public/k.html', 'scripts/l.mjs', 'tests/m.ts', 'lib/n.png'].forEach(put);
    expect(sourceFiles(root).map((f) => f.path).sort()).toEqual([
      'assets/i.css', 'entrypoints/x/g.tsx', 'entrypoints/x/h.css', 'lib/a.ts', 'lib/b.js', 'lib/c.mjs', 'lib/d.jsx', 'public/j.svg', 'public/k.html',
    ]);
  });
});

// Round 2: holes a second review found; each of these printed `ui-check: ok`.
describe('check: L is only ever called directly', () => {
  const run = (text, path = 'entrypoints/sidepanel/X.tsx') => check({ files: [{ path, text }], us, extOnly: [], dropped: [] });
  const flagged = (text) => run(text).filter((e) => / L is used other than as a direct call /.test(e)).map((e) => e.split(' ')[0]);

  it('flags aliases, member access, tagged templates and indirect calls', () => {
    const at = 'entrypoints/sidepanel/X.tsx:2';
    for (const src of [
      "import { L as T } from '@/lib/i18n';\nT('ก', 'A')",
    ]) expect(flagged(src)).toEqual(['entrypoints/sidepanel/X.tsx:1']);
    for (const src of [
      "i18n.L('ก', 'A')",
      "i18n['L']('ก', 'A')",
      'i18n?.["L"]("ก", "A")',
      'L`ก`',
      "(0, L)('ก', 'A')",
      "L.call(null, 'ก', 'A')",
      "const t = L; t('ก', 'A')",
      'const { L: T } = i18n',
      "const { 'L': T } = i18n",
      "(L as any)('ก', 'A')",
      "L!('ก', 'A')",
      "new L('ก', 'A')",
      "export { L as T } from '@/lib/i18n'",
      'const o = { L }',
    ]) expect(flagged('const a = 1;\n' + src), src).toEqual([at]);
  });

  it('allows the unaliased import, direct and optional calls', () => {
    expect(run("import { L } from '@/lib/i18n';\nL('ตกลง', 'OK'); L?.('ตกลง', 'OK')")).toEqual([]);
  });

  it('fails a file with a syntax error', () => {
    expect(run("const a = 1;\nL('ตกลง', 'OK'")).toEqual(["entrypoints/sidepanel/X.tsx:2 syntax error: ')' expected."]);
    expect(run('var x = ;', 'lib/a.js')).toEqual(['lib/a.js:1 syntax error: Expression expected.']);
  });
});

describe('the userscript canary', () => {
  it('the pinned userscript yields 790 pairs, 725 unique', () => {
    expect(canary(userscriptPairs())).toEqual([]);
  });

  it('fails loudly on any other count', () => {
    expect(canary(us)).toEqual(['userscript canary: expected 790 L() pairs (725 unique) at the pinned commit, got 4 (4 unique) — the parser or the pin changed']);
  });
});

describe('smallText: round 2', () => {
  const sizes = (t, name) => smallText(t, name).map((s) => [s.line, s.value, s.px]);

  it('reads quoted keys and bracket access', () => {
    expect(sizes("a = {'font-size':'10px'};\nb = {'fontSize':'10px'};\nc = {\"fontSize\":10};\nel.style[\"fontSize\"]=\"10px\";\nd = {'font': 'bold 9px x'};\ne = {'fontSize': 12}", 'a.ts'))
      .toEqual([[1, '10px', 10], [2, '10px', 10], [3, '10', 10], [4, '10px', 10], [5, '9px', 9]]);
  });

  it('reads JSX props in braces', () => {
    expect(sizes("<Text fontSize={11} />\n<text fontSize={9}/>\n<x fontSize={size}/>\n<y fontSize={'10px'} />\n<z fontSize={14}/>\n<w fontSize={`8px`} />", 'a.tsx'))
      .toEqual([[1, '11', 11], [2, '9', 9], [3, 'size', undefined], [4, '10px', 10], [6, '8px', 8]]);
  });

  it('treats Tailwind v4 text-(length:--x) as unverifiable, text-(--x) as a colour', () => {
    expect(sizes('<b class="text-(length:--x) md:font-(length:--y) text-(--c) text-(color:--c)">')).toEqual([[1, '--x', undefined], [1, '--y', undefined]]);
  });

  it('ignores sizes inside comments', () => {
    expect(sizes('/* font-size: 10px */ a{font-size:12px}\n/*\n.x { font: 9px x }\n*/', 'a.css')).toEqual([]);
    expect(sizes('<!-- <p style="font-size:9px"> --> <p style="font-size:9px">', 'a.html')).toEqual([[1, '9px', 9]]);
    expect(sizes("// fontSize: 10\nconst s = '// x'; /* font: 9px x */ const o = { fontSize: 11 }; // text-[8px]", 'a.ts')).toEqual([[2, '11', 11]]);
    expect(check({ files: [{ path: 'lib/a.ts', text: '// fontSize: 10\n/** text-[9px] */\nconst a = 1;' }], us, extOnly: [], dropped: [] })).toEqual([]);
  });

  it('only length-valued --text-* tokens are sizes', () => {
    expect(sizes('@theme { --text-muted: #666; --text-fg: rgb(0 0 0); --text-ink: var(--x); --text-tiny: 10px; --text-c: calc(1rem - 6px); --text-ok: 0.75rem }'))
      .toEqual([[1, '10px', 10], [1, 'calc(1rem - 6px)', undefined]]);
  });
});
