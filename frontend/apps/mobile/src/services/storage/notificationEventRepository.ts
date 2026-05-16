import { messageDatabase } from './messageDatabase';

export interface NotificationEventRecord {
  id: string;
  type: string;
  routeName?: string;
  payloadJson?: string;
  createdAt: number;
}

const createEventId = () => `notification_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const normalize = (row: Record<string, unknown>): NotificationEventRecord => ({
  id: String(row.id || ''),
  type: String(row.type || 'unknown'),
  routeName: row.routeName ? String(row.routeName) : undefined,
  payloadJson: row.payloadJson ? String(row.payloadJson) : undefined,
  createdAt: Number(row.createdAt || Date.now()),
});

export const notificationEventRepository = {
  record(type: string, routeName?: string, payload?: Record<string, unknown>): NotificationEventRecord {
    const event: NotificationEventRecord = {
      id: createEventId(),
      type,
      routeName,
      payloadJson: payload ? JSON.stringify(payload) : undefined,
      createdAt: Date.now(),
    };
    messageDatabase.memoryUpsert('mobile_notification_events', event.id, { ...event });
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_notification_events
       (id, type, routeName, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [event.id, event.type, event.routeName, event.payloadJson, event.createdAt],
    );
    return event;
  },

  listRecent(limit = 50): NotificationEventRecord[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_notification_events')
      : messageDatabase.query(
          'SELECT * FROM mobile_notification_events ORDER BY createdAt DESC LIMIT ?',
          [limit],
        );
    return rows.map(normalize).sort((left, right) => right.createdAt - left.createdAt);
  },

  /** 清理 mobile_notification_events 表（内存缓存 + SQLite）。 */
  clear(): void {
    messageDatabase.memoryClear('mobile_notification_events');
    messageDatabase.execute('DELETE FROM mobile_notification_events');
  },
};
