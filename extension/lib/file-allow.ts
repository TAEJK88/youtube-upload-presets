import { handles, type Access, type Handles } from './file-handles';

// The "Allow file access" page (allow.html, in a normal tab). There Chrome shows its own
// question for a stored file, one per requestPermission() call, and one of its answers
// ("Allow on every visit") covers every file of the extension. So the click asks about ONE
// file, looks at all of them again, and asks about the next only while some are still at
// 'prompt': after "every visit" on the first question nothing else is asked. Each file is
// asked at most once per click, on the handles this page holds (lib/file-handles.ts).
export type FileState = { id: string; state: Access };

export async function allowAll(ids: string[], files: Handles = handles): Promise<FileState[]> {
  const asked = new Set<string>();
  for (;;) {
    const states = await files.states(ids);
    const next = states.find((s) => s.state === 'prompt' && !asked.has(s.id));
    if (!next) return states;
    asked.add(next.id);
    await files.request([next.id]); // logs `[ytup] regrant <id>: before -> after`
  }
}

export const tally = (states: FileState[]) => ({
  total: states.length,
  granted: states.filter((s) => s.state === 'granted').length,
  prompt: states.filter((s) => s.state === 'prompt').length,
  denied: states.filter((s) => s.state === 'denied').length,
});
