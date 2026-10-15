import { NO_SAPISID, YTI_PATHS } from './main-ops';

// Runs in Studio's MAIN world (studio-main.content.ts): the copyright module's calls to Studio's
// own API (/youtubei/v1). `W` / `ycfg` as the userscript had them (4621–4622); `W` is the page's
// window (globalThis, so tests can import this module outside a DOM).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W = globalThis as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ycfg = (k: string): any => W.ytcfg && W.ytcfg.get(k);

  async function authHeader(): Promise<string> {
    const m = document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
    if (!m) throw new Error(NO_SAPISID);
    const ts = Math.floor(Date.now() / 1000);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${m[1]} https://studio.youtube.com`));
    return `SAPISIDHASH ${ts}_${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  async function yti(path: string, body: Record<string, unknown>) {
    const ctx = JSON.parse(JSON.stringify(ycfg('INNERTUBE_CONTEXT')));
    const dc = ycfg('DELEGATION_CONTEXT');
    const pageId = ycfg('DELEGATED_SESSION_ID');
    ctx.user = Object.assign({}, ctx.user, dc ? { delegationContext: dc } : {}, pageId ? { onBehalfOfUser: pageId } : {});
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
      'X-Origin': 'https://studio.youtube.com',
      'X-Goog-AuthUser': String(ycfg('SESSION_INDEX') || 0),
      'X-Youtube-Client-Name': String(ycfg('INNERTUBE_CONTEXT_CLIENT_NAME')),
      'X-Youtube-Client-Version': ycfg('INNERTUBE_CONTEXT_CLIENT_VERSION'),
    };
    if (pageId) headers['X-Goog-PageId'] = pageId;
    const res = await W.fetch(`/youtubei/v1/${path}?alt=json`, {
      method: 'POST', credentials: 'include', headers, body: JSON.stringify(Object.assign({ context: ctx }, body)),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`${path}: ${res.status} ${(j.error && j.error.message) || ''}`);
    return j;
  }

// What the MAIN world serves: the allowlisted endpoints only (D22), with a plain-object body
// (what postMessage clones from the content script's object literals). The page could call the
// API itself; this script just answers nothing else.
const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export async function youtubei(path: string, body: Record<string, unknown>): Promise<unknown> {
  if (!(YTI_PATHS as readonly string[]).includes(path)) throw new Error(`youtubei: ${path} is not allowed`);
  if (!isPlain(body)) throw new Error('youtubei: the body must be an object');
  return yti(path, body);
}
