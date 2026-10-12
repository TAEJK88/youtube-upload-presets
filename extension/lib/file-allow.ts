import { handles, type Access, type Handles } from './file-handles';

// The "Allow file access" page (allow.html, in a normal tab). There Chrome shows its own
// question for a stored file, one per requestPermission() call, and one of its answers
// ("Allow on every visit") covers every file of the extension. So the click asks about ONE
// file, looks at all of them again, and asks about the next only while some are still at
// 'prompt': after "every visit" on the first question nothing else is asked. The round goes
// on only after an answer that made the asked file readable ("Allow this time"): a dismissed
// question is not followed by one per remaining file (Chrome may stop offering its question
// after several are dismissed). Asked on the handles this page holds (lib/file-handles.ts).
export type FileState = { id: string; state: Access };

export async function allowAll(ids: string[], files: Handles = handles): Promise<FileState[]> {
  const asked = new Set<string>();
  for (;;) {
    const states = await files.states(ids);
    const next = states.find((s) => s.state === 'prompt' && !asked.has(s.id));
    if (!next) return states;
    asked.add(next.id);
    const [a] = await files.request([next.id]); // logs `[ytup] regrant <id>: before -> after`
    if (a?.after !== 'granted') return files.states(ids);
  }
}

// `other`: files Chrome cannot be asked about ('missing', 'error').
export function tally(states: FileState[]) {
  const n = (state: Access) => states.filter((s) => s.state === state).length;
  const [granted, prompt, denied] = [n('granted'), n('prompt'), n('denied')];
  return { total: states.length, granted, prompt, denied, other: states.length - granted - prompt - denied };
}
