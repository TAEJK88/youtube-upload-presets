import { describe, expect, it } from 'vitest';
import { check, extractPairs, pairKey, smallText } from '../scripts/ui-check.mjs';

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
    expect(extractPairs("// L('ก', 'A')\n * L('ข', 'B')\nx(); // L('ค', 'C')\nL('ง', 'D')")).toEqual([{ th: 'ง', en: 'D', line: 4 }]);
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
    expect(smallText('a { font: 600 11px system-ui } <b class="text-[10px] text-[12px]">').map((s) => s.px)).toEqual([10, 11]);
    expect(check({ files: [file('<i className="text-[11px]">')], us, extOnly: [], dropped: [] })).toEqual([
      'entrypoints/sidepanel/X.tsx:1 text is 11px: the minimum is 12px',
    ]);
  });

  it('pairKey is th and en joined', () => {
    expect(pairKey({ th: 'a', en: 'b' })).toBe('a\u0000b');
  });
});
