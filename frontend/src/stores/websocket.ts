import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage, ElNotification } from "element-plus";
import { STORAGE_CONFIG, WS_CONFIG } from "@/config";
import { authApi, imApi } from "@/services";
import type { Message, OnlineStatus, WebSocketMessage } from "@/types";
import { normalizeMessageBase } from "@/utils/messageNormalize";
import { useChatStore } from "./chat";
import { useUserStore } from "./user";

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
    const response = await authApi.issueWsTicket();
    const ticket = response?.data?.ticket;
    if (!ticket) {
      throw new Error(response?.message || "Failed to issue websocket ticket");
    }
    return ticket;
  };

  const connect = async (userId: string) => {
    if (!userId) {
      return;
    }
    if (isConnected.value || isConnecting.value) {
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
      const url = createTicketedWebSocketUrl(userId, ticket);
      socket.value = new WebSocket(url);

      socket.value.onopen = () => {
        isConnected.value = true;
        isConnecting.value = false;
        stopReconnect();
        saveConnectionCache(userId);
        startHeartbeat();

        void useChatStore()
          .syncOfflineMessages()
          .catch((error) => {
            console.error("Failed to sync offline messages:", error);
          });
      };

      socket.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          incomingProcessing.value = incomingProcessing.value
            .then(() => handleMessage(data))
            .catch((error) => {
              console.error("Failed to handle websocket message:", error);
            });
        } catch (error) {
          console.error("Failed to parse websocket payload:", error);
        }
      };

      socket.value.onclose = (event) => {
        socket.value = null;
        isConnected.value = false;
        isConnecting.value = false;
        stopHeartbeat();
        clearConnectionCache();

        if (
          !manualDisconnect.value &&
          event.reason !== DUPLICATE_CONNECTION_REASON
        ) {
          scheduleReconnect(userId);
        }
      };

      socket.value.onerror = (error) => {
        console.error("WebSocket connection error:", error);
        isConnected.value = false;
        isConnecting.value = false;
      };
    } catch (error) {
      console.error("Failed to create websocket connection:", error);
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

  const sendMessage = (message: Message) => {
    if (!isConnected.value || !socket.value) {
      ElMessage.error("WebSocket is disconnected");
      return false;
    }

    try {
      const wsMessage: WebSocketMessage = {
        type: "MESSAGE",
        data: message,
        timestamp: Date.now(),
      };
      socket.value.send(JSON.stringify(wsMessage));
      return true;
    } catch (error) {
      console.error("Failed to send websocket message:", error);
      ElMessage.error("Failed to send message");
      return false;
    }
  };

  const handleMessage = async (data: WebSocketMessage) => {
    const chatStore = useChatStore();

    switch (data.type) {
      case "MESSAGE":
        if (data.data) {
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
          } else {
            const normalizedMessage = normalizeMessageBase(
              rawMessage,
            ) as Message;
            const messageId = String(normalizedMessage.id || "");

            if (messageId && !messageId.startsWith("local_")) {
              const now = Date.now();
              const previous = recentMessageIds.value.get(messageId) || 0;
              if (now - previous < 60_000) {
                break;
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
              String(normalizedMessage.senderId) ===
              String(useUserStore().userId);
            chatStore.addMessage(normalizedMessage);

            if (!isSelfMessage) {
              showMessageNotification(normalizedMessage);
            }
          }
        }
        break;

      case "ONLINE_STATUS":
        if (data.data) {
          updateOnlineStatus(data.data as OnlineStatus);
        }
        break;

      case "READ_RECEIPT":
        if (data.data) {
          chatStore.applyReadReceipt(data.data);
        }
        break;

      case "SYSTEM":
        if (data.data) {
          const systemMessage = data.data as Record<string, unknown>;
          const content = String(systemMessage.content || "");
          let command = "";
          let messageText = content;

          if (content.includes("::CMD:")) {
            const parts = content.split("::CMD:");
            messageText = parts[0];
            command = parts[1] || "";
          }

          if (command === "REFRESH_FRIEND_REQUESTS") {
            await chatStore.loadFriendRequests();
            ElNotification({
              title: "Friend notification",
              message: messageText || "Received a new friend request",
              type: "info",
              duration: 3000,
            });
          } else if (command === "REFRESH_FRIEND_LIST") {
            await Promise.all([chatStore.loadFriends(), chatStore.loadSessions()]);
            ElNotification({
              title: "Friend notification",
              message: messageText || "Friend list updated",
              type: "success",
              duration: 3000,
            });
          } else if (systemMessage.message) {
            ElMessage.info(String(systemMessage.message));
          }
        }
        break;

      case "HEARTBEAT":
        break;

      default:
        break;
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

      const heartbeatMessage: WebSocketMessage = {
        type: "HEARTBEAT",
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
      };

      try {
        socket.value.send(JSON.stringify(heartbeatMessage));
      } catch (error) {
        console.error("Failed to send heartbeat:", error);
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
    const delay = WS_CONFIG.RECONNECT_INTERVAL * reconnectAttempts.value;

    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      void connect(userId);
    }, delay);
  };

  const stopReconnect = () => {
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
    reconnectAttempts.value = 0;
  };

  const saveConnectionCache = (userId: string) => {
    const cacheData = {
      userId,
      timestamp: Date.now(),
      isActive: true,
    };
    localStorage.setItem(
      STORAGE_CONFIG.WS_CACHE_KEY,
      JSON.stringify(cacheData),
    );
  };

  const loadConnectionCache = () => {
    try {
      const cached = localStorage.getItem(STORAGE_CONFIG.WS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error("Failed to load websocket cache:", error);
    }
    return null;
  };

  const clearConnectionCache = () => {
    localStorage.removeItem(STORAGE_CONFIG.WS_CACHE_KEY);
  };

  const heartbeat = async (userIds: string[]) => {
    try {
      const response = await imApi.heartbeat(userIds);
      if (response && response.code === 200 && response.data) {
        const statusMap = response.data as Record<string, boolean>;
        Object.entries(statusMap).forEach(([userId, isOnline]) => {
          if (isOnline) {
            onlineUsers.value.add(userId);
          } else {
            onlineUsers.value.delete(userId);
          }
        });
        return statusMap;
      }
    } catch (error) {
      console.error("Failed to query heartbeat:", error);
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
    sendMessage,
    isUserOnline,
    heartbeat,
    loadConnectionCache,
    clearConnectionCache,
  };
});
