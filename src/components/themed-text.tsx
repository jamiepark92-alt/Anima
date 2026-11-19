import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'title' | 'headline' | 'body' | 'label' | 'caption' | 'timecode';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FontFamily,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 700,
    letterSpacing: -0.8,
  },
  headline: {
    fontFamily: FontFamily,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: 600,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: FontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 400,
  },
  label: {
    fontFamily: FontFamily,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: 500,
  },
  caption: {
    fontFamily: FontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 400,
  },
  timecode: {
    fontFamily: FontFamily,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 500,
    fontVariant: ['tabular-nums'],
  },
});
