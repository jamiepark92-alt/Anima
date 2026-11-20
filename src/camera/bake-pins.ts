import { ImageFormat, Skia, rect } from '@shopify/react-native-skia';

import { pinRects, type BakeInput } from '@/camera/pin-geometry';

// Draws the pinned props onto a captured photo and returns the result as a JPEG data URI.
export async function bakePins({ photo, pins, view, mirrored }: BakeInput): Promise<string> {
  const base = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(photo.uri));
  if (!base) throw new Error('The photo could not be read.');
  const width = base.width();
  const height = base.height();
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('The photo could not be drawn.');

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  canvas.drawImage(base, 0, 0, paint);

  for (const { uri, box } of pinRects({ width, height }, pins, view, mirrored)) {
    const art = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
    if (!art) continue;
    const fit = Math.min(box.size / art.width(), box.size / art.height());
    const w = art.width() * fit;
    const h = art.height() * fit;
    canvas.drawImageRect(
      art,
      rect(0, 0, art.width(), art.height()),
      rect(box.cx - w / 2, box.cy - h / 2, w, h),
      paint,
    );
  }

  surface.flush();
  const encoded = surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 90);
  return `data:image/jpeg;base64,${encoded}`;
}
