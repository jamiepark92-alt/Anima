import type { ImageProps } from 'expo-image';

import type { Panel, PanelEdit } from '@/state/studio';

// What the Storyboard tab saves. Each take's picture is stored by key (a file name on iPhone,
// a blob id in the browser); `main` says which take the reel shows.
export type SavedTake = { id: string; image: string; time: number | null };
export type SavedPanel = {
  id: string;
  note: string;
  edit?: PanelEdit;
  main: number;
  takes: SavedTake[];
};

export function uriOf(source: ImageProps['source']): string | null {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source) {
    return typeof source.uri === 'string' ? source.uri : null;
  }
  return null;
}

// Takes without an address (frames pulled from a video on iPhone are held in memory only)
// can't be saved, so they're left out; a panel with none left isn't saved at all.
export function toSaved(panels: Panel[], keyOf: (uri: string) => string | undefined) {
  const saved: SavedPanel[] = [];
  for (const panel of panels) {
    const takes: SavedTake[] = [];
    let main = 0;
    for (const take of panel.takes) {
      const uri = uriOf(take.source);
      const image = uri ? keyOf(uri) : undefined;
      if (!image) continue;
      if (take.source === panel.source) main = takes.length;
      takes.push({ id: take.id, image, time: take.time });
    }
    if (takes.length) saved.push({ id: panel.id, note: panel.note, edit: panel.edit, main, takes });
  }
  return saved;
}

export function fromSaved(saved: SavedPanel[], uriFor: (image: string) => string | null) {
  const panels: Panel[] = [];
  for (const s of saved) {
    const takes = s.takes.flatMap((t) => {
      const uri = uriFor(t.image);
      return uri ? [{ id: t.id, source: { uri }, time: t.time }] : [];
    });
    if (!takes.length) continue;
    const main = takes[Math.min(s.main, takes.length - 1)];
    panels.push({
      id: s.id,
      source: main.source,
      time: main.time,
      note: s.note,
      takes,
      edit: s.edit,
    });
  }
  return panels;
}
