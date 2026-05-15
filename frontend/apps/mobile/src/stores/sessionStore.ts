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
    set((state) => ({
      sessions: state.sessions.map((session) => (session.id === sessionId ? { ...session, ...flags } : session)),
      currentSession:
        state.currentSession?.id === sessionId ? { ...state.currentSession, ...flags } : state.currentSession,
    }));
  },

  removeSession(sessionId) {
    set({
      sessions: get().sessions.filter((session) => session.id !== sessionId),
      currentSession: get().currentSession?.id === sessionId ? null : get().currentSession,
    });
  },

  markRead(sessionId) {
    set({ sessions: markSessionsRead(get().sessions, sessionId) });
  },

  restoreFromDb() {
    set({ sessions: sortSessions(messageRepository.listSessions()) });
  },

  clear() {
    set({ sessions: [], currentSession: null });
  },
}));
