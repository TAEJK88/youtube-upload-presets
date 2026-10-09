import { DESC_MAX, TITLE_MAX, VARS, VIDEO_EXT } from './constants';
import type { Preset } from './presets';

export const pad = (x: number | string) => String(x).padStart(2, '0');

// Reads a tracklist: "01:03:05 Kehlani - Folded (Cover by BLXD)" → song + artists
export function parseTracks(txt: unknown, priority: string[] = []) {
  const tracks = String(txt || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s*[-–|]?\s*/, '').replace(/^\d{1,3}\.\s*/, '').trim())
    .filter(Boolean);
  const count = new Map<string, { name: string; n: number; first: number }>(); // lower-case key → { name, n, first }
  const add = (raw: string) => {
    for (const a of raw.split(/\s+(?:x|ft\.?|feat\.?|&|and)\s+|,\s*/i)) {
      const name = a.replace(/^(?:ft\.?|feat\.?)\s+/i, '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const c = count.get(key) || { name, n: 0, first: count.size };
      c.n++;
      count.set(key, c);
    }
  };
  for (const t of tracks) {
    const [artistPart, ...rest] = t.split(/\s[-–]\s/);
    if (!rest.length) continue;
    add(artistPart!);
    // featured artists in the song title, e.g. "Waiting On Me (ft. Brent Faiyaz)"
    const song = rest.join(' - ');
    const feat = song.match(/\((?:ft\.?|feat\.?)\s+([^)]+)\)/i) || song.match(/\s(?:ft\.?|feat\.?)\s*([^()]+)$/i);
    if (feat) add(feat[1]!);
  }
  const prio = priority.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  const rank = (c: { name: string }) => {
    const i = prio.indexOf(c.name.toLowerCase());
    return i === -1 ? Infinity : i;
  };
  const artistList = [...count.values()]
    .sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.first - b.first)
    .map((c) => c.name);
  return { track1: tracks[0] || '', trackcount: tracks.length ? String(tracks.length) : '', artistList };
}

export interface VarsEnv { year: string; producer: string; channelName: string }
// preset = the preset in use (artistPriority / artistMax); artists = names typed on the queue card
export interface BuildOpts { preset?: Partial<Preset>; artists?: string }
export interface Vars {
  name: string; filename: string; bpm: string; n: string; date: string; year: string; producer: string;
  txt: string; track1: string; trackcount: string; artists: string;
  _artists: string[]; // internal: used to shorten titles that run over TITLE_MAX
  [k: string]: unknown;
}

export function buildVars(
  rawName: unknown, n: number | string, txt: unknown = '', opt: BuildOpts = {},
  env: VarsEnv = { year: '', producer: '', channelName: '' },
): Vars {
  const base = String(rawName || '').replace(VIDEO_EXT, '').trim();
  const bpm = (base.match(/(\d{2,3})\s*bpm/i) || [])[1] ?? '';
  const name = base
    .replace(/(\d{2,3})\s*bpm/gi, '')
    .replace(/_+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–|,.]+|[\s\-–|,.]+$/g, '');
  const d = new Date();
  const p = opt.preset || {};
  const { artistList, ...tr } = parseTracks(txt, p.artistPriority || []);
  const max = Math.max(1, Number(p.artistMax) || 4);
  const manual = (opt.artists || '').trim();
  const shown = manual ? [] : artistList.slice(0, max);
  return {
    name: name || base,
    filename: base,
    bpm,
    n: String(n),
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    year: String(env.year || d.getFullYear()),
    producer: env.producer || env.channelName,
    txt: String(txt || '').replace(/\r\n/g, '\n').trim(),
    ...tr,
    artists: manual || shown.join(', '),
    _artists: shown,
  };
}

export function render(tpl: unknown, vars: Record<string, unknown>): string {
  return String(tpl || '')
    .replace(/\[\[([\s\S]*?)\]\]/g, (_, inner: string) => {
      const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
      return keys.every((k) => vars[k]) ? inner : '';
    })
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
    .replace(/\n{3,}/g, '\n\n');
}

// YouTube rejects < and > in titles and descriptions
export const clean = (s: unknown) => String(s).replace(/[<>]/g, '');
export const renderTitle = (tpl: unknown, vars: Record<string, unknown>) => clean(render(tpl, vars)).replace(/\s+/g, ' ').trim();

// Title over 100 characters → drop one artist at a time until it fits
export function makeTitle(p: Pick<Preset, 'title'>, vars: Vars): string {
  let t = renderTitle(p.title, vars);
  for (let k = vars._artists.length - 1; t.length > TITLE_MAX && k >= 1; k--) {
    t = renderTitle(p.title, { ...vars, artists: vars._artists.slice(0, k).join(', ') });
  }
  return t.slice(0, TITLE_MAX);
}

// render() leaves unknown variables in place ({artist} typo would reach YouTube) → warn in the preview
export const unknownVars = (p: Partial<Preset>) =>
  [...new Set([p.title || '', p.description || '', ...(p.tags || [])].join('\n').match(/\{\w+\}/g) || [])]
    .filter((v) => !VARS.includes(v.slice(1, -1)));

export const renderTags = (p: Partial<Preset>, vars: Record<string, unknown>) => [
  ...new Set(
    (p.tags || [])
      .flatMap((t) => render(t, vars).split(/,|\s+x\s+/i))
      .map((t) => clean(t).trim())
      .filter(Boolean),
  ),
];

// A preset without {txt} still gets the clip's .txt appended to the description
export function renderDescFull(p: Partial<Preset>, vars: Record<string, unknown>): string {
  let d = render(p.description, vars).trim();
  if (vars.txt && !/\{txt\}/.test(p.description || '')) d = d ? `${d}\n\n${vars.txt}` : String(vars.txt);
  return clean(d);
}
export const renderDesc = (p: Partial<Preset>, vars: Record<string, unknown>) => renderDescFull(p, vars).slice(0, DESC_MAX);
