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

// Skia's web API binds to CanvasKit when its module is first evaluated, so the avatar
// screen must only load once public/canvaskit.wasm is ready.
export default function CreateRoute() {
  const inBrowser = useInBrowser();
  if (!inBrowser) return null;
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file) => `/${file}` }}
      getComponent={() => import('@/components/create-screen')}
    />
  );
}
