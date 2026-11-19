import { createVideoPlayer } from 'expo-video';

import { frameTimes, type VideoFrame } from '@/video/timing';

// Frames are native image refs held in memory, ready for expo-image.
export async function extractFrames(uri: string): Promise<VideoFrame[]> {
  const player = createVideoPlayer(uri);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video took too long to open.')), 15000);
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        subscription.remove();
        if (error) reject(error);
        else resolve();
      };
      const subscription = player.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay') finish();
        if (status === 'error') finish(new Error('Video could not be opened.'));
      });
      if (player.status === 'readyToPlay') finish();
    });
    const times = frameTimes(player.duration);
    const thumbnails = await player.generateThumbnailsAsync(times, { maxWidth: 800 });
    return thumbnails.map((source, i) => ({ source, time: times[i] }));
  } finally {
    player.release();
  }
}
