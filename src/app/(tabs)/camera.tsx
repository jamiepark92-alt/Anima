import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Pill } from '@/components/ui';
import { Colors, Gutter, MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { DEFAULT_STYLE, readStyle } from '@/avatar/style';
import { LIVE_STYLE_SUPPORTED, LiveStyle } from '@/camera/live-style';
import { makeId, useStudio } from '@/state/studio';
import { formatTime } from '@/video/timing';

// Clips are capped at 30 seconds; the timer counts down to show what's left.
const MAX_SECONDS = 30;
// expo-camera doesn't record video in the browser.
const CAN_RECORD = Platform.OS !== 'web';

// The viewfinder is always dark, whatever the app theme, like the system camera.
const ON_DARK = '#FFFFFF';
const ON_DARK_SOFT = 'rgba(255, 255, 255, 0.72)';
const ACCENT = '#FFD60A';
const CHIP = 'rgba(30, 30, 30, 0.55)';

// expo-camera's zoom prop is 0–1 on a log scale up to the device's own maximum, which
// JS can't read. These assume a typical iPhone maximum, so 2× and 5× are approximate.
const ASSUMED_MAX_ZOOM = 123.75;
const ZOOMS = [1, 2, 5].map((factor) => ({
  factor,
  value: Math.log(factor) / Math.log(ASSUMED_MAX_ZOOM),
}));

// Film looks are drawn as blend-mode layers over the live preview, so they don't need a
// native image pipeline. They tint what you see; captured files are not graded yet.
type Blend = 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'saturation' | 'color' | 'lighten';
type Layer = { color: string; blend: Blend; opacity: number };
type Look = {
  id: string;
  name: string;
  contrast: string;
  palette: string;
  vibe: string;
  layers: Layer[];
  vignette: number;
};

const LOOKS: Look[] = [
  {
    id: 'realistic',
    name: 'Realistic',
    contrast: 'Balanced, natural falloff',
    palette: 'True-to-life skin tones, subtle warmth',
    vibe: 'Immersive, grounded, serious',
    layers: [{ color: '#FFB070', blend: 'soft-light', opacity: 0.14 }],
    vignette: 0.25,
  },
  {
    id: 'expressionistic',
    name: 'Expressionistic',
    contrast: 'Extreme contrast, crushed blacks',
    palette: 'Monochromatic tints, bold neon or noir hues',
    vibe: 'Tense, psychological, mysterious',
    layers: [
      { color: '#808080', blend: 'saturation', opacity: 1 },
      { color: '#05081A', blend: 'overlay', opacity: 0.55 },
      { color: '#2E6BFF', blend: 'color', opacity: 0.2 },
    ],
    vignette: 0.75,
  },
  {
    id: 'stylized',
    name: 'Stylized',
    contrast: 'Sculpted, graphic separation',
    palette: 'Hyper-saturated, strict colour harmonies',
    vibe: 'Whimsical, iconic, larger-than-life',
    layers: [
      { color: '#FF0040', blend: 'saturation', opacity: 0.45 },
      { color: '#00B3B3', blend: 'soft-light', opacity: 0.3 },
      { color: '#FF6A00', blend: 'overlay', opacity: 0.16 },
    ],
    vignette: 0.3,
  },
  {
    id: 'high-key',
    name: 'High-Key',
    contrast: 'Minimal shadows, bright highlights',
    palette: 'Warm golds, pastels, clean vibrant tones',
    vibe: 'Optimistic, romantic, nostalgic',
    layers: [
      { color: '#FFE2B0', blend: 'screen', opacity: 0.38 },
      { color: '#FFC2D6', blend: 'soft-light', opacity: 0.25 },
    ],
    vignette: 0,
  },
  {
    id: 'naturalistic',
    name: 'Naturalistic',
    contrast: 'Low contrast, soft or gritty textures',
    palette: 'Muted, earthy, unmanipulated tones',
    vibe: 'Raw, intimate, authentic',
    layers: [
      { color: '#808080', blend: 'saturation', opacity: 0.45 },
      { color: '#C9B79A', blend: 'multiply', opacity: 0.25 },
      { color: '#3A3328', blend: 'lighten', opacity: 0.4 },
    ],
    vignette: 0.2,
  },
];

// Stand-in scene (sky, skin, earth) so each card previews its look before any photo exists.
const SAMPLE_SCENE = ['#8FA9C4', '#D9B59A', '#5B4A3E'] as const;
const LOOK_GAP = Spacing.two;

function LookLayers({ look }: { look: Look }) {
  return (
    <>
      {look.layers.map((layer, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: layer.color, opacity: layer.opacity, mixBlendMode: layer.blend },
          ]}
        />
      ))}
      {look.vignette > 0 && (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={[
              `rgba(0,0,0,${look.vignette})`,
              'rgba(0,0,0,0)',
              `rgba(0,0,0,${look.vignette})`,
            ]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            colors={[
              `rgba(0,0,0,${look.vignette})`,
              'rgba(0,0,0,0)',
              `rgba(0,0,0,${look.vignette})`,
            ]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
    </>
  );
}

type Pin = { id: string; uri: string; x: number; y: number };

// Native press events report locationX/Y; on web the press is a mouse click with offsetX/Y.
function tapPoint(event: object) {
  const e = event as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
  return { x: e.locationX ?? e.offsetX ?? 0, y: e.locationY ?? e.offsetY ?? 0 };
}
const PIN_SIZE = 84;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { shots, setShots, props, artworks, overrides } = useStudio();
  // The user's Character style, read from their artwork, for styling objects live.
  const style = useMemo(
    () => ({
      ...(artworks.length ? readStyle(artworks.map((a) => a.sample)) : DEFAULT_STYLE),
      ...overrides,
    }),
    [artworks, overrides],
  );
  const finderRef = useRef<ComponentRef<typeof View>>(null);
  // In style mode a tap picks an object to restyle instead of pinning a prop.
  const [styleMode, setStyleMode] = useState(false);
  const [stylePoint, setStylePoint] = useState<{ x: number; y: number } | null>(null);
  const camera = useRef<CameraView>(null);
  const isFocused = useIsFocused();
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();

  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [zoom, setZoom] = useState(ZOOMS[0]);
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState('');
  // Props pinned to spots on the live view, placed by tapping the screen.
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinAt, setPinAt] = useState<{ x: number; y: number } | null>(null);
  const [look, setLook] = useState(LOOKS[0]);
  const [looksWidth, setLooksWidth] = useState(0);
  // Three cards fill the row; the other two scroll in.
  const lookWidth = looksWidth > 0 ? (looksWidth - LOOK_GAP * 2) / 3 : 0;

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Tabs stay mounted, so stop the capture session (and torch) when this one is hidden.
  useEffect(() => {
    if (!isFocused && recording) camera.current?.stopRecording();
  }, [isFocused, recording]);

  // Show the system camera prompt as soon as the screen opens. iOS only shows it once,
  // so after a "Don't Allow" the Turn on camera button stays as the fallback.
  const shouldAsk =
    isFocused && cameraPermission?.status === 'undetermined' && cameraPermission.canAskAgain;
  useEffect(() => {
    if (shouldAsk) requestCamera();
  }, [shouldAsk, requestCamera]);

  const granted = cameraPermission?.granted;

  async function turnOnCamera() {
    const { granted: allowed } = await requestCamera();
    setStatus(allowed ? '' : 'Allow camera access in Settings to shoot.');
  }

  function toggleStyleMode() {
    const next = !styleMode;
    setStyleMode(next);
    setStylePoint(null);
    if (!next) setStatus('');
    else if (!LIVE_STYLE_SUPPORTED)
      setStatus('Live object styling works in the web preview for now.');
    else
      setStatus(
        artworks.length
          ? 'Tap an object to style it.'
          : 'Tap an object to style it. Add artwork under Character to use your own style.',
      );
  }

  function tapView(point: { x: number; y: number }) {
    if (!styleMode) {
      setPinAt(point);
      return;
    }
    if (LIVE_STYLE_SUPPORTED) setStylePoint(point);
  }

  // The camera shoots video only, capped at MAX_SECONDS.
  async function shoot() {
    setStatus('');
    if (!CAN_RECORD) {
      setStatus('Video recording needs the iPhone app.');
    } else if (recording) {
      camera.current?.stopRecording();
    } else {
      await record();
    }
  }

  async function record() {
    const microphone = await requestMicrophone();
    if (!microphone.granted) {
      setStatus('Allow the microphone in Settings to record video.');
      return;
    }
    const started = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const video = await camera.current?.recordAsync({ maxDuration: MAX_SECONDS });
      if (video) {
        const seconds = (Date.now() - started) / 1000;
        setShots((current) => [
          ...current,
          { id: makeId(), kind: 'video', uri: video.uri, seconds },
        ]);
      }
    } catch {
      setStatus('That clip did not record. Try again.');
    } finally {
      setRecording(false);
      // Back to the full 30 seconds for the next clip.
      setElapsed(0);
    }
  }

  const canShoot = granted && ready;
  const lastShot = shots[shots.length - 1];
  const lastPhoto = shots.findLast((shot) => shot.kind === 'photo');

  return (
    <View style={styles.root}>
      {isFocused && <StatusBar style="light" />}

      {granted ? (
        <View ref={finderRef} style={styles.viewfinder} pointerEvents="box-none">
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="video"
            active={isFocused || recording}
            zoom={zoom.value}
            enableTorch={torch}
            onCameraReady={() => setReady(true)}
          />
          <LookLayers look={look} />
          <LiveStyle
            finder={finderRef}
            point={styleMode ? stylePoint : null}
            style={style}
            onStatus={setStatus}
            camera={camera}
            facing={facing}
            active={styleMode}
          />
          <Pressable
            onPress={({ nativeEvent }) => tapView(tapPoint(nativeEvent))}
            accessibilityRole="button"
            accessibilityLabel="Pin a prop here"
            accessibilityHint="Tap a spot on the camera view to pin one of your props there"
            style={StyleSheet.absoluteFill}
          />
          {pins.map((pin, i) => (
            <View
              key={pin.id}
              style={[styles.pin, { left: pin.x - PIN_SIZE / 2, top: pin.y - PIN_SIZE / 2 }]}>
              <Image
                source={{ uri: pin.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                accessibilityLabel={`Pinned prop ${i + 1}`}
              />
              <Pressable
                onPress={() => setPins((current) => current.filter((p) => p.id !== pin.id))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove pinned prop ${i + 1}`}
                style={styles.pinRemove}>
                <Icon name="close" size={10} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
          {pinAt && (
            <View
              pointerEvents="none"
              style={[styles.pinTarget, { left: pinAt.x - 14, top: pinAt.y - 14 }]}
            />
          )}
        </View>
      ) : (
        <View style={styles.permission}>
          <Pill secondary grow={false} icon="camera" onPress={turnOnCamera}>
            Turn on camera
          </Pill>
        </View>
      )}

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
        style={styles.shade}
      />

      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + Spacing.two, paddingBottom: TabBarSpace + insets.bottom },
        ]}
        pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <Pressable
            onPress={toggleStyleMode}
            accessibilityRole="button"
            accessibilityLabel="Style an object"
            accessibilityHint="Then tap something in the view to paint it in your artwork style"
            accessibilityState={{ selected: styleMode }}
            style={[styles.round, styles.styleToggle, styleMode && styles.roundOn]}>
            <Icon name="sparkles" color={styleMode ? '#000000' : ON_DARK} />
          </Pressable>
          <View style={[styles.timer, recording && styles.timerRecording]}>
            <ThemedText type="timecode" style={styles.onDark} accessibilityLiveRegion="none">
              {formatTime(Math.max(0, Math.ceil(MAX_SECONDS - elapsed))).slice(3)}
            </ThemedText>
          </View>
          {CAN_RECORD && (
            <Pressable
              onPress={() => setTorch(!torch)}
              accessibilityRole="button"
              accessibilityLabel="Light"
              accessibilityState={{ selected: torch }}
              style={[styles.round, styles.torch, torch && styles.roundOn]}>
              <Icon name="light" color={torch ? '#000000' : ON_DARK} />
            </Pressable>
          )}
        </View>

        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <View style={styles.controls} pointerEvents="box-none">
          {status ? (
            <ThemedText type="caption" style={styles.status} accessibilityLiveRegion="polite">
              {status}
            </ThemedText>
          ) : null}

          <View style={styles.zooms} accessibilityRole="radiogroup" accessibilityLabel="Zoom">
            {ZOOMS.map((option) => {
              const selected = option.factor === zoom.factor;
              return (
                <Pressable
                  key={option.factor}
                  onPress={() => setZoom(option)}
                  hitSlop={6}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.factor} times zoom`}
                  accessibilityState={{ selected }}
                  style={[styles.zoom, selected && styles.zoomSelected]}>
                  <ThemedText
                    type="caption"
                    maxFontSizeMultiplier={1.2}
                    style={[styles.zoomText, selected && styles.accent]}>
                    {selected ? `${option.factor}×` : option.factor}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={lookWidth + LOOK_GAP}
            decelerationRate="fast"
            onLayout={(event) => setLooksWidth(event.nativeEvent.layout.width)}
            style={styles.looks}
            contentContainerStyle={styles.looksRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Film look">
            {lookWidth > 0 &&
              LOOKS.map((option) => {
                const selected = option.id === look.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setLook(option)}
                    accessibilityRole="radio"
                    accessibilityLabel={option.name}
                    accessibilityHint={`${option.contrast}. ${option.palette}. ${option.vibe}.`}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.lookCard,
                      { width: lookWidth },
                      selected && styles.lookSelected,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.lookScene}>
                      {lastPhoto ? (
                        <Image
                          source={{ uri: lastPhoto.uri }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <LinearGradient colors={SAMPLE_SCENE} style={StyleSheet.absoluteFill} />
                      )}
                      <LookLayers look={option} />
                    </View>
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.7)']}
                      style={styles.lookScrim}
                    />
                    <ThemedText
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                      style={[styles.lookName, selected && styles.accent]}>
                      {option.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
          </ScrollView>

          <View style={styles.bar}>
            <Pressable
              onPress={() => router.navigate('/storyboard')}
              disabled={!lastShot}
              accessibilityRole="button"
              accessibilityLabel={
                lastShot ? `${shots.length} shots, open storyboard` : 'No shots yet'
              }
              style={({ pressed }) => [styles.round, styles.thumb, pressed && styles.pressed]}>
              {lastShot?.kind === 'photo' ? (
                <Image
                  source={{ uri: lastShot.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : lastShot ? (
                <Icon name="play" color={ON_DARK} />
              ) : null}
            </Pressable>

            <Pressable
              onPress={shoot}
              disabled={!canShoot}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
              style={({ pressed }) => [
                styles.shutter,
                !canShoot && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.shutterCore,
                  { backgroundColor: Colors.record },
                  recording && styles.shutterRecording,
                ]}
              />
            </Pressable>

            <Pressable
              onPress={() => setFacing(facing === 'front' ? 'back' : 'front')}
              accessibilityRole="button"
              accessibilityLabel="Flip camera"
              style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
              <Icon name="flip" size={24} color={ON_DARK} />
            </Pressable>
          </View>
        </View>
      </View>
      <Modal
        visible={!!pinAt}
        transparent
        animationType="slide"
        onRequestClose={() => setPinAt(null)}>
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setPinAt(null)}
          accessibilityRole="button"
          accessibilityLabel="Cancel pinning"
        />
        <View style={[styles.picker, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.pickerHeader}>
            <ThemedText type="label" accessibilityRole="header" style={styles.onDark}>
              Pin a prop
            </ThemedText>
            <Pressable
              onPress={() => setPinAt(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.pickerClose}>
              <Icon name="close" size={14} color={ON_DARK} />
            </Pressable>
          </View>
          {props.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pickerRow}
              contentContainerStyle={styles.pickerItems}>
              {props.map((uri, i) => (
                <Pressable
                  key={uri}
                  onPress={() => {
                    if (pinAt) setPins((current) => [...current, { id: makeId(), uri, ...pinAt }]);
                    setPinAt(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Pin prop ${i + 1}`}
                  style={({ pressed }) => [styles.pickerItem, pressed && styles.pressed]}>
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.pickerEmpty}>
              <ThemedText type="caption" style={styles.pickerMuted}>
                You have no props yet. Add or describe one in Artwork, then pin it here.
              </ThemedText>
              <Pill
                secondary
                grow={false}
                icon="artwork"
                onPress={() => {
                  setPinAt(null);
                  router.navigate('/create');
                }}>
                Go to Artwork
              </Pill>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const CORNER = 26;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permission: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingBottom: 320,
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  overlay: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
  },
  top: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleToggle: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  torch: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  timer: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 8,
    backgroundColor: CHIP,
  },
  timerRecording: {
    backgroundColor: Colors.record,
  },
  onDark: {
    color: ON_DARK,
  },
  frame: {
    flex: 1,
    marginHorizontal: Spacing.four,
    marginVertical: Spacing.five,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: ON_DARK_SOFT,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  controls: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  status: {
    color: ON_DARK,
    textAlign: 'center',
  },
  zooms: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.one,
    borderRadius: 24,
    backgroundColor: CHIP,
  },
  zoom: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  zoomSelected: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  zoomText: {
    color: ON_DARK,
    fontWeight: 600,
  },
  accent: {
    color: ACCENT,
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
  },
  pinRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  pinTarget: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  pickerBackdrop: {
    flex: 1,
  },
  picker: {
    gap: Spacing.three - 4,
    paddingTop: Spacing.three,
    paddingHorizontal: Gutter,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#1C1C1E',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pickerRow: {
    flexGrow: 0,
  },
  pickerItems: {
    gap: Spacing.two,
  },
  pickerItem: {
    width: 76,
    height: 76,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  pickerEmpty: {
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
  },
  pickerMuted: {
    color: '#8E8E93',
  },
  viewfinder: {
    ...StyleSheet.absoluteFill,
    // Keeps the look layers blending with the camera feed only.
    isolation: 'isolate',
  },
  looks: {
    alignSelf: 'stretch',
    flexGrow: 0,
  },
  looksRow: {
    gap: LOOK_GAP,
  },
  lookCard: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'flex-end',
  },
  lookSelected: {
    borderColor: ACCENT,
  },
  lookScene: {
    ...StyleSheet.absoluteFill,
    isolation: 'isolate',
  },
  lookScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  lookName: {
    color: ON_DARK,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 600,
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  bar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  roundOn: {
    backgroundColor: ACCENT,
  },
  thumb: {
    overflow: 'hidden',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: ON_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ON_DARK,
  },
  shutterRecording: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
