import { useEffect, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

import { POSE_BRIDGE_HTML } from '@/rig/pose-bridge-html';

type WebViewMessageEvent = { nativeEvent: { data: string } };
type WebViewHandle = { postMessage: (message: string) => void; reload: () => void };

// react-native-webview's published props resolve to never under React 19's types,
// so this declares just the props the bridge uses.
const WebView = RNWebView as unknown as ComponentType<{
  ref?: Ref<WebViewHandle>;
  source: { html: string; baseUrl: string };
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  onMessage: (event: WebViewMessageEvent) => void;
  onContentProcessDidTerminate: () => void;
}>;

export type BridgeReply =
  | { type: 'pose'; id: number; landmarks: [number, number, number][] | null }
  | {
      type: 'done';
      id: number;
      rest: { index: number; width: number; height: number; data: string } | null;
    }
  | { type: 'error'; id: number; message: string };

type Pending = { resolve: (reply: BridgeReply) => void; reject: (error: Error) => void };

const READY_TIMEOUT = 30_000;
const REPLY_TIMEOUT = 15_000;

// One bridge is mounted at a time; the tracker talks to it through this module.
let send: ((message: string) => void) | null = null;
let ready = false;
let failure: string | null = null;
let readyListeners: (() => void)[] = [];
const pending = new Map<number, Pending>();
let nextId = 0;

function settleReady() {
  for (const listener of readyListeners) listener();
  readyListeners = [];
}

function waitUntilReady() {
  if (ready) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      readyListeners = readyListeners.filter((l) => l !== check);
      reject(new Error('The body tracker did not load. Check your internet connection.'));
    }, READY_TIMEOUT);
    const check = () => {
      clearTimeout(timer);
      if (ready) resolve();
      else reject(new Error(failure ?? 'The body tracker did not load.'));
    };
    readyListeners.push(check);
  });
}

export async function askBridge(message: Record<string, unknown>): Promise<BridgeReply> {
  await waitUntilReady();
  const post = send;
  if (!post) throw new Error('The body tracker closed.');
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The body tracker stopped responding.'));
    }, REPLY_TIMEOUT);
    pending.set(id, {
      resolve: (reply) => {
        clearTimeout(timer);
        resolve(reply);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    post(JSON.stringify({ ...message, id }));
  });
}

function receive(event: WebViewMessageEvent) {
  let message: { type: string; id?: number; message?: string };
  try {
    message = JSON.parse(event.nativeEvent.data);
  } catch {
    return;
  }
  if (message.type === 'log') {
    console.log('[pose-bridge]', message.message);
    return;
  }
  if (message.type === 'ready') console.log('[pose-bridge] tracker ready');
  if (message.type === 'ready') {
    ready = true;
    settleReady();
  } else if (message.type === 'failed') {
    failure = 'The body tracker did not load. Check your internet connection.';
    settleReady();
  } else if (message.id !== undefined) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.type === 'error') waiter?.reject(new Error('A frame could not be tracked.'));
    else waiter?.resolve(message as BridgeReply);
  }
}

// MediaPipe runs in this invisible web view; mount it on any screen that tracks video.
export function PoseBridge() {
  const webView = useRef<WebViewHandle>(null);

  useEffect(() => {
    const mine = (message: string) => webView.current?.postMessage(message);
    send = mine;
    // A newly mounted page hasn't loaded MediaPipe yet; wait for its own "ready".
    ready = false;
    failure = null;
    return () => {
      // Animate and the live camera can each mount a bridge; closing one mustn't cut off
      // the other, so only tear down if this bridge is still the one in use.
      if (send !== mine) return;
      send = null;
      ready = false;
      failure = null;
      for (const waiter of pending.values()) waiter.reject(new Error('The body tracker closed.'));
      pending.clear();
    };
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webView}
        source={{ html: POSE_BRIDGE_HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={receive}
        // A crashed web process would otherwise leave the tracker waiting forever.
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
