import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';

// SF Symbol on iOS, Material Symbol on Android and web.
const ICONS = {
  back: ['chevron.left', 'arrow_back_ios_new'],
  camera: ['camera', 'photo_camera'],
  flip: ['camera.rotate', 'cameraswitch'],
  light: ['flashlight.on.fill', 'flashlight_on'],
  add: ['plus', 'add'],
  close: ['xmark', 'close'],
  save: ['square.and.arrow.down', 'download'],
  share: ['square.and.arrow.up', 'ios_share'],
  sparkles: ['sparkles', 'auto_awesome'],
  upload: ['arrow.up.circle', 'upload'],
  video: ['video', 'videocam'],
  photo: ['photo', 'image'],
  play: ['play.fill', 'play_arrow'],
  earlier: ['chevron.left', 'chevron_left'],
  later: ['chevron.right', 'chevron_right'],
  remove: ['trash', 'delete'],
  avatar: ['person.crop.circle', 'account_circle'],
  artwork: ['paintpalette', 'palette'],
  board: ['rectangle.stack', 'view_carousel'],
  style: ['slider.horizontal.3', 'tune'],
  check: ['checkmark', 'check'],
  animate: ['figure.walk.motion', 'directions_run'],
  pause: ['pause.fill', 'pause'],
  rig: ['figure.arms.open', 'accessibility_new'],
  up: ['chevron.up', 'expand_less'],
  down: ['chevron.down', 'expand_more'],
  note: ['text.bubble', 'chat_bubble_outline'],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color = Colors.text,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  const [ios, material] = ICONS[name];
  return (
    <SymbolView
      name={{ ios, android: material, web: material }}
      size={size}
      tintColor={color}
      weight="medium"
    />
  );
}
