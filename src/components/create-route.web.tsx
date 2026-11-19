import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// Skia's web API binds to CanvasKit when its module is first evaluated, so the avatar
// screen must only load once public/canvaskit.wasm is ready.
export default function CreateRoute() {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file) => `/${file}` }}
      getComponent={() => import('@/components/create-screen')}
    />
  );
}
