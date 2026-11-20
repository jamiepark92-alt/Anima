import { fromBase64, toBase64, type Library } from '@/state/library-shared';

// In the browser, images are kept as blobs in IndexedDB (localStorage is too small for
// pictures) and the list itself in localStorage. Each image gets an id; the page shows it
// through an object URL made on load.
const DB = 'anima';
const STORE = 'artwork-images';
const MANIFEST = 'anima-artwork-library';

type Manifest = { artworks: { id: string; sample: string }[]; props: string[]; sets: string[] };

// Object URL shown on the page → id of the blob behind it.
const ids = new Map<string, string>();

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

export async function keepImage(uri: string): Promise<string> {
  if (ids.has(uri)) return uri;
  const blob = await (await fetch(uri)).blob();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await run('readwrite', (store) => store.put(blob, id));
  const url = URL.createObjectURL(blob);
  ids.set(url, id);
  return url;
}

export async function loadLibrary(): Promise<Library | null> {
  let saved: Manifest | null = null;
  try {
    const raw = localStorage.getItem(MANIFEST);
    saved = raw ? (JSON.parse(raw) as Manifest) : null;
  } catch {
    return null;
  }
  if (!saved) return null;
  const urlFor = async (id: string) => {
    const blob = await run<Blob | undefined>('readonly', (store) => store.get(id));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    ids.set(url, id);
    return url;
  };
  const artworks = [];
  for (const a of saved.artworks) {
    const uri = await urlFor(a.id);
    if (uri) artworks.push({ uri, sample: fromBase64(a.sample) });
  }
  const props = (await Promise.all(saved.props.map(urlFor))).filter((u): u is string => !!u);
  const sets = (await Promise.all(saved.sets.map(urlFor))).filter((u): u is string => !!u);
  return { artworks, props, sets };
}

export async function saveLibrary(library: Library) {
  const idOf = (uri: string) => ids.get(uri);
  const manifest: Manifest = {
    artworks: library.artworks
      .filter((a) => idOf(a.uri))
      .map((a) => ({ id: idOf(a.uri)!, sample: toBase64(a.sample) })),
    props: library.props.map(idOf).filter((id): id is string => !!id),
    sets: library.sets.map(idOf).filter((id): id is string => !!id),
  };
  try {
    localStorage.setItem(MANIFEST, JSON.stringify(manifest));
  } catch {
    return;
  }

  // Blobs no longer in the library were deleted by the user.
  const kept = new Set([
    ...manifest.artworks.map((a) => a.id),
    ...manifest.props,
    ...manifest.sets,
  ]);
  const stored = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
  for (const key of stored) {
    if (!kept.has(String(key))) await run('readwrite', (store) => store.delete(key));
  }
}
