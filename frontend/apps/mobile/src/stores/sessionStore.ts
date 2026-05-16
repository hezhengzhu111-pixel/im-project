import { create } from 'zustand';
import { messageRepository } from '@/services/storage/messageRepository';
import { sortSessions, markSessionsRead } from '@im/shared-im-core';
import type { ChatSession } from '@im/shared-types';

interface SessionState {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  upsertSession: (session: ChatSession) => void;
  updateSessionFlags: (sessionId: string, flags: Partial<Pick<ChatSession, 'isPinned' | 'isMuted'>>) => void;
  removeSession: (sessionId: string) => void;
  markRead: (sessionId: string) => void;
  restoreFromDb: () => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSession: null,

  setSessions(sessions) {
    const sorted = sortSessions(sessions);
    sorted.forEach((session) => messageRepository.upsertSession(session));
    set({ sessions: sorted });
  },

  setCurrentSession(session) {
    set({ currentSession: session });
    if (session) {
      get().markRead(session.id);
    }
  },

  upsertSession(session) {
    const existing = get().sessions.filter((item) => item.id !== session.id);
    const sessions = sortSessions([session, ...existing]);
    messageRepository.upsertSession(session);
    set({ sessions });
  },

  updateSessionFlags(sessionId, flags) {
    const { sessions, currentSession } = get();
    const existing = sessions.find((session) => session.id === sessionId);
    if (!existing) {
      return;
    }
    const updated = { ...existing, ...flags };
    const nextSessions = sortSessions(sessions.map((session) => (session.id === sessionId ? updated : session)));
    messageRepository.upsertSession(updated);
    set({
      sessions: nextSessions,
      currentSession: currentSession?.id === sessionId ? updated : currentSession,
    });
  },

  removeSession(sessionId) {
    set({
      sessions: get().sessions.filter((session) => session.id !== sessionId),
      currentSession: get().currentSession?.id === sessionId ? null : get().currentSession,
    });
  },

  markRead(sessionId) {
    const { sessions, currentSession } = get();
    const nextSessions = markSessionsRead(sessions, sessionId);
    const updated = nextSessions.find((session) => session.id === sessionId);
    if (!updated) {
      return;
    }
    messageRepository.upsertSession(updated);
    set({
      sessions: nextSessions,
      currentSession: currentSession?.id === sessionId ? updated : currentSession,
    });
  },

  restoreFromDb() {
    set({ sessions: sortSessions(messageRepository.listSessions()) });
  },

  /**
   * 清理会话 store 的内存运行态。
   * 会清：sessions 列表、currentSession。
   * 不会清：SQLite 持久层（由 clearAllCache 处理）。
   */
  clear() {
    set({ sessions: [], currentSession: null });
  },
}));
