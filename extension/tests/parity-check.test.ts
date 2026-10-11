import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script
import { check, inventory, MAX_LINES, pinnedInventory, render } from '../scripts/parity-check.mjs';

const SRC = [
  '// ==UserScript==',                                        // 1
  '// @match        https://studio.youtube.com/*',
  '// @grant        GM_setClipboard',
  '// ==/UserScript==',
  "  const SWITCH_KEY = 'pendingChannelSwitch';",             // 5
  "  const VARS = ['name', 'bpm'];",
  '  const DEFAULT_PRESETS = [',
  '    {',
  '      artistMax: 4,',
  '    },',                                                   // 10
  '  ];',
  '  const settings = Object.assign(',
  '    {',
  '      autoSave: true, // x',
  '      schedule: { on: false },',                           // 15
  '    },',
  "    load('settings', {})",
  '  );',
  '  const saveSettings = () => 1;',
  "  const fab = h('button', { onclick: () => open() });",    // 20
  '  /* a block',
  '     comment */',
  '  // a comment',
  '',
  '  n.onclick = () => focus();',                             // 25
  "    sec(L('ทั่วไป', 'General'), 'gear',",
  "      sw('autoSave', L('ก', 'Auto-press Save')),",
  '    const DEFAULTS = {',
  "      apMaxPct: '25',",
  '    };',                                                   // 30
  '    const cfg = () => 1;',
  "    chSet('trimQueue', []);",
  "    if (e.code === 'KeyP') {}",
  '  panes.queue = h();',
  '  const onlyActive = { onlyActive: true };',               // 35
].join('\n');

describe('parity inventory', () => {
  it('lists the named things and every line of code, handler lines as ui:', () => {
    const inv = inventory(SRC, []);
    for (const id of [
      'header:match https://studio.youtube.com/*', 'header:grant GM_setClipboard',
      'store:pendingChannelSwitch', 'store:settings', 'store:trimQueue:<channel>',
      'setting:autoSave', 'setting:schedule', 'cfg:apMaxPct', 'preset:artistMax', 'switch:autoSave', 'section:General',
      'var:{name}', 'var:{bpm}', 'key:Alt+KeyP', 'tab:queue',
      'ui:20', 'ui:25', 'code:5', 'code:35',
    ]) expect(inv, id).toContain(id);
    // comments and blank lines are not code; a property that only starts with "on" is no handler
    for (const id of ['code:1', 'code:21', 'code:22', 'code:23', 'code:24', 'ui:35', 'code:20']) expect(inv, id).not.toContain(id);
    expect(inv).toEqual([...new Set(inv)].sort());
  });

  it('a line inside a ported region is not listed', () => {
    const inv = inventory(SRC, [[20, 25]]);
    expect(inv).not.toContain('ui:20');
    expect(inv).not.toContain('ui:25');
    expect(inv).toContain('code:19');
  });

  // As ui-check pins pairsHash: the inventory of the real pinned file cannot shrink unseen. It
  // changes only when a port config gains or loses a region; update both numbers in that commit
  // and say in its message which lines moved.
  it('the pinned userscript yields 3211 items', async () => {
    const inv = await pinnedInventory();
    expect(inv).toHaveLength(3211);
    expect(inv.filter((id: string) => id.startsWith('ui:'))).toHaveLength(160);
    expect(createHash('sha256').update(inv.join('\n')).digest('hex')).toBe('024d53ceaf14bb9cbdd6452e6998a4e34898c9472fcc4b847cda90eb8b623873');
    expect(inv).toContain('ui:3267'); // n.onclick = …, the assignment form
  });
});

describe('parity rows', () => {
  const inv = ['store:settings', 'ui:15', 'code:16', 'ui:40'];
  const files: Record<string, string> = { 'lib/settings.ts': "load('settings')", 'tests/settings.test.ts': '', 'README.md': '' };
  const cites = {
    dropped: new Set(['Panel opacity']), extensionOnly: new Set(['Get the update']),
    readmeHeadings: ["Known behaviour, Phase 4b (note, don't test)"], specHeadings: ['GM replacements'], decisions: new Set(['P4-17']),
  };
  const ctx = { read: (p: string) => files[p] ?? null, readmeItems: new Set([35]), cites, release: false };
  const ok = [
    { id: 'store:settings', status: 'same', home: 'lib/settings.ts', readme: [35] },
    { lines: ['10-50'], status: 'dropped', cite: 'dropped.mjs: Panel opacity', note: 'the opacity slider' },
  ];
  const problems = (rows: unknown[], c = ctx, i = inv) => check(rows, i, c).join('\n');

  it('passes when every inventory item has exactly one row', () => expect(problems(ok)).toBe(''));

  it('names an inventory item with no row, and one with two', () => {
    expect(problems([ok[0]])).toMatch(/ui:15: no row/);
    expect(problems([...ok, { ...ok[0] }])).toMatch(/store:settings: 2 rows/);
  });

  it('refuses a row for something the userscript does not have, unless it is a manual feature: row', () => {
    const extra = { id: 'store:nope', status: 'same', home: 'lib/settings.ts', readme: [35] };
    expect(problems([...ok, extra])).toMatch(/store:nope: not in the inventory/);
    expect(problems([...ok, { ...extra, manual: true }])).toMatch(/not in the inventory/);
    expect(problems([...ok, { ...extra, id: 'feature:fab drag', manual: true }])).toBe('');
  });

  it('a home must exist and must contain the key', () => {
    expect(problems([{ ...ok[0], home: 'lib/gone.ts' }, ok[1]])).toMatch(/home lib\/gone\.ts does not exist/);
    expect(problems([{ ...ok[0], home: 'README.md' }, ok[1]])).toMatch(/"settings" does not occur in its home/);
  });

  it('same and changed need a proof: a README item, a test that exists, or a reason nothing can be seen', () => {
    expect(problems([{ ...ok[0], readme: undefined }, ok[1]])).toMatch(/needs a proof/);
    expect(problems([{ ...ok[0], readme: undefined, test: 'tests/settings.test.ts' }, ok[1]])).toBe('');
    expect(problems([{ ...ok[0], readme: undefined, test: 'tests/gone.test.ts' }, ok[1]])).toMatch(/test tests\/gone\.test\.ts does not exist/);
    expect(problems([{ ...ok[0], readme: undefined, unseen: 'a key with no UI' }, ok[1]])).toBe('');
    expect(problems([{ ...ok[0], readme: [999] }, ok[1]])).toMatch(/README item 999/);
  });

  it('changed and dropped need a cite that resolves', () => {
    expect(problems([{ ...ok[0], status: 'changed' }, ok[1]])).toMatch(/store:settings: changed needs a cite/);
    for (const cite of ['because', 'dropped.mjs: Not there', 'decision: P9-1', 'README: No such heading', 'spec: Nope']) {
      expect(problems([ok[0], { ...ok[1], cite }]), cite).toMatch(/10-50: dropped (needs a cite|cite .* resolves to nothing)/);
    }
    for (const cite of ['extension-only.mjs: Get the update', 'decision: P4-17', 'README: Known behaviour, Phase 4b', 'spec: GM replacements']) {
      expect(problems([ok[0], { ...ok[1], cite }]), cite).toBe('');
    }
  });

  it('a lines row names its feature, hits the inventory and stays small', () => {
    const drop = { lines: ['100-999'], status: 'dropped', cite: 'decision: P4-17', note: 'x' };
    expect(problems([ok[0], { ...ok[1], note: undefined }])).toMatch(/needs a note/);
    expect(problems([...ok, { ...drop, lines: ['60-70'] }])).toMatch(/60-70: covers no line/);
    const big = Array.from({ length: MAX_LINES + 1 }, (_, i) => 'code:' + (100 + i));
    expect(problems([drop], ctx, big)).toMatch(/151 lines in one row/);
    expect(problems([drop], ctx, Array.from({ length: 13 }, (_, i) => 'ui:' + (100 + i)))).toMatch(/13 handler lines in one row/);
    expect(problems([{ lines: ['100-999'], status: 'missing' }], ctx, big)).toBe(''); // a seeded row may be large
  });

  it('missing rows pass the structure check and fail the release check', () => {
    const rows = [{ id: 'store:settings', status: 'missing' }, ok[1]];
    expect(problems(rows)).toBe('');
    expect(problems(rows, { ...ctx, release: true })).toMatch(/store:settings: MISSING/);
  });

  it('renders one table line per row, missing ones first', () => {
    const md = render([ok[0], { id: 'ui:40', status: 'missing', note: 'x' }]);
    expect(md.indexOf('ui:40')).toBeLessThan(md.indexOf('store:settings'));
    expect(md).toContain('| `store:settings` | same | `lib/settings.ts` |  | 35 |');
  });
});
