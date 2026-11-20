import type { CameraView } from 'expo-camera';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

import type { Silhouette } from '@/rig/mesh';
import type { Pose } from '@/rig/skeleton';

// What the live camera knows about the body right now. `rest` is the pose the artwork was
// fitted to (the first clear frame); `pose` is where the body is this moment.
export type LivePose = {
  size: { width: number; height: number };
  rest: Pose;
  silhouette: Silhouette | null;
  pose: Pose;
};

export type LivePoseOptions = {
  // The camera stage; the browser reads the <video> inside it.
  container: RefObject<ComponentRef<typeof View> | null>;
  // The iPhone takes snapshots from it.
  camera: RefObject<CameraView | null>;
  // Tracking only runs while this is true (artwork exists, stage on screen, not recording).
  active: boolean;
};

// How clearly the body must be seen before the artwork is fitted to it.
export const FIT_CONFIDENCE = 0.6;
// After losing the body this long, the next appearance is fitted afresh.
export const LOST_MS = 1500;

// Eases each joint toward its new spot so the artwork doesn't jitter frame to frame.
export function smooth(previous: Pose | null, next: Pose, amount = 0.55): Pose {
  if (!previous || previous.length !== next.length) return next;
  const out = new Float32Array(next.length);
  for (let i = 0; i < next.length; i++) out[i] = previous[i] + (next[i] - previous[i]) * amount;
  return out;
}
