import { create } from 'zustand';
import {
  DUPLICATE_CONNECTION_REASON,
  DEFAULT_DEDUP_TTL_MS,
  DEFAULT_DEDUP_MAX_SIZE,
  applyPresenceToRecord,
  classifyContactRefreshFromSystemContent,
  classifyContactRefreshFromWsType,
  classifyWsEvent,
  createHeartbeatPayload,
  createReconnectDelay,
  createWebSocketDiagnosticsSnapshot,
  createTicketedWebSocketUrl,
  getMessageDedupKey,
  normalizePresenceUserId,
  parseWebSocketPayload,
  rememberRecentMessage,
  shouldDropRecentMessage,
  shouldQueueIncomingPayload,
  shouldScheduleReconnect,
} from '@im/shared-ws-core';
import { WS_MESSAGE_TYPE } from '@im/shared-api-contract';
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
import { processE2eeMessage } from '@/e2ee/messageProcessor';
import { ensureLocalE2eeDeviceRegistered } from '@/e2ee/manager/localDevice';
import {
  handleNegotiationAccepted,
  handleNegotiationDisabled,
  handleNegotiationRejected,
  normalizeNegotiationEvent,
  recordPendingNegotiationRequest,
  syncPendingNegotiations,
} from '@/e2ee/manager/negotiation';
import {
  cachePendingEncryptedMessage,
  retryDecryptPendingMessages,
  retryDecryptVisibleEncryptedMessages,
} from '@/e2ee/store/pendingDecryptStore';
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

// W18: WebSocket-layer duplicate message suppression cache.
// Runtime-only Map (key → first-seen timestamp). Not persisted.
let recentMessageIds: Map<string, number> = new Map();
const DEDUP_TTL_MS = DEFAULT_DEDUP_TTL_MS;
const DEDUP_MAX_SIZE = DEFAULT_DEDUP_MAX_SIZE;

/** W18: Reset dedup cache. Exposed for testing only. */
export const resetRecentMessageIds = () => { recentMessageIds = new Map(); };

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
      socket.send(createHeartbeatPayload(Date.now()));
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
        void ensureLocalE2eeDeviceRegistered().catch(() => undefined);
        void syncPendingNegotiations(useSessionStore.getState().currentSession?.id).catch(() => undefined);
        const currentSessionId = useSessionStore.getState().currentSession?.id;
        if (currentSessionId) {
          void retryDecryptPendingMessages(currentSessionId).catch(() => 0);
          void retryDecryptVisibleEncryptedMessages(currentSessionId).catch(() => 0);
        }
      };
      socket.onmessage = (event) => {
        const parsed = parseWebSocketPayload(String(event.data));
        const payload = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
        if (shouldQueueIncomingPayload(payload)) {
          incomingTail = incomingTail.then(
            () => get().dispatchPayload(payload),
            () => get().dispatchPayload(payload),
          );
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
        const shouldReconnect = shouldScheduleReconnect({
          manualDisconnect,
          closeCode: event.code,
          closeReason: event.reason,
          duplicateConnectionReason: DUPLICATE_CONNECTION_REASON,
          reconnectAttempts: get().reconnectAttempts,
          maxReconnectAttempts: WS_CONFIG.reconnectMaxAttempts,
        });
        if (!shouldReconnect) {
          return;
        }
        if (event.code !== 1000) {
          recordWebsocketError(`closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}`);
        }
        const attempts = get().reconnectAttempts + 1;
        set({ reconnectAttempts: attempts });
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void get().connect();
        }, createReconnectDelay(attempts, WS_CONFIG.reconnectBaseDelayMs));
      };
    } catch (error) {
      logger.warn('websocket', 'connect failed', error);
      recordWebsocketError('connect failed', error);
      set({ connecting: false });
    }
  },

  /**
   * 断开 WebSocket 并重置连接相关内存状态。
   * 会清：socket 实例、心跳/重连定时器、连接状态标志、onlineUsers、recentMessageIds。
   * 不会清：持久层数据、auth 状态、消息缓存。
   */
  disconnect() {
    manualDisconnect = true;
    stopHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close(1000, 'manual_disconnect');
    socket = null;
    recentMessageIds = new Map();
    set({ connected: false, connecting: false, reconnectAttempts: 0, onlineUsers: {} });
  },

  async dispatchPayload(payload) {
    // W13/W23/W24: Classify via shared pure function first, then route.
    const kind = classifyWsEvent(payload);
    const data = payload.data;

    if (kind === 'message' || kind === 'messageStatusChanged') {
      const currentUserId = useAuthStore.getState().currentUser?.id || '';
      const message = normalizeMessage(data);

      // W18: Duplicate message suppression for MESSAGE only (not STATUS_CHANGED).
      // Uses shared-ws-core pure strategy; cache is module-level runtime Map.
      if (kind === 'message') {
        const dedupKey = getMessageDedupKey(message as unknown as Record<string, unknown>);
        const now = Date.now();
        if (dedupKey && !dedupKey.startsWith('local_')) {
          if (shouldDropRecentMessage(recentMessageIds, dedupKey, now, DEDUP_TTL_MS)) {
            return;
          }
          recentMessageIds = rememberRecentMessage(recentMessageIds, dedupKey, now, DEDUP_MAX_SIZE, DEDUP_TTL_MS);
        }
      }

      const sessionId = resolveMessageSessionId(message, currentUserId);
      const routedMessage = { ...message, conversationId: sessionId || message.conversationId };
      const processed = await processE2eeMessage(routedMessage, {
        sessionId: routedMessage.conversationId,
        currentUserId,
        findOptimisticMessage: (clientMessageId) =>
          (useMessageStore.getState().messagesBySession[routedMessage.conversationId || ''] || [])
            .find((item) => item.clientMessageId === clientMessageId),
      });
      if (processed.decryptStatus === 'pending') {
        cachePendingEncryptedMessage(routedMessage.conversationId || '', processed.rawMessage);
      }
      const safeRoutedMessage = processed.displayMessage;
      useMessageStore.getState().addMessage(safeRoutedMessage, safeRoutedMessage.conversationId);
      const currentSessionId = useSessionStore.getState().currentSession?.id;
      const isCurrent = Boolean(safeRoutedMessage.conversationId && currentSessionId === safeRoutedMessage.conversationId);
      const isSelf = safeRoutedMessage.senderId === currentUserId;
      const sessionStore = useSessionStore.getState();
      const existingSession = sessionStore.sessions.find((item) => item.id === safeRoutedMessage.conversationId);
      const messageSession = createSessionFromMessage(safeRoutedMessage, currentUserId);
      const baseSession: ChatSession | null = existingSession || messageSession;
      if (baseSession) {
        const shouldIncrement = kind === 'message' && !isCurrent && !isSelf;
        const applied = applyMessageToSession(baseSession, safeRoutedMessage, { incrementUnread: shouldIncrement });
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
      if (kind === 'message' && !isCurrent && !isSelf && !baseSession?.isMuted) {
        await displayMessageNotification(safeRoutedMessage);
      }
      return;
    }
    // W14: Presence policy — apply update to Record.
    if (kind === 'onlineStatus' && data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      set({ onlineUsers: applyPresenceToRecord(get().onlineUsers, record.userId, record.status) });
      return;
    }
    // W15: Read receipt — apply + refresh sessions.
    if (kind === 'readReceipt') {
      useMessageStore.getState().applyReadReceipt(data);
      await useChatStore.getState().refreshSessions().catch(() => undefined);
      return;
    }
    // W16: Contact refresh classifier for friend events.
    if (kind === 'friendRequest' || kind === 'friendAccepted') {
      const wsType = kind === 'friendRequest'
        ? WS_MESSAGE_TYPE.FRIEND_REQUEST
        : WS_MESSAGE_TYPE.FRIEND_ACCEPTED;
      const refreshAction = classifyContactRefreshFromWsType(wsType);
      if (refreshAction) {
        const tasks: Promise<unknown>[] = [];
        if (refreshAction.loadFriendRequests) {
          tasks.push(useContactStore.getState().loadFriendRequests());
        }
        if (refreshAction.loadFriends) {
          tasks.push(useContactStore.getState().loadFriends());
        }
        if (refreshAction.loadSessions) {
          tasks.push(useChatStore.getState().refreshSessions());
        }
        await Promise.allSettled(tasks);
      }
      return;
    }
    // W17: SYSTEM command — classify contact refresh via shared parser.
    if (kind === 'system') {
      if (data && typeof data === 'object') {
        const systemData = data as Record<string, unknown>;
        const content = String(systemData.content || '');
        const refreshAction = classifyContactRefreshFromSystemContent(content);
        if (refreshAction) {
          const tasks: Promise<unknown>[] = [];
          if (refreshAction.loadFriendRequests) {
            tasks.push(useContactStore.getState().loadFriendRequests());
          }
          if (refreshAction.loadFriends) {
            tasks.push(useContactStore.getState().loadFriends());
          }
          if (refreshAction.loadSessions) {
            tasks.push(useChatStore.getState().refreshSessions());
          }
          await Promise.allSettled(tasks);
        }
      }
      return;
    }
    // W20: E2EE negotiation — deferred on mobile.
    // E3.3 / E5.3 / E11.3: only log action category, never requestPayloadJson or key material.
    // E20.1 / E32.5: no identityKey, ephemeralKey, or payload原文 in logs.
    if (kind === 'e2eeNegotiation') {
      const negotiationData = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      const event = normalizeNegotiationEvent(negotiationData);
      const action = (typeof negotiationData.action === 'string' ? negotiationData.action : 'unknown').toLowerCase();
      if (!event) {
        return;
      }
      if (action === 'request') {
        await recordPendingNegotiationRequest({ ...event, action });
      } else if (action === 'accepted') {
        await handleNegotiationAccepted(event.sessionId);
        await retryDecryptPendingMessages(event.sessionId).catch(() => 0);
        await retryDecryptVisibleEncryptedMessages(event.sessionId).catch(() => 0);
      } else if (action === 'rejected') {
        await handleNegotiationRejected(event.sessionId);
      } else if (action === 'disabled') {
        await handleNegotiationDisabled(event.sessionId);
      }
      logger.info('websocket', `E2EE negotiation event handled (action=${action})`, {
        sessionId: event.sessionId,
        action,
      });
    }
  },

  isUserOnline(userId) {
    const normalizedId = normalizePresenceUserId(userId);
    return Boolean(normalizedId && get().onlineUsers[normalizedId]);
  },
}));

export const getWebsocketDiagnostics = () => {
  const state = useWebsocketStore.getState();
  return createWebSocketDiagnosticsSnapshot({
    connected: state.connected,
    connecting: state.connecting,
    reconnectAttempts: state.reconnectAttempts,
    lastEventAt: lastWebsocketEventAt,
  });
};
