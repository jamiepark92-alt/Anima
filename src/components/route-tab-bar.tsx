import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Glass } from '@/components/ui';
import { Colors, FontFamily, Spacing } from '@/constants/theme';

const TABS: { route: string; name: string; icon: IconName }[] = [
  { route: 'create', name: 'Artwork', icon: 'artwork' },
  { route: 'camera', name: 'Camera', icon: 'camera' },
  { route: 'storyboard', name: 'Storyboard', icon: 'board' },
];

// Screens without a tab of their own keep the tab they were opened from lit.
const PARENT_TAB: Record<string, string> = { animate: 'create' };

const ITEM_W = 84;
const ITEM_H = 56;
const PAD = 6;
const LENS_W = ITEM_W + 10;
const LENS_H = ITEM_H + 12;
// The lens enlarges what sits under it, like a drop of water on the bar.
const MAGNIFY = 1.14;
const SPRING = { damping: 16, stiffness: 190, mass: 0.8 };

function lensLeft(index: number) {
  return PAD + index * ITEM_W - (LENS_W - ITEM_W) / 2;
}

// One row of tab icons and labels; drawn once on the bar and once, enlarged, inside the lens.
function Row({ tint, dim }: { tint: string; dim: string }) {
  return (
    <View style={styles.row}>
      {TABS.map((tab) => (
        <View key={tab.route} style={styles.item}>
          <Icon name={tab.icon} size={22} color={tint} />
          <ThemedText style={[styles.label, { color: dim }]}>{tab.name}</ThemedText>
        </View>
      ))}
    </View>
  );
}

// A floating glass bar with a liquid lens that slides to the current tab.
export function RouteTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const current = state.routes[state.index]?.name;
  const activeTab = PARENT_TAB[current] ?? current;
  const activeIndex = TABS.findIndex((t) => t.route === activeTab);
  // Dark screens (the viewfinder, the film reel) would be fogged by the light fade.
  const overDark = current === 'camera' || current === 'storyboard';

  const x = useSharedValue(lensLeft(Math.max(0, activeIndex)));
  const stretch = useSharedValue(1);
  const shown = useSharedValue(activeIndex >= 0 ? 1 : 0);

  useEffect(() => {
    if (activeIndex >= 0) {
      x.value = withSpring(lensLeft(activeIndex), SPRING);
      // The drop pulls long while it travels, then settles back to round.
      stretch.value = withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, SPRING));
    }
    shown.value = withTiming(activeIndex >= 0 ? 1 : 0, { duration: 180 });
  }, [activeIndex, x, stretch, shown]);

  const lensStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: x.value },
      { scaleX: stretch.value },
      { scale: 0.85 + 0.15 * shown.value },
    ],
  }));
  // Keeps the enlarged copy lined up with the real row beneath the lens.
  const insideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -x.value }],
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
      {!overDark && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(250,250,250,0)', 'rgba(250,250,250,0.92)']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[styles.center, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}
        pointerEvents="box-none">
        <Glass style={styles.bar}>
          <View pointerEvents="none">
            <Row tint={Colors.textSecondary} dim={Colors.textSecondary} />
          </View>

          <Animated.View pointerEvents="none" style={[styles.lens, lensStyle]}>
            <View style={styles.rim}>
              <View style={styles.lensInner}>
                <View style={styles.magnify}>
                  <Animated.View style={[styles.copy, insideStyle]}>
                    <Row tint={Colors.text} dim={Colors.text} />
                  </Animated.View>
                </View>
                <View style={styles.shine} />
              </View>
            </View>
          </Animated.View>

          <View style={styles.hits} accessibilityRole="tablist">
            {TABS.map((tab, i) => (
              <Pressable
                key={tab.route}
                onPress={() => go(tab.route)}
                accessibilityRole="tab"
                accessibilityLabel={tab.name}
                accessibilityState={{ selected: i === activeIndex }}
                style={styles.hit}
              />
            ))}
          </View>
        </Glass>
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
  },
  row: {
    flexDirection: 'row',
  },
  item: {
    width: ITEM_W,
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontFamily: FontFamily,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: 600,
  },
  lens: {
    position: 'absolute',
    left: 0,
    top: PAD - (LENS_H - ITEM_H) / 2,
    width: LENS_W,
    height: LENS_H,
  },
  rim: {
    flex: 1,
    borderRadius: LENS_H / 2,
    padding: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    boxShadow: '0px 6px 18px rgba(40, 50, 90, 0.16), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.06)',
  },
  lensInner: {
    flex: 1,
    borderRadius: LENS_H / 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  magnify: {
    ...StyleSheet.absoluteFill,
    transform: [{ scale: MAGNIFY }],
  },
  copy: {
    position: 'absolute',
    top: (LENS_H - ITEM_H) / 2 - 1.5,
    left: -1.5,
  },
  shine: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 3,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  hits: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    padding: PAD,
  },
  hit: {
    width: ITEM_W,
    height: ITEM_H,
  },
});
