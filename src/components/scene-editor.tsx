import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LOOKS, LookLayers } from '@/camera/looks';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DEFAULT_EDIT, type PanelEdit, type Transition } from '@/state/studio';

const WHITE = '#F5F5F5';
const MUTED = '#9E9E9E';
const LINE = '#5C5C5C';
const INK = '#000000';
const MONO = Platform.select({ ios: 'Menlo', default: 'ui-monospace, Menlo, monospace' });

type Tool = 'length' | 'speed' | 'look' | 'crop' | 'transition';
const TOOLS: { id: Tool; label: string; icon: IconName }[] = [
  { id: 'length', label: 'Trim', icon: 'trim' },
  { id: 'speed', label: 'Speed', icon: 'speed' },
  { id: 'look', label: 'Look', icon: 'look' },
  { id: 'crop', label: 'Crop', icon: 'crop' },
  { id: 'transition', label: 'Transition', icon: 'transition' },
];

const LENGTHS = [1, 2, 3, 5, 8];
const SPEEDS = [0.5, 1, 1.5, 2];
const ZOOMS = [1, 1.25, 1.5, 2];
const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'fade', label: 'Fade' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'wipe', label: 'Wipe' },
];

// Seconds the panel actually plays for once speed is applied.
export function onScreen(edit: PanelEdit = DEFAULT_EDIT) {
  return edit.length / edit.speed;
}

// A still shown the way the edit will play it: cropped in, mirrored and graded.
export function EditedImage({
  source,
  edit = DEFAULT_EDIT,
}: {
  source: ImageProps['source'];
  edit?: PanelEdit;
}) {
  const look = LOOKS.find((l) => l.id === edit.look);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      <Image
        source={source}
        contentFit="cover"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ scale: edit.zoom }, { scaleX: edit.flipped ? -1 : 1 }] },
        ]}
      />
      {look && <LookLayers look={look} />}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        pressed && styles.pressed,
      ]}>
      <ThemedText style={[styles.chipText, selected && styles.chipTextOn]}>{label}</ThemedText>
    </Pressable>
  );
}

// The bottom of an opened scene: pick a tool, then one of its settings. Changes show on the
// takes straight away.
export function SceneEditor({
  edit = DEFAULT_EDIT,
  onChange,
}: {
  edit?: PanelEdit;
  onChange: (next: PanelEdit) => void;
}) {
  const [tool, setTool] = useState<Tool>('length');
  const set = (patch: Partial<PanelEdit>) => onChange({ ...edit, ...patch });

  let options: { key: string; label: string; selected: boolean; onPress: () => void }[];
  switch (tool) {
    case 'length':
      options = LENGTHS.map((n) => ({
        key: `${n}`,
        label: `${n}s`,
        selected: edit.length === n,
        onPress: () => set({ length: n }),
      }));
      break;
    case 'speed':
      options = SPEEDS.map((n) => ({
        key: `${n}`,
        label: `${n}×`,
        selected: edit.speed === n,
        onPress: () => set({ speed: n }),
      }));
      break;
    case 'look':
      options = [
        { key: 'none', label: 'None', selected: !edit.look, onPress: () => set({ look: null }) },
        ...LOOKS.map((l) => ({
          key: l.id,
          label: l.name,
          selected: edit.look === l.id,
          onPress: () => set({ look: l.id }),
        })),
      ];
      break;
    case 'crop':
      options = [
        ...ZOOMS.map((n) => ({
          key: `${n}`,
          label: n === 1 ? 'Full' : `${n}×`,
          selected: edit.zoom === n,
          onPress: () => set({ zoom: n }),
        })),
        {
          key: 'mirror',
          label: 'Mirror',
          selected: edit.flipped,
          onPress: () => set({ flipped: !edit.flipped }),
        },
      ];
      break;
    case 'transition':
      options = TRANSITIONS.map((t) => ({
        key: t.id,
        label: t.label,
        selected: edit.transition === t.id,
        onPress: () => set({ transition: t.id }),
      }));
      break;
  }

  return (
    <View style={styles.editor}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.optionsScroll}
        contentContainerStyle={styles.options}>
        {options.map(({ key, ...option }) => (
          <Chip key={key} {...option} />
        ))}
      </ScrollView>
      <View style={styles.tools} accessibilityRole="tablist">
        {TOOLS.map((t) => {
          const active = t.id === tool;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTool(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              hitSlop={4}
              style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
              <Icon name={t.icon} size={20} weight="light" color={active ? WHITE : MUTED} />
              <ThemedText style={[styles.toolLabel, active && styles.toolLabelOn]}>
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Rounded here too: blend-mode layers can escape a parent's rounded clip on the web.
  clip: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  editor: {
    gap: Spacing.two,
    paddingTop: Spacing.three - 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LINE,
  },
  optionsScroll: {
    flexGrow: 0,
  },
  options: {
    gap: Spacing.two,
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 16,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  chipOn: {
    backgroundColor: WHITE,
    borderColor: WHITE,
  },
  chipText: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 16,
    color: WHITE,
  },
  chipTextOn: {
    color: INK,
    fontWeight: 600,
  },
  tools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tool: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toolLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
  },
  toolLabelOn: {
    color: WHITE,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.6,
  },
});
