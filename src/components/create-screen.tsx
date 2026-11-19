import { useCanvasRef } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canShare, saveAvatar, shareAvatar } from '@/avatar/export';
import { sampleArtwork } from '@/avatar/sample-artwork';
import { DEFAULT_STYLE, readStyle, type StyleValues } from '@/avatar/style';
import { AvatarCanvas } from '@/components/avatar-canvas';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { TickSlider } from '@/components/ui';
import { BOX, INK, LINE, PAPER, RoundButton, WirePill } from '@/components/wire';
import { Colors, Gutter, MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { useStudio } from '@/state/studio';

const MAX_ART = 4;
const MIN_ART = 3;

const CARD_W = 100;
const CARD_H = 124;
// Same soft porcelain card as the Storyboard panels.
const SOFT_CARD = '#F7F8FA';

// Where each added artwork floats around the figure, like tags on a model.
const CHIP_SPOTS = [
  { left: '10%', top: '20%' },
  { right: '10%', top: '44%' },
  { left: '12%', top: '66%' },
  { right: '12%', top: '14%' },
] as const;

// Dashed stand-in for the person before a photo is added.
function FigurePlaceholder() {
  return (
    <View style={styles.figure} accessible accessibilityLabel="No photo yet">
      <View style={[styles.dashed, styles.figureHead]} />
      <View style={[styles.dashed, styles.figureBody]} />
      <View style={styles.figureLegs}>
        <View style={[styles.dashed, styles.figureLeg]} />
        <View style={[styles.dashed, styles.figureLeg]} />
      </View>
    </View>
  );
}

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const canvasRef = useCanvasRef();
  const { photo, setPhoto, artworks, setArtworks, overrides, setOverrides } = useStudio();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const [stage, setStage] = useState(0);

  const samples = artworks.map((a) => a.sample);
  const analysed = useMemo(
    () => (samples.length ? readStyle(samples) : DEFAULT_STYLE),
    // The samples are immutable, so the list of artworks identifies them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artworks],
  );
  const style = { ...analysed, ...overrides };

  async function takePhoto() {
    setStatus('');
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      setStatus('Allow camera access in Settings to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      cameraType: ImagePicker.CameraType.front,
      quality: 0.9,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function choosePhoto() {
    setStatus('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

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

  function removeArtwork(uri: string) {
    setArtworks((current) => current.filter((a) => a.uri !== uri));
    setOverrides(() => ({}));
  }

  function adjust(key: keyof StyleValues, value: number) {
    setOverrides((current) => ({ ...current, [key]: value }));
  }

  async function save(action: 'save' | 'share') {
    const image = canvasRef.current?.makeImageSnapshot();
    if (!image) return;
    setBusy(true);
    setStatus('');
    try {
      if (action === 'share') {
        await shareAvatar(image);
      } else if ((await saveAvatar(image)) === 'denied') {
        setStatus('Allow adding photos in Settings to save your avatar.');
      } else {
        setStatus('Avatar saved.');
      }
    } catch {
      setStatus('That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const emptySlots = Math.max(0, MAX_ART - artworks.length - 1);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.page,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: TabBarSpace + insets.bottom,
          },
        ]}>
        <View style={styles.top}>
          <RoundButton icon="camera" label="Take photo" onPress={takePhoto} />
          <ThemedText type="label" accessibilityRole="header" style={styles.title}>
            Artwork
          </ThemedText>
          <RoundButton icon="photo" label="Upload photo" onPress={choosePhoto} />
        </View>

        <View
          style={styles.stage}
          onLayout={({ nativeEvent: { layout } }) =>
            setStage(Math.floor(Math.min(layout.width, layout.height)))
          }>
          {photo && stage > 0 ? (
            <AvatarCanvas uri={photo} style={style} size={stage} canvasRef={canvasRef} />
          ) : !photo ? (
            <>
              <FigurePlaceholder />
              <ThemedText type="caption" style={styles.hint}>
                Take a selfie or upload a photo to start
              </ThemedText>
            </>
          ) : null}

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
            <WirePill icon="style" selected={showStyle} onPress={() => setShowStyle(!showStyle)}>
              Style
            </WirePill>
            <WirePill
              icon="animate"
              disabled={!artworks.length}
              onPress={() => router.push('/animate')}>
              Animate
            </WirePill>
          </View>
          {canShare ? (
            <WirePill icon="share" disabled={!photo || busy} onPress={() => save('share')}>
              Share
            </WirePill>
          ) : (
            <ThemedText type="caption" style={styles.count}>
              {artworks.length} of {MAX_ART} artworks
            </ThemedText>
          )}
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
              style={({ pressed }) => [styles.card, styles.cardNext, pressed && styles.pressed]}>
              <View style={[styles.cardFrame, styles.cardDashed]}>
                <View style={styles.cardPlus}>
                  <Icon name="add" size={18} color={Colors.text} />
                </View>
                <ThemedText type="caption" themeColor="textSecondary">
                  {artworks.length < MIN_ART ? `${MIN_ART - artworks.length} more` : 'Add'}
                </ThemedText>
              </View>
            </Pressable>
          )}
          {Array.from({ length: emptySlots }, (_, i) => (
            <View key={i} style={[styles.card, styles.cardNext]}>
              <View style={[styles.cardFrame, styles.cardDashed]}>
                <ThemedText type="caption" themeColor="textTertiary">
                  {artworks.length + i + 2}
                </ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={() => save('save')}
          disabled={!photo || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !photo || busy }}
          style={({ pressed }) => [
            styles.save,
            (!photo || busy) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="label" style={{ color: BOX }}>
            Save avatar
          </ThemedText>
        </Pressable>
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
  },
  title: {
    color: INK,
    fontWeight: 600,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  hint: {
    color: INK,
  },
  figure: {
    alignItems: 'center',
    gap: 6,
  },
  dashed: {
    borderWidth: LINE,
    borderColor: INK,
    borderStyle: 'dashed',
  },
  figureHead: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  figureBody: {
    width: 104,
    height: 120,
    borderRadius: 22,
  },
  figureLegs: {
    flexDirection: 'row',
    gap: 8,
  },
  figureLeg: {
    width: 40,
    height: 110,
    borderRadius: 16,
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
    borderColor: 'rgba(255, 255, 255, 0.9)',
    boxShadow: '0px 8px 20px rgba(30, 40, 60, 0.10)',
  },
  cardNext: {
    backgroundColor: 'rgba(247, 248, 250, 0.6)',
    boxShadow: '0px 4px 12px rgba(30, 40, 60, 0.05)',
  },
  cardFrame: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#E4E7EC',
  },
  cardDashed: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.dot,
  },
  cardPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 8px rgba(30, 40, 60, 0.12)',
  },
  cardBadgeText: {
    color: Colors.text,
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
