import type { ImageProps } from 'expo-image';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

import type { ArtworkSample, StyleValues } from '@/avatar/style';

export type Artwork = { uri: string; sample: ArtworkSample };
export type Shot = { id: string; kind: 'photo' | 'video'; uri: string; seconds?: number };
export type Panel = {
  id: string;
  source: ImageProps['source'];
  // Seconds into the source clip; null for panels made from a photo.
  time: number | null;
  note: string;
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
};

const StudioContext = createContext<Studio | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [overrides, setOverrides] = useState<Partial<StyleValues>>({});
  const [shots, setShots] = useState<Shot[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);

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
    }),
    [photo, artworks, overrides, shots, panels],
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
