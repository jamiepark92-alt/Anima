import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

// Film looks are drawn as blend-mode layers over the live preview, so they don't need a
// native image pipeline. They tint what you see; captured files are not graded yet.
type Blend = 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'saturation' | 'color' | 'lighten';
type Layer = { color: string; blend: Blend; opacity: number };
export type Look = {
  id: string;
  name: string;
  contrast: string;
  palette: string;
  vibe: string;
  layers: Layer[];
  vignette: number;
};

export const LOOKS: Look[] = [
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

export function LookLayers({ look }: { look: Look }) {
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
