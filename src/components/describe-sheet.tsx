import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BOX, INK } from '@/components/wire';
import { Gutter, Spacing } from '@/constants/theme';

export type DescribeKind = 'character' | 'props' | 'set';

const COPY: Record<DescribeKind, { title: string; placeholder: string }> = {
  character: {
    title: 'Describe a character',
    placeholder: 'A tall knight in patchwork armour, painted in watercolour…',
  },
  props: {
    title: 'Describe a prop',
    placeholder: 'A brass lantern with a cracked green glass panel…',
  },
  set: {
    title: 'Describe a set',
    placeholder: 'A rainy neon alley at night, seen from street level…',
  },
};

const MUTED = '#8E8E93';

// A sheet where you type or dictate (with the keyboard's microphone) what to make.
export function DescribeSheet({
  kind,
  visible,
  onClose,
  onCreated,
}: {
  kind: DescribeKind;
  visible: boolean;
  onClose: () => void;
  onCreated: (uri: string) => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[kind];

  async function create() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, kind }),
      });
      const result = (await response.json().catch(() => ({}))) as { uri?: string; error?: string };
      if (!response.ok || !result.uri) {
        setError(result.error ?? 'The image could not be made. Try again.');
        return;
      }
      await onCreated(result.uri);
      setText('');
      onClose();
    } catch {
      setError('Could not reach the image service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const canCreate = text.trim().length > 0 && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.header}>
            <ThemedText type="label" accessibilityRole="header" style={styles.title}>
              {copy.title}
            </ThemedText>
            <Pressable
              onPress={onClose}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}>
              <Icon name="close" size={14} color={INK} />
            </Pressable>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={copy.placeholder}
            placeholderTextColor={MUTED}
            accessibilityLabel={copy.title}
            multiline
            autoFocus
            editable={!busy}
            style={styles.input}
          />
          <ThemedText type="caption" style={styles.muted}>
            Type it, or tap the microphone on the keyboard to say it.
          </ThemedText>
          {error ? (
            <ThemedText type="caption" style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={create}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCreate, busy }}
            style={({ pressed }) => [
              styles.create,
              !canCreate && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={BOX} />
            ) : (
              <Icon name="sparkles" size={16} color={BOX} />
            )}
            <ThemedText type="label" style={{ color: BOX }}>
              {busy ? 'Making…' : 'Make it'}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    gap: Spacing.three - 4,
    paddingTop: Spacing.three,
    paddingHorizontal: Gutter,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: BOX,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: INK,
    fontWeight: 600,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  input: {
    minHeight: 110,
    maxHeight: 200,
    padding: Spacing.three - 4,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    color: INK,
    fontSize: 17,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  muted: {
    color: MUTED,
  },
  error: {
    color: '#FF6961',
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 50,
    borderRadius: 25,
    backgroundColor: INK,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
