import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';

const TABS: { route: string; name: string; icon: IconName }[] = [
  { route: 'create', name: 'Artwork', icon: 'artwork' },
  { route: 'camera', name: 'Camera', icon: 'camera' },
  { route: 'storyboard', name: 'Storyboard', icon: 'board' },
];

// Screens without a tab of their own keep the tab they were opened from lit.
const PARENT_TAB: Record<string, string> = { animate: 'create' };

const ITEM_W = 72;
const ITEM_H = 38;
const PAD = 4;
const SPOT = 32;
const SPRING = { damping: 18, stiffness: 200, mass: 0.8 };
const GLASS = isLiquidGlassAvailable();
const ICON = '#FFFFFF';

function spotLeft(index: number) {
  return PAD + index * ITEM_W + (ITEM_W - SPOT) / 2;
}

// A clear pane of glass: Apple's clear liquid glass where available, otherwise a nearly
// transparent fill with a blur behind it (web) and a thin bright rim.
function ClearGlass({ style, children }: { style: ViewStyle; children: ReactNode }) {
  if (GLASS) {
    return (
      <GlassView style={style} glassEffectStyle="clear">
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.fallback, style]}>{children}</View>;
}

// A floating, see-through bar of white line icons. A soft spot of light slides to the tab
// you're on; the others sit back a little.
export function RouteTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const current = state.routes[state.index]?.name;
  const activeTab = PARENT_TAB[current] ?? current;
  const activeIndex = TABS.findIndex((t) => t.route === activeTab);

  const x = useSharedValue(spotLeft(Math.max(0, activeIndex)));
  useEffect(() => {
    if (activeIndex >= 0) x.value = withSpring(spotLeft(activeIndex), SPRING);
  }, [activeIndex, x]);
  const spotStyle = useAnimatedStyle(() => ({
    opacity: activeIndex >= 0 ? 1 : 0,
    transform: [{ translateX: x.value }],
  }));

  function go(route: string) {
    if (route === current) return;
    const target = state.routes.find((r) => r.name === route);
    if (!target) return;
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    navigateToTab(target.key);
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[styles.center, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}
        pointerEvents="box-none">
        <ClearGlass style={styles.bar}>
          {/* A faint sheen across the top edge, like light catching the glass. */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0)']}
            locations={[0, 0.6]}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View pointerEvents="none" style={[styles.spot, spotStyle]} />
          <View style={styles.row} accessibilityRole="tablist">
            {TABS.map((tab, i) => {
              const selected = i === activeIndex;
              return (
                <Pressable
                  key={tab.route}
                  onPress={() => go(tab.route)}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.name}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                  <View style={!selected && styles.resting}>
                    <Icon name={tab.icon} size={21} color={ICON} weight="light" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ClearGlass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.six,
  },
  center: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    borderRadius: (ITEM_H + PAD * 2) / 2,
    padding: PAD,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.25)',
    // Blurs what's behind the bar in the browser; ignored on iPhone, where liquid glass
    // (or this nearly clear fill) is used instead.
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(18px) saturate(150%)' } as unknown as ViewStyle)
      : null),
  },
  spot: {
    position: 'absolute',
    left: 0,
    top: PAD + (ITEM_H - SPOT) / 2,
    width: SPOT,
    height: SPOT,
    borderRadius: SPOT / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  row: {
    flexDirection: 'row',
  },
  item: {
    width: ITEM_W,
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resting: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
  },
});
