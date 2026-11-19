import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// Same as the avatar screen: Skia must only load once public/canvaskit.wasm is ready.
export default function AnimateRoute() {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file) => `/${file}` }}
      getComponent={() => import('@/components/animate-screen')}
    />
  );
}
