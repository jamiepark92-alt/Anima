import { ImageFormat, Skia, rect, type SkImage } from '@shopify/react-native-skia';

import { askBridge } from '@/rig/pose-bridge';
import { cleanPoses, poseFromLandmarks, type Pose } from '@/rig/skeleton';
import { TRACK_FPS, TRACK_MAX_SECONDS, type Performance, type TrackOptions } from '@/rig/types';

const ANALYSIS_WIDTH = 480;
const STILL_WIDTH = 160;
const FRAME_WAIT_MS = 1500;

type Video = Awaited<ReturnType<typeof Skia.Video>>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Seeking is asynchronous, so poll until the frame for the new time arrives.
async function frameAt(video: Video, ms: number) {
  video.seek(ms);
  const started = Date.now();
  while (Date.now() - started < FRAME_WAIT_MS) {
    await sleep(12);
    const image = video.nextImage();
    if (image) return image;
  }
  return null;
}

// Draws a video frame upright and scaled into a fresh surface, returned as JPEG base64.
function render(image: SkImage, rotation: number, width: number, height: number, quality: number) {
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('Video could not be read.');
  const canvas = surface.getCanvas();
  const sideways = rotation % 180 !== 0;
  const drawW = sideways ? height : width;
  const drawH = sideways ? width : height;
  canvas.translate(width / 2, height / 2);
  canvas.rotate(rotation, 0, 0);
  canvas.drawImageRect(
    image,
    rect(0, 0, image.width(), image.height()),
    rect(-drawW / 2, -drawH / 2, drawW, drawH),
    Skia.Paint(),
  );
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const data = snapshot.encodeToBase64(ImageFormat.JPEG, quality);
  snapshot.dispose();
  surface.dispose();
  return data;
}

function decodeMask(rest: { width: number; height: number; data: string }) {
  const text = atob(rest.data);
  const values = new Float32Array(text.length);
  for (let i = 0; i < text.length; i++) values[i] = text.charCodeAt(i) / 255;
  return { width: rest.width, height: rest.height, data: values };
}

// On iPhone, frames are read with Skia and tracked by MediaPipe in the hidden PoseBridge web view.
export async function trackVideo(uri: string, options: TrackOptions = {}): Promise<Performance> {
  const fps = options.fps ?? TRACK_FPS;
  const video = await Skia.Video(uri);
  video.pause();
  console.log('[track] video', JSON.stringify({ uri, size: video.size(), rotation: video.rotation(), ms: video.duration() }));
  try {
    const rotation = video.rotation();
    const size = video.size();
    const upright = rotation % 180 === 0 ? size : { width: size.height, height: size.width };
    const width = Math.min(ANALYSIS_WIDTH, upright.width);
    const height = Math.round(width * (upright.height / upright.width));
    const stillHeight = Math.round(STILL_WIDTH * (height / width));

    const seconds = Math.min(video.duration() / 1000, options.maxSeconds ?? TRACK_MAX_SECONDS);
    const count = Math.max(1, Math.floor(seconds * fps));
    const raw: (Pose | null)[] = [];
    const stills: string[] = [];

    for (let i = 0; i < count; i++) {
      // The extra millisecond makes the first seek register as a change of time.
      const image = await frameAt(video, (i * 1000) / fps + 1);
      if (!image) {
        console.warn('[track] no frame at', i);
        raw.push(null);
        stills.push(stills[stills.length - 1] ?? '');
        options.onProgress?.((i + 1) / count);
        continue;
      }
      const frame = render(image, rotation, width, height, 80);
      const still = render(image, rotation, STILL_WIDTH, stillHeight, 70);
      stills.push(`data:image/jpeg;base64,${still}`);
      image.dispose();

      const reply = await askBridge({ type: 'frame', index: i, step: 1000 / fps, data: frame });
      raw.push(
        reply.type === 'pose' && reply.landmarks
          ? poseFromLandmarks(
              reply.landmarks.map(([x, y, visibility]) => ({ x, y, visibility })),
              width,
              height,
            )
          : null,
      );
      options.onProgress?.((i + 1) / count);
    }

    console.log('[track] frames', count, 'with a body', raw.filter(Boolean).length);
    const done = await askBridge({ type: 'finish' });
    const rest = done.type === 'done' ? done.rest : null;
    const poses = cleanPoses(raw);
    if (!poses.length) throw new Error('No one was found in that video.');
    return {
      width,
      height,
      fps,
      poses,
      restIndex: rest?.index ?? 0,
      silhouette: rest ? decodeMask(rest) : null,
      stills,
    };
  } finally {
    video.dispose();
  }
}
