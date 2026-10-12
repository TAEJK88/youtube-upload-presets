// Chrome's read access to picked files, as far as the extension depends on it (read from
// Chromium's source, not measured in a browser):
//   - one grant per file for the whole extension origin: every page sees the same state;
//   - a grant is active only while some page holds a live handle object for that file. When
//     the last one is collected, or its page closes, the grant is gone and a handle read back
//     from IndexedDB starts at 'prompt';
//   - a drop or a picker grants at once;
//   - requestPermission() in a side panel shows nothing: recent Chrome grants silently,
//     older Chrome leaves the state as it was. In a frame inside another site it throws.
// Handle objects can't be counted in JavaScript, so a page here lists the ones it made, and a
// test says which of them are still reachable when it collects garbage.
export interface FakeHandle extends FileSystemFileHandle { path: string }
type Kind = 'panel' | 'frame';

export function fakeChrome(opts: { silentGrant?: boolean } = {}) {
  const silentGrant = opts.silentGrant ?? true;
  const grants = new Map<string, PermissionState>(); // active grants, by path
  const alive = new Map<string, Set<FakeHandle>>(); // live handle objects, by path
  const stored = new Map<string, string>(); // IndexedDB: id → path
  const requests: string[] = [];

  const died = (h: FakeHandle) => {
    const set = alive.get(h.path);
    if (!set?.delete(h)) return;
    if (!set.size) {
      alive.delete(h.path);
      if (grants.get(h.path) !== 'denied') grants.delete(h.path);
    }
  };

  function page(kind: Kind = 'panel') {
    const mine = new Set<FakeHandle>();
    let clicked = false;
    const make = (path: string): FakeHandle => {
      const live = () => {
        if (!mine.has(h)) throw new Error(`fake Chrome: handle for ${path} used after it was collected`);
      };
      const h = {
        kind: 'file', name: path.split('/').pop()!, path,
        async queryPermission() { live(); return grants.get(path) ?? 'prompt'; },
        async requestPermission() {
          live();
          requests.push(path);
          if (kind === 'frame') throw new DOMException('third-party context', 'SecurityError');
          const now = grants.get(path) ?? 'prompt';
          if (now === 'prompt' && clicked && silentGrant) grants.set(path, 'granted');
          return grants.get(path) ?? 'prompt';
        },
        async getFile() {
          live();
          if (grants.get(path) !== 'granted') throw new DOMException('no access', 'NotAllowedError');
          return new File(['x'], h.name);
        },
      } as unknown as FakeHandle;
      mine.add(h);
      if (!alive.has(path)) alive.set(path, new Set());
      alive.get(path)!.add(h);
      return h;
    };
    return {
      // A drop or a pick.
      pick(path: string): FakeHandle {
        const h = make(path);
        grants.set(path, 'granted');
        return h;
      },
      put: async (id: string, h: FileSystemFileHandle) => void stored.set(id, (h as FakeHandle).path),
      // A read from IndexedDB: a new object each time.
      load: async (id: string): Promise<FakeHandle | undefined> => (stored.has(id) ? make(stored.get(id)!) : undefined),
      list: async () => [...stored.keys()],
      // Everything this page made that `reachable` does not list is collected.
      gc(reachable: Iterable<FileSystemFileHandle> = []) {
        const keep = new Set<FileSystemFileHandle>(reachable);
        for (const h of [...mine]) if (!keep.has(h)) { mine.delete(h); died(h); }
      },
      close() {
        for (const h of [...mine]) { mine.delete(h); died(h); }
      },
      // Code run inside a user's click (transient activation).
      async click<T>(fn: () => T | Promise<T>): Promise<T> {
        clicked = true;
        try { return await fn(); } finally { clicked = false; }
      },
    };
  }

  return {
    page,
    refs: (path: string) => alive.get(path)?.size ?? 0,
    state: (path: string): PermissionState => grants.get(path) ?? 'prompt',
    // Chrome withdraws every active grant (the last extension tab closed, five seconds ago).
    revokeAll() { for (const [p, s] of grants) if (s === 'granted') grants.delete(p); },
    block(path: string) { grants.set(path, 'denied'); },
    remove(id: string) { stored.delete(id); },
    requests,
  };
}
