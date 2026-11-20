import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
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
import { makeId, useStudio, type Panel, type Shot, type Take } from '@/state/studio';
import { extractFrames } from '@/video/frames';
import { formatTime } from '@/video/timing';

// A screening-room drum: 16:9 stills on black stacked vertically, three in view. The one in
// the middle faces you flat; the ones above and below tip back around the drum.
// A single greyscale ramp, light to dark, for everything on this screen.
const GREY = {
  50: '#F5F5F5', // primary text, primary buttons
  200: '#D4D4D4', // highlights: panel cue, main take
  400: '#9E9E9E', // secondary text
  600: '#5C5C5C', // dots, outlines
  800: '#262626', // surfaces: sheets, chips, empty cards
  950: '#000000', // background
} as const;
const FILM = GREY[950];
const SURFACE = GREY[800];
const MUTED = GREY[400];
const CUE = GREY[200];
const MONO = Platform.select({ ios: 'Menlo', default: 'ui-monospace, Menlo, monospace' });

const IN_VIEW = 3;
// Empty slots the reel shows before anything is uploaded, so its shape is always visible.
const PLACEHOLDERS = 5;
// The middle card aims to be 30% of the screen's height, as wide as the page allows.
const SCREEN_SHARE = 0.3;
// The tilted neighbours look about half as tall as the middle card, so slots are a bit
// shorter than a card, plus a small gap.
const SLOT = 0.78;
const GAP = 12;
// The take carousel shows the chosen take with its neighbours peeking in at the sides.
const TAKE_SHARE = 0.78;
const TAKE_GAP = 12;

function newPanel(source: Take['source'], time: number | null): Panel {
  return { id: makeId(), source, time, note: '', takes: [{ id: makeId(), source, time }] };
}

// Empty slots step from light (1) to dark (5), each with ink that stays readable on it.
const SLOT_SHADES = ['#E5E5E5', '#B3B3B3', '#808080', '#4D4D4D', '#262626'] as const;
function slotInk(number: number) {
  return (number - 1) % SLOT_SHADES.length < 3 ? '#111111' : GREY[50];
}

// The reel's slots: every card in order, plus a copy of the last card above card 1 and of
// the first card after the last, so the ends of the reel show each other like a loop.
function reelSlots(count: number) {
  return [
    { index: -1, real: count - 1 },
    ...Array.from({ length: count }, (_, i) => ({ index: i, real: i })),
    { index: count, real: 0 },
  ];
}

// Something the user is adding while panels already exist: they choose take or new panels.
type Pending = { kind: 'photo' | 'video'; uri: string; shotId?: string };

function takeCount(n: number) {
  return `${n} ${n === 1 ? 'take' : 'takes'}`;
}

function timecode(panel: { time: number | null }) {
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
      <Icon name={icon} size={18} color={tone === 'danger' ? GREY[200] : GREY[50]} />
    </Pressable>
  );
}

// One still on the reel (or an empty slot when there's no panel yet). Its tilt, size and
// stacking come from how far it sits from centre.
function Still({
  panel,
  index,
  number = index + 1,
  scrollY,
  step,
  cardWidth,
  onPress,
}: {
  panel?: Panel;
  index: number;
  // The panel number shown on the card; differs from index for the wrap-around copies.
  number?: number;
  scrollY: SharedValue<number>;
  step: number;
  cardWidth: number;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    // Negative above the middle, positive below.
    const offset = (index * step - scrollY.value) / step;
    const distance = Math.abs(offset);
    return {
      zIndex: Math.round(100 - distance * 10),
      opacity: interpolate(distance, [0, 1, 2], [1, 0.7, 0.2], Extrapolation.CLAMP),
      transform: [
        { perspective: 800 },
        { rotateX: `${interpolate(offset, [-1, 0, 1], [52, 0, -52], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(distance, [0, 1], [1, 0.86], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={[styles.slot, { height: step }]}>
      <Animated.View style={[styles.still, { width: cardWidth }, style]}>
        {panel ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Panel ${number}${panel.note ? `, ${panel.note}` : ''}`}
            style={StyleSheet.absoluteFill}>
            <Image source={panel.source} style={StyleSheet.absoluteFill} contentFit="cover" />
            <ThemedText style={styles.badge}>{number}</ThemedText>
            <ThemedText style={styles.takesBadge}>{takeCount(panel.takes.length)}</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Empty panel ${number}, upload a video`}
            style={[
              StyleSheet.absoluteFill,
              styles.slotEmpty,
              { backgroundColor: SLOT_SHADES[(number - 1) % SLOT_SHADES.length] },
            ]}>
            <Icon name="upload" size={22} color={slotInk(number)} />
            <ThemedText type="caption" style={{ color: slotInk(number) }}>
              Upload a video
            </ThemedText>
            <ThemedText style={styles.badge}>{number}</ThemedText>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

export default function StoryboardScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { shots, setShots, panels, setPanels } = useStudio();
  const reel = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const [reelHeight, setReelHeight] = useState(0);
  const [current, setCurrent] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [takeView, setTakeView] = useState(0);
  // Opened from "Add narration": the narration box takes focus straight away.
  const [narrating, setNarrating] = useState(false);

  const pageWidth = Math.min(width, MaxContentWidth);
  // Until the reel reports its size, estimate it from the screen so it never renders blank.
  const area = reelHeight || Math.max(height - insets.top - insets.bottom - TabBarSpace - 200, 240);
  const cardWidth = Math.min(pageWidth - Gutter * 2, (height * SCREEN_SHARE * 16) / 9);
  const step = ((cardWidth * 9) / 16) * SLOT + GAP;
  // Three slots tall, centred in the space below the slate.
  const reelSpace = Math.min(area, step * IN_VIEW);
  const takeWidth = Math.round(pageWidth * TAKE_SHARE);
  const takesRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const lastIndex = panels.length - 1;
  const panel = panels[Math.min(current, lastIndex)];
  const open = panels.findIndex((p) => p.id === detail);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  useAnimatedReaction(
    () => Math.round(scrollY.value / step),
    (index, previous) => {
      if (index !== previous) scheduleOnRN(setCurrent, Math.max(0, index));
    },
  );

  function show(index: number) {
    reel.current?.scrollTo({ y: index * step, animated: true });
    setCurrent(index);
  }

  // Adds a video's stills either as new panels or as another take of the existing panels,
  // matched in order (the first still becomes a take of panel 1, and so on).
  async function addVideo(uri: string, asTake: boolean) {
    setBusy(true);
    setStatus('Reading frames…');
    try {
      const frames = await extractFrames(uri);
      const first = asTake ? 0 : panels.length;
      setPanels((existing) => {
        if (!asTake) return [...existing, ...frames.map((f) => newPanel(f.source, f.time))];
        const merged = existing.map((panel, i) =>
          frames[i]
            ? {
                ...panel,
                takes: [
                  ...panel.takes,
                  { id: makeId(), source: frames[i].source, time: frames[i].time },
                ],
              }
            : panel,
        );
        return [...merged, ...frames.slice(existing.length).map((f) => newPanel(f.source, f.time))];
      });
      setStatus('');
      requestAnimationFrame(() => show(first));
      return true;
    } catch {
      setStatus('That video could not be read. Try an MP4 or MOV.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function addPhoto(uri: string, asTake: boolean) {
    if (asTake && panel) {
      const target = panel.id;
      setPanels((existing) =>
        existing.map((p) =>
          p.id === target
            ? { ...p, takes: [...p.takes, { id: makeId(), source: { uri }, time: null }] }
            : p,
        ),
      );
      return;
    }
    const first = panels.length;
    setPanels((existing) => [...existing, newPanel({ uri }, null)]);
    requestAnimationFrame(() => show(first));
  }

  // With nothing on the board yet there's nothing to be a take of, so skip the question.
  async function add(next: Pending, asTake: boolean) {
    setPending(null);
    const added =
      next.kind === 'photo' ? (addPhoto(next.uri, asTake), true) : await addVideo(next.uri, asTake);
    if (added && next.shotId) setShots((existing) => existing.filter((s) => s.id !== next.shotId));
  }

  function offer(next: Pending) {
    setStatus('');
    if (panels.length) setPending(next);
    else add(next, false);
  }

  async function upload() {
    setStatus('');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (!result.canceled) offer({ kind: 'video', uri: result.assets[0].uri });
  }

  function addShot(shot: Shot) {
    offer({ kind: shot.kind, uri: shot.uri, shotId: shot.id });
  }

  function openPanel(target: Panel, narrate = false) {
    setTakeView(
      Math.max(
        0,
        target.takes.findIndex((t) => t.source === target.source),
      ),
    );
    setNarrating(narrate);
    setDetail(target.id);
  }

  function chooseMain(target: Panel, take: Take) {
    setPanels((existing) =>
      existing.map((p) =>
        p.id === target.id ? { ...p, source: take.source, time: take.time } : p,
      ),
    );
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
      <View
        style={[
          styles.flex,
          { paddingTop: insets.top + Spacing.two, paddingBottom: TabBarSpace + insets.bottom },
        ]}>
        <View style={[styles.page, styles.header]}>
          <ThemedText type="title" accessibilityRole="header" style={styles.white}>
            Storyboards
          </ThemedText>
          <DarkButton icon="upload" label="Upload video" onPress={upload} disabled={busy} />
        </View>

        {panel ? (
          <View style={[styles.page, styles.slate]}>
            <View style={styles.slateRow}>
              <ThemedText style={styles.cue}>
                PANEL {current + 1} / {panels.length} ·{' '}
                {takeCount(panel.takes.length).toUpperCase()}
              </ThemedText>
              <ThemedText style={styles.mono}>{timecode(panel)}</ThemedText>
            </View>
            <Pressable
              onPress={() => openPanel(panel, true)}
              accessibilityRole="button"
              accessibilityLabel={panel.note ? `Narration: ${panel.note}. Edit` : 'Add narration'}
              hitSlop={8}>
              <ThemedText numberOfLines={1} style={[styles.cue, !panel.note && styles.muted]}>
                {panel.note || '+ Add narration'}
              </ThemedText>
            </Pressable>
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

        <View
          style={styles.reelArea}
          onLayout={(event) => setReelHeight(event.nativeEvent.layout.height)}>
          <Animated.ScrollView
            ref={reel}
            onScroll={onScroll}
            scrollEventThrottle={16}
            snapToInterval={step}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            style={[styles.reel, { top: (area - reelSpace) / 2, height: reelSpace }]}
            // One slot of the padding is taken by the wrap-around copy above card 1.
            contentContainerStyle={{ paddingVertical: Math.max(0, (reelSpace - step) / 2 - step) }}>
            {reelSlots(panels.length || PLACEHOLDERS).map(({ index, real }) => {
              const p = panels[real];
              const copy = index !== real;
              return (
                <Still
                  key={copy ? `copy-${index}` : (p?.id ?? `empty-${real}`)}
                  panel={p}
                  index={index}
                  number={real + 1}
                  scrollY={scrollY}
                  step={step}
                  cardWidth={cardWidth}
                  onPress={() => {
                    // Tapping any scene opens it; empty slots only upload from the middle.
                    if (p) {
                      show(real);
                      openPanel(p);
                    } else if (real === current && !copy) {
                      if (!busy) upload();
                    } else {
                      show(real);
                    }
                  }}
                />
              );
            })}
          </Animated.ScrollView>
        </View>

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
      </View>

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
                PANEL {open + 1} / {panels.length}
              </ThemedText>
              <View style={styles.roundSpacer} />
            </View>

            <View style={styles.letterbox}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={takeWidth + TAKE_GAP}
                decelerationRate="fast"
                scrollEventThrottle={16}
                contentOffset={{ x: takeView * (takeWidth + TAKE_GAP), y: 0 }}
                onScroll={({ nativeEvent }) =>
                  setTakeView(
                    Math.max(
                      0,
                      Math.min(
                        opened.takes.length - 1,
                        Math.round(nativeEvent.contentOffset.x / (takeWidth + TAKE_GAP)),
                      ),
                    ),
                  )
                }
                ref={takesRef}
                style={[styles.takes, { width: pageWidth }]}
                contentContainerStyle={{
                  gap: TAKE_GAP,
                  paddingHorizontal: (pageWidth - takeWidth) / 2,
                }}>
                {opened.takes.map((take, i) => {
                  const isMain = take.source === opened.source;
                  return (
                    <Pressable
                      key={take.id}
                      onPress={() =>
                        takesRef.current?.scrollTo({
                          x: i * (takeWidth + TAKE_GAP),
                          animated: true,
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Take ${i + 1} of ${opened.takes.length}${
                        isMain ? ', main take' : ''
                      }`}
                      style={[
                        styles.takeCard,
                        { width: takeWidth, opacity: i === takeView ? 1 : 0.55 },
                      ]}>
                      <Image
                        source={take.source}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                      <ThemedText style={styles.takeLabel}>Take {i + 1}</ThemedText>
                      {isMain && (
                        <View style={styles.takeMain}>
                          <Icon name="check" size={10} color={FILM} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {(() => {
                const viewed = opened.takes[Math.min(takeView, opened.takes.length - 1)];
                const isMain = viewed?.source === opened.source;
                return (
                  <View style={[styles.page, styles.takeBar]}>
                    <View style={styles.takeDots}>
                      {opened.takes.map((take, i) => (
                        <View
                          key={take.id}
                          style={[
                            styles.takeDot,
                            i === takeView && styles.takeDotActive,
                            take.source === opened.source && styles.takeDotMain,
                          ]}
                        />
                      ))}
                    </View>
                    <ThemedText style={styles.mono}>
                      TAKE {Math.min(takeView, opened.takes.length - 1) + 1} / {opened.takes.length}
                    </ThemedText>
                    <View style={styles.flex} />
                    {isMain ? (
                      <View style={styles.mainTag}>
                        <Icon name="check" size={12} color={CUE} />
                        <ThemedText type="caption" style={styles.cueText}>
                          Main take
                        </ThemedText>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => viewed && chooseMain(opened, viewed)}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.useMain, pressed && styles.pressed]}>
                        <ThemedText type="caption" style={{ color: FILM, fontWeight: 600 }}>
                          Use as main take
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                );
              })()}
            </View>

            <View style={[styles.page, styles.detailBody]}>
              <ThemedText style={styles.mono}>{timecode(opened)}</ThemedText>
              <TextInput
                value={opened.note}
                onChangeText={(note) => editNote(opened.id, note)}
                autoFocus={narrating}
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

      <Modal
        visible={!!pending}
        transparent
        animationType="slide"
        onRequestClose={() => setPending(null)}>
        <Pressable
          style={styles.flex}
          onPress={() => setPending(null)}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        />
        {pending && (
          <View style={[styles.choice, { paddingBottom: insets.bottom + Spacing.three }]}>
            <ThemedText type="label" accessibilityRole="header" style={styles.white}>
              {pending.kind === 'video' ? 'Add this video' : 'Add this photo'}
            </ThemedText>
            <Pressable
              onPress={() => add(pending, true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}>
              <ThemedText style={styles.white}>As a new take</ThemedText>
              <ThemedText type="caption" style={styles.muted}>
                {pending.kind === 'video'
                  ? 'Each still joins the panel in the same place, so you can compare takes.'
                  : `Joins panel ${current + 1} as another take.`}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => add(pending, false)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}>
              <ThemedText style={styles.white}>As new panels</ThemedText>
              <ThemedText type="caption" style={styles.muted}>
                Adds to the end of the storyboard.
              </ThemedText>
            </Pressable>
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
    color: GREY[50],
  },
  muted: {
    color: MUTED,
  },
  flex: {
    flex: 1,
  },
  slateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
    position: 'absolute',
    left: 0,
    right: 0,
  },
  reelArea: {
    flex: 1,
    marginTop: Spacing.two,
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  still: {
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  takesBadge: {
    position: 'absolute',
    right: Spacing.three - 4,
    top: Spacing.three - 4,
    paddingHorizontal: 8,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 18,
    color: GREY[50],
  },
  takes: {
    flexGrow: 0,
    alignSelf: 'center',
  },
  takeCard: {
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  takeLabel: {
    position: 'absolute',
    left: Spacing.three - 4,
    bottom: Spacing.three - 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    fontFamily: MONO,
    fontSize: 10,
    lineHeight: 16,
    color: GREY[50],
  },
  takeMain: {
    position: 'absolute',
    right: Spacing.three - 4,
    top: Spacing.three - 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CUE,
  },
  takeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    marginTop: Spacing.three - 4,
    minHeight: 32,
  },
  takeDots: {
    flexDirection: 'row',
    gap: 6,
  },
  takeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GREY[600],
  },
  takeDotActive: {
    backgroundColor: GREY[50],
  },
  takeDotMain: {
    borderWidth: 1.5,
    borderColor: CUE,
  },
  mainTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cueText: {
    color: CUE,
    fontWeight: 600,
  },
  useMain: {
    minHeight: 32,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: GREY[50],
  },
  choice: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingHorizontal: Gutter,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: SURFACE,
  },
  choiceRow: {
    gap: 2,
    padding: Spacing.three - 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  badge: {
    position: 'absolute',
    left: Spacing.three - 4,
    bottom: Spacing.three - 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 18,
    color: GREY[50],
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
    color: GREY[50],
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
