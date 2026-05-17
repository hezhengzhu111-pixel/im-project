import type { Message, MessageStatus } from '@im/shared-types';
import type {
  MessageActionContext,
  MessageActionId,
  MessageActionItem,
} from '../types/models';

export const ACTION_LABELS: Record<MessageActionId, string> = {
  copy: '复制',
  retry: '重试发送',
  deleteLocal: '删除',
  recall: '撤回',
  saveMedia: '保存',
  openFile: '打开文件',
  readDetail: '消息详情',
  forward: '转发',
};

const SENT_STATUSES: ReadonlySet<MessageStatus> = new Set([
  'SENT',
  'DELIVERED',
  'READ',
]);

const FAILED_VALUES = new Set<MessageStatus | string>([
  'FAILED',
  'SEND_FAILED',
  'UPLOAD_FAILED',
]);

export function getAvailableMessageActions(
  message: Message,
  ctx: MessageActionContext,
): MessageActionItem[] {
  const actions: MessageActionItem[] = [];
  const add = (
    id: MessageActionId,
    overrides?: Partial<MessageActionItem>,
  ) => {
    actions.push({ id, label: ACTION_LABELS[id], ...overrides });
  };

  const mine = message.senderId === ctx.currentUserId;
  const encrypted = Boolean(message.encrypted);
  const sent =
    (ctx.messageStatus != null && SENT_STATUSES.has(ctx.messageStatus)) ||
    SENT_STATUSES.has(message.status);
  const failed =
    FAILED_VALUES.has(message.status) ||
    (ctx.messageStatus != null && FAILED_VALUES.has(ctx.messageStatus)) ||
    ctx.sendStage === 'SEND_FAILED' ||
    ctx.sendStage === 'UPLOAD_FAILED';

  // copy — TEXT with non-empty content, exclude encrypted
  if (
    message.messageType === 'TEXT' &&
    typeof message.content === 'string' &&
    message.content.length > 0 &&
    !encrypted
  ) {
    add('copy');
  }

  // retry — failed send or upload stage
  if (failed) {
    add('retry');
  }

  // recall — own sent message: within window → enabled, else → disabled
  if (mine && sent) {
    if (encrypted) {
      add('recall', {
        destructive: true,
        disabled: true,
        reason: '加密消息暂不支持撤回',
      });
    } else {
      const sendMs = Date.parse(message.sendTime);
      if (!Number.isNaN(sendMs) && ctx.now - sendMs < ctx.recallWindowMs) {
        add('recall', { destructive: true });
      } else {
        add('recall', {
          destructive: true,
          disabled: true,
          reason: '超过撤回时限',
        });
      }
    }
  }

  // deleteLocal — always available
  add('deleteLocal', { destructive: true });

  // saveMedia — IMAGE / VIDEO with local or remote media URI
  if (
    (message.messageType === 'IMAGE' || message.messageType === 'VIDEO') &&
    (ctx.hasMediaUri || ctx.hasRemoteMediaUri)
  ) {
    add('saveMedia');
  }

  // openFile — FILE with local or remote media URI
  if (message.messageType === 'FILE' && (ctx.hasMediaUri || ctx.hasRemoteMediaUri)) {
    add('openFile');
  }

  // readDetail — reserved, own sent messages only
  if (mine && sent) {
    if (encrypted) {
      add('readDetail', {
        disabled: true,
        reason: '加密消息暂不支持查看详情',
      });
    } else {
      add('readDetail');
    }
  }

  // forward — reserved, always disabled
  add('forward', { disabled: true, reason: '转发功能即将推出' });

  return actions;
}
