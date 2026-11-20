import { Canvas, Group, ImageShader, Vertices, rect, useImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LivePose } from '@/rig/live-pose-shared';
import { buildRig, deform } from '@/rig/mesh';

// Draws the artwork over the live camera, bent to the body: the mesh is fitted once to the
// rest pose, then deformed to each new pose, exactly like Animate does for a recorded clip.
export function LiveRig({
  art,
  live,
  stage,
  mirrored,
}: {
  art: string;
  live: LivePose;
  stage: { width: number; height: number };
  mirrored: boolean;
}) {
  const image = useImage(art);

  const rig = useMemo(
    () =>
      image
        ? buildRig(live.rest, live.silhouette, { width: image.width(), height: image.height() })
        : null,
    // A new rest pose (or artwork) means a new fit; frame-to-frame poses reuse the mesh.
    [image, live.rest, live.silhouette],
  );

  const textures = useMemo(
    () =>
      rig
        ? Array.from({ length: rig.uvs.length / 2 }, (_, i) => ({
            x: rig.uvs[i * 2],
            y: rig.uvs[i * 2 + 1],
          }))
        : [],
    [rig],
  );

  const vertices = useMemo(() => {
    if (!rig) return null;
    const moved = deform(rig, live.rest, live.pose, new Float32Array(rig.positions.length));
    return Array.from({ length: moved.length / 2 }, (_, i) => ({
      x: moved[i * 2],
      y: moved[i * 2 + 1],
    }));
  }, [rig, live.rest, live.pose]);

  if (!image || !rig || !vertices || !stage.width) return null;

  // The preview fills the stage like `cover`; map the analysis frame onto it the same way.
  const scale = Math.max(stage.width / live.size.width, stage.height / live.size.height);
  const offsetX = (stage.width - live.size.width * scale) / 2;
  const offsetY = (stage.height - live.size.height * scale) / 2;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, mirrored && styles.mirrored]}
      accessible
      accessibilityLabel="Your artwork, following your body live">
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale }]}>
          <Vertices vertices={vertices} textures={textures} indices={rig.indices} mode="triangles">
            <ImageShader
              image={image}
              rect={rect(0, 0, image.width(), image.height())}
              fit="fill"
            />
          </Vertices>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  // The front camera preview is a mirror image; the analysis frame isn't.
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
