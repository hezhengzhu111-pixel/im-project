import type { ChatSession } from '@im/shared-types';

// Auto-mock all dependencies (no factory needed)
jest.mock('@/services/storage/messageRepository');

import { useSessionStore } from '../sessionStore';
import { messageRepository } from '@/services/storage/messageRepository';

const mr = jest.mocked(messageRepository);

const baseSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: '100_200',
  type: 'private',
  targetId: '200',
  targetName: 'Bob',
  unreadCount: 0,
  lastActiveTime: '',
  isPinned: false,
  isMuted: false,
  ...overrides,
});

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ sessions: [], currentSession: null });
    jest.clearAllMocks();
    // Set default return values for auto-mocked methods
    mr.listSessions.mockReturnValue([]);
  });

  describe('upsertSession', () => {
    it('pinned sessions sort before unpinned', () => {
      const unpinned = baseSession({ id: '100_200', isPinned: false, lastActiveTime: '2024-06-02T10:00:00.000Z' });
      const pinned = baseSession({ id: '100_300', isPinned: true, lastActiveTime: '2024-06-01T10:00:00.000Z' });

      useSessionStore.setState({ sessions: [unpinned] });
      useSessionStore.getState().upsertSession(pinned);

      const sessions = useSessionStore.getState().sessions;
      expect(sessions[0].id).toBe('100_300');
      expect(sessions[0].isPinned).toBe(true);
      expect(sessions[1].id).toBe('100_200');
    });

    it('within same pin group, sorts by lastActiveTime descending', () => {
      const older = baseSession({ id: '100_200', lastActiveTime: '2024-06-01T10:00:00.000Z' });
      const newer = baseSession({ id: '100_300', lastActiveTime: '2024-06-02T10:00:00.000Z' });

      useSessionStore.setState({ sessions: [older] });
      useSessionStore.getState().upsertSession(newer);

      const sessions = useSessionStore.getState().sessions;
      expect(sessions[0].id).toBe('100_300');
      expect(sessions[1].id).toBe('100_200');
    });

    it('treats missing lastActiveTime as 0 (sorts last)', () => {
      const withTime = baseSession({ id: '100_200', lastActiveTime: '2024-06-01T10:00:00.000Z' });
      const noTime = baseSession({ id: '100_300', lastActiveTime: '' });

      useSessionStore.setState({ sessions: [noTime] });
      useSessionStore.getState().upsertSession(withTime);

      const sessions = useSessionStore.getState().sessions;
      expect(sessions[0].id).toBe('100_200');
      expect(sessions[1].id).toBe('100_300');
    });

    it('replaces existing session with same id', () => {
      const original = baseSession({ id: '100_200', unreadCount: 5, lastActiveTime: '2024-06-01T10:00:00.000Z' });
      const updated = baseSession({ id: '100_200', unreadCount: 0, lastActiveTime: '2024-06-02T10:00:00.000Z' });

      useSessionStore.setState({ sessions: [original] });
      useSessionStore.getState().upsertSession(updated);

      const sessions = useSessionStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].unreadCount).toBe(0);
    });

    it('persists session to messageRepository', () => {
      const session = baseSession();
      useSessionStore.getState().upsertSession(session);
      expect(mr.upsertSession).toHaveBeenCalledWith(session);
    });
  });

  describe('markRead', () => {
    it('clears unreadCount for the target session', () => {
      const session = baseSession({ unreadCount: 5 });
      useSessionStore.setState({ sessions: [session] });
      useSessionStore.getState().markRead('100_200');

      const sessions = useSessionStore.getState().sessions;
      expect(sessions[0].unreadCount).toBe(0);
    });

    it('does not affect other sessions', () => {
      const a = baseSession({ id: '100_200', unreadCount: 5 });
      const b = baseSession({ id: '100_300', unreadCount: 3 });
      useSessionStore.setState({ sessions: [a, b] });
      useSessionStore.getState().markRead('100_200');

      const sessions = useSessionStore.getState().sessions;
      const sessionB = sessions.find((s) => s.id === '100_300');
      expect(sessionB?.unreadCount).toBe(3);
    });
  });

  describe('setCurrentSession', () => {
    it('sets currentSession and marks it read', () => {
      const session = baseSession({ unreadCount: 5 });
      useSessionStore.setState({ sessions: [session] });
      useSessionStore.getState().setCurrentSession(session);

      expect(useSessionStore.getState().currentSession?.id).toBe('100_200');
      expect(useSessionStore.getState().sessions[0].unreadCount).toBe(0);
    });

    it('clears currentSession when null is passed', () => {
      useSessionStore.getState().setCurrentSession(null);
      expect(useSessionStore.getState().currentSession).toBeNull();
    });
  });

  describe('setSessions', () => {
    it('sorts and persists all sessions', () => {
      const a = baseSession({ id: '100_200', lastActiveTime: '2024-06-01T10:00:00.000Z' });
      const b = baseSession({ id: '100_300', lastActiveTime: '2024-06-02T10:00:00.000Z' });

      useSessionStore.getState().setSessions([a, b]);

      const sessions = useSessionStore.getState().sessions;
      expect(sessions[0].id).toBe('100_300');
      expect(mr.upsertSession).toHaveBeenCalledTimes(2);
    });
  });

  describe('restoreFromDb', () => {
    it('loads sessions from repository and sorts them', () => {
      const a = baseSession({ id: '100_200', lastActiveTime: '2024-06-01T10:00:00.000Z' });
      const b = baseSession({ id: '100_300', isPinned: true, lastActiveTime: '2024-06-01T10:00:00.000Z' });
      mr.listSessions.mockReturnValue([a, b]);

      useSessionStore.getState().restoreFromDb();

      const sessions = useSessionStore.getState().sessions;
      expect(sessions[0].id).toBe('100_300');
      expect(sessions[0].isPinned).toBe(true);
    });
  });

  describe('clear', () => {
    it('resets sessions and currentSession to empty', () => {
      const sessions = [baseSession(), baseSession({ id: '100_300' })];
      useSessionStore.setState({ sessions, currentSession: sessions[0] });

      useSessionStore.getState().clear();

      expect(useSessionStore.getState().sessions).toEqual([]);
      expect(useSessionStore.getState().currentSession).toBeNull();
    });
  });
});
