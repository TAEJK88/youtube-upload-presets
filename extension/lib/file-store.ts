// Dropped files are kept as FileSystemFileHandles (not copies) in the extension's
// IndexedDB, keyed by queue item id. The side panel writes them; the file-bridge
// iframe inside Studio reads them. Both are extension-origin pages.
const DB = 'ytup-files';
const STORE = 'handles';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves when the transaction commits, so another page reading next sees the write.
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error ?? req.error); };
  });
}

export const putHandle = (id: string, handle: FileSystemFileHandle) =>
  run('readwrite', (s) => s.put(handle, id)).then(() => undefined);

export const getHandle = (id: string) =>
  run<FileSystemFileHandle | undefined>('readonly', (s) => s.get(id));

export const deleteHandle = (id: string) =>
  run('readwrite', (s) => s.delete(id)).then(() => undefined);

export const listIds = () =>
  run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((keys) => keys.map(String));
