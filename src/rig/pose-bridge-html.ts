// The page that runs MediaPipe inside a hidden web view on iPhone.
// The app sends it JPEG frames one at a time and gets landmarks back.
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

export const POSE_BRIDGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script type="module">
const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
// Pass page errors back to the app so they show in the Expo terminal.
window.addEventListener('error', (e) => post({ type: 'log', message: 'page error: ' + e.message }));
window.addEventListener('unhandledrejection', (e) => post({ type: 'log', message: 'page rejection: ' + String(e.reason) }));
post({ type: 'log', message: 'bridge page started' });
// Shoulders, hips, elbows, knees: the same landmarks the app uses to pick the rest frame.
const KEY = [11, 12, 23, 24, 13, 14, 25, 26];
let landmarker = null;
let clock = 0;
let best = null;

async function start() {
  try {
    const { FilesetResolver, PoseLandmarker } = await import('${VISION}/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('${VISION}/wasm');
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: '${MODEL}', delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      outputSegmentationMasks: true,
    });
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
    }
    post({ type: 'ready' });
  } catch (error) {
    post({ type: 'log', message: 'load failed: ' + String(error) });
    post({ type: 'failed', message: String(error) });
  }
}

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

async function frame({ id, index, step, data, resize }) {
  const blob = await (await fetch('data:image/jpeg;base64,' + data)).blob();
  // Live camera snapshots arrive full size; shrink them as they decode when asked.
  let bitmap = await createImageBitmap(blob);
  if (resize && bitmap.width > resize) {
    const height = Math.round((resize * bitmap.height) / bitmap.width);
    bitmap.close();
    bitmap = await createImageBitmap(blob, { resizeWidth: resize, resizeHeight: height, resizeQuality: 'low' });
  }
  clock += step;
  const result = landmarker.detectForVideo(bitmap, clock);
  const found = result.landmarks[0];
  let landmarks = null;
  if (found) {
    landmarks = found.map((p) => [p.x, p.y, p.visibility ?? 0]);
    const score = KEY.reduce((sum, i) => sum + (found[i].visibility ?? 0), 0) / KEY.length;
    const mask = result.segmentationMasks && result.segmentationMasks[0];
    if (mask && (!best || score > best.score + 0.05)) {
      const values = mask.getAsFloat32Array();
      const bytes = new Uint8Array(values.length);
      for (let i = 0; i < values.length; i++) bytes[i] = Math.round(values[i] * 255);
      best = { index, score, width: mask.width, height: mask.height, bytes };
    }
  }
  result.close();
  bitmap.close();
  post({ type: 'pose', id, landmarks });
}

function finish({ id }) {
  const rest = best && {
    index: best.index,
    width: best.width,
    height: best.height,
    data: toBase64(best.bytes),
  };
  best = null;
  post({ type: 'done', id, rest });
}

async function receive(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  try {
    if (message.type === 'frame') await frame(message);
    else if (message.type === 'finish') finish(message);
  } catch (error) {
    post({ type: 'log', message: message.type + ' failed: ' + String(error) });
    post({ type: 'error', id: message.id, message: String(error) });
  }
}

// iOS delivers app messages on window, Android on document.
window.addEventListener('message', receive);
document.addEventListener('message', receive);
start();
</script>
</body></html>`;
