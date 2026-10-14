import { afterEach, describe, expect, it, vi } from 'vitest';
import { failedByDraft, repairCascade } from '../lib/drafts';

const card = (id: string, status: string, draftId?: string) => ({ id, status, draftId });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('the failed videos, by what "Resume drafts" can do with them', () => {
  it('resumable: failed with a draft id no other card names; in queue order', () => {
    const r = failedByDraft([card('a', 'error', 'aaaaaaaaaaa'), card('b', 'pending'), card('c', 'error', 'ccccccccccc'), card('d', 'error')]);
    expect(ids(r.resumable)).toEqual(['a', 'c']);
    expect(ids(r.plain)).toEqual(['d']);
    expect(ids(r.shared)).toEqual([]);
  });

  it('a draft id on another card, whatever that card\'s status, is shared and not resumable', () => {
    const r = failedByDraft([card('a', 'error', 'xxxxxxxxxxx'), card('b', 'error', 'xxxxxxxxxxx'), card('c', 'error', 'yyyyyyyyyyy'), card('d', 'done', 'yyyyyyyyyyy')]);
    expect(ids(r.resumable)).toEqual([]);
    expect(ids(r.shared)).toEqual(['a', 'b', 'c']);
  });

  it('only failed videos: one waiting, uploading or done with a draft id is none of the three', () => {
    const r = failedByDraft([card('a', 'pending', 'aaaaaaaaaaa'), card('b', 'uploading', 'bbbbbbbbbbb'), card('c', 'done', 'ccccccccccc')]);
    expect([r.resumable, r.shared, r.plain].flat()).toEqual([]);
  });

  it('two failed videos without a draft id do not "share" one', () => {
    const r = failedByDraft([card('a', 'error'), card('b', 'error', '')]);
    expect(ids(r.plain)).toEqual(['a', 'b']);
    expect(ids(r.shared)).toEqual([]);
  });
});

// The owner's stored queue, 2026-10-14 (cards 118–130 and 134–143; 131–133 had no draft).
describe('the old cascade: draft ids on cards that never handed a file to Studio', () => {
  afterEach(() => vi.restoreAllMocks());
  const OLD = (id: string) => ` · The file is already uploaded as a draft (${id}). Delete it in Content before retrying to avoid duplicates`;
  const OLD_TH = (id: string) => ` · ไฟล์ขึ้นไปเป็นฉบับร่างแล้ว (${id}) ลบใน Content ก่อนกดลองใหม่ จะได้ไม่ซ้ำ`;
  const NEW = (id: string) => ` · The file is already a draft in Studio (${id}). Retry goes on with that draft, without uploading again`;
  const OPEN = 'An upload dialog is still open. Close it, then start again';
  const OPEN_TH = 'มีหน้าต่างอัปโหลดค้างอยู่ ปิดก่อนแล้วกดเริ่มใหม่';
  const FREED = ' · This file was not uploaded. Retry uploads it';
  const err = (n: number, msg: string, draftId?: string) => ({ n, status: 'error', msg, draftId });
  const stored = () => [
    err(118, 'Scheduling failed: Could not open the calendar' + OLD('M-A1h9Vno7M'), 'M-A1h9Vno7M'),
    ...Array.from({ length: 12 }, (_, k) => err(119 + k, OPEN + OLD('M-A1h9Vno7M'), 'M-A1h9Vno7M')),
    ...[131, 132, 133].map((n) => err(n, "Could not open Studio's upload dialog (Create button not found)")),
    err(134, 'Scheduling failed: Could not open the calendar' + OLD('Qp0seb9AdHY'), 'Qp0seb9AdHY'),
    ...Array.from({ length: 9 }, (_, k) => err(135 + k, OPEN + OLD('Qp0seb9AdHY'), 'Qp0seb9AdHY')),
  ];

  it('the cards that failed on "an upload dialog is still open" lose the id and say the file was not uploaded; the two that own a draft become resumable', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const q = stored();
    expect(failedByDraft(q).resumable).toEqual([]); // before: every draft id is on several cards
    expect(repairCascade(q)).toEqual({ freed: 21, reworded: 2 });
    const by = failedByDraft(q);
    expect(by.resumable.map((i) => i.n)).toEqual([118, 134]);
    expect(by.shared).toEqual([]);
    expect(by.plain).toHaveLength(24); // 21 freed + 131–133
    expect(q[0]).toEqual(err(118, 'Scheduling failed: Could not open the calendar' + NEW('M-A1h9Vno7M'), 'M-A1h9Vno7M'));
    expect(q[1]).toEqual(err(119, OPEN + FREED, ''));
    expect(q.every((i) => i.status === 'error' && !i.msg.includes('Delete it in Content'))).toBe(true);
    expect(q[13]!.msg).toBe("Could not open Studio's upload dialog (Create button not found)"); // 131: untouched
    expect(info.mock.calls).toEqual([['[ytup] draft retry: repaired 21 card(s) that never handed a file to Studio (draft id dropped), 2 message(s) reworded']]);
  });

  it('a second time changes nothing and logs nothing', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const q = stored();
    repairCascade(q);
    const once = structuredClone(q);
    info.mockClear();
    expect(repairCascade(q)).toEqual({ freed: 0, reworded: 0 });
    expect(q).toEqual(once);
    expect(info).not.toHaveBeenCalled();
  });

  it('the messages as an earlier build stored them in Thai', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const q = [err(1, 'ตั้งเวลาไม่สำเร็จ: เปิดปฏิทินไม่ได้' + OLD_TH('M-A1h9Vno7M'), 'M-A1h9Vno7M'), err(2, OPEN_TH + OLD_TH('M-A1h9Vno7M'), 'M-A1h9Vno7M')];
    expect(repairCascade(q)).toEqual({ freed: 1, reworded: 1 });
    expect(q[1]).toEqual(err(2, OPEN_TH + FREED, ''));
    expect(q[0]!.msg).toBe('ตั้งเวลาไม่สำเร็จ: เปิดปฏิทินไม่ได้' + NEW('M-A1h9Vno7M'));
  });

  it('two cards that both own a draft claim keep the id: still refused as shared', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const q = [err(1, 'Scheduling failed: x' + OLD('aaaaaaaaaaa'), 'aaaaaaaaaaa'), err(2, 'Could not go to the Visibility page' + OLD('aaaaaaaaaaa'), 'aaaaaaaaaaa')];
    repairCascade(q);
    expect(failedByDraft(q).shared).toHaveLength(2);
    expect(failedByDraft(q).resumable).toEqual([]);
  });

  it('a card of this build that met the same sentence while going on in its own draft keeps its draft id', () => {
    const q = [err(1, OPEN + NEW('aaaaaaaaaaa'), 'aaaaaaaaaaa')];
    expect(repairCascade(q)).toEqual({ freed: 0, reworded: 0 });
    expect(q[0]!.draftId).toBe('aaaaaaaaaaa');
  });

  it('only failed cards, only an ending that names the card\'s own id, and the sentence must be the whole message before it', () => {
    const q = [
      { n: 1, status: 'pending', msg: OPEN + OLD('aaaaaaaaaaa'), draftId: 'aaaaaaaaaaa' },
      err(2, OPEN + OLD('bbbbbbbbbbb'), 'ccccccccccc'),
      err(3, 'Thumbnail "x.jpg": ' + OPEN + OLD('ddddddddddd'), 'ddddddddddd'),
      err(4, OPEN + OLD('eeeeeeeeeee')),
      err(5, OPEN + OLD('fffffffffff') + ' · something a later build added', 'fffffffffff'), // not the ending: left as it is
    ];
    const was = structuredClone(q);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(repairCascade(q)).toEqual({ freed: 0, reworded: 1 }); // card 3 owns its draft: only its ending is reworded
    expect([q[0], q[1], q[3], q[4]]).toEqual([was[0], was[1], was[3], was[4]]);
    expect(q[2]).toEqual(err(3, 'Thumbnail "x.jpg": ' + OPEN + NEW('ddddddddddd'), 'ddddddddddd'));
  });
});
