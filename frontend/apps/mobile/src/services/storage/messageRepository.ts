import { hasSameMobileMessageIdentity } from '@/utils/normalizers';
import { isEncryptedMessage, maskEncryptedMessage } from '@/e2ee/e2eeDeferred';
import type { ChatSession } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';
import { messageDatabase } from './messageDatabase';
import { pendingMessageRepository } from './pendingMessageRepository';
import { uploadTaskRepository } from './uploadTaskRepository';

const messageKey = (message: MobileMessage): string =>
  message.serverId || message.clientMessageId || message.id || `${message.conversationId}:${message.sendTime}`;

const parseMessage = (row: Record<string, unknown>): MobileMessage => {
  const rawJson = String(row.rawJson || '{}');
  try {
    return JSON.parse(rawJson) as MobileMessage;
  } catch {
    return {
      id: String(row.id || ''),
      conversationId: String(row.conversationId || ''),
      senderId: String(row.senderId || ''),
      isGroupChat: Boolean(row.groupId),
      messageType: String(row.messageType || 'TEXT') as MobileMessage['messageType'],
      sendTime: String(row.sendTime || new Date().toISOString()),
      status: 'SENT',
      content: String(row.content || ''),
    };
  }
};

const mobileIdentityValues = (message: Pick<MobileMessage, 'id' | 'serverId' | 'clientMessageId'>): string[] =>
  [message.id, message.serverId, message.clientMessageId].map((item) => String(item || '')).filter(Boolean);

const sanitizeSession = (session: ChatSession): ChatSession => {
  const lastMessage = session.lastMessage
    ? maskEncryptedMessage(session.lastMessage as MobileMessage)
    : undefined;
  return {
    ...session,
    lastMessage,
    encrypted: Boolean(session.encrypted) || Boolean(lastMessage && isEncryptedMessage(lastMessage)),
  };
};

const sqliteDuplicateRows = (conversationId: string, message: MobileMessage): Record<string, unknown>[] => {
  const conditions: string[] = ['conversationId = ?'];
  const params: Array<string | null> = [conversationId];

  if (message.id) {
    conditions.push('id = ?');
    params.push(message.id);
  }
  if (message.serverId) {
    conditions.push('serverId = ?');
    params.push(message.serverId);
  }
  if (message.clientMessageId) {
    conditions.push('clientMessageId = ?');
    params.push(message.clientMessageId);
  }
  if (conditions.length === 1) {
    return [];
  }
  return messageDatabase.query(
    `SELECT * FROM mobile_messages WHERE ${conditions[0]} AND (${conditions.slice(1).join(' OR ')})`,
    params,
  );
};

const removeDuplicateMessages = (conversationId: string, message: MobileMessage): void => {
  const identities = new Set(mobileIdentityValues(message));

  messageDatabase
    .memoryList('mobile_messages')
    .filter((row) => row.conversationId === conversationId)
    .map(parseMessage)
    .filter(
      (existing) =>
        hasSameMobileMessageIdentity(existing, message) ||
        mobileIdentityValues(existing).some((identity) => identities.has(identity)),
    )
    .forEach((existing) => {
      messageDatabase.memoryDelete('mobile_messages', `${conversationId}:${messageKey(existing)}`);
    });

  sqliteDuplicateRows(conversationId, message).forEach((row) => {
    if (row.id) {
      messageDatabase.execute('DELETE FROM mobile_messages WHERE id = ?', [String(row.id)]);
    }
  });
};

export interface MessagePageResult {
  messages: MobileMessage[];
  hasMore: boolean;
  oldestMessage?: MobileMessage;
  newestMessage?: MobileMessage;
}

export interface MessagePageOptions {
  limit?: number;
  beforeTime?: string;
  afterTime?: string;
  beforeId?: string;
  afterId?: string;
  direction?: 'older' | 'newer';
}

export const messageRepository = {
  upsertSession(session: ChatSession): void {
    const safeSession = sanitizeSession(session);
    const now = Date.now();
    messageDatabase.memoryUpsert('mobile_sessions', safeSession.id, {
      ...safeSession,
      updatedAt: now,
      lastMessageJson: safeSession.lastMessage ? JSON.stringify(safeSession.lastMessage) : '',
    });
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_sessions
      (id, type, targetId, targetName, targetAvatar, unreadCount, lastActiveTime, lastMessageJson, isPinned, isMuted, encrypted, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeSession.id,
        safeSession.type,
        safeSession.targetId,
        safeSession.targetName,
        safeSession.targetAvatar,
        safeSession.unreadCount,
        safeSession.lastActiveTime,
        safeSession.lastMessage ? JSON.stringify(safeSession.lastMessage) : '',
        safeSession.isPinned ? 1 : 0,
        safeSession.isMuted ? 1 : 0,
        safeSession.encrypted ? 1 : 0,
        now,
      ],
    );
  },

  listSessions(): ChatSession[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_sessions').sort((a, b) => {
          const pinDelta = Number(b.isPinned || 0) - Number(a.isPinned || 0);
          if (pinDelta !== 0) return pinDelta;
          return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
        })
      : messageDatabase.query('SELECT * FROM mobile_sessions ORDER BY isPinned DESC, updatedAt DESC');
    return rows.map((row) =>
      sanitizeSession({
        id: String(row.id || ''),
        type: String(row.type || 'private') as ChatSession['type'],
        targetId: String(row.targetId || ''),
        targetName: String(row.targetName || ''),
        targetAvatar: row.targetAvatar ? String(row.targetAvatar) : undefined,
        unreadCount: Number(row.unreadCount || 0),
        lastActiveTime: row.lastActiveTime ? String(row.lastActiveTime) : '',
        lastMessage: row.lastMessageJson ? (JSON.parse(String(row.lastMessageJson)) as MobileMessage) : undefined,
        isPinned: Boolean(row.isPinned),
        isMuted: Boolean(row.isMuted),
        encrypted: Boolean(row.encrypted),
      }),
    );
  },

  upsertMessages(conversationId: string, messages: MobileMessage[]): void {
    const now = Date.now();
    messages.forEach((message) => {
      removeDuplicateMessages(conversationId, message);
      const record = {
        ...message,
        conversationId,
        rawJson: JSON.stringify({ ...message, conversationId }),
      };
      messageDatabase.memoryUpsert('mobile_messages', `${conversationId}:${messageKey(message)}`, record);
      messageDatabase.execute(
        `INSERT OR REPLACE INTO mobile_messages
        (id, serverId, clientMessageId, conversationId, senderId, receiverId, groupId, messageType, content, mediaUrl,
         thumbnailUrl, mediaName, mediaSize, duration, status, readStatus, readByCount, sendTime, createdAt, updatedAt, rawJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          message.serverId,
          message.clientMessageId,
          conversationId,
          message.senderId,
          message.receiverId,
          message.groupId,
          message.messageType,
          message.content,
          message.mediaUrl,
          message.thumbnailUrl,
          message.mediaName,
          message.mediaSize,
          message.duration,
          message.status,
          message.readStatus,
          message.readByCount,
          message.sendTime,
          now,
          now,
          record.rawJson,
        ],
      );
    });
  },

  listMessages(conversationId: string, limit = 50): MobileMessage[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase
          .memoryList('mobile_messages')
          .filter((row) => row.conversationId === conversationId)
          .sort((a, b) => new Date(String(b.sendTime || '')).getTime() - new Date(String(a.sendTime || '')).getTime())
          .slice(0, limit)
      : messageDatabase.query(
          'SELECT * FROM mobile_messages WHERE conversationId = ? ORDER BY sendTime DESC LIMIT ?',
          [conversationId, limit],
        );
    return rows
      .map((row) => maskEncryptedMessage(parseMessage(row)))
      .sort((left, right) => new Date(left.sendTime).getTime() - new Date(right.sendTime).getTime());
  },

  /**
   * 分页查询本地消息。
   *
   * 支持三种模式：
   * - 初始加载（无 cursor）：返回最近 limit 条，按 sendTime ASC
   * - 加载更旧消息（beforeTime）：返回 sendTime < beforeTime 的消息
   * - 加载更新消息（afterTime）：返回 sendTime > afterTime 的消息
   *
   * 查询 limit+1 条以判断 hasMore，最终按 sendTime ASC 返回给调用方。
   */
  listMessagesPage(conversationId: string, options: MessagePageOptions = {}): MessagePageResult {
    const limit = options.limit ?? 50;
    const fetchLimit = limit + 1;
    const isNewer = Boolean(options.afterTime || options.afterId);
    const isOlder = Boolean(options.beforeTime || options.beforeId);

    const messageCompare = (a: MobileMessage, b: MobileMessage): number => {
      const timeDiff = new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (a.serverId || a.clientMessageId || a.id || '').localeCompare(
        b.serverId || b.clientMessageId || b.id || '',
      );
    };

    const toPageResult = (fetched: MobileMessage[]): MessagePageResult => {
      const hasMore = fetched.length > limit;
      let sliced = fetched;
      if (hasMore) {
        // initial/older: DESC query → extra item is the oldest (position 0 after ASC sort) → drop head
        // newer: ASC query → extra item is the newest (position last after ASC sort) → drop tail
        sliced = isNewer ? fetched.slice(0, limit) : fetched.slice(1);
      }
      return {
        messages: sliced,
        hasMore,
        oldestMessage: sliced[0],
        newestMessage: sliced[sliced.length - 1],
      };
    };

    const memoryTiebreaker = (row: Record<string, unknown>): string =>
      String(row.serverId || row.clientMessageId || row.id || '');

    const memoryCompare = (a: Record<string, unknown>, b: Record<string, unknown>, dir: 'asc' | 'desc'): number => {
      const aTime = String(a.sendTime || '');
      const bTime = String(b.sendTime || '');
      const timeDiff = new Date(aTime).getTime() - new Date(bTime).getTime();
      if (timeDiff !== 0) return dir === 'desc' ? -timeDiff : timeDiff;
      const aKey = memoryTiebreaker(a);
      const bKey = memoryTiebreaker(b);
      const keyDiff = aKey.localeCompare(bKey);
      return dir === 'desc' ? -keyDiff : keyDiff;
    };

    if (messageDatabase.isMemoryFallback()) {
      const allRows = messageDatabase
        .memoryList('mobile_messages')
        .filter((row) => row.conversationId === conversationId);

      let filtered = allRows;
      if (isOlder) {
        const cutoffTime = options.beforeTime || '';
        filtered = allRows.filter((row) => String(row.sendTime || '') < cutoffTime);
      } else if (isNewer) {
        const cutoffTime = options.afterTime || '';
        filtered = allRows.filter((row) => String(row.sendTime || '') > cutoffTime);
      }

      const direction: 'asc' | 'desc' = isNewer ? 'asc' : 'desc';
      const sorted = filtered.sort((a, b) => memoryCompare(a, b, direction));
      const sliced = sorted.slice(0, fetchLimit);

      const messages = sliced.map((row) => maskEncryptedMessage(parseMessage(row)));
      messages.sort(messageCompare);

      return toPageResult(messages);
    }

    // SQLite path
    let where = 'conversationId = ?';
    const params: Array<string | number> = [conversationId];

    if (isOlder) {
      where += ' AND sendTime < ?';
      params.push(options.beforeTime || '');
    } else if (isNewer) {
      where += ' AND sendTime > ?';
      params.push(options.afterTime || '');
    }

    const orderBy = isNewer
      ? 'ORDER BY sendTime ASC, COALESCE(serverId, clientMessageId, id) DESC'
      : 'ORDER BY sendTime DESC, COALESCE(serverId, clientMessageId, id) ASC';

    const rows = messageDatabase.query(
      `SELECT * FROM mobile_messages WHERE ${where} ${orderBy} LIMIT ?`,
      [...params, fetchLimit],
    );

    const messages = rows.map((row) => maskEncryptedMessage(parseMessage(row)));
    messages.sort(messageCompare);

    return toPageResult(messages);
  },

  clearConversation(conversationId: string): void {
    messageDatabase
      .memoryList('mobile_messages')
      .filter((row) => row.conversationId === conversationId)
      .forEach((row) => {
        const key = `${conversationId}:${messageKey(parseMessage(row))}`;
        messageDatabase.memoryDelete('mobile_messages', key);
      });
    messageDatabase.execute('DELETE FROM mobile_messages WHERE conversationId = ?', [conversationId]);
  },

  /**
   * 清理全部消息相关 SQLite 表和内存缓存。
   * 会清：mobile_sessions、mobile_messages、mobile_media_cache、
   * mobile_notification_events、mobile_pending_messages（委托）、
   * mobile_upload_tasks（委托）。
   * 不会清：auth 凭据、kvStorage、WebSocket 状态。
   */
  clearAllCache(): void {
    ['mobile_sessions', 'mobile_messages', 'mobile_media_cache', 'mobile_notification_events'].forEach((name) =>
      messageDatabase.memoryClear(name),
    );
    messageDatabase.execute('DELETE FROM mobile_sessions');
    messageDatabase.execute('DELETE FROM mobile_messages');
    messageDatabase.execute('DELETE FROM mobile_media_cache');
    messageDatabase.execute('DELETE FROM mobile_notification_events');
    pendingMessageRepository.clear();
    uploadTaskRepository.clear();
  },
};
