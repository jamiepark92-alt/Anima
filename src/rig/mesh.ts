import { BONES, SPINE, type Pose } from '@/rig/skeleton';

// The person's silhouette in the rest frame, as MediaPipe returns it (0–1 per pixel).
export type Silhouette = { width: number; height: number; data: Float32Array };

export type Rig = {
  // Rest-frame vertex positions and their matching artwork pixel coordinates.
  positions: Float32Array;
  uvs: Float32Array;
  indices: number[];
  // Per vertex: INFLUENCES × (bone, weight, along, across).
  binding: Float32Array;
  bounds: { x: number; y: number; width: number; height: number };
};

const INFLUENCES = 3;
const STRIDE = INFLUENCES * 4;
const GRID = 72;

function segment(rest: Pose, bone: number) {
  const [a, b] = BONES[bone];
  const ax = rest[a * 2];
  const ay = rest[a * 2 + 1];
  const dx = rest[b * 2] - ax;
  const dy = rest[b * 2 + 1] - ay;
  const length = Math.hypot(dx, dy) || 1;
  return { ax, ay, ux: dx / length, uy: dy / length, length };
}

function distanceToBone(x: number, y: number, s: ReturnType<typeof segment>) {
  const t = Math.min(Math.max(((x - s.ax) * s.ux + (y - s.ay) * s.uy) / s.length, 0), 1);
  return Math.hypot(x - (s.ax + s.ux * s.length * t), y - (s.ay + s.uy * s.length * t));
}

// Where the person is in the rest frame, from the silhouette or, failing that, the skeleton.
function occupancy(rest: Pose, silhouette: Silhouette | null) {
  if (silhouette) {
    const { width, height, data } = silhouette;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[y * width + x] > 0.5) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
    if (x1 > x0 && y1 > y0) {
      const inside = (x: number, y: number) => {
        const px = Math.round(x);
        const py = Math.round(y);
        return px >= 0 && py >= 0 && px < width && py < height && data[py * width + px] > 0.5;
      };
      return { box: { x0, y0, x1, y1 }, inside };
    }
  }
  const xs = rest.filter((_, i) => i % 2 === 0);
  const ys = rest.filter((_, i) => i % 2 === 1);
  const spine = segment(rest, SPINE).length;
  const pad = spine * 0.35;
  const segments = BONES.map((_, i) => segment(rest, i));
  return {
    box: {
      x0: Math.min(...xs) - pad,
      y0: Math.min(...ys) - pad * 1.2,
      x1: Math.max(...xs) + pad,
      y1: Math.max(...ys) + pad * 0.3,
    },
    inside: (x: number, y: number) =>
      segments.some((s, i) => distanceToBone(x, y, s) < spine * (i < 2 ? 0.42 : 0.18)),
  };
}

// Lays the artwork over the person's rest pose as a triangle mesh cut to their silhouette,
// and binds each vertex to its nearest bones.
export function buildRig(
  rest: Pose,
  silhouette: Silhouette | null,
  art: { width: number; height: number },
): Rig {
  const { box, inside } = occupancy(rest, silhouette);
  const margin = (box.y1 - box.y0) * 0.03;
  const bx = box.x0 - margin;
  const by = box.y0 - margin;
  const bw = box.x1 - box.x0 + margin * 2;
  const bh = box.y1 - box.y0 + margin * 2;

  const cell = Math.max(bw, bh) / GRID;
  const cols = Math.ceil(bw / cell);
  const rows = Math.ceil(bh / cell);

  // A cell belongs to the character if any part of it touches the silhouette.
  const filled = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      outer: for (let sy = 0; sy <= 2; sy++) {
        for (let sx = 0; sx <= 2; sx++) {
          if (inside(bx + (c + sx / 2) * cell, by + (r + sy / 2) * cell)) {
            filled[r * cols + c] = 1;
            break outer;
          }
        }
      }
    }
  }

  // Cover-fit the artwork onto the character's box.
  const scale = Math.max(bw / art.width, bh / art.height);
  const offsetX = (art.width - bw / scale) / 2;
  const offsetY = (art.height - bh / scale) / 2;

  const vertexOf = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertex = (c: number, r: number) => {
    const key = r * (cols + 1) + c;
    if (vertexOf[key] < 0) {
      const x = bx + c * cell;
      const y = by + r * cell;
      vertexOf[key] = positions.length / 2;
      positions.push(x, y);
      uvs.push(offsetX + (x - bx) / scale, offsetY + (y - by) / scale);
    }
    return vertexOf[key];
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled[r * cols + c]) continue;
      const a = vertex(c, r);
      const b = vertex(c + 1, r);
      const d = vertex(c, r + 1);
      const e = vertex(c + 1, r + 1);
      indices.push(a, b, d, b, e, d);
    }
  }

  const segments = BONES.map((_, i) => segment(rest, i));
  const falloff = segments[SPINE].length * 0.05;
  const count = positions.length / 2;
  const binding = new Float32Array(count * STRIDE);
  for (let v = 0; v < count; v++) {
    const x = positions[v * 2];
    const y = positions[v * 2 + 1];
    const nearest = segments
      .map((s, bone) => ({
        bone,
        s,
        w: 1 / (distanceToBone(x, y, s) + falloff) ** 4,
      }))
      .sort((p, q) => q.w - p.w)
      .slice(0, INFLUENCES);
    const total = nearest.reduce((sum, n) => sum + n.w, 0);
    nearest.forEach(({ bone, s, w }, k) => {
      const o = v * STRIDE + k * 4;
      binding[o] = bone;
      binding[o + 1] = w / total;
      // Position relative to the bone: a fraction of its length, and a distance off its side.
      binding[o + 2] = ((x - s.ax) * s.ux + (y - s.ay) * s.uy) / s.length;
      binding[o + 3] = (x - s.ax) * -s.uy + (y - s.ay) * s.ux;
    });
  }

  return {
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    indices,
    binding,
    bounds: { x: bx, y: by, width: bw, height: bh },
  };
}

// Moves every vertex with its bones. Limbs stretch along their length as they
// foreshorten; their thickness follows the body's overall size instead.
export function deform(rig: Rig, rest: Pose, pose: Pose, out: Float32Array) {
  const restSpine = segment(rest, SPINE).length;
  const spine = segment(pose, SPINE).length;
  const thickness = spine / restSpine;
  const bones = BONES.map((_, i) => segment(pose, i));
  const count = rig.positions.length / 2;
  for (let v = 0; v < count; v++) {
    let x = 0;
    let y = 0;
    for (let k = 0; k < INFLUENCES; k++) {
      const o = v * STRIDE + k * 4;
      const s = bones[rig.binding[o]];
      const weight = rig.binding[o + 1];
      const along = rig.binding[o + 2] * s.length;
      const across = rig.binding[o + 3] * thickness;
      x += weight * (s.ax + s.ux * along - s.uy * across);
      y += weight * (s.ay + s.uy * along + s.ux * across);
    }
    out[v * 2] = x;
    out[v * 2 + 1] = y;
  }
  return out;
}

// The area the character covers across the whole clip, so the view can frame it.
export function motionBounds(rig: Rig, rest: Pose, poses: Pose[]) {
  const out = new Float32Array(rig.positions.length);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const pose of poses) {
    deform(rig, rest, pose, out);
    for (let i = 0; i < out.length; i += 2) {
      x0 = Math.min(x0, out[i]);
      x1 = Math.max(x1, out[i]);
      y0 = Math.min(y0, out[i + 1]);
      y1 = Math.max(y1, out[i + 1]);
    }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
