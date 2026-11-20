import { hexToRgb, type AvatarStyle } from '@/avatar/style';

// The object-styling routine as plain JavaScript source. The browser preview and the iPhone
// web-view bridge both run this exact text, so the look matches on every platform.
//
// stylize(frame, mask, selectedHigh, style) repaints `frame` (ImageData) in place with the
// avatar shader's look: tones mapped onto the artwork palette, print dots in the shadows and
// ink outlines, only where the confidence `mask` covers the tapped object. Everything else
// is made transparent. `style.palette` is five [r, g, b] colours (0–255), darkest first.
export const STYLIZE_SOURCE = `
function stylize(frame, mask, selectedHigh, style) {
  const width = frame.width, height = frame.height, data = frame.data;
  const palette = style.palette;
  const levels = 1 + style.detail;
  const line = (style.line - 1) / 9;
  const texture = (style.texture - 1) / 9;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    luma[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }
  const cell = 5;
  const edgeLow = 0.62 - 0.38 * line;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const confidence = selectedHigh ? mask[i] : 1 - mask[i];
      if (confidence < 0.5) { data[i * 4 + 3] = 0; continue; }
      const l = Math.min(1, Math.max(0, (luma[i] - 0.04) / 0.92));
      const tone = Math.min(1, Math.floor(l * levels) / (levels - 1));
      const s = tone * 4;
      const k = Math.min(3, Math.floor(s));
      const t = s - k;
      let r = palette[k][0] + (palette[k + 1][0] - palette[k][0]) * t;
      let g = palette[k][1] + (palette[k + 1][1] - palette[k][1]) * t;
      let b = palette[k][2] + (palette[k + 1][2] - palette[k][2]) * t;
      const gx = ((x + y) / Math.SQRT2) % cell;
      const gy = ((y - x + width) / Math.SQRT2) % cell;
      const dot = Math.hypot(gx - cell / 2, gy - cell / 2) < (1 - l) * cell * 0.72 ? 1 : 0;
      const ink = dot * texture * 0.8;
      let edge = 0;
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const gxv = luma[i + 1] - luma[i - 1];
        const gyv = luma[i + width] - luma[i - width];
        edge = Math.min(1, Math.max(0, (Math.hypot(gxv, gyv) * 2 - edgeLow) / 0.2));
      }
      const mix = Math.min(1, ink + edge * Math.min(1, line * 1.6));
      r += (palette[0][0] - r) * mix;
      g += (palette[0][1] - g) * mix;
      b += (palette[0][2] - b) * mix;
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      // Feather the cut-out edge so the object blends into the live view.
      data[i * 4 + 3] = Math.min(255, (confidence - 0.5) * 2 * 255 * 1.6);
    }
  }
}
`;

export type StyleForBridge = {
  palette: number[][];
  line: number;
  detail: number;
  texture: number;
};

export function toBridgeStyle(style: AvatarStyle): StyleForBridge {
  return {
    palette: style.palette.map(hexToRgb).map((c) => c.map((v) => v * 255)),
    line: style.line,
    detail: style.detail,
    texture: style.texture,
  };
}
