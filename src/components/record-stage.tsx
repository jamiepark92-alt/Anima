import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { INK, WirePill } from '@/components/wire';
import { Spacing } from '@/constants/theme';
import { TRACK_MAX_SECONDS } from '@/rig/types';
import { formatTime } from '@/video/timing';

// expo-camera doesn't record video in the browser.
const CAN_RECORD = Platform.OS !== 'web';
const RECORD = '#FF3B30';

// The Character stage: a front camera you record yourself on. The finished clip is handed
// to Animate, which tracks your body and wraps your artwork around it.
export function RecordStage({
  active,
  ready,
  onRecorded,
  onStatus,
}: {
  // The stage is on screen; the camera only runs then.
  active: boolean;
  // There's artwork to wear, so recording makes sense.
  ready: boolean;
  onRecorded: (uri: string) => void;
  onStatus: (message: string) => void;
}) {
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Leaving the screen ends a recording rather than leaving the camera running.
  useEffect(() => {
    if (!active && recording) camera.current?.stopRecording();
  }, [active, recording]);

  async function record() {
    if (recording) {
      camera.current?.stopRecording();
      return;
    }
    if (!ready) {
      onStatus('Add a piece of artwork below first, so there’s something to wear.');
      return;
    }
    const microphone = await requestMicrophone();
    if (!microphone.granted) {
      onStatus('Allow the microphone in Settings to record.');
      return;
    }
    onStatus('');
    setElapsed(0);
    setRecording(true);
    try {
      const video = await camera.current?.recordAsync({ maxDuration: TRACK_MAX_SECONDS });
      if (video) onRecorded(video.uri);
    } catch {
      onStatus('That clip did not record. Try again.');
    } finally {
      setRecording(false);
    }
  }

  const granted = cameraPermission?.granted;

  return (
    <View style={styles.stage}>
      {granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="front"
          mode="video"
          active={active || recording}
          onCameraReady={() => setCameraReady(true)}
        />
      ) : (
        <View style={styles.center}>
          <WirePill icon="camera" onPress={requestCamera}>
            Turn on camera
          </WirePill>
        </View>
      )}

      <View style={styles.top} pointerEvents="none">
        <ThemedText type="caption" style={styles.hint}>
          {recording
            ? `Recording ${formatTime(elapsed).slice(3)} of 0:${TRACK_MAX_SECONDS}`
            : !CAN_RECORD
              ? 'Recording works in the iPhone app. Upload a video below instead.'
              : 'Record yourself moving, head to toe. Your artwork will wrap around you.'}
        </ThemedText>
      </View>

      {granted && CAN_RECORD && (
        <Pressable
          onPress={record}
          disabled={!cameraReady}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Record yourself'}
          style={({ pressed }) => [
            styles.shutter,
            !cameraReady && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <View style={[styles.shutterCore, recording && styles.shutterRecording]} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    top: Spacing.three,
    alignItems: 'center',
  },
  hint: {
    color: INK,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  shutter: {
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: RECORD,
  },
  shutterRecording: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
