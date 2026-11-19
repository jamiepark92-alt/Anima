import type { ImageProps } from 'expo-image';

export type VideoFrame = { source: ImageProps['source']; time: number };

const SECONDS_PER_PANEL = 3;
const MIN_PANELS = 4;
const MAX_PANELS = 12;

// One panel every few seconds, each taken from the middle of its slice of the clip.
export function frameTimes(duration: number) {
  const count = Math.min(
    MAX_PANELS,
    Math.max(MIN_PANELS, Math.round(duration / SECONDS_PER_PANEL)),
  );
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * duration);
}

export function formatTime(seconds: number) {
  const total = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
