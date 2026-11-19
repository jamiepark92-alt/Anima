import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Path,
  Skia,
  Vertices,
  rect,
  useImage,
} from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BOX, INK, LINE, PAPER, RoundButton, WirePill } from '@/components/wire';
import { Colors, Gutter, MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { buildRig, deform, motionBounds } from '@/rig/mesh';
import { PoseBridge } from '@/rig/pose-bridge';
import { BONES } from '@/rig/skeleton';
import { trackVideo } from '@/rig/track';
import type { Performance } from '@/rig/types';
import { useStudio } from '@/state/studio';
import { formatTime } from '@/video/timing';

export default function AnimateScreen() {
  const insets = useSafeAreaInsets();
  const { artworks, shots } = useStudio();
  const clips = shots.filter((s) => s.kind === 'video');

  const [artIndex, setArtIndex] = useState(0);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showRig, setShowRig] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const run = useRef(0);

  const art = artworks[Math.min(artIndex, artworks.length - 1)];
  const image = useImage(art?.uri);

  async function animate(uri: string) {
    const id = ++run.current;
    setPerformance(null);
    setStatus('');
    setProgress(0);
    try {
      const result = await trackVideo(uri, {
        onProgress: (done) => id === run.current && setProgress(done),
      });
      if (id !== run.current) return;
      setPerformance(result);
      setFrame(0);
      setPlaying(true);
    } catch (error) {
      console.warn('[animate] tracking failed:', error);
      if (id === run.current) {
        setStatus(error instanceof Error ? error.message : 'That video could not be tracked.');
      }
    } finally {
      if (id === run.current) setProgress(null);
    }
  }

  async function upload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
    });
    if (!result.canceled) await animate(result.assets[0].uri);
  }

  useEffect(() => {
    if (!performance || !playing) return;
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % performance.poses.length),
      1000 / performance.fps,
    );
    return () => clearInterval(timer);
  }, [performance, playing]);

  const rig = useMemo(() => {
    if (!performance || !image) return null;
    return buildRig(performance.poses[performance.restIndex], performance.silhouette, {
      width: image.width(),
      height: image.height(),
    });
  }, [performance, image]);

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

  const pose = performance?.poses[frame];
  const drawn = useMemo(() => {
    if (!rig || !performance || !pose) return null;
    const moved = deform(
      rig,
      performance.poses[performance.restIndex],
      pose,
      new Float32Array(rig.positions.length),
    );
    const vertices = Array.from({ length: moved.length / 2 }, (_, i) => ({
      x: moved[i * 2],
      y: moved[i * 2 + 1],
    }));
    let mesh = null;
    let bones = null;
    if (showRig) {
      mesh = Skia.PathBuilder.Make();
      for (let t = 0; t < rig.indices.length; t += 3) {
        const [a, b, c] = [rig.indices[t], rig.indices[t + 1], rig.indices[t + 2]];
        mesh.moveTo(vertices[a].x, vertices[a].y);
        mesh.lineTo(vertices[b].x, vertices[b].y);
        mesh.lineTo(vertices[c].x, vertices[c].y);
        mesh.close();
      }
      bones = Skia.PathBuilder.Make();
      for (const [a, b] of BONES) {
        bones.moveTo(pose[a * 2], pose[a * 2 + 1]);
        bones.lineTo(pose[b * 2], pose[b * 2 + 1]);
      }
    }
    return { vertices, mesh: mesh?.build() ?? null, bones: bones?.build() ?? null };
  }, [rig, performance, pose, showRig]);

  // Frame the character's full range of movement, with a little room around it.
  const view = useMemo(() => {
    if (!rig || !performance) return null;
    const b = motionBounds(rig, performance.poses[performance.restIndex], performance.poses);
    const pad = Math.max(b.width, b.height) * 0.08;
    return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  }, [rig, performance]);
  const fit = view ? Math.min(stage.width / view.width, stage.height / view.height) : 1;
  const offsetX = view ? (stage.width - view.width * fit) / 2 - view.x * fit : 0;
  const offsetY = view ? (stage.height - view.height * fit) / 2 - view.y * fit : 0;

  const tracking = progress !== null;

  return (
    <View style={styles.root}>
      <PoseBridge />
      <View
        style={[
          styles.page,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: TabBarSpace + insets.bottom,
          },
        ]}>
        <View style={styles.top}>
          <RoundButton icon="back" label="Back" onPress={() => router.navigate('/create')} />
          <ThemedText type="label" accessibilityRole="header" style={styles.title}>
            Animate
          </ThemedText>
          <RoundButton icon="upload" label="Upload a video" onPress={upload} />
        </View>

        <View
          style={styles.stage}
          onLayout={({ nativeEvent: { layout } }) =>
            setStage({ width: layout.width, height: layout.height })
          }>
          {drawn && image && rig && stage.width > 0 ? (
            <Canvas
              style={StyleSheet.absoluteFill}
              accessibilityLabel="Your artwork, animated by the moves in your video">
              <Fill color={PAPER} />
              <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale: fit }]}>
                <Vertices
                  vertices={drawn.vertices}
                  textures={textures}
                  indices={rig.indices}
                  mode="triangles">
                  <ImageShader
                    image={image}
                    rect={rect(0, 0, image.width(), image.height())}
                    fit="fill"
                  />
                </Vertices>
                {drawn.mesh && (
                  <Path
                    path={drawn.mesh}
                    style="stroke"
                    strokeWidth={0.6 / fit}
                    color="rgba(28,28,30,0.35)"
                  />
                )}
                {drawn.bones && (
                  <Path
                    path={drawn.bones}
                    style="stroke"
                    strokeWidth={3 / fit}
                    strokeCap="round"
                    color={Colors.record}
                  />
                )}
              </Group>
            </Canvas>
          ) : (
            <View style={styles.empty}>
              <Icon name="animate" size={44} color={INK} />
              <ThemedText style={styles.emptyText}>
                {tracking
                  ? `Tracking your moves… ${Math.round((progress ?? 0) * 100)}%`
                  : !artworks.length
                    ? 'Add your artwork in the Artwork tab first.'
                    : 'Pick a clip of yourself moving. Your artwork will follow your body.'}
              </ThemedText>
              {tracking && (
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${(progress ?? 0) * 100}%` }]} />
                </View>
              )}
            </View>
          )}

          {performance && (
            <Image
              source={{ uri: performance.stills[frame] }}
              style={[styles.inset, { aspectRatio: performance.width / performance.height }]}
              contentFit="cover"
              accessibilityLabel="Your video"
            />
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
              icon={playing ? 'pause' : 'play'}
              disabled={!performance}
              onPress={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play'}
            </WirePill>
            <WirePill
              icon="rig"
              selected={showRig}
              disabled={!performance}
              onPress={() => setShowRig(!showRig)}>
              Rig
            </WirePill>
          </View>
          {performance && (
            <ThemedText type="timecode" style={styles.ink}>
              {formatTime(frame / performance.fps).slice(3)}
            </ThemedText>
          )}
        </View>

        {artworks.length > 1 && (
          <ScrollView
            horizontal
            style={styles.strip}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}>
            {artworks.map((a, i) => (
              <Pressable
                key={a.uri}
                onPress={() => setArtIndex(i)}
                accessibilityRole="button"
                accessibilityLabel={`Wear artwork ${i + 1}`}
                accessibilityState={{ selected: i === artIndex }}
                style={[styles.swatch, i === artIndex && styles.swatchSelected]}>
                <Image source={{ uri: a.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <ScrollView
          horizontal
          style={styles.strip}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}>
          {clips.map((clip, i) => (
            <WirePill
              key={clip.id}
              icon="video"
              disabled={tracking || !artworks.length}
              onPress={() => animate(clip.uri)}>
              {`Clip ${i + 1} · ${formatTime(clip.seconds ?? 0).slice(3)}`}
            </WirePill>
          ))}
          <WirePill icon="upload" disabled={tracking || !artworks.length} onPress={upload}>
            Upload video
          </WirePill>
        </ScrollView>
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
    marginHorizontal: Gutter,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: LINE,
    borderColor: INK,
    backgroundColor: PAPER,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  emptyText: {
    color: INK,
    textAlign: 'center',
  },
  bar: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: INK,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: INK,
  },
  inset: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.two,
    width: 72,
    borderRadius: 10,
    borderWidth: LINE,
    borderColor: INK,
    backgroundColor: BOX,
  },
  status: {
    color: INK,
    paddingHorizontal: Gutter,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
  },
  pillGroup: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  ink: {
    color: INK,
  },
  strip: {
    flexGrow: 0,
  },
  row: {
    gap: Spacing.two,
    paddingHorizontal: Gutter,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: LINE,
    borderColor: INK,
    backgroundColor: BOX,
  },
  swatchSelected: {
    borderWidth: 3,
  },
});
