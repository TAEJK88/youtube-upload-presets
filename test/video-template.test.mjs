import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, makeLookup } from './harness.mjs';

const Y = String(new Date().getFullYear());
const TL = [
  '0:00 SZA - Snooze',
  '3:21 Brent Faiyaz - Dead Man Walking',
  '6:40 SZA - Good Days (ft. Jacob Collier)',
  '10:15 Kehlani - Folded',
].join('\n');
const TRAPSOUL = {
  title: `TrapSoul Mix | SZA, Brent Faiyaz - Dark R&B Playlist ${Y}`,
  description: `TrapSoul Mix | SZA, Brent Faiyaz - Dark R&B Playlist ${Y}\n\nTracklist:\n${TL}\n\n#trapsoul #rnb`,
  tags: ['trapsoul', 'SZA', 'kehlani', `r&b playlist ${Y}`],
  publishedYear: Y,
};
// แปลงผลที่เรียนรู้ให้เป็นรูปแบบพรีเซ็ต แล้วเรนเดอร์ด้วยฟังก์ชันจริงของสคริปต์
const asPreset = (l) => ({ ...l, id: 'v:abc', label: 'x', visibility: 'PRIVATE' });
const renderWith = (l, file, txt) => {
  const p = asPreset(l);
  const vars = S.buildVars(file, 1, txt, { preset: p });
  return { title: S.makeTitle(p, vars), description: S.renderDesc(p, vars), tags: S.renderTags(p, vars) };
};

test('learnTemplate round-trips a TrapSoul video through its own tracklist', () => {
  const l = S.learnTemplate(TRAPSOUL);
  assert.equal(l.title, 'TrapSoul Mix[[ | {artists}]] - Dark R&B Playlist {year}');
  assert.equal(l.txt, TL);
  assert.deepEqual(l.warnings, []);
  const out = renderWith(l, 'clip01.mp4', l.txt);
  assert.equal(out.title, TRAPSOUL.title);
  assert.equal(out.description, TRAPSOUL.description);
});

test('a learned pattern fills in a new tracklist', () => {
  const l = S.learnTemplate(TRAPSOUL);
  const tl2 = '0:00 Kehlani - Folded\n3:00 Summer Walker - Girls Need Love\n6:00 Kehlani - Nights Like This';
  assert.equal(renderWith(l, 'clip07.mp4', tl2).title, `TrapSoul Mix | Kehlani, Summer Walker - Dark R&B Playlist ${Y}`);
});

test('the title artists become the priority and the artist count', () => {
  const l = S.learnTemplate(TRAPSOUL);
  assert.deepEqual(l.artistPriority, ['SZA', 'Brent Faiyaz']);
  assert.equal(l.artistMax, 2);
});

test('the tracklist heading goes into the optional block with {txt}', () => {
  assert.match(S.learnTemplate(TRAPSOUL).description, /\[\[Tracklist:\n\{txt\}\]\]/);
});

test('a clip without a .txt gets no dangling separators', () => {
  const out = renderWith(S.learnTemplate(TRAPSOUL), 'clip02.mp4', '');
  assert.equal(out.title, `TrapSoul Mix - Dark R&B Playlist ${Y}`);
  assert.equal(out.description, `TrapSoul Mix - Dark R&B Playlist ${Y}\n\n#trapsoul #rnb`);
});

test('artists at the start of the title take the separator after them', () => {
  const l = S.learnTemplate({ title: 'SZA, Kehlani | R&B Playlist (4 Songs)', description: TL, tags: [], publishedYear: '2025' });
  assert.equal(l.title, '[[{artists} | ]]R&B Playlist[[ ({trackcount} Songs)]]');
  assert.equal(renderWith(l, 'a.mp4', l.txt).title, 'SZA, Kehlani | R&B Playlist (4 Songs)');
  assert.equal(renderWith(l, 'b.mp4', '').title, 'R&B Playlist');
});

test('a type-beat title learns the quoted beat name and an optional BPM', () => {
  const l = S.learnTemplate({
    title: '[FREE] Thai Type Beat - "Midnight" | 140 BPM',
    description: '[FREE] Thai Type Beat - "Midnight"\nBPM: 140\nProd. by X',
    tags: ['type beat'], publishedYear: '2025',
  });
  assert.equal(l.title, '[FREE] Thai Type Beat - "{name}"[[ | {bpm} BPM]]');
  assert.equal(l.description, '[FREE] Thai Type Beat - "{name}"\n[[BPM: {bpm}]]\nProd. by X');
  assert.equal(renderWith(l, 'Midnight 140bpm.mp4', '').title, '[FREE] Thai Type Beat - "Midnight" | 140 BPM');
  assert.equal(renderWith(l, 'Sunrise.mp4', '').title, '[FREE] Thai Type Beat - "Sunrise"');
});

test('only the publish year or this year becomes {year}', () => {
  const l = S.learnTemplate({ title: 'Throwback 2019 Mix 2025', description: '', tags: ['mix 2019'], publishedYear: '2025' });
  assert.equal(l.title, 'Throwback 2019 Mix {year}');
  assert.deepEqual(l.tags, ['mix 2019']);
});

test('artist tags collapse into one {artists} tag', () => {
  assert.deepEqual(S.learnTemplate(TRAPSOUL).tags, ['trapsoul', '{artists}', 'r&b playlist {year}']);
});

test('no tracklist: artists stay as text and a warning is returned', () => {
  const l = S.learnTemplate({ title: 'Mix | SZA - Dark R&B', description: 'no stamps here', tags: ['SZA'], publishedYear: '2025' });
  assert.equal(l.title, 'Mix | SZA - Dark R&B');
  assert.deepEqual(l.tags, ['SZA']);
  assert.ok(l.warnings.includes('no-tracklist'));
});

test('a title with no variables is flagged', () => {
  assert.ok(S.learnTemplate({ title: 'Just a vlog', description: '', tags: [], publishedYear: '2025' }).warnings.includes('static-title'));
});

// ----- pickTopVideos -----
const NOW = Date.UTC(2026, 9, 5);
const DAY = 864e5;
// รูปแบบตาม list_creator_videos (ยืนยันชื่อ field ใน Task 1)
const vid = (id, views, daysAgo, privacy = 'VIDEO_PRIVACY_PUBLIC') => ({
  videoId: id, title: 'T ' + id, privacy,
  timePublishedSeconds: daysAgo == null ? '0' : String(Math.floor((NOW - daysAgo * DAY) / 1000)),
  metrics: { viewCount: String(views) },
});

test('pickTopVideos keeps public videos from the last 6 months, sorted by views', () => {
  const out = S.pickTopVideos([
    vid('a', 100, 10), vid('b', 900, 30), vid('old', 99999, 200),
    vid('priv', 5000, 5, 'VIDEO_PRIVACY_PRIVATE'), vid('draft', 7000, null), vid('c', 500, 170),
  ], NOW);
  assert.deepEqual(out.map((v) => v.videoId), ['b', 'c', 'a']);
  assert.deepEqual(out[0], { videoId: 'b', title: 'T b', views: 900, at: Math.floor((NOW - 30 * DAY) / 1000) * 1000 });
});

test('pickTopVideos returns at most n videos', () => {
  const many = Array.from({ length: 15 }, (_, i) => vid('v' + i, i, 1));
  const out = S.pickTopVideos(many, NOW);
  assert.equal(out.length, 10);
  assert.equal(out[0].videoId, 'v14');
});

test('pickTopVideos copes with an empty or missing list', () => {
  assert.deepEqual(S.pickTopVideos(undefined, NOW), []);
  assert.deepEqual(S.pickTopVideos([], NOW), []);
});

// ----- presetById / videoTemplates -----
const PRESETS = [{ id: 'trapsoul', label: 'TrapSoul' }, { id: 'playlist', label: 'Playlist' }];
const TPL = { id: 'v:abc', label: '📈 Top', title: '{artists}', description: '', tags: [] };

test('presetById resolves a stored video template', () => {
  const lk = makeLookup({ presets: PRESETS, store: { 'videoTemplates:UCtest': { 'v:abc': TPL } } });
  assert.equal(lk.presetById('v:abc'), TPL);
  assert.equal(lk.presetById('playlist').id, 'playlist');
});

test('presetById falls back to the first preset for a missing video template', () => {
  const lk = makeLookup({ presets: PRESETS });
  assert.equal(lk.presetById('v:gone').id, 'trapsoul');
  assert.equal(lk.presetById('nope').id, 'trapsoul');
});

test('video templates are kept per channel', () => {
  const store = { 'videoTemplates:UCone': { 'v:abc': TPL } };
  const lk = makeLookup({ presets: PRESETS, store, channelId: 'UCone' });
  assert.equal(lk.presetById('v:abc'), TPL);
  lk.ch.id = 'UCtwo';
  assert.equal(lk.presetById('v:abc').id, 'trapsoul');
  lk.videoTemplates()['v:xyz'] = { ...TPL, id: 'v:xyz' };
  lk.saveVideoTemplates();
  assert.deepEqual(Object.keys(store['videoTemplates:UCtwo']), ['v:xyz']);
  assert.deepEqual(Object.keys(store['videoTemplates:UCone']), ['v:abc']);
});

test('ownId keeps user presets and maps anything else to the first preset', () => {
  const lk = makeLookup({ presets: PRESETS });
  assert.equal(lk.ownId('playlist'), 'playlist');
  assert.equal(lk.ownId('v:abc'), 'trapsoul');
  assert.equal(lk.isVideoId('v:abc'), true);
  assert.equal(lk.isVideoId('trapsoul'), false);
});
