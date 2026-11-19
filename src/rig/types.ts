import type { Silhouette } from '@/rig/mesh';
import type { Pose } from '@/rig/skeleton';

export type Performance = {
  // Pixel size of the frames the poses were measured in.
  width: number;
  height: number;
  fps: number;
  poses: Pose[];
  // The clearest frame; the artwork is fitted to the body as it stands here.
  restIndex: number;
  silhouette: Silhouette | null;
  // Small stills of the source clip, to show next to the character.
  stills: string[];
};

export type TrackOptions = {
  fps?: number;
  maxSeconds?: number;
  onProgress?: (done: number) => void;
};

export const TRACK_FPS = 15;
export const TRACK_MAX_SECONDS = 12;
