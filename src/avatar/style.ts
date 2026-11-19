// Reads a "style" from the user's artwork: a five-colour palette plus how much line,
// tonal detail and surface texture the pieces have. This is plain pixel statistics that
// run on the device; it steers the avatar shader rather than doing neural style transfer.
export const SAMPLE_SIZE = 64;

export type ArtworkSample = Uint8Array;

export type StyleValues = {
  line: number;
  detail: number;
  texture: number;
};

export type AvatarStyle = StyleValues & { palette: string[] };

export const DEFAULT_STYLE: AvatarStyle = {
  palette: ['#000000', '#404040', '#808080', '#BFBFBF', '#FFFFFF'],
  line: 5,
  detail: 5,
  texture: 3,
};

type Rgb = [number, number, number];

function luma([r, g, b]: Rgb) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function toHex(color: Rgb) {
  return `#${color.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function scale(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function collectPixels(samples: ArtworkSample[]) {
  const pixels: Rgb[] = [];
  for (const sample of samples) {
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i + 3] > 127) pixels.push([sample[i], sample[i + 1], sample[i + 2]]);
    }
  }
  return pixels;
}

function kMeans(pixels: Rgb[], k: number) {
  const byLuma = [...pixels].sort((a, b) => luma(a) - luma(b));
  // Seeding across the tonal range keeps results stable between runs.
  let centers = Array.from(
    { length: k },
    (_, i) => [...byLuma[Math.floor(((i + 0.5) / k) * byLuma.length)]] as Rgb,
  );

  for (let round = 0; round < 8; round++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      let bestDistance = Infinity;
      centers.forEach((c, i) => {
        const distance = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      });
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3] += 1;
    }
    centers = centers.map((c, i) => {
      const n = sums[i][3];
      return n ? ([sums[i][0] / n, sums[i][1] / n, sums[i][2] / n] as Rgb) : c;
    });
  }
  return centers;
}

function measure(sample: ArtworkSample) {
  const gray = new Float32Array(SAMPLE_SIZE * SAMPLE_SIZE);
  const histogram = new Array<number>(16).fill(0);
  for (let i = 0; i < gray.length; i++) {
    const l = luma([sample[i * 4], sample[i * 4 + 1], sample[i * 4 + 2]]) / 255;
    gray[i] = l;
    histogram[Math.min(15, Math.floor(l * 16))] += 1;
  }

  let gradient = 0;
  let laplacian = 0;
  let count = 0;
  for (let y = 1; y < SAMPLE_SIZE - 1; y++) {
    for (let x = 1; x < SAMPLE_SIZE - 1; x++) {
      const i = y * SAMPLE_SIZE + x;
      const [left, right, up, down] = [
        gray[i - 1],
        gray[i + 1],
        gray[i - SAMPLE_SIZE],
        gray[i + SAMPLE_SIZE],
      ];
      gradient += Math.abs(right - left) + Math.abs(down - up);
      laplacian += Math.abs(4 * gray[i] - left - right - up - down);
      count += 1;
    }
  }

  let entropy = 0;
  for (const n of histogram) {
    if (!n) continue;
    const p = n / gray.length;
    entropy -= p * Math.log2(p);
  }

  return { gradient: gradient / count, laplacian: laplacian / count, entropy: entropy / 4 };
}

export function readStyle(samples: ArtworkSample[]): AvatarStyle {
  const pixels = collectPixels(samples);
  if (!pixels.length) return DEFAULT_STYLE;

  const palette = kMeans(pixels, 5)
    .sort((a, b) => luma(a) - luma(b))
    .map(toHex);

  const metrics = samples.map(measure);
  const mean = (read: (m: (typeof metrics)[number]) => number) =>
    metrics.reduce((sum, m) => sum + read(m), 0) / metrics.length;

  return {
    palette,
    line: scale(1 + mean((m) => m.gradient) * 22),
    detail: scale(1 + mean((m) => m.entropy) * 9),
    texture: scale(1 + mean((m) => m.laplacian) * 14),
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
