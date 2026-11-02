// A small JPEG of a thumbnail, kept on its queue item for the side panel's card. The card can't
// count on reading the file itself: Chrome withdraws read access once no page holds the handle
// (a reopened panel, a finished upload), and a file picked in Studio's dialog lives in the tab only.
const W = 184; // the card's 92×52 box at 2×
const H = 104;

export async function thumbPreview(file: Blob): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.max(W / bmp.width, H / bmp.height); // cover, like the card's object-cover
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d')!.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    bmp.close();
    return c.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    console.warn('[ytup] thumbnail preview', e); // the card falls back to reading the file
    return undefined;
  }
}
