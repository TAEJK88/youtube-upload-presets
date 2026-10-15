import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { songsCsvRows } from '@/lib/claims/core';
import { SONGS_CSV_MAX } from '@/lib/claims/ops';
import { importSongs } from '@/lib/claims/songs';
import { L, locale } from '@/lib/i18n';
import { claimsWrite, type ClaimsData } from '@/lib/panel/claims-data';
import { songList, type SongSort } from '@/lib/panel/claims';
import { downloadCsv } from '@/lib/panel/download';
import { TextField } from '../../fields';
import { saveFailed } from '../../save-failed';
import { SubView } from './SubView';

// showSongs() (5190–5251): search, sort, delete one (asks once), delete all (asks once), CSV in
// and out. One card per song (D23). The history is every channel's; its writes are `songs` ops.
export function Songs({ data }: { data: ClaimsData }) {
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<SongSort>('count');
  const [armed, setArmed] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const total = Object.keys(data.songs).length;
  const list = songList(data.songs, q, sortBy);
  // importSongsCSV() (5137–5164): the background adds the rows; the count is worked out here too.
  const importFile = async (f: File) => {
    // Refused before it is read: the background refuses the same size (isSongsOp).
    if (f.size > SONGS_CSV_MAX) return void toast(L(`ไฟล์ใหญ่เกินไป — นำเข้าได้ไม่เกิน ${SONGS_CSV_MAX / 1048576} MB`, `This file is too large — the limit is ${SONGS_CSV_MAX / 1048576} MB`));
    let text: string;
    try {
      text = await f.text();
    } catch (e) {
      console.error('[ytup] import songs', e);
      return void toast(L(`อ่านไฟล์ไม่สำเร็จ (${(e as Error)?.message ?? e})`, `Couldn't read the file (${(e as Error)?.message ?? e})`));
    }
    const now = new Date().toISOString();
    const n = importSongs({}, text, now);
    if (n < 0) return void toast(L('ไฟล์นี้ไม่ใช่ CSV ประวัติเพลง (ต้องมีคอลัมน์ song)', 'This is not a song history CSV (needs a song column)'));
    try {
      await claimsWrite({ op: 'songs', songs: { fn: 'import', text, now } });
    } catch (e) {
      return saveFailed(e);
    }
    toast(L(`นำเข้าประวัติเพลง ${n} เพลงแล้ว`, `Imported ${n} songs into history`));
  };
  const search = L('ค้นหาเพลง ศิลปิน ค่าย หรือผู้ claim…', 'Search song, artist, label or claimant…');
  return (
    <SubView title={L('🎵 เพลงที่เคยโดน claim', '🎵 Previously claimed songs')}
      sub={L('ทุกเพลงที่เคยโดน claim ในทุกช่องของคุณ เช็กก่อนใส่เพลงในมิกซ์ใหม่ (ตอนลาก .txt เข้าคิว สคริปต์จะเตือนให้อัตโนมัติ)', 'Every song ever claimed across all your channels. Check before adding songs to a new mix (the script warns automatically when you drop a .txt into the queue).')}
      footer={<>
        <Button size="sm" variant="danger" onClick={() => {
          if (!clearArmed) return setClearArmed(true);
          void claimsWrite({ op: 'songs', songs: { fn: 'clear' } }).catch(saveFailed);
          setClearArmed(false);
        }}>{clearArmed ? L('กดอีกครั้งเพื่อลบทั้งหมด', 'Press again to delete all') : L('ลบทั้งหมด', 'Delete all')}</Button>
        <input ref={fileIn} type="file" accept=".csv,text/csv" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        <Button size="sm" title={L('ไฟล์ claimed-songs-*.csv จากสคริปต์ YT Studio Helper เดิม', 'claimed-songs-*.csv file from the old YT Studio Helper script')} onClick={() => fileIn.current?.click()}>{L('⬆ นำเข้า CSV', '⬆ Import CSV')}</Button>
        <span className="flex-1" />
        <Button size="sm" onClick={() => downloadCsv(songsCsvRows(data.songs), `claimed-songs-${new Date().toISOString().slice(0, 10)}.csv`)}>⬇ CSV</Button>
      </>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TextField className="min-w-40 flex-1" value={q} onValue={setQ} placeholder={search} aria-label={search} />
        <NativeSelect aria-label={L('เรียงตาม', 'Sort by')} value={sortBy} onChange={(e) => setSortBy(e.target.value as SongSort)}>
          <option value="count">{L('โดนบ่อยสุด', 'Most claimed')}</option>
          <option value="recent">{L('ล่าสุด', 'Latest')}</option>
          <option value="title">{L('ชื่อเพลง A–Z', 'Title A–Z')}</option>
          <option value="artist">{L('ศิลปิน A–Z', 'Artist A–Z')}</option>
        </NativeSelect>
        <span className="text-xs text-fg3">{q ? L(`${list.length} จาก ${total} เพลง`, `${list.length} of ${total} songs`) : L(`${total} เพลง`, `${total} songs`)}</span>
      </div>
      <div className="flex flex-col gap-2">
        {list.map((e) => {
          const vids = Object.values(e.videos);
          const channels = [...new Set(vids.map((v) => v.channel))].filter(Boolean).join(', ');
          const remove = L('ลบออกจากประวัติ', 'Remove from history');
          // An imported file can hold anything in these two columns: shown only when they make sense.
          const seen = new Date(e.lastSeen);
          const when = Number.isNaN(seen.getTime()) ? '' : seen.toLocaleDateString(locale());
          return (
            <div key={e.key} data-song={e.key} className="flex items-start gap-2 rounded-[14px] border border-tint/[0.09] bg-tint/5 p-3 text-[13px]">
              <div className="min-w-0 flex-1 break-words">
                <b>{e.title}</b>{e.types.length ? <span className="text-xs text-fg3">{' · ' + e.types.join(', ')}</span> : null}
                <div className="text-xs text-fg2">{e.artists || '—'}{e.label ? ' · ' + e.label : ''}</div>
                <div className="text-xs text-fg2">{e.claimants.join(', ') || '—'}</div>
                <div className="text-xs"><b>{String(e.n)}</b>{L(' คลิป', ' videos')}{e.trimmed > 0 ? <span className="ml-1.5 text-ok">{L(`✂ ตัดแล้ว ${e.trimmed}`, `✂ Trimmed ${e.trimmed}`)}</span> : null}</div>
                <div className="text-xs text-fg3">{channels}{channels && when ? ' · ' : ''}{when}</div>
              </div>
              {/* Asks once: the first click arms this song's button (5207–5210). */}
              <Button size="sm" title={remove} aria-label={armed === e.key ? undefined : remove} onClick={() => {
                if (armed !== e.key) return setArmed(e.key);
                void claimsWrite({ op: 'songs', songs: { fn: 'delete', key: e.key } }).catch(saveFailed);
                setArmed(null);
              }}>{armed === e.key ? L('แน่ใจ?', 'Sure?') : '✕'}</Button>
            </div>
          );
        })}
        {!list.length && (
          <div className="py-4 text-center text-xs text-fg3">
            {total ? L('ไม่พบเพลงที่ค้นหา', 'No matching songs') : L('ยังไม่มีข้อมูล — กด "สแกน claim" หรือนำเข้า CSV จากสคริปต์เดิม', 'No data yet — press "Scan claims" or import a CSV from the old script')}
          </div>
        )}
      </div>
    </SubView>
  );
}
