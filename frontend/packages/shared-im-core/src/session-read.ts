import type { ChatSession } from "@im/shared-types";

/**
 * 将单个会话的未读计数清零，保留其他所有字段不变。
 * 纯函数，不修改输入。
 */
export const markSessionRead = (session: ChatSession): ChatSession => {
  if (session.unreadCount === 0) {
    return session;
  }
  return { ...session, unreadCount: 0 };
};

/**
 * 将目标会话的未读计数清零，非目标会话保持不变。
 * 纯函数，不修改输入。
 */
export const markSessionsRead = (
  sessions: ChatSession[],
  sessionId: string,
): ChatSession[] => {
  let changed = false;
  const next = sessions.map((s) => {
    if (s.id === sessionId && s.unreadCount !== 0) {
      changed = true;
      return { ...s, unreadCount: 0 };
    }
    return s;
  });
  return changed ? next : sessions;
};
