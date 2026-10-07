import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEL } from '../lib/studio/sel';
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
