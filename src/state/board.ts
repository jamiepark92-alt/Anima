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

import { fromSaved, toSaved, uriOf, type SavedPanel } from '@/state/board-shared';
import type { Panel } from '@/state/studio';

// On iPhone, storyboard pictures are copied into their own Documents folder, apart from the
// Artwork library (which deletes any file it doesn't list), with the board's list beside them.
const DIR = `${documentDirectory ?? ''}storyboard/`;
const MANIFEST = `${DIR}board.json`;

// Address shown on the page → file name in DIR.
const names = new Map<string, string>();
// Saves run one at a time so a quick run of edits can't copy the same picture twice.
let queue: Promise<void> = Promise.resolve();

async function ensureDir() {
  const info = await getInfoAsync(DIR);
  if (!info.exists) await makeDirectoryAsync(DIR, { intermediates: true });
}

async function keep(uri: string) {
  if (names.has(uri)) return;
  const data = uri.match(/^data:image\/(\w+);base64,(.*)$/);
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${
    data ? data[1].replace('jpeg', 'jpg') : uri.split('.').pop()?.split('?')[0] || 'jpg'
  }`;
  if (data) await writeAsStringAsync(`${DIR}${name}`, data[2], { encoding: 'base64' });
  else await copyAsync({ from: uri, to: `${DIR}${name}` });
  names.set(uri, name);
}

export async function loadBoard(): Promise<Panel[] | null> {
  const info = await getInfoAsync(MANIFEST);
  if (!info.exists) return null;
  const saved = JSON.parse(await readAsStringAsync(MANIFEST)) as SavedPanel[];
  return fromSaved(saved, (name) => {
    const uri = `${DIR}${name}`;
    names.set(uri, name);
    return uri;
  });
}

export function saveBoard(panels: Panel[]) {
  queue = queue.catch(() => {}).then(async () => {
    await ensureDir();
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
    const saved = toSaved(panels, (uri) => names.get(uri));
    await writeAsStringAsync(MANIFEST, JSON.stringify(saved));

    // Pictures no longer on the board were removed by the user.
    const kept = new Set(['board.json', ...saved.flatMap((p) => p.takes.map((t) => t.image))]);
    for (const name of await readDirectoryAsync(DIR)) {
      if (!kept.has(name)) await deleteAsync(`${DIR}${name}`, { idempotent: true });
    }
  });
  return queue;
}
