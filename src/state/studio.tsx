import type { ImageProps } from 'expo-image';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ArtworkSample, StyleValues } from '@/avatar/style';
import { loadBoard, saveBoard } from '@/state/board';
import { keepImage, loadLibrary, saveLibrary } from '@/state/library';

export type Artwork = { uri: string; sample: ArtworkSample };
export type Shot = { id: string; kind: 'photo' | 'video'; uri: string; seconds?: number };
// One recording of a storyboard moment. A panel collects every take of the same moment.
export type Take = {
  id: string;
  source: ImageProps['source'];
  // Seconds into the source clip; null for takes made from a photo.
  time: number | null;
};

export type Panel = {
  id: string;
  // The main take, which is what the reel shows.
  source: ImageProps['source'];
  time: number | null;
  note: string;
  takes: Take[];
  // How the panel plays in the cut; missing means the defaults. Kept apart from the takes so
  // switching the main take keeps the edit.
  edit?: PanelEdit;
};

export type Transition = 'cut' | 'fade' | 'dissolve' | 'wipe';
export type PanelEdit = {
  // Seconds the panel stays on screen, before speed.
  length: number;
  speed: number;
  // A film look id from the camera, or null for none.
  look: string | null;
  zoom: number;
  flipped: boolean;
  // How this panel comes in from the one before.
  transition: Transition;
};

export const DEFAULT_EDIT: PanelEdit = {
  length: 3,
  speed: 1,
  look: null,
  zoom: 1,
  flipped: false,
  transition: 'cut',
};

type Studio = {
  photo: string | null;
  setPhoto: (uri: string | null) => void;
  artworks: Artwork[];
  setArtworks: (update: (current: Artwork[]) => Artwork[]) => void;
  // Slider positions the user has changed by hand; these win over analysed values.
  overrides: Partial<StyleValues>;
  setOverrides: (update: (current: Partial<StyleValues>) => Partial<StyleValues>) => void;
  shots: Shot[];
  setShots: (update: (current: Shot[]) => Shot[]) => void;
  panels: Panel[];
  setPanels: (update: (current: Panel[]) => Panel[]) => void;
  // Drawings of objects (props) and backdrops (sets), kept apart from the character's artwork.
  props: string[];
  setProps: (update: (current: string[]) => string[]) => void;
  sets: string[];
  setSets: (update: (current: string[]) => string[]) => void;
};

const StudioContext = createContext<Studio | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [overrides, setOverrides] = useState<Partial<StyleValues>>({});
  const [shots, setShots] = useState<Shot[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [props, setProps] = useState<string[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  // The Artwork tab's uploads are saved on the device and come back on the next launch;
  // they're only removed when the user deletes them.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((saved) => {
        if (cancelled || !saved) return;
        setArtworks((current) => (current.length ? current : saved.artworks));
        setProps((current) => (current.length ? current : saved.props));
        setSets((current) => (current.length ? current : saved.sets));
      })
      .catch((error) => console.warn('[library] could not load saved artwork:', error))
      .finally(() => !cancelled && setRestored(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    (async () => {
      // Copy anything new into lasting storage, then swap its temporary address for the
      // saved one; the next pass (with nothing new) writes the list.
      const swap = new Map<string, string>();
      for (const uri of [...artworks.map((a) => a.uri), ...props, ...sets]) {
        const kept = await keepImage(uri);
        if (kept !== uri) swap.set(uri, kept);
      }
      if (cancelled) return;
      if (swap.size) {
        const to = (uri: string) => swap.get(uri) ?? uri;
        setArtworks((current) => current.map((a) => ({ ...a, uri: to(a.uri) })));
        setProps((current) => current.map(to));
        setSets((current) => current.map(to));
        return;
      }
      await saveLibrary({ artworks, props, sets });
    })().catch((error) => console.warn('[library] could not save artwork:', error));
    return () => {
      cancelled = true;
    };
  }, [restored, artworks, props, sets]);

  // The storyboard is saved too, so a relaunch doesn't empty the board: takes, the main
  // take, narration and edits all come back.
  const [boardRestored, setBoardRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBoard()
      .then((saved) => {
        if (!cancelled && saved?.length) setPanels((current) => (current.length ? current : saved));
      })
      .catch((error) => console.warn('[board] could not load the storyboard:', error))
      .finally(() => !cancelled && setBoardRestored(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!boardRestored) return;
    // Wait for a pause so typing narration doesn't write on every key.
    const timer = setTimeout(() => {
      saveBoard(panels).catch((error) => console.warn('[board] could not save:', error));
    }, 400);
    return () => clearTimeout(timer);
  }, [boardRestored, panels]);

  const value = useMemo(
    () => ({
      photo,
      setPhoto,
      artworks,
      setArtworks,
      overrides,
      setOverrides,
      shots,
      setShots,
      panels,
      setPanels,
      props,
      setProps,
      sets,
      setSets,
    }),
    [photo, artworks, overrides, shots, panels, props, sets],
  );

  return <StudioContext value={value}>{children}</StudioContext>;
}

export function useStudio() {
  const studio = use(StudioContext);
  if (!studio) throw new Error('useStudio must be used inside StudioProvider');
  return studio;
}

let nextId = 0;
export function makeId() {
  nextId += 1;
  return `${Date.now()}-${nextId}`;
}
