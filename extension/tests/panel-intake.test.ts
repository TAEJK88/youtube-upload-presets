import { describe, expect, it, vi } from 'vitest';
import { dropHandles, expandHandles, hasFiles, MAX_FOLDER_FILES, pickAttachments, pickFiles, pickFolder, PICK_ATTACH, sendFiles, storeHandles, TooManyFiles } from '../lib/panel/intake';

const file = (name: string) => ({ kind: 'file', name }) as unknown as FileSystemFileHandle;
const dir = (name: string, kids: unknown[]) => ({
  kind: 'directory', name,
  async *values() { yield* kids; },
}) as unknown as FileSystemDirectoryHandle;
// kids, inside `levels` folders: nest(3, …) puts them three folders below the one it returns.
const nest = (levels: number, kids: unknown[]): unknown[] => (levels ? [dir(`L${levels}`, nest(levels - 1, kids))] : kids);
const names = (hs: FileSystemFileHandle[]) => hs.map((h) => h.name).sort();
const picked = (tree: FileSystemDirectoryHandle) => pickFolder({ showDirectoryPicker: async () => tree } as unknown as Window);

describe('intake', () => {
  it('only a drag that carries files counts', () => {
    expect(hasFiles({ types: ['text/plain', 'Files'] } as unknown as DataTransfer)).toBe(true);
    expect(hasFiles({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
    expect(hasFiles(null)).toBe(false);
  });

  it('asks for every file handle before the first await (the drop data is emptied after)', () => {
    const get = vi.fn(async () => file('x.mp4'));
    const dt = { items: [{ kind: 'file', getAsFileSystemHandle: get }, { kind: 'string', getAsFileSystemHandle: get }, { kind: 'file', getAsFileSystemHandle: get }] };
    void dropHandles(dt as unknown as DataTransfer);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reads folders at every depth and skips hidden files inside them (the drawer\'s folder input, 3503)', async () => {
    const tree = dir('Mixes', [
      file('Mix 1.mp4'), file('.DS_Store'),
      dir('Covers', [file('Mix 1.jpg'), file('._Mix 1.jpg'), dir('Old', [file('Mix 3.mp4')])]),
    ]);
    const got = await expandHandles([tree, file('Mix 2.mp4'), null]);
    expect(names(got)).toEqual(['Mix 1.jpg', 'Mix 1.mp4', 'Mix 2.mp4', 'Mix 3.mp4']);
  });

  it('a dropped folder and a picked one give the same files: three, four and ten folders down', async () => {
    const tree = () => dir('Mixes', [
      file('Top.mp4'), file('notes.pdf'),
      ...nest(2, [file('Three.mp4'), file('.DS_Store')]),
      ...nest(3, [file('Four.mp4'), file('._Four.mp4'), file('Four.txt')]),
      ...nest(9, [file('Ten.mp4'), file('Ten.jpg'), file('.hidden.txt')]),
    ]);
    const want = ['Four.mp4', 'Four.txt', 'Ten.jpg', 'Ten.mp4', 'Three.mp4', 'Top.mp4', 'notes.pdf'];
    expect(names(await expandHandles([tree()]))).toEqual(want);
    expect(names(await picked(tree()))).toEqual(want);
  });

  it('a .txt and a thumbnail come along from other folders than their video (addFiles pairs by name alone)', async () => {
    const tree = dir('Mixes', [
      dir('video', [dir('2026', [dir('october', [file('Mix 7.mp4')])])]),
      dir('text', [file('Mix 7.txt')]),
      ...nest(5, [file('mix 7.JPG')]),
    ]);
    expect(names(await picked(tree))).toEqual(['Mix 7.mp4', 'Mix 7.txt', 'mix 7.JPG']);
  });

  it('a folder is read in the order its entries come, folders where they stand', async () => {
    const tree = dir('Mixes', [file('b.mp4'), dir('sub', [file('z.txt'), dir('deep', [file('a.mp4')])]), file('a.txt')]);
    expect((await expandHandles([file('first.mp4'), tree])).map((h) => h.name)).toEqual(['first.mp4', 'b.mp4', 'z.txt', 'a.mp4', 'a.txt']);
  });

  it('a folder with more files than the limit adds nothing and says so, dropped or picked', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => file(`f${i}.mp4`));
    const full = () => dir('Mixes', [...many(MAX_FOLDER_FILES - 1), file('.DS_Store'), ...nest(4, [file('last.mp4')])]);
    expect(await expandHandles([full()])).toHaveLength(MAX_FOLDER_FILES);
    expect(await picked(full())).toHaveLength(MAX_FOLDER_FILES);
    const over = () => dir('Mixes', [...many(MAX_FOLDER_FILES), ...nest(4, [file('one more.mp4')])]);
    await expect(expandHandles([over()])).rejects.toBeInstanceOf(TooManyFiles);
    await expect(picked(over())).rejects.toThrow(`more than ${MAX_FOLDER_FILES} files`);
    // Files dropped without a folder are never walked, so never counted.
    expect(await expandHandles(many(MAX_FOLDER_FILES + 1))).toHaveLength(MAX_FOLDER_FILES + 1);
  });

  it('hidden files dropped next to a folder are skipped too; dropped alone they are kept (filesFromDrop)', async () => {
    expect((await expandHandles([dir('Mixes', []), file('._Mix 2.mp4')])).map((h) => h.name)).toEqual([]);
    expect((await expandHandles([file('._Mix 2.mp4'), file('Mix 2.mp4')])).map((h) => h.name)).toEqual(['._Mix 2.mp4', 'Mix 2.mp4']);
  });

  it('stores each file under a fresh unguessable id', async () => {
    const put = vi.fn(async (_id: string, _h: FileSystemFileHandle) => {});
    const ids = await storeHandles([file('a.mp4'), file('b.mp4')], put);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(put.mock.calls.map(([id]) => id)).toEqual(ids);
  });

  it('sends the stored ids to the tab', async () => {
    const deliver = vi.fn(async (_ids: string[]) => {});
    const del = vi.fn(async () => {});
    expect(await sendFiles([file('a.mp4'), file('a.txt')], deliver, async () => {}, del)).toBe(2);
    expect(deliver.mock.calls[0]![0]).toHaveLength(2);
    expect(del).not.toHaveBeenCalled();
  });

  it('a tab that does not take the files gets them forgotten again', async () => {
    const del = vi.fn(async (_id: string) => {});
    const put = vi.fn(async (_id: string, _h: FileSystemFileHandle) => {});
    await expect(sendFiles([file('a.mp4'), file('b.mp4')], async () => { throw new Error('no receiver'); }, put, del)).rejects.toThrow('no receiver');
    expect(del.mock.calls.map(([id]) => id)).toEqual(put.mock.calls.map(([id]) => id));
    const deliver = vi.fn(async () => {});
    expect(await sendFiles([], deliver)).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('a store that fails halfway forgets what it did store', async () => {
    const del = vi.fn(async (_id: string) => {});
    let n = 0;
    const put = vi.fn(async () => { if (++n === 2) throw new Error('quota'); });
    const deliver = vi.fn(async () => {});
    await expect(sendFiles([file('a.mp4'), file('b.mp4')], deliver, put, del)).rejects.toThrow('quota');
    expect(deliver).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledOnce();
    expect(del.mock.calls[0]![0]).toBe((put.mock.calls[0] as unknown[])[0]);
  });

  it('a cancelled picker is no files, not an error', async () => {
    const abort = async () => { throw new DOMException('cancelled', 'AbortError'); };
    const win = { showOpenFilePicker: abort, showDirectoryPicker: abort } as unknown as Window;
    expect(await pickFiles(win)).toEqual([]);
    expect(await pickFolder(win)).toEqual([]);
    const broken = { showOpenFilePicker: async () => { throw new DOMException('no', 'SecurityError'); } } as unknown as Window;
    await expect(pickFiles(broken)).rejects.toThrow('no');
  });

  it('pickers: many files; attachments only .txt and images; a folder is read like a dropped one', async () => {
    const open = vi.fn(async () => [file('a.txt')]);
    const win = { showOpenFilePicker: open, showDirectoryPicker: async () => dir('Mixes', [file('Mix 1.mp4'), file('.DS_Store')]) } as unknown as Window;
    await pickAttachments(win);
    expect(open).toHaveBeenCalledWith({ multiple: true, types: PICK_ATTACH });
    expect(Object.values(PICK_ATTACH[0]!.accept).flat()).not.toContain('.mp4');
    expect((await pickFolder(win)).map((h) => h.name)).toEqual(['Mix 1.mp4']);
  });
});
