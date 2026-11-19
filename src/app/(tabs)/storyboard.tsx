import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, Gutter, MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { makeId, useStudio, type Panel, type Shot } from '@/state/studio';
import { extractFrames } from '@/video/frames';
import { formatTime } from '@/video/timing';

// A screening-room reel: stills on black, the one in front flat, the rest turned away in depth.
const FILM = '#000000';
const SURFACE = '#1C1C1E';
const LINE = 'rgba(255, 255, 255, 0.14)';
const MUTED = '#A1A1A6';
const CUE = '#FF9F0A';
const MONO = Platform.select({ ios: 'Menlo', default: 'ui-monospace, Menlo, monospace' });

const STEP = 172;
const CARD_W = 244;
const CARD_H = 152;
const REEL_H = CARD_H + 48;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function timecode(panel: Panel) {
  return panel.time === null ? 'PHOTO' : formatTime(panel.time).slice(3);
}

function DarkButton({
  icon,
  label,
  onPress,
  disabled,
  tone = 'plain',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.round,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={18} color={tone === 'danger' ? '#FF453A' : '#FFFFFF'} />
    </Pressable>
  );
}

// One still on the reel. Its tilt, size and stacking come from how far it sits from centre.
function Still({
  panel,
  index,
  scrollX,
  onPress,
}: {
  panel: Panel;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const offset = (scrollX.value - index * STEP) / STEP;
    const distance = Math.abs(offset);
    return {
      zIndex: Math.round(100 - distance * 10),
      opacity: interpolate(distance, [0, 3], [1, 0.35], Extrapolation.CLAMP),
      transform: [
        { perspective: 900 },
        { rotateY: `${interpolate(offset, [-1, 0, 1], [48, 0, -48], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(distance, [0, 1], [1, 0.82], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.still, style]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Panel ${index + 1}${panel.note ? `, ${panel.note}` : ''}`}
          style={StyleSheet.absoluteFill}>
          <Image source={panel.source} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function StoryboardScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { shots, setShots, panels, setPanels } = useStudio();
  const reel = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [current, setCurrent] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const pageWidth = Math.min(width, MaxContentWidth);
  const lastIndex = panels.length - 1;
  const panel = panels[Math.min(current, lastIndex)];
  const open = panels.findIndex((p) => p.id === detail);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });
  useAnimatedReaction(
    () => Math.round(scrollX.value / STEP),
    (index, previous) => {
      if (index !== previous) scheduleOnRN(setCurrent, Math.max(0, index));
    },
  );

  function show(index: number) {
    reel.current?.scrollTo({ x: index * STEP, animated: true });
    setCurrent(index);
  }

  async function addVideo(uri: string) {
    setBusy(true);
    setStatus('Reading frames…');
    try {
      const frames = await extractFrames(uri);
      const first = panels.length;
      setPanels((existing) => [
        ...existing,
        ...frames.map((f) => ({ id: makeId(), source: f.source, time: f.time, note: '' })),
      ]);
      setStatus(`${frames.length} stills added.`);
      requestAnimationFrame(() => show(first));
      return true;
    } catch {
      setStatus('That video could not be read. Try an MP4 or MOV.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    setStatus('');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (!result.canceled) await addVideo(result.assets[0].uri);
  }

  async function addShot(shot: Shot) {
    if (shot.kind === 'photo') {
      const first = panels.length;
      setPanels((existing) => [
        ...existing,
        { id: makeId(), source: { uri: shot.uri }, time: null, note: '' },
      ]);
      requestAnimationFrame(() => show(first));
    } else if (!(await addVideo(shot.uri))) {
      return;
    }
    setShots((existing) => existing.filter((s) => s.id !== shot.id));
  }

  function editNote(id: string, note: string) {
    setPanels((existing) => existing.map((p) => (p.id === id ? { ...p, note } : p)));
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target > lastIndex) return;
    setPanels((existing) => {
      const next = [...existing];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    show(target);
  }

  function remove(target: Panel) {
    const index = panels.findIndex((p) => p.id === target.id);
    setPanels((existing) => existing.filter((p) => p.id !== target.id));
    setDetail(null);
    show(Math.max(0, Math.min(index, panels.length - 2)));
  }

  const opened = open >= 0 ? panels[open] : null;

  return (
    <View style={styles.root}>
      {isFocused && <StatusBar style="light" />}
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.two,
          paddingBottom: TabBarSpace + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.page, styles.header]}>
          <ThemedText type="title" accessibilityRole="header" style={styles.white}>
            Storyboard
          </ThemedText>
          <DarkButton icon="upload" label="Upload video" onPress={upload} disabled={busy} />
        </View>

        {panel ? (
          <View style={[styles.page, styles.slate]}>
            <ThemedText style={styles.cue}>
              PANEL {pad(current + 1)} / {pad(panels.length)}
            </ThemedText>
            <ThemedText
              type="headline"
              numberOfLines={1}
              style={panel.note ? styles.white : styles.muted}>
              {panel.note || 'No narration yet'}
            </ThemedText>
            <ThemedText style={styles.mono}>{timecode(panel)}</ThemedText>
          </View>
        ) : null}

        {status ? (
          <ThemedText
            type="caption"
            style={[styles.page, styles.muted]}
            accessibilityLiveRegion="polite">
            {status}
          </ThemedText>
        ) : null}

        {panels.length ? (
          <Animated.ScrollView
            ref={reel}
            horizontal
            onScroll={onScroll}
            scrollEventThrottle={16}
            snapToInterval={STEP}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            style={styles.reel}
            contentContainerStyle={{ paddingHorizontal: (width - STEP) / 2 }}>
            {panels.map((p, i) => (
              <Still
                key={p.id}
                panel={p}
                index={i}
                scrollX={scrollX}
                onPress={() => (i === current ? setDetail(p.id) : show(i))}
              />
            ))}
          </Animated.ScrollView>
        ) : (
          <View style={[styles.page, styles.empty]}>
            <Icon name="board" size={36} color={MUTED} />
            <ThemedText style={[styles.muted, styles.center]}>
              Upload a video, or add a clip from the camera, and it becomes a reel of stills you can
              narrate.
            </ThemedText>
            <Pressable
              onPress={upload}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Icon name="upload" size={16} color={FILM} />
              <ThemedText type="label" style={{ color: FILM }}>
                Upload video
              </ThemedText>
            </Pressable>
          </View>
        )}

        {shots.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.chips}>
            {shots.map((shot) => (
              <Pressable
                key={shot.id}
                onPress={() => addShot(shot)}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Icon name={shot.kind === 'photo' ? 'photo' : 'video'} size={14} color="#FFFFFF" />
                <ThemedText type="caption" style={styles.white}>
                  {shot.kind === 'photo'
                    ? 'Add photo'
                    : `Add clip ${formatTime(shot.seconds ?? 0).slice(3)}`}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {panels.length > 0 && (
          <View style={[styles.page, styles.sheet]} accessibilityRole="list">
            {panels.map((p, i) => {
              const selected = i === current;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => (selected ? setDetail(p.id) : show(i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Panel ${i + 1}, ${timecode(p)}${p.note ? `, ${p.note}` : ''}`}
                  accessibilityState={{ selected }}
                  style={[
                    styles.cell,
                    { width: (pageWidth - Gutter * 2 - 8 * 2) / 3 },
                    selected && styles.cellSelected,
                  ]}>
                  <ThemedText style={[styles.cellNumber, selected && { color: CUE }]}>
                    {pad(i + 1)}
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={styles.cellNote}>
                    {p.note || 'Untitled'}
                  </ThemedText>
                  <ThemedText style={styles.cellTime}>{timecode(p)}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!opened}
        animationType="fade"
        transparent
        onRequestClose={() => setDetail(null)}>
        {opened && (
          <View
            style={[
              styles.detail,
              { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four },
            ]}>
            <View style={[styles.page, styles.header]}>
              <DarkButton icon="close" label="Close" onPress={() => setDetail(null)} />
              <ThemedText style={styles.cue}>
                PANEL {pad(open + 1)} / {pad(panels.length)}
              </ThemedText>
              <View style={styles.roundSpacer} />
            </View>

            <View style={styles.letterbox}>
              <View style={[styles.frame, { height: pageWidth / 1.78 }]}>
                <Image source={opened.source} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            </View>

            <View style={[styles.page, styles.detailBody]}>
              <ThemedText style={styles.mono}>{timecode(opened)}</ThemedText>
              <TextInput
                value={opened.note}
                onChangeText={(note) => editNote(opened.id, note)}
                placeholder="Add narration for this moment…"
                placeholderTextColor={MUTED}
                accessibilityLabel={`Narration for panel ${open + 1}`}
                multiline
                style={styles.narration}
              />
              <View style={styles.actions}>
                <DarkButton
                  icon="earlier"
                  label="Move panel earlier"
                  disabled={open === 0}
                  onPress={() => move(open, -1)}
                />
                <DarkButton
                  icon="later"
                  label="Move panel later"
                  disabled={open === lastIndex}
                  onPress={() => move(open, 1)}
                />
                <View style={styles.flex} />
                <DarkButton
                  icon="remove"
                  label="Delete panel"
                  tone="danger"
                  onPress={() => remove(opened)}
                />
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: FILM,
  },
  page: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  white: {
    color: '#FFFFFF',
  },
  muted: {
    color: MUTED,
  },
  center: {
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  slate: {
    marginTop: Spacing.four,
    gap: 4,
  },
  cue: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    color: CUE,
    letterSpacing: 0.6,
  },
  mono: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    fontVariant: ['tabular-nums'],
  },
  reel: {
    marginTop: Spacing.three,
    height: REEL_H,
    flexGrow: 0,
  },
  slot: {
    width: STEP,
    height: REEL_H,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  still: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  empty: {
    marginTop: Spacing.five,
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  strip: {
    flexGrow: 0,
    marginTop: Spacing.three,
  },
  chips: {
    gap: Spacing.two,
    paddingHorizontal: Gutter,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 18,
    backgroundColor: SURFACE,
  },
  sheet: {
    marginTop: Spacing.four,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    minHeight: 64,
    padding: Spacing.two,
    gap: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  cellSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cellNumber: {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
  },
  cellNote: {
    fontFamily: FontFamily,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: 600,
    color: '#FFFFFF',
  },
  cellTime: {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  roundSpacer: {
    width: 44,
  },
  detail: {
    flex: 1,
    backgroundColor: FILM,
  },
  letterbox: {
    flex: 1,
    justifyContent: 'center',
  },
  frame: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: SURFACE,
  },
  detailBody: {
    gap: Spacing.three,
  },
  narration: {
    minHeight: 72,
    maxHeight: 140,
    padding: Spacing.three - 4,
    borderRadius: 12,
    backgroundColor: SURFACE,
    fontFamily: FontFamily,
    fontSize: 17,
    lineHeight: 22,
    color: '#FFFFFF',
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});
