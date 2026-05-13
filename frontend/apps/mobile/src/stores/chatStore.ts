import { create } from 'zustand';
import { messageService } from '@/services/chat/messageService';
import { messageRepository } from '@/services/storage/messageRepository';
import { uploadService } from '@/services/upload/uploadService';
import { useAuthStore } from './authStore';
import { useContactStore } from './contactStore';
import { useGroupStore } from './groupStore';
import { useMessageStore } from './messageStore';
import { useSessionStore } from './sessionStore';
import type { ChatSession, Group, MessageType } from '@/types/models';
import type { MobileFile } from '@/services/file/fileService';

interface ChatState {
  loading: boolean;
  bootstrap: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  openSession: (session: ChatSession) => Promise<void>;
  openPrivateSession: (target: { targetId: string; targetName: string; targetAvatar?: string }) => Promise<void>;
  openGroupSession: (group: Group) => Promise<void>;
  sendText: (content: string) => Promise<void>;
  sendMedia: (file: MobileFile, type: MessageType) => Promise<void>;
  retryPending: () => Promise<void>;
  clearRuntime: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
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

  async openPrivateSession(target) {
    const userId = useAuthStore.getState().currentUser?.id || '';
    await useChatStore.getState().openSession({
      id: `private_${userId}_${target.targetId}`,
      type: 'private',
      targetId: target.targetId,
      targetName: target.targetName,
      targetAvatar: target.targetAvatar,
      unreadCount: 0,
    });
  },

  async openGroupSession(group) {
    await useChatStore.getState().openSession({
      id: `group_${group.id}`,
      type: 'group',
      targetId: group.id,
      targetName: group.groupName || group.name || group.id,
      targetAvatar: group.avatar,
      unreadCount: 0,
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
    useSessionStore.getState().clear();
    useMessageStore.getState().clear();
    useContactStore.getState().clear();
    useGroupStore.getState().clear();
  },
}));
