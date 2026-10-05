import type { Visibility } from './constants';
import { L } from './i18n';

export interface Preset {
  id: string;
  label: string;
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  artistPriority?: string[];
  artistMax?: number;
}

export const visLabels = (): Record<Visibility, string> => ({
  PRIVATE: L('🔒 ส่วนตัว', '🔒 Private'),
  UNLISTED: L('🔗 ไม่เป็นสาธารณะ', '🔗 Unlisted'),
  PUBLIC: L('🌐 สาธารณะ', '🌐 Public'),
});

// A function (not a constant) because the labels depend on the language, which is
// only known after initI18n(). Every call returns fresh objects.
// [[ ... ]] = optional block, dropped when any variable inside it is empty.
export const defaultPresets = (): Preset[] => [
  {
    id: 'trapsoul',
    label: '🌑 TrapSoul Mix',
    title: 'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
    description: [
      'TrapSoul Mix[[ | {artists}]] - Dark & Smokey R&B Playlist {year}',
      '',
      '[[Tracklist:\n{txt}]]',
      '',
      '#trapsoul #rnb #rnbplaylist #darkrnb',
    ].join('\n'),
    tags: ['trapsoul', 'trapsoul mix', 'dark r&b', 'smokey r&b', 'r&b playlist', 'r&b playlist {year}', '{artists}'],
    visibility: 'PRIVATE',
    // Artists listed here sort first (only those present in the tracklist); the rest by track count.
    artistPriority: ['SZA', 'Chris Brown', 'Summer Walker', 'Bryson Tiller', 'Brent Faiyaz', 'Kehlani', 'Ella Mai', 'Nessy J.', 'BLXD'],
    artistMax: 4,
  },
  {
    id: 'playlist',
    label: '🎧 Playlist + Tracklist',
    title: '{artists} | R&B Playlist[[ ({trackcount} Songs)]]',
    description: '🎧 {artists}\n\nTracklist:\n{txt}\n\n#rnb #playlist #rnbplaylist',
    tags: ['rnb', 'r&b playlist', 'rnb playlist', '{artists}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'typebeat',
    label: '🔥 Type Beat (FREE)',
    title: '[FREE] Thai Type Beat - "{name}"[[ | {bpm} BPM]]',
    description: [
      '[FREE] Thai Type Beat - "{name}"',
      '[[BPM: {bpm}]]',
      'Prod. by {producer}',
      '',
      L('💰 ซื้อบีท / Lease: (ใส่ลิงก์)', '💰 Buy / lease this beat: (add link)'),
      L('📩 ติดต่องาน: (ใส่อีเมล)', '📩 Business inquiries: (add email)'),
      '',
      L('⚠️ ใช้ฟรีแบบไม่แสวงหากำไร ต้องให้เครดิต (prod. {producer})', '⚠️ Free for non-profit use only — credit required (prod. {producer})'),
      '',
      '#typebeat #thaibeat #freebeat',
    ].join('\n'),
    tags: ['type beat', 'thai type beat', 'free beat', 'thai beat', 'instrumental', '{name}', '{producer}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'lofi',
    label: '🌙 Lofi Chill',
    title: L('{name} 🌙 Thai Lofi Chill Beat สำหรับอ่านหนังสือ / ทำงาน', '{name} 🌙 Lofi Chill Beat to Study / Work To'),
    description: L('{name} — บีทชิล ๆ สำหรับอ่านหนังสือ ทำงาน หรือพักผ่อน ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #thailofi', '{name} — chill beats to study, work or relax to ☕\n\nProd. by {producer}\n\n#lofi #chillbeats #studymusic'),
    tags: ['lofi', 'thai lofi', 'chill beat', 'study music', L('เพลงอ่านหนังสือ', 'music to study to'), '{producer}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'shorts',
    label: '📱 Shorts',
    title: '{name} 🔥 #shorts #thaibeat',
    description: '{name}[[ | {bpm} BPM]]\nProd. by {producer}\n\n#shorts #beat #producer',
    tags: ['shorts', 'beat', 'producer', 'thai beat'],
    visibility: 'PRIVATE',
  },
  {
    id: 'instrumental',
    label: '🎹 Instrumental',
    title: '{name} - Instrumental (Prod. {producer})',
    description: '{name} (Instrumental)\nProd. by {producer}\n© {year} {producer}',
    tags: ['instrumental', 'beat', '{name}', '{producer}'],
    visibility: 'PRIVATE',
  },
  {
    id: 'series',
    label: L('📺 ทำบีทสด EP', '📺 Beat Making EP'),
    title: L('ทำบีทสด EP.{n} - {name}[[ ({bpm} BPM)]]', 'Making a Beat EP.{n} - {name}[[ ({bpm} BPM)]]'),
    description: L('ทำบีทสด EP.{n} — {name}\nอัปโหลดเมื่อ {date}\n\nProd. by {producer}', 'Making a Beat EP.{n} — {name}\nUploaded {date}\n\nProd. by {producer}'),
    tags: [L('ทำบีท', 'making beats'), 'beat making', 'cook up', 'producer', '{producer}'],
    visibility: 'PRIVATE',
  },
];
