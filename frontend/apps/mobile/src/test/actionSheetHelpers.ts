import { Alert } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

// ─── Alert.alert mock ──────────────────────────────────────────────

const alertMock = jest.fn();
// Replace Alert.alert with a jest mock so tests can assert on calls
// and inspect captured buttons. Must be imported before the code under
// test so the same module instance carries the mock.
Object.defineProperty(Alert, 'alert', { value: alertMock, writable: true });

/** Reset captured Alert.alert calls (call in beforeEach). */
export function resetAlertMock(): void {
  alertMock.mockClear();
}

/**
 * Return the button array from the most recent Alert.alert call.
 * Returns an empty array if Alert.alert has never been called.
 */
export function getAlertButtons(): Array<{
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}> {
  const calls = alertMock.mock.calls;
  if (calls.length === 0) return [];
  const lastCall = calls[calls.length - 1];
  // Alert.alert(title, message?, buttons?, options?)
  return Array.isArray(lastCall[2]) ? (lastCall[2] as Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>) : [];
}

/** Return the full Alert.alert mock so tests can assert on title/message. */
export function getAlertMock(): jest.Mock {
  return alertMock;
}

// ─── ReactTestInstance helpers ─────────────────────────────────────

function typeName(node: { type: unknown }): string {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') {
    return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  }
  return '';
}

/**
 * Check whether a ReactTestInstance tree contains a <Text> node whose
 * rendered content includes `text`.
 */
export function findText(root: ReactTestInstance, text: string): boolean {
  try {
    root.find(
      (node) =>
        typeName(node) === 'Text' &&
        String((node.children ?? []).join('')).includes(text),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a Pressable descendant whose children include `text` and fire its
 * onPress handler.
 *
 * Throws if no matching Pressable is found or the found node has no onPress.
 */
export function pressByText(root: ReactTestInstance, text: string): void {
  let target: ReactTestInstance | null = null;
  try {
    target = root.find((node) => {
      if (node.props.onPress == null) return false;
      if (typeName(node) !== 'Pressable') return false;
      return findText(node, text);
    });
  } catch {
    // not found
  }
  if (!target) {
    throw new Error(`pressByText: no Pressable containing "${text}" found`);
  }
  if (typeof target.props.onPress !== 'function') {
    throw new Error(`pressByText: found Pressable with text "${text}" but onPress is not a function`);
  }
  target.props.onPress();
}

// ─── Convenience accessors for commonly-mocked services ────────────

/**
 * Return the mocked Clipboard.default instance (setString is jest.fn()).
 * Only works after "@react-native-clipboard/clipboard" has been mocked
 * (setup.tsx handles this automatically).
 */
export function getMockedClipboard(): { setString: jest.Mock } {
  const mod = require('@react-native-clipboard/clipboard') as {
    default: { setString: jest.Mock };
  };
  return mod.default;
}
