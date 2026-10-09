import type { QueueItem } from './queue-runner';

// Two idle Studio tabs (two windows' panels) each save their whole queue 300 ms after an edit.
// A foreign save that lands while ours still waits would replace our copy and lose our edit
// (3b review M3). Instead the two copies are merged per item against `base`, the list this tab
// last read from or wrote to storage:
//  - an item this tab changed or added since `base` keeps this tab's version (its save lands last);
//  - an item it didn't touch takes the foreign version;
//  - an item either side removed stays removed;
//  - the order is this tab's when it moved items, otherwise the foreign one, new items after it.
export function mergeQueue(base: QueueItem[], local: QueueItem[], foreign: QueueItem[]): QueueItem[] {
  const before = new Map(base.map((it) => [it.id, JSON.stringify(it)]));
  const mine = new Map(local.map((it) => [it.id, it]));
  const theirs = new Map(foreign.map((it) => [it.id, it]));
  // In both copies, or new on one side; an item of `base` that one side dropped is gone.
  const kept = (id: string) => (mine.has(id) && theirs.has(id)) || !before.has(id);
  const version = (id: string): QueueItem => {
    const l = mine.get(id);
    const f = theirs.get(id);
    if (!l) return f!;
    if (!f) return l;
    return before.get(id) !== JSON.stringify(l) ? l : f;
  };
  const both = (list: QueueItem[]) => list.map((it) => it.id).filter((id) => before.has(id) && mine.has(id));
  const moved = both(local).join('\n') !== both(base).join('\n');
  const order = (moved ? [...local, ...foreign] : [...foreign, ...local]).map((it) => it.id);
  return order.filter((id, i) => order.indexOf(id) === i && kept(id)).map(version);
}
