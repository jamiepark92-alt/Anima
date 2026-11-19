import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  Gutter,
  MaxContentWidth,
  Radius,
  Shadow,
  Spacing,
  TabBarSpace,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const GLASS = isLiquidGlassAvailable();

// iOS 26 Liquid Glass where available, a frosted white surface elsewhere.
export function Glass({
  style,
  children,
  interactive,
}: {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  interactive?: boolean;
}) {
  if (GLASS) {
    return (
      <GlassView style={style} glassEffectStyle="regular" isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.glassFallback, style]}>{children}</View>;
}

export function GlassButton({
  icon,
  label,
  onPress,
  disabled,
  selected,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      style={({ pressed }) => [(pressed || disabled) && styles.dimmed]}>
      <Glass interactive style={[styles.glassButton, selected && styles.glassSelected]}>
        <Icon name={icon} size={20} color={selected ? Colors.card : Colors.text} />
      </Glass>
    </Pressable>
  );
}

export function GlassPill({
  children,
  onPress,
  icon,
  disabled,
  accessibilityLabel,
}: {
  children: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [(pressed || disabled) && styles.dimmed]}>
      <Glass interactive style={styles.glassPill}>
        <ThemedText type="label">{children}</ThemedText>
        {icon && <Icon name={icon} size={17} />}
      </Glass>
    </Pressable>
  );
}

// Solid pills: black for the main action, white for secondary ones.
export function Pill({
  children,
  onPress,
  secondary,
  icon,
  disabled,
  grow = true,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  icon?: IconName;
  disabled?: boolean;
  grow?: boolean;
}) {
  const theme = useTheme();
  const color = secondary ? theme.text : theme.card;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.pill,
        grow && styles.grow,
        secondary ? [styles.pillSecondary, Shadow] : { backgroundColor: theme.text },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText type="label" style={{ color }}>
        {children}
      </ThemedText>
      {icon && <Icon name={icon} size={17} color={color} />}
    </Pressable>
  );
}

export function Title({ strong, soft }: { strong: string; soft?: string }) {
  return (
    <ThemedText type="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
      {strong}
      {soft ? <ThemedText type="title" themeColor="textTertiary">{` ${soft}`}</ThemedText> : null}
    </ThemedText>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="headline" accessibilityRole="header">
        {title}
      </ThemedText>
      {count ? (
        <ThemedText type="label" themeColor="textSecondary">
          {count}
        </ThemedText>
      ) : null}
    </View>
  );
}

// A photo that bleeds to the top edge and fades into the page, with the title on top.
export function HeroScreen({
  heroHeight,
  media,
  title,
  soft,
  action,
  topRight,
  children,
}: {
  heroHeight: number;
  media: ReactNode;
  title: string;
  soft?: string;
  action?: ReactNode;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: TabBarSpace + insets.bottom }]}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { height: heroHeight }]}>
          <View style={styles.heroMedia}>{media}</View>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(250,250,250,0.75)', 'rgba(250,250,250,0)']}
            style={[styles.fadeTop, { height: insets.top + 90 }]}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(250,250,250,0)', 'rgba(250,250,250,0.8)', Colors.background]}
            locations={[0, 0.5, 0.82]}
            style={[styles.fadeBottom, { height: heroHeight * 0.5 }]}
          />
          <View style={styles.heroTitle}>
            <View style={styles.heroTitleText}>
              <Title strong={title} soft={soft} />
            </View>
            {action}
          </View>
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.topRight}>{topRight}</View>
      </View>
    </View>
  );
}

// Three-up portrait tiles, as in Photos.
export function useTileSize(width: number) {
  const content = Math.min(width, MaxContentWidth) - Gutter * 2;
  const gap = Spacing.two + 2;
  const tile = (content - gap * 2) / 3;
  return { tile, gap, tileHeight: tile * 1.38 };
}

export const tileStyle = StyleSheet.create({
  base: {
    borderRadius: Radius.tile,
    overflow: 'hidden',
    backgroundColor: Colors.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
});

const TICKS = 19;
const THUMB_WIDTH = 30;

export function TickSlider({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  function fromTouch(e: GestureResponderEvent) {
    if (!width) return;
    const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    const next = 1 + Math.round(ratio * 9);
    if (next !== value) onChange(next);
  }

  function onAction(e: AccessibilityActionEvent) {
    const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
    onChange(Math.min(10, Math.max(1, value + step)));
  }

  return (
    <View style={styles.slider}>
      <View style={styles.sliderLabels}>
        <ThemedText type="caption" themeColor="textSecondary">
          {low}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {high}
        </ThemedText>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={fromTouch}
        onResponderMove={fromTouch}
        onResponderTerminationRequest={() => false}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: 10, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}>
        <View style={styles.ticks} pointerEvents="none">
          {Array.from({ length: TICKS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  backgroundColor: i % 2 === 0 ? theme.text : theme.dot,
                  height: i % 2 === 0 ? 16 : 10,
                },
              ]}
            />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            Shadow,
            { left: ((value - 1) / 9) * Math.max(0, width - THUMB_WIDTH) },
          ]}>
          <ThemedText type="caption" style={styles.thumbText}>
            {value}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

// Speaker-grille dots on the golden angle; a quiet placeholder for empty heroes.
export function DotGrille({ size, count = 170 }: { size: number; count?: number }) {
  const theme = useTheme();
  const dot = size * 0.03;
  const spread = (size / 2 - dot) / Math.sqrt(count);
  return (
    <View style={{ width: size, height: size }} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const radius = spread * Math.sqrt(i + 1);
        const angle = (i + 1) * 2.39996;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: theme.dot,
              left: size / 2 + radius * Math.cos(angle) - dot / 2,
              top: size / 2 + radius * Math.sin(angle) - dot / 2,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  hero: {
    width: '100%',
    overflow: 'hidden',
  },
  heroMedia: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  heroTitle: {
    position: 'absolute',
    left: Gutter,
    right: Gutter,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroTitleText: {
    flex: 1,
  },
  title: {
    flexShrink: 1,
  },
  body: {
    paddingHorizontal: Gutter,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  topRight: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  glassFallback: {
    backgroundColor: Colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    ...Shadow,
  },
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassSelected: {
    backgroundColor: Colors.text,
  },
  glassPill: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: Spacing.three + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pill: {
    minHeight: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  grow: {
    flex: 1,
  },
  pillSecondary: {
    backgroundColor: Colors.card,
  },
  dimmed: {
    opacity: 0.45,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  slider: {
    gap: Spacing.one,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 44,
    justifyContent: 'center',
  },
  ticks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THUMB_WIDTH / 2,
  },
  tick: {
    width: 2,
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_WIDTH,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.text,
  },
  thumbText: {
    color: Colors.card,
    fontWeight: 600,
  },
});
