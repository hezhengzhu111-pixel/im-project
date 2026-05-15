import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage, ElNotification } from "element-plus";
import { STORAGE_CONFIG, WS_CONFIG } from "@/config";
import { authService, userService } from "@/services";
import { normalizeMessage } from "@/normalizers/message";
import { buildSessionId } from "@/normalizers/chat";
import { resolveMessageSessionId } from "@im/shared-im-core";
import {
  createTicketedWebSocketUrl,
  createHeartbeatPayload,
  parseWebSocketPayload,
  shouldQueueIncomingPayload,
  createReconnectDelay,
  shouldScheduleReconnect,
  DUPLICATE_CONNECTION_REASON,
  resolveWebSocketConnectionStatus,
  normalizePresenceUserId,
  isOnlineStatusValue,
  applyPresenceToSet,
  DEFAULT_DEDUP_TTL_MS,
  DEFAULT_DEDUP_MAX_SIZE,
  getMessageDedupKey,
  shouldDropRecentMessage,
  rememberRecentMessage,
  cleanupRecentMessages,
  classifyContactRefreshFromWsType,
  classifyContactRefreshFromSystemContent,
  classifyWsEvent,
  getIncomingPayloadType,
} from "@im/shared-ws-core";
import type { WsEventKind } from "@im/shared-ws-core";
import type { Message, OnlineStatus, WebSocketMessage } from "@/types";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { logger } from "@/utils/logger";
import type { E2eeNegotiationEvent } from "@/features/e2ee/negotiation-events";

type TimerHandle = ReturnType<typeof setInterval>;

const normalizeE2eeNegotiationEvent = (
  raw: Record<string, unknown>,
): E2eeNegotiationEvent | null => {
  const sessionId = String(raw.sessionId || raw.session_id || "");
  if (!sessionId) return null;
  const action = String(raw.action || "");
  if (!["request", "accepted", "rejected", "disabled"].includes(action)) return null;
  return {
    action: action as E2eeNegotiationEvent["action"],
    sessionId,
    requesterId: String(raw.requesterId || raw.requester_id || ""),
    requesterName: String(raw.requesterName || raw.requester_name || ""),
    targetUserId: String(raw.targetUserId || raw.target_user_id || ""),
    requestPayloadJson: raw.requestPayloadJson
      ? String(raw.requestPayloadJson)
      : raw.request_payload_json
        ? String(raw.request_payload_json)
        : undefined,
  };
};

const FRIEND_REFRESH_DEBOUNCE_MS = 1500;

export const useWebSocketStore = defineStore("websocket", () => {
  const socket = ref<WebSocket | null>(null);
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const onlineUsers = ref<Set<string>>(new Set());
  const reconnectAttempts = ref(0);
  const heartbeatTimer = ref<TimerHandle | null>(null);
  const reconnectTimer = ref<TimerHandle | null>(null);
  const manualDisconnect = ref(false);
  const incomingProcessing = ref<Promise<void>>(Promise.resolve());
  const recentMessageIds = ref<Map<string, number>>(new Map());
  const pendingContactRefresh = ref<{
    loadFriendRequests: boolean;
    loadFriends: boolean;
    loadSessions: boolean;
    notificationTitle: string;
    notificationMessage: string;
    notificationType: "info" | "success";
  }>({
    loadFriendRequests: false,
    loadFriends: false,
    loadSessions: false,
    notificationTitle: "",
    notificationMessage: "",
    notificationType: "info",
  });

  const createAsyncDebounce = <TArgs extends unknown[]>(
    handler: (...args: TArgs) => Promise<void>,
    waitMs: number,
  ) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latestArgs: TArgs | null = null;
    let pendingResolvers: Array<{
      resolve: () => void;
      reject: (error: unknown) => void;
    }> = [];

    return (...args: TArgs): Promise<void> => {
      latestArgs = args;
      return new Promise<void>((resolve, reject) => {
        pendingResolvers.push({ resolve, reject });
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          timer = null;
          const argsToUse = latestArgs as TArgs;
          latestArgs = null;
          const resolvers = pendingResolvers;
          pendingResolvers = [];
          Promise.resolve()
            .then(() => handler(...argsToUse))
            .then(() => {
              resolvers.forEach((entry) => entry.resolve());
            })
            .catch((error) => {
              resolvers.forEach((entry) => entry.reject(error));
            });
        }, waitMs);
      });
    };
  };

  const RECENT_MESSAGE_TTL_MS = DEFAULT_DEDUP_TTL_MS;
  const RECENT_MESSAGE_MAX_SIZE = DEFAULT_DEDUP_MAX_SIZE;

  const cleanupRecentMessageIds = (now: number) => {
    recentMessageIds.value = cleanupRecentMessages(
      recentMessageIds.value,
      now,
      RECENT_MESSAGE_TTL_MS,
    );
  };

  const hasMessageInLocalState = (
    chatStore: ReturnType<typeof useChatStore>,
    message: Message,
    currentUserId: string,
  ): boolean => {
    const messageId = String(message.id || "");
    if (!messageId) {
      return false;
    }
    const allMessages = chatStore.messages as Map<string, Message[]>;
    if (!(allMessages instanceof Map)) {
      return false;
    }
    const sessionId = resolveMessageSessionId(message, currentUserId);
    if (sessionId) {
      return (allMessages.get(sessionId) || []).some(
        (item) => String(item.id) === messageId,
      );
    }
    for (const list of allMessages.values()) {
      if (list.some((item) => String(item.id) === messageId)) {
        return true;
      }
    }
    return false;
  };

  const debouncedRefreshContactData = createAsyncDebounce(async () => {
    const chatStore = useChatStore();
    const pending = pendingContactRefresh.value;

    pendingContactRefresh.value = {
      loadFriendRequests: false,
      loadFriends: false,
      loadSessions: false,
      notificationTitle: "",
      notificationMessage: "",
      notificationType: "info",
    };

    const tasks: Promise<unknown>[] = [];
    if (pending.loadFriendRequests) {
      tasks.push(chatStore.loadFriendRequests());
    }
    if (pending.loadFriends) {
      tasks.push(chatStore.loadFriends());
    }
    if (pending.loadSessions) {
      tasks.push(
        chatStore.refreshSessionSkeletons({
          force: true,
          refreshPresence: false,
        }),
      );
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    if (pending.notificationMessage) {
      ElNotification({
        title: pending.notificationTitle || "System notification",
        message: pending.notificationMessage,
        type: pending.notificationType,
        duration: 3000,
      });
    }
  }, FRIEND_REFRESH_DEBOUNCE_MS);

  const queueContactRefresh = async (options: {
    loadFriendRequests?: boolean;
    loadFriends?: boolean;
    loadSessions?: boolean;
    notificationTitle?: string;
    notificationMessage?: string;
    notificationType?: "info" | "success";
  }) => {
    pendingContactRefresh.value = {
      loadFriendRequests:
        pendingContactRefresh.value.loadFriendRequests ||
        Boolean(options.loadFriendRequests),
      loadFriends:
        pendingContactRefresh.value.loadFriends || Boolean(options.loadFriends),
      loadSessions:
        pendingContactRefresh.value.loadSessions ||
        Boolean(options.loadSessions),
      notificationTitle:
        options.notificationTitle ||
        pendingContactRefresh.value.notificationTitle,
      notificationMessage:
        options.notificationMessage ||
        pendingContactRefresh.value.notificationMessage,
      notificationType:
        options.notificationType ||
        pendingContactRefresh.value.notificationType,
    };
    await debouncedRefreshContactData();
  };

  const connectionStatus = computed(() => {
    return resolveWebSocketConnectionStatus({
      connected: isConnected.value,
      connecting: isConnecting.value,
    });
  });

  const setUserOnline = (userId: unknown, isOnline: boolean) => {
    const normalizedUserId = normalizePresenceUserId(userId);
    if (!normalizedUserId) {
      return;
    }
    const wasOnline = onlineUsers.value.has(normalizedUserId);
    const next = applyPresenceToSet(onlineUsers.value, normalizedUserId, isOnline);
    onlineUsers.value = next;

    if (wasOnline !== isOnline) {
      window.dispatchEvent(
        new CustomEvent("onlineStatusChanged", {
          detail: { userId: normalizedUserId, isOnline },
        }),
      );
    }
  };

  const applyOnlineStatusMap = (statusMap: Record<string, boolean>) => {
    Object.entries(statusMap || {}).forEach(([userId, isOnline]) => {
      setUserOnline(userId, Boolean(isOnline));
    });
  };

  const collectKnownPresenceUserIds = () => {
    const chatStore = useChatStore();
    const ids = new Set<string>();

    (chatStore.friends || []).forEach((friend) => {
      const friendId = normalizePresenceUserId(friend.friendId);
      if (friendId) {
        ids.add(friendId);
      }
    });

    (chatStore.sessions || []).forEach((session) => {
      if (session.type !== "private") {
        return;
      }
      const targetId = normalizePresenceUserId(session.targetId);
      if (targetId) {
        ids.add(targetId);
      }
    });

    const currentSession = chatStore.currentSession;
    if (currentSession?.type === "private") {
      const targetId = normalizePresenceUserId(currentSession.targetId);
      if (targetId) {
        ids.add(targetId);
      }
    }

    return Array.from(ids);
  };

  const requestWsTicket = async (): Promise<string> => {
    const response = await authService.issueWsTicket();
    const ticket = response?.data?.ticket;
    if (!ticket) {
      throw new Error(response?.message || "Failed to issue websocket ticket");
    }
    return ticket;
  };

  const connect = async (userId: string) => {
    if (!userId || isConnected.value || isConnecting.value) {
      return;
    }

    try {
      manualDisconnect.value = false;
      if (reconnectTimer.value) {
        clearTimeout(reconnectTimer.value);
        reconnectTimer.value = null;
      }

      isConnecting.value = true;
      const ticket = await requestWsTicket();
      const wsBaseUrl = import.meta.env.DEV ? "" : WS_CONFIG.BASE_URL;
      socket.value = new WebSocket(createTicketedWebSocketUrl(wsBaseUrl, userId, ticket));

      socket.value.onopen = () => {
        isConnected.value = true;
        isConnecting.value = false;
        stopReconnect();
        saveConnectionCache(userId);
        startHeartbeat();
        void useChatStore()
          .scheduleRealtimeResume({
            forceSessionRefresh: false,
          })
          .catch((error) => {
            logger.warn("failed to resume realtime sync", error);
          });
      };

      socket.value.onmessage = (event) => {
        const parsed = parseWebSocketPayload(String(event.data));
        if (!parsed || typeof parsed !== "object") {
          logger.warn("failed to parse websocket payload");
          return;
        }
        const data = parsed as WebSocketMessage;

        if (shouldQueueIncomingPayload(parsed as Record<string, unknown>)) {
          // W12: 普通聊天消息保留串行处理，确保时序敏感消息仍按顺序落库与渲染。
          incomingProcessing.value = incomingProcessing.value.then(
            () => handleMessage(data),
            () => handleMessage(data),
          );
          void incomingProcessing.value.catch((error) => {
            logger.error("failed to handle websocket message", error);
          });
          return;
        }
        // W12: 系统消息、心跳和在线状态消息跳过串行队列，避免无关消息被长链路阻塞。
        void handleMessage(data).catch((error) => {
          logger.error("failed to handle websocket message", error);
        });
      };

      socket.value.onclose = (event) => {
        socket.value = null;
        isConnected.value = false;
        isConnecting.value = false;
        stopHeartbeat();
        clearConnectionCache();
        if (
          shouldScheduleReconnect({
            manualDisconnect: manualDisconnect.value,
            closeCode: event.code,
            closeReason: event.reason,
            duplicateConnectionReason: DUPLICATE_CONNECTION_REASON,
            reconnectAttempts: reconnectAttempts.value,
            maxReconnectAttempts: WS_CONFIG.RECONNECT_ATTEMPTS,
          })
        ) {
          scheduleReconnect(userId);
        } else if (
          !manualDisconnect.value &&
          reconnectAttempts.value >= WS_CONFIG.RECONNECT_ATTEMPTS
        ) {
          ElMessage.error("WebSocket reconnect limit reached");
        }
      };

      socket.value.onerror = (error) => {
        logger.warn("websocket connection error", error);
        isConnected.value = false;
        isConnecting.value = false;
      };
    } catch (error) {
      logger.warn("failed to create websocket connection", error);
      isConnecting.value = false;
      if (!manualDisconnect.value) {
        scheduleReconnect(userId);
      }
      ElMessage.error("WebSocket connection failed");
    }
  };

  const disconnect = () => {
    manualDisconnect.value = true;
    stopHeartbeat();
    stopReconnect();
    clearConnectionCache();

    if (socket.value) {
      socket.value.close(1000, "manual_disconnect");
      socket.value = null;
    }

    isConnected.value = false;
    isConnecting.value = false;
  };

  const handleMessage = async (data: WebSocketMessage) => {
    const chatStore = useChatStore();
    const eventKind: WsEventKind = classifyWsEvent(data as unknown as Record<string, unknown>);

    if (eventKind === "message") {
      if (!data.data) {
        return;
      }
      const rawMessage = data.data as Record<string, unknown>;
      const { innerType } = getIncomingPayloadType(data as unknown as Record<string, unknown>);
      const isSystemMessage = innerType.toUpperCase() === "SYSTEM";

      if (isSystemMessage) {
        const content = String(rawMessage.content || "");
        const refreshAction = classifyContactRefreshFromSystemContent(content);

        if (refreshAction) {
          await queueContactRefresh(refreshAction);
        }
        return;
      }

      const normalizedMessage = normalizeMessage(rawMessage);
      const currentUserId = String(useUserStore().userId || "");
      const dedupKey = getMessageDedupKey(rawMessage);
      if (dedupKey && !dedupKey.startsWith("local_")) {
        const now = Date.now();
        if (
          shouldDropRecentMessage(
            recentMessageIds.value,
            dedupKey,
            now,
            RECENT_MESSAGE_TTL_MS,
          )
        ) {
          return;
        }
        // W18: 除内存去重外，再检查本地消息状态，避免服务端重试导致重复渲染和重复提示。
        if (
          hasMessageInLocalState(chatStore, normalizedMessage, currentUserId)
        ) {
          return;
        }
        recentMessageIds.value = rememberRecentMessage(
          recentMessageIds.value,
          dedupKey,
          now,
          RECENT_MESSAGE_MAX_SIZE,
          RECENT_MESSAGE_TTL_MS,
        );
      }

      // E2EE decrypt intercept
      const isEncrypted = normalizedMessage.encrypted === true || normalizedMessage.encrypted === 1;

      if (isEncrypted && normalizedMessage.messageType !== "SYSTEM") {
        const senderId = String(normalizedMessage.senderId || "");
        if (senderId !== currentUserId) {
        const sessionId = buildSessionId("private", currentUserId, senderId);
        const headerRaw = normalizedMessage.e2eeHeader;
        const header = typeof headerRaw === "string" ? JSON.parse(headerRaw) : headerRaw;
        const senderIdentityKey = normalizedMessage.e2eeSenderIdentityKey;
        const ephemeralKey = normalizedMessage.e2eeEphemeralKey;

        try {
          const { e2eeManager } = await import("@/features/e2ee/manager/e2ee-manager");

          if (header && normalizedMessage.content) {
            const decrypted = await e2eeManager.decryptMessage(
              sessionId, senderId, header, normalizedMessage.content,
              senderIdentityKey, ephemeralKey,
            );
            if (decrypted) {
              normalizedMessage.content = decrypted;
              normalizedMessage.encrypted = false;
            }
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          const isNoRatchetState = errMsg.includes("No ratchet state") || errMsg.includes("negotiation has not been accepted");

          if (isNoRatchetState) {
            const { getLocalSessionStatus, setLocalSessionStatus } = await import("@/features/e2ee/manager/negotiation");
            const status = getLocalSessionStatus(sessionId);

            if (status === "encrypted") {
              console.error(`[E2EE] Status is 'encrypted' but no ratchet state for session=${sessionId}. Resetting to plaintext.`);
              setLocalSessionStatus(sessionId, "plaintext");
              ElNotification({ title: "加密状态异常", message: "端到端加密状态已重置，请重新发起加密协商。", type: "warning", duration: 8000 });
            } else if (status === "negotiating") {
              console.warn(`[E2EE] Negotiation in progress for session=${sessionId}, message will be decrypted after completion.`);
              ElMessage({ message: "加密协商进行中，消息将在协商完成后解密。", type: "info", duration: 3000 });
            } else {
              console.log(`[E2EE] No ratchet state for session=${sessionId} (status=${status}), auto-triggering negotiation.`);
              try {
                const { initiateNegotiation } = await import("@/features/e2ee/manager/negotiation");
                const { cachePendingMessage } = await import("@/features/e2ee/manager/pending-messages");
                cachePendingMessage({
                  sessionId,
                  peerId: senderId,
                  content: normalizedMessage.content,
                  header,
                  senderIdentityKey,
                  ephemeralPublicKey: ephemeralKey,
                  messageRef: normalizedMessage as unknown as { content: string; encrypted: boolean | number },
                });
                initiateNegotiation(sessionId, senderId).then((ok) => {
                  if (ok) {
                    ElNotification({ title: "端到端加密请求", message: "收到加密消息但尚未建立加密通道，已自动发起协商请求。", type: "info", duration: 5000 });
                  }
                });
              } catch {
                // Auto-negotiation failed — message stays encrypted
              }
            }
          } else {
            console.error("[E2EE] Decrypt failed:", e);
          }
          (normalizedMessage as unknown as Record<string, unknown>).encrypted = true;
        }
        } else {
          // Own message synced via WebSocket — preserve local plaintext
          const sessionId = normalizedMessage.receiverId
            ? buildSessionId("private", currentUserId, normalizedMessage.receiverId)
            : null;
          if (sessionId) {
            const existingList = (chatStore.messages as Map<string, Message[]>).get(sessionId) || [];
            const existing = existingList.find(
              (m) => m.clientMessageId && m.clientMessageId === normalizedMessage.clientMessageId,
            );
            if (existing && existing.content) {
              normalizedMessage.content = existing.content;
            }
          }
          (normalizedMessage as unknown as Record<string, unknown>).encrypted = true;
        }
      }

      const isSelfMessage =
        String(normalizedMessage.senderId) === currentUserId;
      await chatStore.addMessage(normalizedMessage);
      if (!isSelfMessage) {
        showMessageNotification(normalizedMessage);
      }
      return;
    }

    if (eventKind === "messageStatusChanged") {
      if (!data.data) {
        return;
      }
      const normalizedMessage = normalizeMessage(
        data.data as Record<string, unknown>,
      );
      await chatStore.addMessage(normalizedMessage);
      return;
    }

    // W14: presence policy — online status dispatched to platform-side state
    if (eventKind === "onlineStatus") {
      if (data.data) {
        updateOnlineStatus(data.data as OnlineStatus);
      }
      return;
    }

    // W15: read receipt delegated to chatStore
    if (eventKind === "readReceipt") {
      if (data.data) {
        await chatStore.applyReadReceipt(data.data);
      }
      return;
    }

    // W16: friend request / friend accepted → contact refresh
    if (eventKind === "friendRequest" || eventKind === "friendAccepted") {
      const refreshAction = classifyContactRefreshFromWsType(data.type);
      if (refreshAction) {
        await queueContactRefresh(refreshAction);
      }
      return;
    }

    // W17: system command → contact refresh or fallback info
    if (eventKind === "system") {
      if (!data.data) {
        return;
      }
      const systemMessage = data.data as Record<string, unknown>;
      const content = String(systemMessage.content || "");
      const refreshAction = classifyContactRefreshFromSystemContent(content);

      if (refreshAction) {
        await queueContactRefresh(refreshAction);
        return;
      }
      if (systemMessage.message) {
        ElMessage.info(String(systemMessage.message));
      }
      return;
    }

    // W20: E2EE negotiation — dispatch only, no crypto logic change
    if (eventKind === "e2eeNegotiation") {
      if (!data.data) return;
      const normalized = normalizeE2eeNegotiationEvent(
        data.data as Record<string, unknown>,
      );
      if (!normalized) return;
      try {
        const { emitE2eeNegotiation } = await import("@/features/e2ee/negotiation-events");
        emitE2eeNegotiation(normalized);
      } catch (e) {
        console.error("[E2EE] Failed to dispatch negotiation event:", e);
      }
      return;
    }

    // heartbeat / unknown — no-op
  };

  const showMessageNotification = (message: Message) => {
    if (!document.hidden) {
      return;
    }
    ElNotification({
      title: message.senderName || "New message",
      message: message.content,
      type: "info",
      duration: 3000,
    });
  };

  const updateOnlineStatus = (status: OnlineStatus) => {
    setUserOnline(status.userId, isOnlineStatusValue(status.status));
  };

  const isUserOnline = (userId: string): boolean => {
    const normalizedUserId = normalizePresenceUserId(userId);
    return Boolean(normalizedUserId && onlineUsers.value.has(normalizedUserId));
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeatTimer.value = setInterval(() => {
      if (!isConnected.value || !socket.value) {
        return;
      }
      try {
        socket.value.send(createHeartbeatPayload(Date.now()));
      } catch (error) {
        logger.warn("failed to send heartbeat", error);
      }
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value);
      heartbeatTimer.value = null;
    }
  };

  const scheduleReconnect = (userId: string) => {
    if (reconnectTimer.value) {
      return;
    }
    // Max-attempts guard is handled by shouldScheduleReconnect in onclose.
    reconnectAttempts.value += 1;
    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      void connect(userId);
    }, createReconnectDelay(reconnectAttempts.value, WS_CONFIG.RECONNECT_INTERVAL));
  };

  const stopReconnect = () => {
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
    reconnectAttempts.value = 0;
  };

  const saveConnectionCache = (userId: string) => {
    localStorage.setItem(
      STORAGE_CONFIG.WS_CACHE_KEY,
      JSON.stringify({
        userId,
        timestamp: Date.now(),
        isActive: true,
      }),
    );
  };

  const loadConnectionCache = () => {
    try {
      const cached = localStorage.getItem(STORAGE_CONFIG.WS_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn("failed to load websocket cache", error);
      return null;
    }
  };

  const clearConnectionCache = () => {
    localStorage.removeItem(STORAGE_CONFIG.WS_CACHE_KEY);
  };

  const heartbeat = async (userIds: string[]) => {
    const normalizedUserIds = Array.from(
      new Set(userIds.map(normalizePresenceUserId).filter(Boolean)),
    );
    if (normalizedUserIds.length === 0) {
      return {};
    }
    try {
      const response = await userService.checkOnlineStatus(normalizedUserIds);
      if (response.code === 200 && response.data) {
        applyOnlineStatusMap(response.data);
        return response.data;
      }
    } catch (error) {
      logger.warn("failed to query heartbeat", error);
    }
    return {};
  };

  const refreshOnlineStatus = heartbeat;

  const refreshKnownOnlineStatus = async () => {
    const userIds = collectKnownPresenceUserIds();
    if (userIds.length === 0) {
      return {};
    }
    return heartbeat(userIds);
  };

  const setupLifecycleListeners = (
    getUserId: () => string | null,
  ): (() => void) => {
    const cleanupFns: (() => void)[] = [];

    const tryReconnect = () => {
      const uid = getUserId();
      if (uid && !isConnected.value && !isConnecting.value) {
        void connect(uid);
      }
    };

    import("@/services/platform/app-lifecycle.service").then(({ appLifecycleService }) => {
      cleanupFns.push(appLifecycleService.onForeground(tryReconnect));
    });
    import("@/services/platform/network-status.service").then(({ networkStatusService }) => {
      cleanupFns.push(networkStatusService.onOnline(tryReconnect));
    });

    return () => cleanupFns.forEach((fn) => fn());
  };

  return {
    socket,
    isConnected,
    isConnecting,
    onlineUsers,
    reconnectAttempts,
    connectionStatus,
    connect,
    disconnect,
    isUserOnline,
    heartbeat,
    refreshOnlineStatus,
    refreshKnownOnlineStatus,
    loadConnectionCache,
    clearConnectionCache,
    setupLifecycleListeners,
  };
});
