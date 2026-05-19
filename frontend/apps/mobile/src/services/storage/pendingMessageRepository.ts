import type { PendingMessage } from '@/types/models';
import { isEncryptedValue, isRustE2eeEnvelope } from '@im/shared-e2ee-core';
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

const sanitizePendingPayloadJson = (payloadJson: string): string => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    const data = parsed.data && typeof parsed.data === 'object'
      ? { ...(parsed.data as Record<string, unknown>) }
      : undefined;
    const encrypted = isEncryptedValue(parsed.encrypted) || isEncryptedValue(data?.encrypted);
    if (!encrypted || !data) {
      return payloadJson;
    }
    const safeData: Record<string, unknown> = {
      receiverId: data.receiverId,
      clientMessageId: data.clientMessageId,
      messageType: data.messageType,
      encrypted: true,
      e2eeDeviceId: data.e2eeDeviceId,
    };
    if (isRustE2eeEnvelope(data.e2eeEnvelope)) {
      safeData.e2eeEnvelope = data.e2eeEnvelope;
    }
    return JSON.stringify({ ...parsed, encrypted: true, data: safeData });
  } catch {
    return payloadJson;
  }
};

const normalize = (row: Record<string, unknown>): PendingMessage => ({
  localId: String(row.localId || ''),
  conversationId: String(row.conversationId || ''),
  sendType: String(row.sendType || 'private') as PendingMessage['sendType'],
  payloadJson: String(row.payloadJson || '{}'),
  clientMessageId: row.clientMessageId ? String(row.clientMessageId) : undefined,
  status: String(row.status || 'pending') as PendingMessage['status'],
  retryCount: Number(row.retryCount || 0),
  lastError: row.lastError ? String(row.lastError) : undefined,
  createdAt: Number(row.createdAt || Date.now()),
  updatedAt: Number(row.updatedAt || Date.now()),
  nextRetryAt: row.nextRetryAt != null ? Number(row.nextRetryAt) : undefined,
});

export const pendingMessageRepository = {
  enqueue(item: PendingMessage): void {
    // 优先使用独立的 clientMessageId 字段，否则从 payloadJson 解析
    const payloadJson = sanitizePendingPayloadJson(item.payloadJson);
    const clientMessageId = item.clientMessageId || parsePayload(payloadJson).data?.clientMessageId;
    const enriched = clientMessageId ? { ...item, payloadJson, clientMessageId } : { ...item, payloadJson };

    messageDatabase.memoryUpsert('mobile_pending_messages', item.localId, enriched);
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_pending_messages
      (localId, conversationId, sendType, payloadJson, clientMessageId, status, retryCount, lastError, createdAt, updatedAt, nextRetryAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.localId,
        item.conversationId,
        item.sendType,
        payloadJson,
        clientMessageId || null,
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
    return this.listReadyToSend(now);
  },

  listReadyToSend(now = Date.now()): PendingMessage[] {
    return this.listAll().filter(
      (item) => item.status === 'pending' && (item.nextRetryAt ?? 0) <= now,
    );
  },

  listByConversation(conversationId: string): PendingMessage[] {
    if (messageDatabase.isMemoryFallback()) {
      return messageDatabase
        .memoryList('mobile_pending_messages')
        .filter((row) => row.conversationId === conversationId)
        .map(normalize)
        .sort((a, b) => a.createdAt - b.createdAt);
    }
    return messageDatabase
      .query('SELECT * FROM mobile_pending_messages WHERE conversationId = ? ORDER BY createdAt ASC', [conversationId])
      .map(normalize);
  },

  listFailed(): PendingMessage[] {
    return this.listAll().filter((item) => item.status === 'failed');
  },

  listBlocked(): PendingMessage[] {
    return this.listAll().filter((item) => item.status === 'blocked');
  },

  countByStatus(): Record<PendingMessage['status'], number> {
    const counts: Record<string, number> = { pending: 0, sending: 0, failed: 0, sent: 0, blocked: 0 };
    for (const item of this.listAll()) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return counts as Record<PendingMessage['status'], number>;
  },

  updateStatus(
    localId: string,
    patch: Partial<Pick<PendingMessage, 'status' | 'retryCount' | 'lastError' | 'nextRetryAt'>>,
  ): void {
    const existing = this.get(localId);
    if (!existing) {
      return;
    }
    const merged: PendingMessage = {
      ...existing,
      ...patch,
      payloadJson: existing.payloadJson,
      updatedAt: Date.now(),
    };
    this.enqueue(merged);
  },

  listAll(): PendingMessage[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase
          .memoryList('mobile_pending_messages')
          .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      : messageDatabase.query('SELECT * FROM mobile_pending_messages ORDER BY createdAt ASC');
    return rows.map(normalize);
  },

  countAll(): number {
    return this.listAll().length;
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

    if (messageDatabase.isMemoryFallback()) {
      return messageDatabase
        .memoryList('mobile_pending_messages')
        .map(normalize)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .find((item) => item.clientMessageId === normalizedId || parsePayload(item.payloadJson).data?.clientMessageId === normalizedId);
    }

    // 优先通过独立列查询
    const directRows = messageDatabase.query(
      `SELECT * FROM mobile_pending_messages
       WHERE clientMessageId = ?
       ORDER BY updatedAt DESC LIMIT 1`,
      [normalizedId],
    );
    if (directRows.length > 0) {
      return normalize(directRows[0]);
    }

    // 兼容旧数据：fallback 解析 payloadJson（不使用 LIKE）
    const allRows = messageDatabase.query(
      `SELECT * FROM mobile_pending_messages
       WHERE clientMessageId IS NULL
       ORDER BY updatedAt DESC`,
    );
    return allRows
      .map(normalize)
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

  /** 清理 mobile_pending_messages 表（内存缓存 + SQLite）。 */
  clear(): void {
    messageDatabase.memoryClear('mobile_pending_messages');
    messageDatabase.execute('DELETE FROM mobile_pending_messages');
  },
};
