import { create } from 'zustand';
import { WS_MESSAGE_TYPE } from '@im/shared-api-contract';
import {
  DUPLICATE_CONNECTION_REASON,
  createHeartbeatPayload,
  createReconnectDelay,
  createTicketedWebSocketUrl,
  parseWebSocketPayload,
  shouldProcessSequentially,
} from '@im/shared-ws-core';
import { applyMessageToSession } from '@im/shared-im-core';
import type { ChatSession } from '@im/shared-types';
import { createSessionFromMessage, resolveMessageSessionId } from '@/utils/normalizers';
import { APP_CONFIG, WS_CONFIG } from '@/constants/config';
import { authService } from '@/services/auth/authService';
import { debugTelemetry } from '@/services/debug/debugTelemetry';
import { displayMessageNotification } from '@/services/notification/notificationService';
import { appLifecycle } from '@/services/platform/appLifecycle';
import { networkStatus } from '@/services/platform/networkStatus';
import { normalizeMessage } from '@/utils/normalizers';
import { logger } from '@/utils/logger';
import { useAuthStore } from './authStore';
import { useChatStore } from './chatStore';
import { useContactStore } from './contactStore';
import { useMessageStore } from './messageStore';
import { useSessionStore } from './sessionStore';

interface WebsocketState {
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  onlineUsers: Record<string, boolean>;
  connect: () => Promise<void>;
  disconnect: () => void;
  dispatchPayload: (payload: Record<string, unknown>) => Promise<void>;
  isUserOnline: (userId: string) => boolean;
}

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualDisconnect = false;
let incomingTail = Promise.resolve();
let lifecycleBound = false;
let lastWebsocketEventAt = 0;

const recordWebsocketError = (message: string, detail?: unknown) => {
  lastWebsocketEventAt = Date.now();
  debugTelemetry.recordWsError({
    message: detail instanceof Error ? `${message}: ${detail.message}` : message,
    url: APP_CONFIG.WS_BASE_URL,
  });
};

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(createHeartbeatPayload());
    }
  }, WS_CONFIG.heartbeatIntervalMs);
};

const bindResumeHooks = () => {
  if (lifecycleBound) {
    return;
  }
  lifecycleBound = true;
  const resume = () => {
    void useChatStore.getState().retryPending();
    void useWebsocketStore.getState().connect();
  };
  appLifecycle.onForeground(resume);
  networkStatus.onOnline(resume);
};

export const useWebsocketStore = create<WebsocketState>((set, get) => ({
  connected: false,
  connecting: false,
  reconnectAttempts: 0,
  onlineUsers: {},

  async connect() {
    bindResumeHooks();
    const userId = useAuthStore.getState().currentUser?.id;
    if (!userId || get().connected || get().connecting) {
      return;
    }
    manualDisconnect = false;
    set({ connecting: true });
    try {
      const ticket = (await authService.issueWsTicket()).data.ticket;
      if (!ticket) {
        throw new Error('WebSocket ticket unavailable');
      }
      socket = new WebSocket(createTicketedWebSocketUrl(APP_CONFIG.WS_BASE_URL, userId, ticket));
      socket.onopen = () => {
        lastWebsocketEventAt = Date.now();
        set({ connected: true, connecting: false, reconnectAttempts: 0 });
        startHeartbeat();
      };
      socket.onmessage = (event) => {
        const parsed = parseWebSocketPayload(String(event.data));
        const payload = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
        const type = String(payload.type || '');
        const data = payload.data as Record<string, unknown> | undefined;
        const innerType = data ? String(data.messageType || data.type || '') : '';
        if (shouldProcessSequentially(type, innerType)) {
          incomingTail = incomingTail.then(() => get().dispatchPayload(payload));
        } else {
          void get().dispatchPayload(payload);
        }
      };
      socket.onerror = (error) => {
        logger.warn('websocket', 'connection error', error);
        recordWebsocketError('connection error', error);
        set({ connected: false, connecting: false });
      };
      socket.onclose = (event) => {
        socket = null;
        stopHeartbeat();
        set({ connected: false, connecting: false });
        if (!manualDisconnect && event.reason !== DUPLICATE_CONNECTION_REASON && event.code !== 1000) {
          recordWebsocketError(`closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}`);
        }
        if (!manualDisconnect && event.reason !== DUPLICATE_CONNECTION_REASON) {
          const attempts = get().reconnectAttempts + 1;
          if (attempts <= WS_CONFIG.reconnectMaxAttempts) {
            set({ reconnectAttempts: attempts });
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              void get().connect();
            }, createReconnectDelay(attempts, WS_CONFIG.reconnectBaseDelayMs));
          }
        }
      };
    } catch (error) {
      logger.warn('websocket', 'connect failed', error);
      recordWebsocketError('connect failed', error);
      set({ connecting: false });
    }
  },

  disconnect() {
    manualDisconnect = true;
    stopHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close(1000, 'manual_disconnect');
    socket = null;
    set({ connected: false, connecting: false, reconnectAttempts: 0 });
  },

  async dispatchPayload(payload) {
    const type = String(payload.type || '');
    const data = payload.data;
    if (type === WS_MESSAGE_TYPE.MESSAGE || type === WS_MESSAGE_TYPE.MESSAGE_STATUS_CHANGED) {
      const currentUserId = useAuthStore.getState().currentUser?.id || '';
      const message = normalizeMessage(data);
      const sessionId = resolveMessageSessionId(message, currentUserId);
      const routedMessage = { ...message, conversationId: sessionId || message.conversationId };
      useMessageStore.getState().addMessage(routedMessage, routedMessage.conversationId);
      const currentSessionId = useSessionStore.getState().currentSession?.id;
      const isCurrent = Boolean(routedMessage.conversationId && currentSessionId === routedMessage.conversationId);
      const isSelf = routedMessage.senderId === currentUserId;
      const sessionStore = useSessionStore.getState();
      const existingSession = sessionStore.sessions.find((item) => item.id === routedMessage.conversationId);
      const messageSession = createSessionFromMessage(routedMessage, currentUserId);
      const baseSession: ChatSession | null = existingSession || messageSession;
      if (baseSession) {
        const shouldIncrement = type === WS_MESSAGE_TYPE.MESSAGE && !isCurrent && !isSelf;
        const applied = applyMessageToSession(baseSession, routedMessage, { incrementUnread: shouldIncrement });
        const merged: ChatSession = {
          ...baseSession,
          lastMessage: applied.lastMessage,
          lastMessageTime: applied.lastMessageTime,
          lastActiveTime: applied.lastActiveTime,
          unreadCount: applied.unreadIncrement
            ? (existingSession?.unreadCount || 0) + 1
            : existingSession?.unreadCount || baseSession.unreadCount,
        };
        sessionStore.upsertSession(merged);
      }
      if (type === WS_MESSAGE_TYPE.MESSAGE && !isCurrent && !isSelf && !baseSession?.isMuted) {
        await displayMessageNotification(routedMessage);
      }
      return;
    }
    if (type === WS_MESSAGE_TYPE.ONLINE_STATUS && data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const userId = String(record.userId || '');
      if (userId) {
        set({ onlineUsers: { ...get().onlineUsers, [userId]: String(record.status) === 'ONLINE' } });
      }
      return;
    }
    if (type === WS_MESSAGE_TYPE.READ_RECEIPT) {
      useMessageStore.getState().applyReadReceipt(data);
      await useChatStore.getState().refreshSessions().catch(() => undefined);
      return;
    }
    if (type === WS_MESSAGE_TYPE.FRIEND_REQUEST || type === WS_MESSAGE_TYPE.FRIEND_ACCEPTED) {
      await Promise.allSettled([
        useContactStore.getState().loadFriendRequests(),
        useContactStore.getState().loadFriends(),
        useChatStore.getState().refreshSessions(),
      ]);
      return;
    }
    if (type === WS_MESSAGE_TYPE.E2EE_NEGOTIATION) {
      logger.info('websocket', 'E2EE negotiation ignored on mobile because E2EE is deferred');
    }
  },

  isUserOnline(userId) {
    return Boolean(get().onlineUsers[userId]);
  },
}));

export const getWebsocketDiagnostics = () => {
  const state = useWebsocketStore.getState();
  const status = state.connected ? 'connected' : state.connecting ? 'connecting' : 'disconnected';
  return {
    status,
    reconnectAttempts: state.reconnectAttempts,
    lastEventAt: lastWebsocketEventAt,
  };
};
