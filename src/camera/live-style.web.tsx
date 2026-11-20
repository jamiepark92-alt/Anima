import type * as Vision from '@mediapipe/tasks-vision';
import { useEffect, type ComponentRef, type RefObject } from 'react';
import type { View } from 'react-native';

import type { AvatarStyle } from '@/avatar/style';
import { STYLIZE_SOURCE, toBridgeStyle, type StyleForBridge } from '@/camera/stylize-source';

export const LIVE_STYLE_SUPPORTED = true;

type Segmenter = Vision.InteractiveSegmenterLegacy;

// Engine and model are served from public/mediapipe, like the rigging tracker.
const BASE = '/mediapipe';
// Small enough to segment and restyle every frame on the main thread.
const ANALYSIS_WIDTH = 320;
const FRAME_MS = 80;

let segmenter: Promise<Segmenter> | null = null;

function loadSegmenter() {
  segmenter ??= (async () => {
    // Metro can't bundle MediaPipe, so the browser loads its own module (see rig/track.web).
    const loadModule = new Function('url', 'return import(url)') as (
      url: string,
    ) => Promise<typeof Vision>;
    const { FilesetResolver, InteractiveSegmenterLegacy } = await loadModule(
      `${BASE}/vision_bundle.mjs`,
    );
    const fileset = await FilesetResolver.forVisionTasks(BASE);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${BASE}/magic_touch.tflite`, delegate },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    try {
      return await InteractiveSegmenterLegacy.createFromOptions(fileset, options('GPU'));
    } catch {
      return await InteractiveSegmenterLegacy.createFromOptions(fileset, options('CPU'));
    }
  })();
  segmenter.catch(() => {
    segmenter = null;
  });
  return segmenter;
}

// The preview shows the video like `cover` (and mirrored for the front camera); this maps a
// tap on the viewfinder back into the video frame, as 0–1 coordinates.
function toVideoPoint(video: HTMLVideoElement, point: { x: number; y: number }) {
  const box = video.getBoundingClientRect();
  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  const offsetX = (box.width - video.videoWidth * scale) / 2;
  const offsetY = (box.height - video.videoHeight * scale) / 2;
  let x = (point.x - offsetX) / scale / video.videoWidth;
  const y = (point.y - offsetY) / scale / video.videoHeight;
  if (getComputedStyle(video).transform.startsWith('matrix(-1')) x = 1 - x;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

type Stylize = (
  frame: ImageData,
  mask: Float32Array,
  selectedHigh: boolean,
  style: StyleForBridge,
) => void;
// Same routine the iPhone bridge runs (see stylize-source.ts).
const stylize = new Function(`${STYLIZE_SOURCE}; return stylize;`)() as Stylize;

type Props = {
  // The viewfinder that holds the camera's <video>.
  finder: RefObject<ComponentRef<typeof View> | null>;
  // Where the user tapped, in viewfinder points; null turns styling off.
  point: { x: number; y: number } | null;
  style: AvatarStyle;
  onStatus: (message: string) => void;
  // Used by the iPhone version only; the browser reads the <video> directly.
  camera?: unknown;
  facing?: 'front' | 'back';
  active?: boolean;
};

// Restyles the tapped object in the live camera view, frame by frame, in the browser.
export function LiveStyle({ finder, point, style, onStatus }: Props) {
  useEffect(() => {
    if (!point) return;
    const root = finder.current as unknown as HTMLElement | null;
    const video = root?.querySelector('video');
    if (!video?.parentElement) {
      onStatus('Turn on the camera to style an object.');
      return;
    }

    const overlay = document.createElement('canvas');
    const shown = getComputedStyle(video);
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: shown.transform === 'none' ? '' : shown.transform,
      pointerEvents: 'none',
    });
    video.parentElement.appendChild(overlay);
    const work = document.createElement('canvas');
    const workContext = work.getContext('2d', { willReadFrequently: true });
    const overlayContext = overlay.getContext('2d');

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    onStatus('Finding the object…');

    loadSegmenter()
      .then((model) => {
        let announced = false;
        const tick = () => {
          if (stopped) return;
          if (video.readyState >= 2 && video.videoWidth && workContext && overlayContext) {
            const width = ANALYSIS_WIDTH;
            const height = Math.round((width * video.videoHeight) / video.videoWidth);
            work.width = overlay.width = width;
            work.height = overlay.height = height;
            workContext.drawImage(video, 0, 0, width, height);
            const keypoint = toVideoPoint(video, point);
            const result = model.segment(work, { keypoint });
            const mask = result.confidenceMasks?.[0]?.getAsFloat32Array();
            if (mask) {
              const at =
                mask[
                  Math.min(height - 1, Math.round(keypoint.y * height)) * width +
                    Math.min(width - 1, Math.round(keypoint.x * width))
                ];
              const frame = workContext.getImageData(0, 0, width, height);
              stylize(frame, mask, at >= 0.5, toBridgeStyle(style));
              overlayContext.putImageData(frame, 0, 0);
              if (!announced) {
                announced = true;
                onStatus('');
              }
            }
            result.close();
          }
          timer = setTimeout(tick, FRAME_MS);
        };
        tick();
      })
      .catch(() => onStatus('Object styling could not start in this browser.'));

    return () => {
      stopped = true;
      clearTimeout(timer);
      overlay.remove();
    };
  }, [finder, point, style, onStatus]);

  return null;
}
