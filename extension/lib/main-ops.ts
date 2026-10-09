// The MAIN-world script is the only code that can see Studio's own `ytcfg`.
// It exposes a deliberately tiny API over window.postMessage.
export const MAIN_CH = 'ytup:main';

export type MainOps = {
  getCfg(keys: string[]): Record<string, unknown>;
} & MainOpsYoutubei;

// Studio's internal API, for the copyright module (D22): MAIN-world ytcfg and cookies.
export type MainOpsYoutubei = { youtubei(path: string, body: Record<string, unknown>): unknown };
// The endpoints the copyright module calls (user.js 4722, 4748, 4784, 4796, 5373, 5789, 6026).
export const YTI_PATHS = [
  'creator/list_creator_videos', 'creator/list_creator_received_claims',
  'copyright/get_creator_received_claim_matches', 'creator/get_creator_videos',
] as const;
// authHeader()'s "not signed in" (4657): the MAIN world has no language, the tab says it in L().
export const NO_SAPISID = 'ytup:no-sapisid';
