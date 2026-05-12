import type { ChatSession, MobileMessage } from '@/types/models';
import { messageDatabase } from './messageDatabase';

const messageKey = (message: MobileMessage): string =>
  message.serverId || message.id || message.clientMessageId || `${message.conversationId}:${message.sendTime}`;

const parseMessage = (row: Record<string, unknown>): MobileMessage => {
  const rawJson = String(row.rawJson || '{}');
  try {
    return JSON.parse(rawJson) as MobileMessage;
  } catch {
    return {
      id: String(row.id || ''),
      conversationId: String(row.conversationId || ''),
      senderId: String(row.senderId || ''),
      messageType: String(row.messageType || 'TEXT') as MobileMessage['messageType'],
      sendTime: String(row.sendTime || new Date().toISOString()),
      content: String(row.content || ''),
    };
  }
};

export const messageRepository = {
  upsertSession(session: ChatSession): void {
    const now = Date.now();
    messageDatabase.memoryUpsert('mobile_sessions', session.id, {
      ...session,
      updatedAt: now,
      lastMessageJson: session.lastMessage ? JSON.stringify(session.lastMessage) : '',
    });
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_sessions
      (id, type, targetId, targetName, targetAvatar, unreadCount, lastActiveTime, lastMessageJson, isPinned, isMuted, encrypted, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.type,
        session.targetId,
        session.targetName,
        session.targetAvatar,
        session.unreadCount,
        session.lastActiveTime,
        session.lastMessage ? JSON.stringify(session.lastMessage) : '',
        session.isPinned ? 1 : 0,
        session.isMuted ? 1 : 0,
        session.encrypted ? 1 : 0,
        now,
      ],
    );
  },

  listSessions(): ChatSession[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_sessions')
      : messageDatabase.query('SELECT * FROM mobile_sessions ORDER BY isPinned DESC, updatedAt DESC');
    return rows.map((row) => ({
      id: String(row.id || ''),
      type: String(row.type || 'private') as ChatSession['type'],
      targetId: String(row.targetId || ''),
      targetName: String(row.targetName || ''),
      targetAvatar: row.targetAvatar ? String(row.targetAvatar) : undefined,
      unreadCount: Number(row.unreadCount || 0),
      lastActiveTime: row.lastActiveTime ? String(row.lastActiveTime) : undefined,
      lastMessage: row.lastMessageJson ? (JSON.parse(String(row.lastMessageJson)) as MobileMessage) : undefined,
      isPinned: Boolean(row.isPinned),
      isMuted: Boolean(row.isMuted),
      encrypted: Boolean(row.encrypted),
    }));
  },

  upsertMessages(conversationId: string, messages: MobileMessage[]): void {
    const now = Date.now();
    messages.forEach((message) => {
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
      : messageDatabase.query(
          'SELECT * FROM mobile_messages WHERE conversationId = ? ORDER BY sendTime DESC LIMIT ?',
          [conversationId, limit],
        );
    return rows
      .map(parseMessage)
      .sort((left, right) => new Date(left.sendTime).getTime() - new Date(right.sendTime).getTime());
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

  clearAllCache(): void {
    ['mobile_sessions', 'mobile_messages', 'mobile_media_cache', 'mobile_notification_events'].forEach((name) =>
      messageDatabase.memoryClear(name),
    );
    messageDatabase.execute('DELETE FROM mobile_sessions');
    messageDatabase.execute('DELETE FROM mobile_messages');
    messageDatabase.execute('DELETE FROM mobile_media_cache');
    messageDatabase.execute('DELETE FROM mobile_notification_events');
  },
};
