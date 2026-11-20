import type { CameraView } from 'expo-camera';
import { Image } from 'expo-image';
import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, useWindowDimensions, type View } from 'react-native';

import type { AvatarStyle } from '@/avatar/style';
import { StyleBridge, styleSnapshot } from '@/camera/style-bridge';
import { toBridgeStyle } from '@/camera/stylize-source';

export const LIVE_STYLE_SUPPORTED = true;

type Props = {
  finder: RefObject<ComponentRef<typeof View> | null>;
  // Where the user tapped, in viewfinder points; null turns styling off.
  point: { x: number; y: number } | null;
  style: AvatarStyle;
  onStatus: (message: string) => void;
  camera: RefObject<CameraView | null>;
  facing: 'front' | 'back';
  // Style mode is on: keep the segmenter loaded so the first tap responds quickly.
  active: boolean;
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// expo-camera can't stream frames on iPhone, so this takes quick silent snapshots, has the
// hidden web view cut out and restyle the tapped object, and lays the result over the live
// view. It refreshes a few times a second rather than every frame.
export function LiveStyle({ point, style, onStatus, camera, facing, active }: Props) {
  const view = useWindowDimensions();
  const [overlay, setOverlay] = useState<string | null>(null);

  useEffect(() => {
    if (!point) return;
    let stopped = false;
    const bridgeStyle = toBridgeStyle(style);
    onStatus('Finding the object…');

    (async () => {
      let first = true;
      while (!stopped) {
        try {
          const shot = await camera.current?.takePictureAsync({
            quality: 0.2,
            base64: true,
            shutterSound: false,
          });
          if (stopped) break;
          if (!shot?.base64) {
            await pause(300);
            continue;
          }
          // The preview fills the viewfinder like `cover`, and mirrors the front camera
          // while the snapshot doesn't, so map the tap into the snapshot's own frame.
          const scale = Math.max(view.width / shot.width, view.height / shot.height);
          const offsetX = (view.width - shot.width * scale) / 2;
          const offsetY = (view.height - shot.height * scale) / 2;
          let x = (point.x - offsetX) / scale / shot.width;
          const y = (point.y - offsetY) / scale / shot.height;
          if (facing === 'front') x = 1 - x;
          const uri = await styleSnapshot({
            image: shot.base64,
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
            style: bridgeStyle,
          });
          if (stopped) break;
          setOverlay(uri);
          if (first) {
            first = false;
            onStatus(uri ? '' : 'Nothing found there. Tap the middle of an object.');
          }
        } catch (error) {
          if (stopped) break;
          onStatus(error instanceof Error ? error.message : 'Object styling stopped.');
          await pause(1000);
        }
      }
    })();

    return () => {
      stopped = true;
      setOverlay(null);
    };
  }, [point, style, onStatus, camera, facing, view.width, view.height]);

  if (!active) return null;
  return (
    <>
      <StyleBridge />
      {point && overlay && (
        <Image
          source={{ uri: overlay }}
          style={[StyleSheet.absoluteFill, facing === 'front' && styles.mirrored]}
          contentFit="cover"
          transition={0}
          pointerEvents="none"
          accessibilityIgnoresInvertColors
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
