import { useEffect, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

import { STYLE_BRIDGE_HTML } from '@/camera/style-bridge-html';
import type { StyleForBridge } from '@/camera/stylize-source';

type WebViewMessageEvent = { nativeEvent: { data: string } };
type WebViewHandle = { postMessage: (message: string) => void; reload: () => void };

// react-native-webview's published props resolve to never under React 19's types
// (same workaround as rig/pose-bridge).
const WebView = RNWebView as unknown as ComponentType<{
  ref?: Ref<WebViewHandle>;
  source: { html: string; baseUrl: string };
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  onMessage: (event: WebViewMessageEvent) => void;
  onContentProcessDidTerminate: () => void;
}>;

const READY_TIMEOUT = 30_000;
const REPLY_TIMEOUT = 10_000;

let send: ((message: string) => void) | null = null;
let ready = false;
let failed = false;
let readyListeners: (() => void)[] = [];
const pending = new Map<number, (uri: string | null, error?: string) => void>();
let nextId = 0;

function waitUntilReady() {
  if (ready) return Promise.resolve();
  if (failed) return Promise.reject(new Error('Object styling did not load.'));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Object styling did not load. Check your internet connection.')),
      READY_TIMEOUT,
    );
    readyListeners.push(() => {
      clearTimeout(timer);
      if (ready) resolve();
      else reject(new Error('Object styling did not load. Check your internet connection.'));
    });
  });
}

// Sends one snapshot to be cut out and restyled; resolves with a PNG data URI of the
// styled object, or null when nothing was found at the tap point.
export async function styleSnapshot(message: {
  image: string;
  x: number;
  y: number;
  style: StyleForBridge;
}): Promise<string | null> {
  await waitUntilReady();
  const post = send;
  if (!post) throw new Error('Object styling closed.');
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Object styling stopped responding.'));
    }, REPLY_TIMEOUT);
    pending.set(id, (uri, error) => {
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve(uri);
    });
    post(JSON.stringify({ type: 'style', id, ...message }));
  });
}

function receive(event: WebViewMessageEvent) {
  let message: { type: string; id?: number; uri?: string | null; message?: string };
  try {
    message = JSON.parse(event.nativeEvent.data);
  } catch {
    return;
  }
  if (message.type === 'log') {
    console.log('[style-bridge]', message.message);
  } else if (message.type === 'ready' || message.type === 'failed') {
    ready = message.type === 'ready';
    failed = !ready;
    if (failed) console.warn('[style-bridge] load failed:', message.message);
    for (const listener of readyListeners) listener();
    readyListeners = [];
  } else if (message.id !== undefined) {
    const settle = pending.get(message.id);
    pending.delete(message.id);
    settle?.(message.uri ?? null, message.type === 'error' ? message.message : undefined);
  }
}

// MediaPipe's interactive segmenter runs in this invisible web view while styling is on.
export function StyleBridge() {
  const webView = useRef<WebViewHandle>(null);

  useEffect(() => {
    send = (message) => webView.current?.postMessage(message);
    return () => {
      send = null;
      ready = false;
      failed = false;
      for (const settle of pending.values()) settle(null, 'Object styling closed.');
      pending.clear();
    };
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webView}
        source={{ html: STYLE_BRIDGE_HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={receive}
        onContentProcessDidTerminate={() => webView.current?.reload()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
