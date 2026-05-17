import { Alert, type AlertButton } from 'react-native';
import { getAvailableMessageActions } from '@/utils/messageActions';
import type { MessageActionContext, MessageActionId, MessageActionItem } from '@/types/models';
import type { MobileMessage } from '@/types/models';

export interface MessageActionCallbacks {
  onCopy?: (message: MobileMessage) => void;
  onRetry?: (message: MobileMessage) => void;
  onDeleteLocal?: (message: MobileMessage) => void;
  onRecall?: (message: MobileMessage) => void;
  onSaveMedia?: (message: MobileMessage) => void;
  onOpenFile?: (message: MobileMessage) => void;
  onReadDetail?: (message: MobileMessage) => void;
}

const CALLBACK_MAP: Record<MessageActionId, keyof MessageActionCallbacks | undefined> = {
  copy: 'onCopy',
  retry: 'onRetry',
  deleteLocal: 'onDeleteLocal',
  recall: 'onRecall',
  saveMedia: 'onSaveMedia',
  openFile: 'onOpenFile',
  readDetail: 'onReadDetail',
  forward: undefined,
};

function resolveCallback(
  id: MessageActionId,
  callbacks: MessageActionCallbacks,
): ((message: MobileMessage) => void) | undefined {
  const key = CALLBACK_MAP[id];
  if (!key) return undefined;
  return callbacks[key];
}

function executeAction(
  id: MessageActionId,
  message: MobileMessage,
  callbacks: MessageActionCallbacks,
): void {
  const cb = resolveCallback(id, callbacks);
  if (cb) {
    cb(message);
  }
}

const DESTRUCTIVE_IDS: ReadonlySet<MessageActionId> = new Set(['deleteLocal', 'recall']);

/**
 * Show the message action menu using Alert.alert.
 *
 * Disabled actions display their reason when tapped.
 * Destructive actions (deleteLocal, recall) show a second confirmation Alert
 * before executing.
 */
export function showMessageActionSheet(
  message: MobileMessage,
  ctx: MessageActionContext,
  callbacks: MessageActionCallbacks,
): void {
  const actions = getAvailableMessageActions(message, ctx);

  const handlePress = (action: MessageActionItem) => {
    if (action.disabled) {
      Alert.alert(action.label, action.reason || '此操作暂不可用');
      return;
    }

    if (DESTRUCTIVE_IDS.has(action.id)) {
      Alert.alert(
        action.label,
        `确定要${action.label}这条消息吗？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: action.label,
            style: 'destructive',
            onPress: () => executeAction(action.id, message, callbacks),
          },
        ],
        { cancelable: true },
      );
      return;
    }

    executeAction(action.id, message, callbacks);
  };

  const buttons: AlertButton[] = actions.map((action) => ({
    text: action.label,
    onPress: () => handlePress(action),
  }));

  buttons.push({ text: '取消', onPress: undefined, style: 'cancel' });

  Alert.alert('消息操作', undefined, buttons, { cancelable: true });
}
