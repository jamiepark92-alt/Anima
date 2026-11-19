export const AVATAR_SHADER = `
uniform shader image;
uniform float2 size;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;
uniform float3 c4;
uniform float lineAmount;
uniform float levels;
uniform float textureAmount;

float luma(float3 c) { return dot(c, float3(0.299, 0.587, 0.114)); }
float3 px(float2 p) { return image.eval(p).rgb; }

float edge(float2 p, float r) {
  float tl = luma(px(p + float2(-r, -r)));
  float t  = luma(px(p + float2( 0, -r)));
  float tr = luma(px(p + float2( r, -r)));
  float l  = luma(px(p + float2(-r,  0)));
  float rr = luma(px(p + float2( r,  0)));
  float bl = luma(px(p + float2(-r,  r)));
  float b  = luma(px(p + float2( 0,  r)));
  float br = luma(px(p + float2( r,  r)));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(float2(gx, gy));
}

// Maps tone onto the artwork palette, darkest to lightest.
float3 ramp(float t) {
  float s = clamp(t, 0.0, 1.0) * 4.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  return mix(c3, c4, s - 3.0);
}

half4 main(float2 xy) {
  float u = size.x / 360.0;
  float l = smoothstep(0.04, 0.96, luma(px(xy)));
  float tone = clamp(floor(l * levels) / (levels - 1.0), 0.0, 1.0);
  float3 c = ramp(tone);

  // Print-style dots grow in the shadows as texture goes up.
  float cell = 7.0 * u;
  float2x2 rot = float2x2(0.7071, -0.7071, 0.7071, 0.7071);
  float2 g = rot * xy;
  float2 center = (floor(g / cell) + 0.5) * cell;
  float r = (1.0 - l) * cell * 0.72;
  float dotMask = 1.0 - smoothstep(r - 0.8, r + 0.8, distance(g, center));
  c = mix(c, c0, dotMask * textureAmount * 0.8);

  float low = 0.62 - 0.38 * lineAmount;
  float e = smoothstep(low, low + 0.2, edge(xy, (1.0 + 1.6 * lineAmount) * u));
  c = mix(c, c0, e * min(1.0, lineAmount * 1.6));
  return half4(c, 1.0);
}`;
