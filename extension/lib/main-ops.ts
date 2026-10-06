// The MAIN-world script is the only code that can see Studio's own `ytcfg`.
// It exposes a deliberately tiny API over window.postMessage.
export const MAIN_CH = 'ytup:main';

export type MainOps = {
  getCfg(keys: string[]): Record<string, unknown>;
};
