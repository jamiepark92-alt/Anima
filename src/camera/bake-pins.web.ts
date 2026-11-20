import { pinRects, type BakeInput } from '@/camera/pin-geometry';

function loadImage(uri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('An image could not be read.'));
    image.src = uri;
  });
}

// Web version: the Camera tab doesn't load Skia in the browser, so this uses a 2D canvas.
export async function bakePins({ photo, pins, view, mirrored }: BakeInput): Promise<string> {
  const base = await loadImage(photo.uri);
  const width = base.naturalWidth;
  const height = base.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The photo could not be drawn.');
  context.drawImage(base, 0, 0);

  for (const { uri, box } of pinRects({ width, height }, pins, view, mirrored)) {
    const art = await loadImage(uri).catch(() => null);
    if (!art) continue;
    const fit = Math.min(box.size / art.naturalWidth, box.size / art.naturalHeight);
    const w = art.naturalWidth * fit;
    const h = art.naturalHeight * fit;
    context.drawImage(art, box.cx - w / 2, box.cy - h / 2, w, h);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}
