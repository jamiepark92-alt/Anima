import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  readDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import { fromBase64, toBase64, type Library } from '@/state/library-shared';

// On iPhone, everything added in the Artwork tab is copied into the app's own Documents
// folder (picker results live in a cache iOS can clear) with a small list beside it.
const DIR = `${documentDirectory ?? ''}artwork-library/`;
const MANIFEST = `${DIR}library.json`;

type Manifest = { artworks: { uri: string; sample: string }[]; props: string[]; sets: string[] };

async function ensureDir() {
  const info = await getInfoAsync(DIR);
  if (!info.exists) await makeDirectoryAsync(DIR, { intermediates: true });
}

// Files are saved under a fresh name, so the stored path stays valid across app updates
// only if we keep the name, not the full path: the Documents path itself can change.
function fileName(uri: string) {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

export async function keepImage(uri: string): Promise<string> {
  if (uri.startsWith(DIR)) return uri;
  await ensureDir();
  const data = uri.match(/^data:image\/(\w+);base64,(.*)$/);
  const target = `${DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${
    data ? data[1].replace('jpeg', 'jpg') : uri.split('.').pop()?.split('?')[0] || 'jpg'
  }`;
  if (data) await writeAsStringAsync(target, data[2], { encoding: 'base64' });
  else await copyAsync({ from: uri, to: target });
  return target;
}

export async function loadLibrary(): Promise<Library | null> {
  const info = await getInfoAsync(MANIFEST);
  if (!info.exists) return null;
  const saved = JSON.parse(await readAsStringAsync(MANIFEST)) as Manifest;
  const at = (name: string) => `${DIR}${fileName(name)}`;
  return {
    artworks: saved.artworks.map((a) => ({ uri: at(a.uri), sample: fromBase64(a.sample) })),
    props: saved.props.map(at),
    sets: saved.sets.map(at),
  };
}

export async function saveLibrary(library: Library) {
  await ensureDir();
  const manifest: Manifest = {
    artworks: library.artworks.map((a) => ({ uri: fileName(a.uri), sample: toBase64(a.sample) })),
    props: library.props.map(fileName),
    sets: library.sets.map(fileName),
  };
  await writeAsStringAsync(MANIFEST, JSON.stringify(manifest));

  // Anything no longer in the library was deleted by the user, so its file goes too.
  const kept = new Set([
    'library.json',
    ...manifest.artworks.map((a) => a.uri),
    ...manifest.props,
    ...manifest.sets,
  ]);
  for (const name of await readDirectoryAsync(DIR)) {
    if (!kept.has(name)) await deleteAsync(`${DIR}${name}`, { idempotent: true });
  }
}
