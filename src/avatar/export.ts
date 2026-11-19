import type { SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';

export const canShare = true;

async function writePng(image: SkImage) {
  const file = new File(Paths.cache, `avatar-${Date.now()}.png`);
  await file.write(image.encodeToBytes());
  return file.uri;
}

export async function saveAvatar(image: SkImage): Promise<'saved' | 'denied'> {
  const { granted } = await requestPermissionsAsync(true);
  if (!granted) return 'denied';
  await Asset.create(await writePng(image));
  return 'saved';
}

export async function shareAvatar(image: SkImage) {
  await Sharing.shareAsync(await writePng(image), {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: 'Share your avatar',
  });
}
