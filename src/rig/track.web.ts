import type * as Vision from '@mediapipe/tasks-vision';

import { cleanPoses, poseConfidence, poseFromLandmarks, type Pose } from '@/rig/skeleton';
import { TRACK_FPS, TRACK_MAX_SECONDS, type Performance, type TrackOptions } from '@/rig/types';

type PoseLandmarker = Vision.PoseLandmarker;

// The engine and model are served from public/mediapipe, so tracking needs no network.
const BASE = '/mediapipe';
const ANALYSIS_WIDTH = 480;
const STILL_WIDTH = 160;

let landmarker: Promise<PoseLandmarker> | null = null;

function loadLandmarker() {
  landmarker ??= (async () => {
    // Metro can't bundle MediaPipe (it loads its engine with a computed import), so the
    // browser loads the package's own ES module from public/mediapipe instead.
    const loadModule = new Function('url', 'return import(url)') as (
      url: string,
    ) => Promise<typeof Vision>;
    const { FilesetResolver, PoseLandmarker } = await loadModule(`${BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(BASE);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: {
        modelAssetPath: `${BASE}/pose_landmarker_lite.task`,
        delegate,
      },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      outputSegmentationMasks: true,
    });
    try {
      return await PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      return await PoseLandmarker.createFromOptions(fileset, options('CPU'));
    }
  })();
  landmarker.catch(() => {
    landmarker = null;
  });
  return landmarker;
}

function once(target: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener('error', () => reject(new Error('Video could not be opened.')), {
      once: true,
    });
  });
}

// Each run gets later timestamps than the last, as the VIDEO mode requires.
let clock = 0;

// One frame from the live camera: landmarks, plus the body mask when asked for (used once,
// to fit the artwork to the body). Shares the clock with trackVideo so timestamps only rise.
export async function detectLiveFrame(source: HTMLCanvasElement, withMask: boolean) {
  const detector = await loadLandmarker();
  clock = Math.max(clock + 1, performance.now());
  const result = detector.detectForVideo(source, clock);
  const landmarks = result.landmarks[0] ?? null;
  const mask = withMask ? result.segmentationMasks?.[0] : undefined;
  const silhouette = mask
    ? { width: mask.width, height: mask.height, data: mask.getAsFloat32Array().slice() }
    : null;
  result.close();
  return { landmarks, silhouette };
}

export async function trackVideo(uri: string, options: TrackOptions = {}): Promise<Performance> {
  const fps = options.fps ?? TRACK_FPS;
  const [detector, video] = await Promise.all([
    loadLandmarker(),
    (async () => {
      const element = document.createElement('video');
      element.muted = true;
      element.playsInline = true;
      element.preload = 'auto';
      element.src = uri;
      await once(element, 'loadedmetadata');
      // MediaRecorder files report an infinite duration until the player seeks to the end.
      if (!Number.isFinite(element.duration)) {
        element.currentTime = 1e7;
        await once(element, 'seeked');
      }
      return element;
    })(),
  ]);

  const width = Math.min(ANALYSIS_WIDTH, video.videoWidth);
  const height = Math.round(width * (video.videoHeight / video.videoWidth));
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  const still = document.createElement('canvas');
  still.width = STILL_WIDTH;
  still.height = Math.round(STILL_WIDTH * (height / width));
  const frameContext = frame.getContext('2d', { willReadFrequently: true });
  const stillContext = still.getContext('2d');
  if (!frameContext || !stillContext) throw new Error('Video could not be read.');

  const duration = Math.min(video.duration, options.maxSeconds ?? TRACK_MAX_SECONDS);
  const count = Math.max(1, Math.floor(duration * fps));
  const raw: (Pose | null)[] = [];
  const stills: string[] = [];
  let best = {
    index: -1,
    score: -1,
    silhouette: null as Performance['silhouette'],
  };

  for (let i = 0; i < count; i++) {
    video.currentTime = Math.min(i / fps, video.duration - 0.01);
    await once(video, 'seeked');
    frameContext.drawImage(video, 0, 0, width, height);
    stillContext.drawImage(frame, 0, 0, still.width, still.height);
    stills.push(still.toDataURL('image/jpeg', 0.7));

    clock += 1000 / fps;
    const result = detector.detectForVideo(frame, clock);
    const landmarks = result.landmarks[0];
    if (landmarks) {
      raw.push(poseFromLandmarks(landmarks, width, height));
      const score = poseConfidence(landmarks);
      const mask = result.segmentationMasks?.[0];
      // Prefer an early clear frame: people usually start facing the camera.
      if (mask && score > best.score + 0.05) {
        best = {
          index: i,
          score,
          silhouette: {
            width: mask.width,
            height: mask.height,
            data: mask.getAsFloat32Array().slice(),
          },
        };
      }
    } else {
      raw.push(null);
    }
    result.close();
    options.onProgress?.((i + 1) / count);
  }

  const poses = cleanPoses(raw);
  if (!poses.length) throw new Error('No one was found in that video.');
  return {
    width,
    height,
    fps,
    poses,
    restIndex: Math.max(0, best.index),
    silhouette: best.silhouette,
    stills,
  };
}
