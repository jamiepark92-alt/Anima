import { useEffect, useState } from 'react';

import {
  FIT_CONFIDENCE,
  LOST_MS,
  smooth,
  type LivePose,
  type LivePoseOptions,
} from '@/rig/live-pose-shared';
import { askBridge } from '@/rig/pose-bridge';
import { poseConfidence, poseFromLandmarks, type Pose } from '@/rig/skeleton';

const ANALYSIS_WIDTH = 256;
// The snapshot interval; tracking itself adds a few hundred milliseconds on top.
const STEP_MS = 120;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fromBytes(base64: string) {
  const binary = atob(base64);
  const values = new Float32Array(binary.length);
  for (let i = 0; i < binary.length; i++) values[i] = binary.charCodeAt(i) / 255;
  return values;
}

// expo-camera can't stream frames on iPhone, so this takes quick silent snapshots and has
// the hidden MediaPipe web view (PoseBridge) find the body in each. A few updates a second.
export function useLivePose({ camera, active }: LivePoseOptions) {
  const [state, setState] = useState<LivePose | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let fitted: Pick<LivePose, 'rest' | 'silhouette' | 'size'> | null = null;
    let last: Pose | null = null;
    let lastSeen = Date.now();
    let index = 0;

    (async () => {
      while (!stopped) {
        try {
          const shot = await camera.current?.takePictureAsync({
            quality: 0.15,
            base64: true,
            shutterSound: false,
          });
          if (stopped) break;
          if (!shot?.base64) {
            await pause(300);
            continue;
          }
          const width = ANALYSIS_WIDTH;
          const height = Math.round((width * shot.height) / shot.width);
          const reply = await askBridge({
            type: 'frame',
            index: index++,
            step: STEP_MS,
            data: shot.base64,
            resize: width,
          });
          if (stopped) break;
          const landmarks =
            reply.type === 'pose' && reply.landmarks
              ? reply.landmarks.map(([x, y, visibility]) => ({ x, y, visibility }))
              : null;
          if (landmarks) {
            lastSeen = Date.now();
            const pose = smooth(last, poseFromLandmarks(landmarks, width, height));
            last = pose;
            if (!fitted && poseConfidence(landmarks) >= FIT_CONFIDENCE) {
              // The bridge keeps the clearest body mask since the last "finish"; collect it.
              const done = await askBridge({ type: 'finish' });
              const mask = done.type === 'done' ? done.rest : null;
              fitted = {
                rest: pose,
                silhouette: mask
                  ? { width: mask.width, height: mask.height, data: fromBytes(mask.data) }
                  : null,
                size: { width, height },
              };
            }
            if (fitted && !stopped) setState({ ...fitted, pose });
          } else if (Date.now() - lastSeen > LOST_MS) {
            fitted = null;
            last = null;
            setState(null);
          }
        } catch (error) {
          if (stopped) break;
          console.warn('[live-rig] tracking failed:', error);
          await pause(800);
        }
      }
    })();

    return () => {
      stopped = true;
      setState(null);
    };
  }, [camera, active]);

  return state;
}
