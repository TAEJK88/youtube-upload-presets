import { describe, expect, it } from 'vitest';
import { mp4Duration } from '../lib/chapters';

function box(type: string, payload: Uint8Array): Uint8Array {
  const b = new Uint8Array(8 + payload.length);
  new DataView(b.buffer as ArrayBuffer).setUint32(0, b.length);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  b.set(payload, 8);
  return b;
}
// mvhd version 0: version+flags, creation, modification, timescale, duration (4 bytes each)
function mvhd(timescale: number, duration: number): Uint8Array {
  const p = new Uint8Array(20);
  const dv = new DataView(p.buffer);
  dv.setUint32(12, timescale);
  dv.setUint32(16, duration);
  return box('mvhd', p);
}

describe('mp4Duration', () => {
  it('reads the duration from moov > mvhd', async () => {
    const file = new Blob([box('ftyp', new Uint8Array(8)) as BlobPart, box('moov', mvhd(1000, 754_000)) as BlobPart]);
    expect(await mp4Duration(file)).toBe(754);
  });

  // An mvhd header whose box claims 40 bytes but the moov only holds `size` of them.
  const truncatedMvhd = (size: number, version: number) => {
    const p = new Uint8Array(size);
    const dv = new DataView(p.buffer);
    dv.setUint32(0, 40);
    for (let i = 0; i < 4; i++) p[4 + i] = 'mvhd'.charCodeAt(i);
    if (size > 8) p[8] = version;
    return box('moov', p);
  };

  it('returns 0 instead of throwing for a truncated mvhd', async () => {
    const ftyp = box('ftyp', new Uint8Array(8)) as BlobPart;
    expect(await mp4Duration(new Blob([ftyp, truncatedMvhd(8, 0) as BlobPart]))).toBe(0); // no version byte
    expect(await mp4Duration(new Blob([ftyp, truncatedMvhd(12, 0) as BlobPart]))).toBe(0); // v0 fields cut off
    expect(await mp4Duration(new Blob([ftyp, truncatedMvhd(32, 1) as BlobPart]))).toBe(0); // v1 duration cut off
  });

  it('finds moov after mdat (moov at the end of the file)', async () => {
    const file = new Blob([box('ftyp', new Uint8Array(8)) as BlobPart, box('mdat', new Uint8Array(4096)) as BlobPart, box('moov', mvhd(600, 1800)) as BlobPart]);
    expect(await mp4Duration(file)).toBe(3);
  });

  it('returns 0 for a file that is not MP4', async () => {
    expect(await mp4Duration(new Blob(['just some text, not boxes']))).toBe(0);
  });
});
