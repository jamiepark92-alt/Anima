import { Platform } from 'react-native';

import '@/global.css';

export const Colors = {
  background: '#FAFAFA',
  card: '#FFFFFF',
  fill: '#EFEFF1',
  text: '#000000',
  textSecondary: '#6E6E73',
  // Large titles only; too light for body copy.
  textTertiary: '#8A8A8E',
  hairline: 'rgba(0, 0, 0, 0.06)',
  glass: 'rgba(255, 255, 255, 0.86)',
  dot: '#C7C7CC',
  record: '#FF3B30',
} as const;

export type ThemeColor = keyof typeof Colors;

// SF Pro on iOS; the closest system face elsewhere.
export const FontFamily = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif',
  default: undefined,
});

export const Shadow = { boxShadow: '0px 4px 18px rgba(0, 0, 0, 0.08)' } as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { tile: 14, card: 20 } as const;
export const Gutter = Spacing.three;
export const MaxContentWidth = 560;
// Room left under scrolling content for the floating tab bar.
export const TabBarSpace = 112;
