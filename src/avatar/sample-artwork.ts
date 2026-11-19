import { AlphaType, ColorType, Skia, rect } from '@shopify/react-native-skia';

import { SAMPLE_SIZE, type ArtworkSample } from '@/avatar/style';

// Shrinks an artwork to a small RGBA buffer, which is all the style analysis needs.
export async function sampleArtwork(uri: string): Promise<ArtworkSample> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  const surface = Skia.Surface.Make(SAMPLE_SIZE, SAMPLE_SIZE);
  if (!image || !surface) throw new Error('This image could not be read.');

  surface
    .getCanvas()
    .drawImageRect(
      image,
      rect(0, 0, image.width(), image.height()),
      rect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE),
      Skia.Paint(),
    );
  surface.flush();

  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: SAMPLE_SIZE,
    height: SAMPLE_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!(pixels instanceof Uint8Array)) throw new Error('This image could not be read.');
  return pixels;
}
