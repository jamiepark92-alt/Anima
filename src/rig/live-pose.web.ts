import { useEffect, useState } from 'react';

import {
  FIT_CONFIDENCE,
  LOST_MS,
  smooth,
  type LivePose,
  type LivePoseOptions,
} from '@/rig/live-pose-shared';
import { poseConfidence, poseFromLandmarks, type Pose } from '@/rig/skeleton';
import { detectLiveFrame } from '@/rig/track.web';

const ANALYSIS_WIDTH = 256;
const FRAME_MS = 50;

// Tracks the body in the live camera, in the browser, about 20 times a second.
export function useLivePose({ container, active }: LivePoseOptions) {
  const [state, setState] = useState<LivePose | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = document.createElement('canvas');
    const context = frame.getContext('2d', { willReadFrequently: true });
    let fitted: Pick<LivePose, 'rest' | 'silhouette' | 'size'> | null = null;
    let last: Pose | null = null;
    let lastSeen = 0;

    const tick = async () => {
      if (stopped) return;
      const root = container.current as unknown as HTMLElement | null;
      const video = root?.querySelector('video');
      if (video && video.readyState >= 2 && video.videoWidth && context) {
        const width = ANALYSIS_WIDTH;
        const height = Math.round((width * video.videoHeight) / video.videoWidth);
        frame.width = width;
        frame.height = height;
        context.drawImage(video, 0, 0, width, height);
        try {
          const { landmarks, silhouette } = await detectLiveFrame(frame, !fitted);
          if (stopped) return;
          const now = Date.now();
          if (landmarks) {
            lastSeen = now;
            const pose = smooth(last, poseFromLandmarks(landmarks, width, height));
            last = pose;
            if (!fitted && poseConfidence(landmarks) >= FIT_CONFIDENCE) {
              fitted = { rest: pose, silhouette, size: { width, height } };
            }
            if (fitted) setState({ ...fitted, pose });
          } else if (now - lastSeen > LOST_MS) {
            fitted = null;
            last = null;
            setState(null);
          }
        } catch (error) {
          console.warn('[live-rig] tracking failed:', error);
        }
      }
      timer = setTimeout(tick, FRAME_MS);
    };
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      setState(null);
    };
  }, [container, active]);

  return state;
}
