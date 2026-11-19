import type { SkImage } from '@shopify/react-native-skia';

export const canShare = false;

export async function saveAvatar(image: SkImage): Promise<'saved' | 'denied'> {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${image.encodeToBase64()}`;
  link.download = 'avatar.png';
  link.click();
  return 'saved';
}

export async function shareAvatar(_image: SkImage) {}
