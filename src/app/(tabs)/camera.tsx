import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { DotGrille, Pill } from '@/components/ui';
import { Colors, Gutter, MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { makeId, useStudio } from '@/state/studio';
import { formatTime } from '@/video/timing';

const MAX_SECONDS = 120;
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

const MODES = ['video', 'photo'] as const;
type Mode = (typeof MODES)[number];

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { shots, setShots } = useStudio();
  const camera = useRef<CameraView>(null);
  const isFocused = useIsFocused();
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();

  const [mode, setMode] = useState<Mode>('photo');
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [zoom, setZoom] = useState(ZOOMS[0]);
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState('');

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

  async function shoot() {
    setStatus('');
    if (mode === 'video') {
      if (!CAN_RECORD) {
        setStatus('Video recording needs the iPhone app. Photos work here.');
      } else if (recording) {
        camera.current?.stopRecording();
      } else {
        await record();
      }
      return;
    }
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 0.9 });
      if (picture) {
        setShots((current) => [...current, { id: makeId(), kind: 'photo', uri: picture.uri }]);
      }
    } catch {
      setStatus('That photo did not take. Try again.');
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
    }
  }

  function chooseMode(next: Mode) {
    if (recording || next === mode) return;
    setReady(false);
    setStatus('');
    setMode(next);
  }

  const canShoot = granted && ready;
  const lastShot = shots[shots.length - 1];

  return (
    <View style={styles.root}>
      {isFocused && <StatusBar style="light" />}

      {granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode={mode === 'video' ? 'video' : 'picture'}
          active={isFocused || recording}
          zoom={zoom.value}
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
        />
      ) : (
        <View style={styles.permission}>
          <DotGrille size={220} count={130} />
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
          {mode === 'video' ? (
            <View style={[styles.timer, recording && styles.timerRecording]}>
              <ThemedText type="timecode" style={styles.onDark} accessibilityLiveRegion="none">
                {formatTime(elapsed)}
              </ThemedText>
            </View>
          ) : null}
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

          <View style={styles.modes} accessibilityRole="tablist">
            {MODES.map((option) => {
              const selected = option === mode;
              return (
                <Pressable
                  key={option}
                  onPress={() => chooseMode(option)}
                  disabled={recording}
                  hitSlop={8}
                  accessibilityRole="tab"
                  accessibilityLabel={option === 'photo' ? 'Photo' : 'Video'}
                  accessibilityState={{ selected, disabled: recording }}
                  style={styles.mode}>
                  <ThemedText
                    type="label"
                    maxFontSizeMultiplier={1.3}
                    style={[styles.modeText, selected && styles.accent]}>
                    {option === 'photo' ? 'PHOTO' : 'VIDEO'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

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
              accessibilityLabel={
                recording ? 'Stop recording' : mode === 'photo' ? 'Take photo' : 'Start recording'
              }
              style={({ pressed }) => [
                styles.shutter,
                !canShoot && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.shutterCore,
                  mode === 'video' && { backgroundColor: Colors.record },
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
    paddingBottom: 220,
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
  modes: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  mode: {
    minHeight: 32,
    justifyContent: 'center',
  },
  modeText: {
    color: ON_DARK,
    letterSpacing: 0.6,
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
