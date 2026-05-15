import { create } from 'zustand';
import { resolveGroupSessionId, resolvePrivateSessionId } from '@/adapters/sessionAdapter';
import { messageService } from '@/services/chat/messageService';
import { messageRepository } from '@/services/storage/messageRepository';
import { uploadService } from '@/services/upload/uploadService';
import { useAuthStore } from './authStore';
import { useContactStore } from './contactStore';
import { useGroupStore } from './groupStore';
import { useMessageStore } from './messageStore';
import { useSessionStore } from './sessionStore';
import type { ChatRouteParams, ChatSession, Group, MessageType } from '@/types/models';
import type { MobileFile } from '@/services/file/fileService';

interface ChatState {
  loading: boolean;
  bootstrap: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  openSession: (session: ChatSession) => Promise<void>;
  openSessionFromRoute: (params: ChatRouteParams) => Promise<boolean>;
  openPrivateSession: (target: { targetId: string; targetName: string; targetAvatar?: string }) => Promise<void>;
  openGroupSession: (group: Group) => Promise<void>;
  sendText: (content: string) => Promise<void>;
  sendMedia: (file: MobileFile, type: MessageType) => Promise<void>;
  retryPending: () => Promise<void>;
  clearRuntime: () => void;
}

const routeOpenRequests = new Map<string, Promise<boolean>>();
let lastOpenedRouteKey = '';

const clean = (value?: string): string => value?.trim() || '';

const firstValue = (...values: Array<string | undefined>): string => {
  for (const value of values) {
    const next = clean(value);
    if (next) {
      return next;
    }
  }
  return '';
};

const groupIdFromSessionId = (sessionId: string): string =>
  sessionId.startsWith('group_') ? sessionId.slice('group_'.length) : '';

const inferPrivateTargetFromSessionId = (sessionId: string, currentUserId: string): string => {
  if (!sessionId || sessionId.startsWith('group_')) {
    return '';
  }
  const parts = sessionId.split('_').filter(Boolean);
  if (parts.length !== 2) {
    return '';
  }
  const [left, right] = parts;
  if (left === currentUserId) {
    return right || '';
  }
  if (right === currentUserId) {
    return left || '';
  }
  return '';
};

const privateTargetFromRoute = (
  params: ChatRouteParams,
  currentUserId: string,
  requestedSessionId: string,
): string =>
  firstValue(
    params.targetId,
    params.senderId && params.senderId !== currentUserId ? params.senderId : undefined,
    params.receiverId && params.receiverId !== currentUserId ? params.receiverId : undefined,
    inferPrivateTargetFromSessionId(requestedSessionId, currentUserId),
  );

const sessionFromRoute = (params: ChatRouteParams, currentUserId: string): ChatSession | null => {
  const requestedSessionId = firstValue(params.sessionId, params.conversationId);
  const groupId = firstValue(params.groupId, groupIdFromSessionId(requestedSessionId));
  if (groupId) {
    return {
      id: requestedSessionId || resolveGroupSessionId(groupId),
      type: 'group',
      targetId: groupId,
      targetName: firstValue(params.groupName, params.targetName, groupId),
      unreadCount: 0,
      lastActiveTime: '',
      isPinned: false,
      isMuted: false,
    };
  }

  const targetId = privateTargetFromRoute(params, currentUserId, requestedSessionId);
  if (!targetId) {
    return null;
  }
  return {
    id: requestedSessionId || resolvePrivateSessionId(currentUserId, targetId),
    type: 'private',
    targetId,
    targetName: firstValue(params.targetName, params.senderName, targetId),
    unreadCount: 0,
    lastActiveTime: '',
    isPinned: false,
    isMuted: false,
  };
};

const findStoredSession = (sessionId: string): ChatSession | undefined =>
  useSessionStore.getState().sessions.find((item) => item.id === sessionId) ||
  messageRepository.listSessions().find((item) => item.id === sessionId);

const routeKeyFor = (params: ChatRouteParams, currentUserId: string): string => {
  const session = sessionFromRoute(params, currentUserId);
  return session ? `${session.type}:${session.id}:${session.targetId}` : '';
};

export const useChatStore = create<ChatState>((set, get) => ({
  loading: false,

  async bootstrap() {
    set({ loading: true });
    try {
      useSessionStore.getState().restoreFromDb();
      await Promise.allSettled([
        useContactStore.getState().loadFriends(),
        useGroupStore.getState().loadGroups(),
        useContactStore.getState().loadFriendRequests(),
      ]);
      await useChatStore.getState().refreshSessions();
      await useChatStore.getState().retryPending();
    } finally {
      set({ loading: false });
    }
  },

  async refreshSessions() {
    const userId = useAuthStore.getState().currentUser?.id;
    if (!userId) {
      return;
    }
    const response = await messageService.getConversations(userId);
    response.data.forEach((session) => messageRepository.upsertSession(session));
    useSessionStore.getState().setSessions(response.data);
  },

  async openSession(session) {
    useSessionStore.getState().setCurrentSession(session);
    await useMessageStore.getState().loadMessages(session);
    await useMessageStore.getState().markRead(session).catch(() => undefined);
  },

  async openSessionFromRoute(params) {
    const authState = useAuthStore.getState();
    const currentUserId = authState.currentUser?.id || '';
    if (!authState.authReady || !currentUserId) {
      return false;
    }
    const routeKey = routeKeyFor(params, currentUserId);
    if (!routeKey) {
      return false;
    }
    const existingRequest = routeOpenRequests.get(routeKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const routeSession = sessionFromRoute(params, currentUserId);
      if (!routeSession) {
        return false;
      }
      let session = findStoredSession(routeSession.id);
      if (!session) {
        await get().refreshSessions().catch(() => undefined);
        session = findStoredSession(routeSession.id);
      }
      const resolvedSession = session || routeSession;
      if (
        lastOpenedRouteKey === routeKey &&
        useSessionStore.getState().currentSession?.id === resolvedSession.id
      ) {
        return true;
      }
      if (!session) {
        useSessionStore.getState().upsertSession(resolvedSession);
      }
      await get().openSession(resolvedSession);
      lastOpenedRouteKey = routeKey;
      return true;
    })();

    routeOpenRequests.set(routeKey, request);
    try {
      return await request;
    } finally {
      routeOpenRequests.delete(routeKey);
    }
  },

  async openPrivateSession(target) {
    const userId = useAuthStore.getState().currentUser?.id || '';
    if (!userId) {
      throw new Error('No authenticated user');
    }
    await useChatStore.getState().openSession({
      id: resolvePrivateSessionId(userId, target.targetId),
      type: 'private',
      targetId: target.targetId,
      targetName: target.targetName,
      targetAvatar: target.targetAvatar,
      unreadCount: 0,
      lastActiveTime: '',
      isPinned: false,
      isMuted: false,
    });
  },

  async openGroupSession(group) {
    await useChatStore.getState().openSession({
      id: resolveGroupSessionId(group.id),
      type: 'group',
      targetId: group.id,
      targetName: group.groupName || group.name || group.id,
      targetAvatar: group.avatar,
      unreadCount: 0,
      lastActiveTime: group.lastActivityAt || group.lastMessageTime || group.createTime,
      isPinned: false,
      isMuted: false,
      memberCount: group.memberCount,
    });
  },

  async sendText(content) {
    const session = useSessionStore.getState().currentSession;
    if (!session) {
      throw new Error('No active session');
    }
    await useMessageStore.getState().sendText(session, content);
  },

  async sendMedia(file, type) {
    const session = useSessionStore.getState().currentSession;
    if (!session) {
      throw new Error('No active session');
    }
    await useMessageStore.getState().sendMedia(session, file, type);
  },

  async retryPending() {
    await uploadService.retryPendingUploads();
    await useMessageStore.getState().retryPending();
  },

  clearRuntime() {
    lastOpenedRouteKey = '';
    useSessionStore.getState().clear();
    useMessageStore.getState().clear();
    useContactStore.getState().clear();
    useGroupStore.getState().clear();
  },
}));
