import { frameTimes, type VideoFrame } from '@/video/timing';

function once(target: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener('error', () => reject(new Error('Video could not be opened.')), {
      once: true,
    });
  });
}

export async function extractFrames(uri: string): Promise<VideoFrame[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = uri;
  await once(video, 'loadedmetadata');

  // MediaRecorder files report an infinite duration until the player seeks to the end.
  if (!Number.isFinite(video.duration)) {
    video.currentTime = 1e7;
    await once(video, 'seeked');
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(800, video.videoWidth);
  canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Video could not be read.');

  const frames: VideoFrame[] = [];
  for (const time of frameTimes(video.duration)) {
    video.currentTime = time;
    await once(video, 'seeked');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({ source: { uri: canvas.toDataURL('image/jpeg', 0.8) }, time });
  }
  return frames;
}
