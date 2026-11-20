import { STYLIZE_SOURCE } from '@/camera/stylize-source';

// The page that cuts out and restyles a tapped object inside a hidden web view on iPhone.
// The app sends it a JPEG snapshot plus the tap point; it sends back a PNG of just the
// styled object (transparent elsewhere) to lay over the live camera view.
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
const ANALYSIS_WIDTH = 320;

export const STYLE_BRIDGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script type="module">
const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
window.addEventListener('error', (e) => post({ type: 'log', message: 'page error: ' + e.message }));
window.addEventListener('unhandledrejection', (e) => post({ type: 'log', message: 'page rejection: ' + String(e.reason) }));
${STYLIZE_SOURCE}
let segmenter = null;
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

async function start() {
  try {
    const { FilesetResolver, InteractiveSegmenterLegacy } = await import('${VISION}/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('${VISION}/wasm');
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: '${MODEL}', delegate },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    try {
      segmenter = await InteractiveSegmenterLegacy.createFromOptions(fileset, options('GPU'));
    } catch {
      segmenter = await InteractiveSegmenterLegacy.createFromOptions(fileset, options('CPU'));
    }
    post({ type: 'ready' });
  } catch (error) {
    post({ type: 'failed', message: String(error) });
  }
}

async function styleFrame({ id, image, x, y, style }) {
  const blob = await (await fetch('data:image/jpeg;base64,' + image)).blob();
  const probe = await createImageBitmap(blob);
  const width = ${ANALYSIS_WIDTH};
  const height = Math.round((width * probe.height) / probe.width);
  probe.close();
  // Shrink the full-size snapshot as it's decoded; segmenting needs only a small frame.
  const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' });
  canvas.width = width;
  canvas.height = height;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const result = segmenter.segment(canvas, { keypoint: { x, y } });
  const mask = result.confidenceMasks && result.confidenceMasks[0] && result.confidenceMasks[0].getAsFloat32Array();
  if (!mask) {
    result.close();
    post({ type: 'styled', id, uri: null });
    return;
  }
  const at = mask[Math.min(height - 1, Math.round(y * height)) * width + Math.min(width - 1, Math.round(x * width))];
  const frame = context.getImageData(0, 0, width, height);
  stylize(frame, mask, at >= 0.5, style);
  result.close();
  context.putImageData(frame, 0, 0);
  post({ type: 'styled', id, uri: canvas.toDataURL('image/png') });
}

async function receive(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.type !== 'style') return;
  try {
    await styleFrame(message);
  } catch (error) {
    post({ type: 'error', id: message.id, message: String(error) });
  }
}

window.addEventListener('message', receive);
document.addEventListener('message', receive);
start();
</script>
</body></html>`;
