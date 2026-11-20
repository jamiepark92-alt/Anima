import { fromSaved, toSaved, uriOf, type SavedPanel } from '@/state/board-shared';
import type { Panel } from '@/state/studio';

// In the browser, storyboard pictures are blobs in their own IndexedDB database (apart from
// the Artwork library's) and the board's list is in localStorage.
const DB = 'anima-board';
const STORE = 'images';
const MANIFEST = 'anima-storyboard';

// Address shown on the page → id of the blob behind it.
const ids = new Map<string, string>();
// Saves run one at a time so a quick run of edits can't store the same picture twice.
let queue: Promise<void> = Promise.resolve();

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = act(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function keep(uri: string) {
  if (ids.has(uri)) return;
  const blob = await (await fetch(uri)).blob();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await run('readwrite', (store) => store.put(blob, id));
  ids.set(uri, id);
}

export async function loadBoard(): Promise<Panel[] | null> {
  let saved: SavedPanel[] | null = null;
  try {
    const raw = localStorage.getItem(MANIFEST);
    saved = raw ? (JSON.parse(raw) as SavedPanel[]) : null;
  } catch {
    return null;
  }
  if (!saved) return null;
  const urls = new Map<string, string>();
  for (const id of saved.flatMap((p) => p.takes.map((t) => t.image))) {
    const blob = await run<Blob | undefined>('readonly', (store) => store.get(id));
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    ids.set(url, id);
    urls.set(id, url);
  }
  return fromSaved(saved, (id) => urls.get(id) ?? null);
}

export function saveBoard(panels: Panel[]) {
  queue = queue.catch(() => {}).then(async () => {
    for (const panel of panels) {
      for (const take of panel.takes) {
        const uri = uriOf(take.source);
        if (!uri) continue;
        try {
          await keep(uri);
        } catch (error) {
          console.warn('[board] could not keep a take:', error);
        }
      }
    }
    const saved = toSaved(panels, (uri) => ids.get(uri));
    try {
      localStorage.setItem(MANIFEST, JSON.stringify(saved));
    } catch {
      return;
    }

    // Blobs no longer on the board were removed by the user.
    const kept = new Set(saved.flatMap((p) => p.takes.map((t) => t.image)));
    const stored = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    for (const key of stored) {
      if (!kept.has(String(key))) await run('readwrite', (store) => store.delete(key));
    }
  });
  return queue;
}
