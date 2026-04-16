import {computed, ref} from "vue";
import {defineStore} from "pinia";
import {ElMessage, ElNotification} from "element-plus";
import {STORAGE_CONFIG, WS_CONFIG} from "@/config";
import {authService, userService} from "@/services";
import {normalizeMessage} from "@/normalizers/message";
import {buildSessionId} from "@/normalizers/chat";
import type {Message, OnlineStatus, WebSocketMessage} from "@/types";
import {useChatStore} from "@/stores/chat";
import {useUserStore} from "@/stores/user";
import {logger} from "@/utils/logger";

type TimerHandle = ReturnType<typeof setInterval>;

const DUPLICATE_CONNECTION_REASON = "duplicate_connection";
const FRIEND_REFRESH_DEBOUNCE_MS = 1500;

export const createTicketedWebSocketUrl = (
  userId: string,
  ticket?: string,
): string => {
  const isDev = import.meta.env.DEV;
  const wsBaseUrl = isDev ? "" : WS_CONFIG.BASE_URL;
  const baseUrl = `${wsBaseUrl}/websocket/${userId}`;
  if (!ticket) {
    return baseUrl;
  }
  return `${baseUrl}?ticket=${encodeURIComponent(ticket)}`;
};

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

  const cleanupRecentMessageIds = (now: number) => {
    if (recentMessageIds.value.size <= 2000) {
      return;
    }
    const cutoff = now - 300_000;
    recentMessageIds.value.forEach((timestamp, id) => {
      if (timestamp < cutoff) {
        recentMessageIds.value.delete(id);
      }
    });
  };

  const resolveMessageSessionId = (
    message: Message,
    currentUserId: string,
  ): string | null => {
    if (message.isGroupChat && message.groupId) {
      return buildSessionId("group", currentUserId, message.groupId);
    }
    if (message.senderId && message.receiverId) {
      const targetId =
        message.senderId === currentUserId ? message.receiverId : message.senderId;
      if (targetId) {
        return buildSessionId("private", currentUserId, targetId);
      }
    }
    return null;
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

  const shouldProcessSequentially = (message: WebSocketMessage): boolean => {
    if (message.type !== "MESSAGE" || !message.data) {
      return false;
    }
    const rawMessage = message.data as Record<string, unknown>;
    const normalizedMessageType = String(
      rawMessage.messageType || rawMessage.type || "",
    ).toUpperCase();
    return normalizedMessageType !== "SYSTEM";
  };

  const debouncedRefreshFriendRequests = createAsyncDebounce(
    async (messageText: string) => {
      const chatStore = useChatStore();
      // OPTIMIZE: 对连续系统通知做防抖，避免短时间内重复请求好友申请接口。
      await chatStore.loadFriendRequests();
      ElNotification({
        title: "Friend notification",
        message: messageText || "Received a new friend request",
        type: "info",
        duration: 3000,
      });
    },
    FRIEND_REFRESH_DEBOUNCE_MS,
  );

  const debouncedRefreshFriendList = createAsyncDebounce(
    async (messageText: string) => {
      const chatStore = useChatStore();
      // OPTIMIZE: 对连续系统通知做防抖，避免短时间内重复刷新好友列表与会话列表。
      await Promise.all([chatStore.loadFriends(), chatStore.loadSessions()]);
      ElNotification({
        title: "Friend notification",
        message: messageText || "Friend list updated",
        type: "success",
        duration: 3000,
      });
    },
    FRIEND_REFRESH_DEBOUNCE_MS,
  );

  const debouncedRefreshFriendData = createAsyncDebounce(
    async (messageText: string) => {
      const chatStore = useChatStore();
      // OPTIMIZE: 对好友关系相关系统消息做防抖，避免瞬时通知风暴压垮前端 API。
      await Promise.all([
        chatStore.loadFriendRequests(),
        chatStore.loadFriends(),
        chatStore.loadSessions(),
      ]);
      ElNotification({
        title: "System notification",
        message: messageText,
        type: "info",
        duration: 3000,
      });
    },
    FRIEND_REFRESH_DEBOUNCE_MS,
  );

  const connectionStatus = computed(() => {
    if (isConnecting.value) return "connecting";
    if (isConnected.value) return "connected";
    return "disconnected";
  });

  const normalizePresenceUserId = (userId: unknown): string =>
    String(userId || "").trim();

  const setUserOnline = (userId: unknown, isOnline: boolean) => {
    const normalizedUserId = normalizePresenceUserId(userId);
    if (!normalizedUserId) {
      return;
    }
    const nextOnlineUsers = new Set(onlineUsers.value);
    const wasOnline = nextOnlineUsers.has(normalizedUserId);
    if (isOnline) {
      nextOnlineUsers.add(normalizedUserId);
    } else {
      nextOnlineUsers.delete(normalizedUserId);
    }
    onlineUsers.value = nextOnlineUsers;

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

  const requestWsTicket = async (): Promise<void> => {
    const response = await authService.issueWsTicket();
    const ticket = response?.data?.ticket;
    if (!ticket) {
      throw new Error(response?.message || "Failed to issue websocket ticket");
    }
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
      await requestWsTicket();
      socket.value = new WebSocket(createTicketedWebSocketUrl(userId));

      socket.value.onopen = () => {
        isConnected.value = true;
        isConnecting.value = false;
        stopReconnect();
        saveConnectionCache(userId);
        startHeartbeat();
        void refreshKnownOnlineStatus().catch((error) => {
          logger.warn("failed to refresh known online status", error);
        });
        void useChatStore().syncOfflineMessages({
          refreshSessions: true,
          batchSize: 3,
          batchDelayMs: 150,
          loadSize: 50,
        }).catch((error) => {
          logger.warn("failed to sync offline messages", error);
        });
      };

      socket.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          if (shouldProcessSequentially(data)) {
            // FIX: 普通聊天消息保留串行处理，确保时序敏感消息仍按顺序落库与渲染。
            incomingProcessing.value = incomingProcessing.value
              .then(() => handleMessage(data))
              .catch((error) => {
                logger.error("failed to handle websocket message", error);
              });
            return;
          }
          // FIX: 系统消息、心跳和在线状态消息跳过串行队列，避免无关消息被长链路阻塞。
          void handleMessage(data).catch((error) => {
            logger.error("failed to handle websocket message", error);
          });
        } catch (error) {
          logger.warn("failed to parse websocket payload", error);
        }
      };

      socket.value.onclose = (event) => {
        socket.value = null;
        isConnected.value = false;
        isConnecting.value = false;
        stopHeartbeat();
        clearConnectionCache();
        if (!manualDisconnect.value && event.reason !== DUPLICATE_CONNECTION_REASON) {
          scheduleReconnect(userId);
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

    switch (data.type) {
      case "MESSAGE": {
        if (!data.data) {
          return;
        }
        const rawMessage = data.data as Record<string, unknown>;
        const isSystemMessage =
          String(rawMessage.messageType || rawMessage.type || "").toUpperCase() ===
          "SYSTEM";

        if (isSystemMessage) {
          const content = String(rawMessage.content || "");
          const shouldRefreshFriendData =
            content.includes("好友申请") ||
            content.includes("同意") ||
            content.toLowerCase().includes("friend request");

          if (shouldRefreshFriendData) {
            await debouncedRefreshFriendData(content);
          }
          return;
        }

        const normalizedMessage = normalizeMessage(rawMessage);
        const currentUserId = String(useUserStore().userId || "");
        const messageId = String(normalizedMessage.id || "");
        if (messageId && !messageId.startsWith("local_")) {
          const now = Date.now();
          const previous = recentMessageIds.value.get(messageId) || 0;
          if (now - previous < 60_000) {
            return;
          }
          // FIX: 除内存去重外，再检查本地消息状态，避免服务端重试导致重复渲染和重复提示。
          if (hasMessageInLocalState(chatStore, normalizedMessage, currentUserId)) {
            return;
          }
          recentMessageIds.value.set(messageId, now);
          cleanupRecentMessageIds(now);
        }

        const isSelfMessage =
          String(normalizedMessage.senderId) === currentUserId;
        await chatStore.addMessage(normalizedMessage);
        if (!isSelfMessage) {
          showMessageNotification(normalizedMessage);
        }
        return;
      }
      case "ONLINE_STATUS":
        if (data.data) {
          updateOnlineStatus(data.data as OnlineStatus);
        }
        return;
      case "READ_RECEIPT":
        if (data.data) {
          await chatStore.applyReadReceipt(data.data);
        }
        return;
      case "SYSTEM": {
        if (!data.data) {
          return;
        }
        const systemMessage = data.data as Record<string, unknown>;
        const content = String(systemMessage.content || "");
        const [messageText, command = ""] = content.includes("::CMD:")
          ? content.split("::CMD:")
          : [content, ""];

        if (command === "REFRESH_FRIEND_REQUESTS") {
          await debouncedRefreshFriendRequests(
            messageText || "Received a new friend request",
          );
          return;
        }
        if (command === "REFRESH_FRIEND_LIST") {
          await debouncedRefreshFriendList(messageText || "Friend list updated");
          return;
        }
        if (systemMessage.message) {
          ElMessage.info(String(systemMessage.message));
        }
        return;
      }
      case "HEARTBEAT":
      default:
        return;
    }
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
    setUserOnline(status.userId, status.status === "ONLINE");
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
        socket.value.send(
          JSON.stringify({
            type: "HEARTBEAT",
            data: { timestamp: Date.now() },
            timestamp: Date.now(),
          } satisfies WebSocketMessage),
        );
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
    if (manualDisconnect.value || reconnectTimer.value) {
      return;
    }
    if (reconnectAttempts.value >= WS_CONFIG.RECONNECT_ATTEMPTS) {
      ElMessage.error("WebSocket reconnect limit reached");
      return;
    }
    reconnectAttempts.value += 1;
    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      void connect(userId);
    }, WS_CONFIG.RECONNECT_INTERVAL * reconnectAttempts.value);
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
  };
});
