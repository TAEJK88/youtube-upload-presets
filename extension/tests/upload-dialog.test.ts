import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEL } from '../lib/studio/sel';
import { settings } from '../lib/studio/state';
import * as ud from '../lib/studio/upload-dialog';
import { checkSelectors, diagnoseUploadDialog, dialogError, setThumbnail, thumbUnusable, uploadProgressText } from '../lib/studio/upload-dialog';
// @ts-expect-error -- untyped test helper shared with the ported DOM tests
import { makeDocument } from './fake-dom.mjs';

// Most of this module drives Studio's real upload dialog and is checked by hand on
// Studio. These pin the parts that decide without it.
beforeEach(() => vi.stubGlobal('document', makeDocument()));
afterEach(() => vi.unstubAllGlobals());

const file = (name: string, size: number) => ({ name, size }) as File;

describe('thumbnails Studio will never take', () => {
  it('are over 2 MB or not JPG / PNG / GIF / BMP', () => {
    expect(thumbUnusable(file('a.jpg', 2 * 1024 * 1024))).toBe(false);
    expect(thumbUnusable(file('a.jpg', 2 * 1024 * 1024 + 1))).toBe(true);
    expect(thumbUnusable(file('a.webp', 10))).toBe(true);
    expect(thumbUnusable(file('a.PNG', 10))).toBe(false);
  });

  it('are refused with a reason before touching the page', async () => {
    expect(await setThumbnail(file('big.jpg', 3 * 1048576))).toBe('Thumbnail is larger than 2MB (3.0 MB)');
    expect(await setThumbnail(file('a.webp', 10))).toBe('Unsupported file type. Use JPG / PNG / GIF / BMP');
    expect(await setThumbnail(file('a.jpg', 10))).toBe('Upload dialog not found');
  });
});

describe('with no upload dialog open', () => {
  it('reports nothing in progress and no error', () => {
    expect(uploadProgressText()).toBe('');
    expect(dialogError()).toBe('');
  });

  it('the diagnostic says to open the details page first', () => {
    expect(diagnoseUploadDialog()).toEqual({
      error: 'Details page is not open yet — select a file in the upload dialog first, then try again',
    });
  });

  it('checkSelectors lists every SEL key as missing', () => {
    const { missing, broken } = checkSelectors();
    expect(broken).toEqual([]);
    expect(new Set(missing)).toEqual(new Set(Object.keys(SEL)));
  });
});

// injectUploadFile hands the page a file the way a user would: files on the hidden
// input plus a change event, then (if Studio ignores that) a synthetic drop. The runner
// relies on injectingFile being true for exactly that long.
describe('injectUploadFile', () => {
  class FakeDataTransfer {
    list: File[] = [];
    items = { add: (f: File) => void this.list.push(f) };
    get files() { return this.list; }
  }
  class FakeDragEvent {
    constructor(public type: string, public init: Record<string, unknown>) {}
    get bubbles() { return !!this.init.bubbles; }
  }

  // ytcp-uploads-dialog > ytcp-uploads-file-picker > (#content, input[name=Filedata])
  function openPicker() {
    const doc = makeDocument();
    vi.stubGlobal('document', doc);
    const dlg = doc.createElement('ytcp-uploads-dialog');
    const picker = doc.createElement('ytcp-uploads-file-picker');
    const zone = doc.createElement('div');
    zone.setAttribute('id', 'content');
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10 });
    const input = doc.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('name', 'Filedata');
    picker.append(zone, input);
    dlg.append(picker);
    doc.body.append(dlg);
    return { picker, zone, input };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('DataTransfer', FakeDataTransfer);
    vi.stubGlobal('DragEvent', FakeDragEvent);
    settings.pace = 'normal';
  });
  afterEach(() => {
    vi.useRealTimers();
    settings.pace = 'slow';
  });

  it('sets files on input[name=Filedata] and fires change; injectingFile is true meanwhile, false after', async () => {
    const { picker, input } = openPicker();
    const f = new File(['x'], 'clip.mp4');
    const seen: { files: unknown; flag: boolean; bubbles: boolean }[] = [];
    input.addEventListener('change', (ev: unknown) => {
      seen.push({ files: (input as unknown as { files: unknown }).files, flag: ud.injectingFile, bubbles: (ev as Event).bubbles });
      (picker as unknown as { hidden: boolean }).hidden = true; // Studio accepted: the picker goes away
    });
    expect(ud.injectingFile).toBe(false);
    const done = ud.injectUploadFile(input as unknown as HTMLInputElement, f);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await done).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ flag: true, bubbles: true });
    expect(seen[0]!.files).toEqual([f]);
    expect(ud.injectingFile).toBe(false);
  });

  it('falls back to a drop and returns false when Studio never accepts; injectingFile is false again', async () => {
    const { zone, input } = openPicker();
    const f = new File(['x'], 'clip.mp4');
    let changes = 0;
    input.addEventListener('change', () => { changes++; });
    const drops: string[] = [];
    for (const t of ['dragenter', 'dragover', 'drop']) zone.addEventListener(t, (ev: unknown) => void drops.push((ev as { type: string }).type));
    const done = ud.injectUploadFile(input as unknown as HTMLInputElement, f);
    let flagDuring = false;
    await vi.advanceTimersByTimeAsync(1000);
    flagDuring = ud.injectingFile;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await done).toBe(false);
    expect(flagDuring).toBe(true);
    expect(changes).toBe(3); // three rounds of files + change
    expect(drops).toEqual(['dragenter', 'dragover', 'drop']);
    expect(ud.injectingFile).toBe(false);
  });
});
