import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

// Wireframe look: flat paper, ink outlines, no glass or shadows.
// Dark wireframe, on the same black as Camera and Storyboard.
export const PAPER = '#000000';
export const INK = '#FFFFFF';
export const BOX = '#1C1C1E';
export const ADDED = '#248A3D';
export const LINE = 1.5;

export function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [wire.round, pressed && wire.pressed]}>
      <Icon name={icon} size={20} color={INK} />
    </Pressable>
  );
}

export function WirePill({
  icon,
  children,
  selected,
  disabled,
  onPress,
}: {
  icon: IconName;
  children: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        wire.pill,
        selected && wire.pillSelected,
        disabled && wire.disabled,
        pressed && wire.pressed,
      ]}>
      <Icon name={icon} size={16} color={selected ? BOX : INK} />
      <ThemedText type="caption" style={[wire.pillText, selected && { color: BOX }]}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

const wire = StyleSheet.create({
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BOX,
    borderWidth: LINE,
    borderColor: INK,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 18,
    backgroundColor: BOX,
    // Hairline to match the section switch above it.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  pillSelected: {
    backgroundColor: INK,
  },
  pillText: {
    color: INK,
    fontWeight: 500,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});
