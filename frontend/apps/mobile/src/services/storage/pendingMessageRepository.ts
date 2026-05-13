import type { PendingMessage } from '@/types/models';
import { messageDatabase } from './messageDatabase';

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
           WHERE status = 'pending' AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
           ORDER BY createdAt ASC`,
          [now],
        );
    return rows.map(normalize).filter((item) => item.status === 'pending' && (item.nextRetryAt || 0) <= now);
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

  remove(localId: string): void {
    messageDatabase.memoryDelete('mobile_pending_messages', localId);
    messageDatabase.execute('DELETE FROM mobile_pending_messages WHERE localId = ?', [localId]);
  },

  clear(): void {
    messageDatabase.memoryClear('mobile_pending_messages');
    messageDatabase.execute('DELETE FROM mobile_pending_messages');
  },
};
