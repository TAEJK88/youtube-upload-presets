import { pad } from '../template';

// Formatting the drawer used on cards (3746, 3874). The runner's own pure helpers are
// re-exported: importing lib/studio/queue-runner runs no page code, it only defines functions.
export const fmtSize = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');
export const fmtDur = (sec: number) => {
  const t = Math.round(sec), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss);
};
export { fmtWhen, isImg, isTxt, isVideo, readText, statusLabel, toLocalInput } from '../studio/queue-runner';
