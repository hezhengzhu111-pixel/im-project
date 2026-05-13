import type { PendingMessage } from '@/types/models';
import { messageDatabase } from './messageDatabase';

interface PendingPayloadRecord {
  data?: {
    clientMessageId?: string;
  };
}

const parsePayload = (payloadJson: string): PendingPayloadRecord => {
  try {
    return JSON.parse(payloadJson) as PendingPayloadRecord;
  } catch {
    return {};
  }
};

const normalize = (row: Record<string, unknown>): PendingMessage => ({
  localId: String(row.localId || ''),
  conversationId: String(row.conversationId || ''),
  sendType: String(row.sendType || 'private') as PendingMessage['sendType'],
  payloadJson: String(row.payloadJson || '{}'),
  status: String(row.status || 'pending') as PendingMessage['status'],
  retryCount: Number(row.retryCount || 0),
  lastError: row.lastError ? String(row.lastError) : undefined,
  createdAt: Number(row.createdAt || Date.now()),
  updatedAt: Number(row.updatedAt || Date.now()),
  nextRetryAt: row.nextRetryAt ? Number(row.nextRetryAt) : undefined,
});

export const pendingMessageRepository = {
  enqueue(item: PendingMessage): void {
    messageDatabase.memoryUpsert('mobile_pending_messages', item.localId, { ...item });
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_pending_messages
      (localId, conversationId, sendType, payloadJson, status, retryCount, lastError, createdAt, updatedAt, nextRetryAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.localId,
        item.conversationId,
        item.sendType,
        item.payloadJson,
        item.status,
        item.retryCount,
        item.lastError,
        item.createdAt,
        item.updatedAt,
        item.nextRetryAt,
      ],
    );
  },

  listReady(now = Date.now()): PendingMessage[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_pending_messages')
      : messageDatabase.query(
          `SELECT * FROM mobile_pending_messages
           WHERE status IN ('pending', 'sending') AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
           ORDER BY createdAt ASC`,
          [now],
        );
    return rows
      .map(normalize)
      .filter((item) => ['pending', 'sending'].includes(item.status) && (item.nextRetryAt || 0) <= now);
  },

  get(localId: string): PendingMessage | undefined {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_pending_messages').filter((row) => row.localId === localId)
      : messageDatabase.query('SELECT * FROM mobile_pending_messages WHERE localId = ? LIMIT 1', [localId]);
    return rows[0] ? normalize(rows[0]) : undefined;
  },

  update(item: PendingMessage): void {
    this.enqueue({ ...item, updatedAt: Date.now() });
  },

  findByClientMessageId(clientMessageId: string): PendingMessage | undefined {
    const normalizedId = clientMessageId.trim();
    if (!normalizedId) {
      return undefined;
    }
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_pending_messages')
      : messageDatabase.query(
          `SELECT * FROM mobile_pending_messages
           WHERE payloadJson LIKE ?
           ORDER BY updatedAt DESC LIMIT 20`,
          [`%${normalizedId}%`],
        );
    return rows
      .map(normalize)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .find((item) => parsePayload(item.payloadJson).data?.clientMessageId === normalizedId);
  },

  remove(localId: string): void {
    messageDatabase.memoryDelete('mobile_pending_messages', localId);
    messageDatabase.execute('DELETE FROM mobile_pending_messages WHERE localId = ?', [localId]);
  },

  removeByClientMessageId(clientMessageId: string): void {
    const existing = this.findByClientMessageId(clientMessageId);
    if (!existing) {
      return;
    }
    this.remove(existing.localId);
  },

  clear(): void {
    messageDatabase.memoryClear('mobile_pending_messages');
    messageDatabase.execute('DELETE FROM mobile_pending_messages');
  },
};
