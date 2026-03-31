import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage, ElNotification } from "element-plus";
import { STORAGE_CONFIG, WS_CONFIG } from "@/config";
import { authService, userService } from "@/services";
import { normalizeMessage } from "@/normalizers/message";
import type { Message, OnlineStatus, WebSocketMessage } from "@/types";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { logger } from "@/utils/logger";

type TimerHandle = ReturnType<typeof setInterval>;

const DUPLICATE_CONNECTION_REASON = "duplicate_connection";

export const createTicketedWebSocketUrl = (
  userId: string,
  ticket: string,
): string => {
  const isDev = import.meta.env.DEV;
  const wsBaseUrl = isDev ? "" : WS_CONFIG.BASE_URL;
  const baseUrl = `${wsBaseUrl}/websocket/${userId}`;
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

  const connectionStatus = computed(() => {
    if (isConnecting.value) return "connecting";
    if (isConnected.value) return "connected";
    return "disconnected";
  });

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
      socket.value = new WebSocket(createTicketedWebSocketUrl(userId, ticket));

      socket.value.onopen = () => {
        isConnected.value = true;
        isConnecting.value = false;
        stopReconnect();
        saveConnectionCache(userId);
        startHeartbeat();
        void useChatStore().syncOfflineMessages().catch((error) => {
          logger.warn("failed to sync offline messages", error);
        });
      };

      socket.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          incomingProcessing.value = incomingProcessing.value
            .then(() => handleMessage(data))
            .catch((error) => {
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
          rawMessage.messageType === "SYSTEM" || rawMessage.type === "SYSTEM";

        if (isSystemMessage) {
          const content = String(rawMessage.content || "");
          const shouldRefreshFriendData =
            content.includes("好友申请") ||
            content.includes("同意") ||
            content.toLowerCase().includes("friend request");

          if (shouldRefreshFriendData) {
            await Promise.all([
              chatStore.loadFriendRequests(),
              chatStore.loadFriends(),
              chatStore.loadSessions(),
            ]);
            ElNotification({
              title: "System notification",
              message: content,
              type: "info",
              duration: 3000,
            });
          }
          return;
        }

        const normalizedMessage = normalizeMessage(rawMessage);
        const messageId = String(normalizedMessage.id || "");
        if (messageId && !messageId.startsWith("local_")) {
          const now = Date.now();
          const previous = recentMessageIds.value.get(messageId) || 0;
          if (now - previous < 60_000) {
            return;
          }
          recentMessageIds.value.set(messageId, now);
          if (recentMessageIds.value.size > 2000) {
            const cutoff = now - 300_000;
            recentMessageIds.value.forEach((timestamp, id) => {
              if (timestamp < cutoff) {
                recentMessageIds.value.delete(id);
              }
            });
          }
        }

        const isSelfMessage =
          String(normalizedMessage.senderId) === String(useUserStore().userId);
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
          await chatStore.loadFriendRequests();
          ElNotification({
            title: "Friend notification",
            message: messageText || "Received a new friend request",
            type: "info",
            duration: 3000,
          });
          return;
        }
        if (command === "REFRESH_FRIEND_LIST") {
          await Promise.all([chatStore.loadFriends(), chatStore.loadSessions()]);
          ElNotification({
            title: "Friend notification",
            message: messageText || "Friend list updated",
            type: "success",
            duration: 3000,
          });
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
    const wasOnline = onlineUsers.value.has(status.userId);
    const isNowOnline = status.status === "ONLINE";

    if (isNowOnline) {
      onlineUsers.value.add(status.userId);
    } else {
      onlineUsers.value.delete(status.userId);
    }

    if (wasOnline !== isNowOnline) {
      window.dispatchEvent(
        new CustomEvent("onlineStatusChanged", {
          detail: { userId: status.userId, isOnline: isNowOnline },
        }),
      );
    }
  };

  const isUserOnline = (userId: string): boolean => {
    return onlineUsers.value.has(userId);
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
    try {
      const response = await userService.checkOnlineStatus(userIds);
      if (response.code === 200 && response.data) {
        Object.entries(response.data).forEach(([userId, isOnline]) => {
          if (isOnline) {
            onlineUsers.value.add(userId);
          } else {
            onlineUsers.value.delete(userId);
          }
        });
        return response.data;
      }
    } catch (error) {
      logger.warn("failed to query heartbeat", error);
    }
    return {};
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
    loadConnectionCache,
    clearConnectionCache,
  };
});
