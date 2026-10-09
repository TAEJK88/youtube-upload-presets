// The side panel only makes sense next to YouTube Studio.
export function isStudioUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === 'studio.youtube.com';
  } catch {
    return false;
  }
}
