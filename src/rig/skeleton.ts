// A 2D skeleton built from MediaPipe's 33 pose landmarks.
// Poses are flat arrays of joint x/y pairs in the tracked video's pixel space.

export type Pose = Float32Array;

// Only the shape of a MediaPipe landmark, so this file stays platform-neutral.
export type Landmark = { x: number; y: number; visibility?: number };

export const JOINTS = [
  'head',
  'neck',
  'pelvis',
  'lShoulder',
  'rShoulder',
  'lElbow',
  'rElbow',
  'lWrist',
  'rWrist',
  'lHand',
  'rHand',
  'lHip',
  'rHip',
  'lKnee',
  'rKnee',
  'lAnkle',
  'rAnkle',
  'lFoot',
  'rFoot',
] as const;

type Joint = (typeof JOINTS)[number];
const J = Object.fromEntries(JOINTS.map((name, i) => [name, i])) as Record<Joint, number>;

// Each bone runs from a parent joint to a child joint.
export const BONES: readonly (readonly [number, number])[] = [
  [J.pelvis, J.neck],
  [J.neck, J.head],
  [J.neck, J.lShoulder],
  [J.neck, J.rShoulder],
  [J.pelvis, J.lHip],
  [J.pelvis, J.rHip],
  [J.lShoulder, J.lElbow],
  [J.rShoulder, J.rElbow],
  [J.lElbow, J.lWrist],
  [J.rElbow, J.rWrist],
  [J.lWrist, J.lHand],
  [J.rWrist, J.rHand],
  [J.lHip, J.lKnee],
  [J.rHip, J.rKnee],
  [J.lKnee, J.lAnkle],
  [J.rKnee, J.rAnkle],
  [J.lAnkle, J.lFoot],
  [J.rAnkle, J.rFoot],
];

// The bone whose length sets the character's overall size from frame to frame.
export const SPINE = 0;

// MediaPipe landmark indices.
const NOSE = 0;
const L_EAR = 7;
const R_EAR = 8;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_PINKY = 17;
const R_PINKY = 18;
const L_INDEX = 19;
const R_INDEX = 20;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const L_ANKLE = 27;
const R_ANKLE = 28;
const L_TOE = 31;
const R_TOE = 32;

const KEY_LANDMARKS = [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP, L_ELBOW, R_ELBOW, L_KNEE, R_KNEE];

export function poseFromLandmarks(lm: Landmark[], width: number, height: number): Pose {
  const pose = new Float32Array(JOINTS.length * 2);
  const set = (joint: number, ...indices: number[]) => {
    let x = 0;
    let y = 0;
    for (const i of indices) {
      x += lm[i].x;
      y += lm[i].y;
    }
    pose[joint * 2] = (x / indices.length) * width;
    pose[joint * 2 + 1] = (y / indices.length) * height;
  };
  // The nose swings as the face turns, so the head follows the ears too.
  set(J.head, NOSE, L_EAR, R_EAR);
  set(J.neck, L_SHOULDER, R_SHOULDER);
  set(J.pelvis, L_HIP, R_HIP);
  set(J.lShoulder, L_SHOULDER);
  set(J.rShoulder, R_SHOULDER);
  set(J.lElbow, L_ELBOW);
  set(J.rElbow, R_ELBOW);
  set(J.lWrist, L_WRIST);
  set(J.rWrist, R_WRIST);
  set(J.lHand, L_PINKY, L_INDEX);
  set(J.rHand, R_PINKY, R_INDEX);
  set(J.lHip, L_HIP);
  set(J.rHip, R_HIP);
  set(J.lKnee, L_KNEE);
  set(J.rKnee, R_KNEE);
  set(J.lAnkle, L_ANKLE);
  set(J.rAnkle, R_ANKLE);
  set(J.lFoot, L_TOE);
  set(J.rFoot, R_TOE);
  return pose;
}

// How clearly the body was seen, used to choose the rest frame.
export function poseConfidence(lm: Landmark[]) {
  return KEY_LANDMARKS.reduce((sum, i) => sum + (lm[i].visibility ?? 0), 0) / KEY_LANDMARKS.length;
}

// Fills frames with no detection from their neighbours, then smooths out jitter.
// Tracking runs after recording, so the filter can look both ways in time.
export function cleanPoses(raw: (Pose | null)[], radius = 1): Pose[] {
  const firstFound = raw.findIndex(Boolean);
  if (firstFound < 0) return [];
  const filled: Pose[] = [];
  let last = raw[firstFound] as Pose;
  for (const pose of raw) {
    if (pose) last = pose;
    filled.push(last);
  }
  return filled.map((_, i) => {
    const out = new Float32Array(filled[i].length);
    let count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(filled.length - 1, i + radius); k++) {
      const pose = filled[k];
      for (let c = 0; c < out.length; c++) out[c] += pose[c];
      count++;
    }
    for (let c = 0; c < out.length; c++) out[c] /= count;
    return out;
  });
}
