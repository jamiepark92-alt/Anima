import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sampleArtwork } from '@/avatar/sample-artwork';
import { DEFAULT_STYLE, readStyle, type StyleValues } from '@/avatar/style';
import { DescribeSheet } from '@/components/describe-sheet';
import { RecordStage } from '@/components/record-stage';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { TickSlider } from '@/components/ui';
import { BOX, INK, LINE, PAPER, WirePill } from '@/components/wire';
import { Colors, Gutter, MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { useStudio } from '@/state/studio';

const MAX_ART = 4;
const MIN_ART = 3;

const CARD_W = 100;
const CARD_H = 124;
// Same soft porcelain card as the Storyboard panels.
const SOFT_CARD = '#1C1C1E';
const SOFT_FRAME = '#2C2C2E';
const MUTED = '#8E8E93';

// Where each added artwork floats around the figure, like tags on a model.
const CHIP_SPOTS = [
  { left: '10%', top: '20%' },
  { right: '10%', top: '44%' },
  { left: '12%', top: '66%' },
  { right: '12%', top: '14%' },
] as const;

const SECTIONS = [
  { key: 'character', label: 'Character' },
  { key: 'props', label: 'Props' },
  { key: 'set', label: 'Set' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

const LIBRARY = {
  props: {
    noun: 'prop',
    empty: 'Add drawings of objects your character can hold or use.',
  },
  set: {
    noun: 'set',
    empty: 'Add a backdrop for your character to perform in.',
  },
} as const;

// Opens the sheet where you type or dictate something for FLUX to draw.
function DescribeCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Describe one to make it"
      style={({ pressed }) => [styles.card, styles.cardNext, pressed && styles.pressed]}>
      <View style={[styles.cardFrame, styles.cardDashed]}>
        <View style={styles.cardPlus}>
          <Icon name="sparkles" size={18} color={INK} />
        </View>
        <ThemedText type="caption" style={styles.muted}>
          Describe
        </ThemedText>
      </View>
    </Pressable>
  );
}

// Props and sets: a large preview of the chosen drawing over a row of soft cards.
function Library({
  kind,
  items,
  setItems,
}: {
  kind: keyof typeof LIBRARY;
  items: string[];
  setItems: (update: (current: string[]) => string[]) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [describing, setDescribing] = useState(false);
  const copy = LIBRARY[kind];
  const index = Math.min(selected, items.length - 1);
  const current = items[index];

  async function add() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    setSelected(items.length);
    setItems((existing) => [...existing, ...result.assets.map((asset) => asset.uri)]);
  }

  function remove(uri: string) {
    setItems((existing) => existing.filter((item) => item !== uri));
    setSelected((i) => Math.max(0, i - 1));
  }

  return (
    <>
      <View style={styles.stage}>
        {current ? (
          <View style={[styles.preview, kind === 'set' ? styles.previewSet : styles.previewProp]}>
            <Image
              source={{ uri: current }}
              style={StyleSheet.absoluteFill}
              contentFit={kind === 'set' ? 'cover' : 'contain'}
              accessibilityLabel={`${copy.noun} ${index + 1}`}
            />
          </View>
        ) : (
          <>
            <View
              style={[styles.dashed, kind === 'set' ? styles.emptySet : styles.emptyProp]}
              accessible
              accessibilityLabel={`No ${copy.noun}s yet`}
            />
            <ThemedText type="caption" style={[styles.hint, styles.center]}>
              {copy.empty}
            </ThemedText>
          </>
        )}
      </View>

      <View style={styles.pills}>
        <ThemedText type="caption" style={styles.count}>
          {items.length} {items.length === 1 ? copy.noun : `${copy.noun}s`}
        </ThemedText>
        {current ? (
          <WirePill icon="close" onPress={() => remove(current)}>
            Remove
          </WirePill>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.carousel}
        contentContainerStyle={styles.cards}>
        {items.map((uri, i) => (
          <Pressable
            key={uri}
            onPress={() => setSelected(i)}
            accessibilityRole="button"
            accessibilityLabel={`${copy.noun} ${i + 1}`}
            accessibilityState={{ selected: i === index }}
            style={[styles.card, i === index && styles.cardSelected]}>
            <View style={styles.cardFrame}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
            <View style={styles.cardBadge}>
              <ThemedText type="caption" style={styles.cardBadgeText}>
                {i + 1}
              </ThemedText>
            </View>
          </Pressable>
        ))}
        <Pressable
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel={`Add ${copy.noun}`}
          style={({ pressed }) => [styles.card, styles.cardNext, pressed && styles.pressed]}>
          <View style={[styles.cardFrame, styles.cardDashed]}>
            <View style={styles.cardPlus}>
              <Icon name="add" size={18} color={INK} />
            </View>
            <ThemedText type="caption" style={styles.muted}>
              Add
            </ThemedText>
          </View>
        </Pressable>
        <DescribeCard onPress={() => setDescribing(true)} />
      </ScrollView>

      <DescribeSheet
        kind={kind}
        visible={describing}
        onClose={() => setDescribing(false)}
        onCreated={(uri) => {
          setSelected(items.length);
          setItems((existing) => [...existing, uri]);
        }}
      />
    </>
  );
}

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { artworks, setArtworks, overrides, setOverrides, props, setProps, sets, setSets } =
    useStudio();
  const [section, setSection] = useState<Section>('character');
  const [describing, setDescribing] = useState(false);
  const isFocused = useIsFocused();
  const [status, setStatus] = useState('');
  const [showStyle, setShowStyle] = useState(false);

  const samples = artworks.map((a) => a.sample);
  const analysed = useMemo(
    () => (samples.length ? readStyle(samples) : DEFAULT_STYLE),
    // The samples are immutable, so the list of artworks identifies them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artworks],
  );
  const style = { ...analysed, ...overrides };

  async function addArtwork() {
    setStatus('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ART - artworks.length,
      quality: 0.8,
    });
    if (result.canceled) return;
    try {
      const added = await Promise.all(
        result.assets.map(async ({ uri }) => ({
          uri,
          sample: await sampleArtwork(uri),
        })),
      );
      setArtworks((current) => [...current, ...added].slice(0, MAX_ART));
      setOverrides(() => ({}));
    } catch {
      setStatus('One of those images could not be read. Try a JPEG or PNG.');
    }
  }

  async function addDescribedArtwork(uri: string) {
    try {
      const sample = await sampleArtwork(uri);
      setArtworks((current) => [...current, { uri, sample }].slice(0, MAX_ART));
      setOverrides(() => ({}));
    } catch {
      setStatus('That drawing could not be read. Try describing it again.');
    }
  }

  function removeArtwork(uri: string) {
    setArtworks((current) => current.filter((a) => a.uri !== uri));
    setOverrides(() => ({}));
  }

  function adjust(key: keyof StyleValues, value: number) {
    setOverrides((current) => ({ ...current, [key]: value }));
  }

  // A recorded or uploaded clip goes straight to Animate, which wraps the artwork round you.
  function animateClip(uri: string) {
    router.push({ pathname: '/animate', params: { clip: uri } });
  }

  async function uploadClip() {
    setStatus('');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (!result.canceled) animateClip(result.assets[0].uri);
  }

  const emptySlots = Math.max(0, MAX_ART - artworks.length - 1);

  return (
    <View style={styles.root}>
      {isFocused && <StatusBar style="light" />}
      <View
        style={[
          styles.page,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: TabBarSpace + insets.bottom,
          },
        ]}>
        <View style={styles.top}>
          <ThemedText type="title" accessibilityRole="header" style={styles.title}>
            Artwork
          </ThemedText>
        </View>

        {section === 'props' ? (
          <Library kind="props" items={props} setItems={setProps} />
        ) : section === 'set' ? (
          <Library kind="set" items={sets} setItems={setSets} />
        ) : (
          <>
            <View style={[styles.stage, styles.stageCamera]}>
              <RecordStage
                active={isFocused && section === 'character'}
                ready={artworks.length > 0}
                onRecorded={animateClip}
                onStatus={setStatus}
              />

              {artworks.map((art, i) => (
                <Pressable
                  key={art.uri}
                  onPress={() => removeArtwork(art.uri)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove artwork ${i + 1}`}
                  hitSlop={6}
                  style={[styles.chip, CHIP_SPOTS[i % CHIP_SPOTS.length]]}>
                  <Image source={{ uri: art.uri }} style={styles.chipImage} contentFit="cover" />
                  <View style={styles.chipRemove}>
                    <Icon name="close" size={10} color={BOX} />
                  </View>
                </Pressable>
              ))}

              {showStyle && (
                <View style={styles.panel}>
                  <TickSlider
                    label="Outline"
                    low="Soft"
                    high="Bold"
                    value={style.line}
                    onChange={(v) => adjust('line', v)}
                  />
                  <TickSlider
                    label="Detail"
                    low="Simple"
                    high="Complex"
                    value={style.detail}
                    onChange={(v) => adjust('detail', v)}
                  />
                  <TickSlider
                    label="Texture"
                    low="Clean"
                    high="Grainy"
                    value={style.texture}
                    onChange={(v) => adjust('texture', v)}
                  />
                </View>
              )}
            </View>

            {status ? (
              <ThemedText type="caption" style={styles.status} accessibilityLiveRegion="polite">
                {status}
              </ThemedText>
            ) : null}

            <View style={styles.pills}>
              <View style={styles.pillGroup}>
                <WirePill
                  icon="style"
                  selected={showStyle}
                  onPress={() => setShowStyle(!showStyle)}>
                  Style
                </WirePill>
                <WirePill icon="upload" disabled={!artworks.length} onPress={uploadClip}>
                  Upload video
                </WirePill>
              </View>
              <ThemedText type="caption" style={styles.count}>
                {artworks.length} of {MAX_ART} artworks
              </ThemedText>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.carousel}
              contentContainerStyle={styles.cards}>
              {artworks.map((art, i) => (
                <View key={art.uri} style={styles.card}>
                  <View style={styles.cardFrame}>
                    <Image
                      source={{ uri: art.uri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      accessibilityLabel={`Artwork ${i + 1}, in use`}
                    />
                  </View>
                  <View style={styles.cardBadge}>
                    <ThemedText type="caption" style={styles.cardBadgeText}>
                      {i + 1}
                    </ThemedText>
                  </View>
                </View>
              ))}
              {artworks.length < MAX_ART && (
                <Pressable
                  onPress={addArtwork}
                  accessibilityRole="button"
                  accessibilityLabel="Add artwork"
                  style={({ pressed }) => [
                    styles.card,
                    styles.cardNext,
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.cardFrame, styles.cardDashed]}>
                    <View style={styles.cardPlus}>
                      <Icon name="add" size={18} color={INK} />
                    </View>
                    <ThemedText type="caption" style={styles.muted}>
                      {artworks.length < MIN_ART ? `${MIN_ART - artworks.length} more` : 'Add'}
                    </ThemedText>
                  </View>
                </Pressable>
              )}
              {artworks.length < MAX_ART && <DescribeCard onPress={() => setDescribing(true)} />}
              {Array.from({ length: emptySlots }, (_, i) => (
                <View key={i} style={[styles.card, styles.cardNext]}>
                  <View style={[styles.cardFrame, styles.cardDashed]}>
                    <ThemedText type="caption" style={styles.muted}>
                      {artworks.length + i + 2}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </ScrollView>

            <DescribeSheet
              kind="character"
              visible={describing}
              onClose={() => setDescribing(false)}
              onCreated={addDescribedArtwork}
            />
          </>
        )}

        {/* Sits just above the tab bar, so the sections switch within thumb reach. */}
        <View style={styles.segments} accessibilityRole="tablist">
          {SECTIONS.map((option) => {
            const selected = option.key === section;
            return (
              <Pressable
                key={option.key}
                onPress={() => setSection(option.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.segment, selected && styles.segmentSelected]}>
                <ThemedText
                  type="caption"
                  maxFontSizeMultiplier={1.3}
                  style={[styles.segmentText, selected && { color: BOX }]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAPER,
  },
  page: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three - 4,
  },
  // Same title bar as Storyboards: large title, left-aligned, 48 points tall.
  top: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Gutter,
  },
  title: {
    color: INK,
  },
  stageCamera: {
    marginHorizontal: Gutter,
    paddingHorizontal: 0,
  },
  stage: {
    flex: 1,
    paddingHorizontal: Gutter,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  hint: {
    color: INK,
    maxWidth: 260,
  },
  center: {
    textAlign: 'center',
  },
  muted: {
    color: MUTED,
  },
  segments: {
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 2,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    backgroundColor: BOX,
  },
  segment: {
    minHeight: 26,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: INK,
  },
  segmentText: {
    color: INK,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
  },
  preview: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: BOX,
    borderWidth: LINE,
    borderColor: INK,
  },
  previewProp: {
    aspectRatio: 1,
    maxHeight: '100%',
  },
  previewSet: {
    aspectRatio: 16 / 9,
  },
  emptyProp: {
    width: 120,
    height: 120,
    borderRadius: 20,
  },
  emptySet: {
    width: 240,
    height: 135,
    borderRadius: 20,
  },
  cardSelected: {
    borderColor: INK,
  },
  dashed: {
    borderWidth: LINE,
    borderColor: INK,
    borderStyle: 'dashed',
  },
  chip: {
    position: 'absolute',
    width: 44,
    height: 44,
  },
  chipImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: LINE,
    borderColor: INK,
    backgroundColor: BOX,
  },
  chipRemove: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.record,
    borderWidth: LINE,
    borderColor: BOX,
  },
  panel: {
    position: 'absolute',
    left: Gutter,
    right: Gutter,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 4,
    gap: Spacing.two,
    borderRadius: 16,
    backgroundColor: BOX,
    borderWidth: LINE,
    borderColor: INK,
  },
  status: {
    color: INK,
    paddingHorizontal: Gutter,
  },
  pillGroup: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
  },
  count: {
    color: INK,
  },
  ink: {
    color: INK,
  },
  carousel: {
    flexGrow: 0,
  },
  cards: {
    gap: Spacing.three - 4,
    paddingHorizontal: Gutter,
    // Room for the cards' soft shadows, which the scroll view would otherwise clip.
    paddingVertical: Spacing.two,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    padding: 5,
    borderRadius: 20,
    backgroundColor: SOFT_CARD,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.4)',
  },
  cardNext: {
    backgroundColor: 'rgba(28, 28, 30, 0.6)',
    boxShadow: '0px 4px 12px rgba(30, 40, 60, 0.05)',
  },
  cardFrame: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: SOFT_FRAME,
  },
  cardDashed: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  cardPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOFT_FRAME,
    boxShadow: '0px 4px 12px rgba(30, 40, 60, 0.10)',
  },
  cardBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOFT_FRAME,
    boxShadow: '0px 2px 8px rgba(30, 40, 60, 0.12)',
  },
  cardBadgeText: {
    color: INK,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  save: {
    marginHorizontal: Gutter,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INK,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});
