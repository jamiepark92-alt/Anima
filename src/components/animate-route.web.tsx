import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
// False while Expo renders the page on the server, where CanvasKit can't load.
const useInBrowser = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

// Same as the avatar screen: Skia must only load once public/canvaskit.wasm is ready.
export default function AnimateRoute() {
  const inBrowser = useInBrowser();
  if (!inBrowser) return null;
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file) => `/${file}` }}
      getComponent={() => import('@/components/animate-screen')}
    />
  );
}
