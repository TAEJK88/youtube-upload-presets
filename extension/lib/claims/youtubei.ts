import { L } from '../i18n';
import { NO_SAPISID } from '../main-ops';
import { checkAnswer } from './answers';

// yti() as the copyright module calls it in the Studio tab: through the MAIN world
// (studio.content.ts sets the call through wireClaims; its rpcClient times out after 30 s, D22).
// The answer is page data: checked and copied before the module reads it (answers.ts).
type Call = (path: string, body: Record<string, unknown>) => Promise<unknown>;
let call: Call | null = null;
export const setYoutubei = (c: Call | null) => { call = c; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function yti(path: string, body: Record<string, unknown>): Promise<any> {
  if (!call) throw new Error(L('Studio ยังโหลดไม่เสร็จ ลองใหม่ในอีกไม่กี่วินาที', "Studio hasn't finished loading — try again in a few seconds"));
  let answer: unknown;
  try {
    answer = await call(path, body);
  } catch (e) {
    if ((e as Error)?.message === NO_SAPISID) throw new Error(L('ไม่ได้ล็อกอิน (ไม่พบคุกกี้ SAPISID)', 'Not signed in (SAPISID cookie not found)'));
    throw e;
  }
  return checkAnswer(path, answer);
}
