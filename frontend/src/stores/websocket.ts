/**
 * WebSocket状态管理
 * 管理WebSocket连接、消息收发、在线状态等
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { WS_CONFIG, STORAGE_CONFIG } from "@/config";
import { imApi } from "@/services";
import type { Message, OnlineStatus, WebSocketMessage } from "@/types";
import { ElMessage, ElNotification } from "element-plus";
import { useChatStore } from "./chat";
import { useUserStore } from "./user";

export const useWebSocketStore = defineStore("websocket", () => {
  // 状态
  const socket = ref<WebSocket | null>(null);
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const onlineUsers = ref<Set<string>>(new Set());
  const reconnectAttempts = ref(0);
  const heartbeatTimer = ref<NodeJS.Timeout | null>(null);
  const reconnectTimer = ref<NodeJS.Timeout | null>(null);

  // 计算属性
  const connectionStatus = computed(() => {
    if (isConnecting.value) return "connecting";
    if (isConnected.value) return "connected";
    return "disconnected";
  });

  // 构建WebSocket URL
  const buildWebSocketUrl = (userId: string): string => {
    const userStore = useUserStore();
    const token = userStore.token;
    
    // 在开发环境中使用代理路径
    const isDev = import.meta.env.DEV;
    const wsBaseUrl = isDev ? "" : WS_CONFIG.BASE_URL;
    const url = `${wsBaseUrl}/websocket/${userId}`;
    
    if (token) {
      // 使用 Sec-WebSocket-Protocol 需要后端支持，或者直接作为 Query Param
      return `${url}?token=${encodeURIComponent(token)}`;
    }
    return url;
  };

  // 连接WebSocket
  const connect = (userId: string) => {
    if (isConnected.value || isConnecting.value) {
      console.log("WebSocket已连接或正在连接中");
      return;
    }

    try {
      isConnecting.value = true;
      const url = buildWebSocketUrl(userId);

      console.log("正在连接WebSocket:", url);
      socket.value = new WebSocket(url);

      // 连接成功
      socket.value.onopen = () => {
        console.log("WebSocket连接成功");
        isConnected.value = true;
        isConnecting.value = false;
        reconnectAttempts.value = 0;

        // 保存连接状态
        saveConnectionCache(userId);

        // 开始心跳
        startHeartbeat();

        ElMessage.success("连接成功");
      };

      // 接收消息
      socket.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error("解析WebSocket消息失败:", error);
        }
      };

      // 连接关闭
      socket.value.onclose = (event) => {
        console.log("WebSocket连接关闭:", event.code, event.reason);
        isConnected.value = false;
        isConnecting.value = false;

        // 停止心跳
        stopHeartbeat();

        // 清除连接缓存
        clearConnectionCache();

        // 如果不是主动关闭，尝试重连
        if (
          event.code !== 1000 &&
          reconnectAttempts.value < WS_CONFIG.RECONNECT_ATTEMPTS
        ) {
          scheduleReconnect(userId);
        }
      };

      // 连接错误
      socket.value.onerror = (error) => {
        console.error("WebSocket连接错误:", error);
        isConnected.value = false;
        isConnecting.value = false;

        ElMessage.error("连接失败");
      };
    } catch (error) {
      console.error("创建WebSocket连接失败:", error);
      isConnecting.value = false;
      ElMessage.error("连接失败");
    }
  };

  // 断开连接
  const disconnect = () => {
    if (socket.value) {
      socket.value.close(1000, "主动断开");
      socket.value = null;
    }

    isConnected.value = false;
    isConnecting.value = false;

    // 停止心跳和重连
    stopHeartbeat();
    stopReconnect();

    // 清除缓存
    clearConnectionCache();
  };

  // 发送消息
  const sendMessage = (message: Message) => {
    if (!isConnected.value || !socket.value) {
      console.error("WebSocket未连接，无法发送消息");
      ElMessage.error("连接已断开，请重新连接");
      return false;
    }

    try {
      const wsMessage: WebSocketMessage = {
        type: "MESSAGE",
        data: message,
        timestamp: Date.now(),
      };

      socket.value.send(JSON.stringify(wsMessage));
      console.log("发送WebSocket消息:", wsMessage);
      return true;
    } catch (error) {
      console.error("发送WebSocket消息失败:", error);
      ElMessage.error("发送失败");
      return false;
    }
  };

  // 处理接收到的消息
  const handleMessage = async (data: WebSocketMessage) => {
    console.log("收到WebSocket消息:", data);

    const chatStore = useChatStore();

    switch (data.type) {
      case "MESSAGE":
        if (data.data) {
          const msg = data.data;
          const isSystem = (msg.messageType === "SYSTEM") || (msg.type === "SYSTEM");
          if (isSystem) {
            if (msg.content && (msg.content.includes("好友申请") || msg.content.includes("同意"))) {
              // 刷新好友列表、申请列表和会话列表，确保状态完全同步
              await Promise.all([
                chatStore.loadFriendRequests(),
                chatStore.loadFriends(),
                chatStore.loadSessions()
              ]);
              
              ElNotification({
                title: '系统通知',
                message: msg.content,
                type: 'info',
                duration: 3000
              });
            }
          } else {
            // Normalize message fields for consistency
            const created =
              (msg as any).created_at ||
              (msg as any).createdAt ||
              (msg as any).createdTime ||
              (msg as any).created_time ||
              (msg as any).sendTime ||
              (msg as any).send_time;
            const createdNormalized =
              typeof created === "string"
                ? created.replace(
                    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
                    "$1.$2",
                  )
                : created;
            const statusNum = typeof (msg as any).status === "number" ? (msg as any).status : Number((msg as any).status);
            const status =
              Number.isFinite(statusNum) && statusNum > 0
                ? statusNum === 3
                  ? "READ"
                  : statusNum === 2
                    ? "DELIVERED"
                    : statusNum === 1
                      ? "SENT"
                      : statusNum === 4
                        ? "RECALLED"
                        : statusNum === 5
                          ? "DELETED"
                          : "SENT"
                : (msg as any).status || "SENT";
            const normalizedMsg = {
              ...msg,
              senderId: msg.senderId || msg.sender?.id || msg.sender_id,
              messageType: msg.messageType || msg.type || 'TEXT',
              type: msg.type || msg.messageType || 'TEXT',
              senderName: msg.senderName || msg.sender?.nickname || msg.sender?.username,
              senderAvatar: msg.senderAvatar || msg.sender?.avatar,
              sendTime: createdNormalized || (msg as any).sendTime || new Date().toISOString(),
              status,
            };
            
            // 如果发送者是当前用户，则忽略该消息（因为本地已经添加了，避免重复）
            if (String(normalizedMsg.senderId) === String(useUserStore().userId)) {
              console.log("忽略自己发送的消息:", normalizedMsg.id);
            } else {
              chatStore.addMessage(normalizedMsg);
              showMessageNotification(normalizedMsg);
            }
          }
        }
        break;

      case "ONLINE_STATUS":
        // 处理在线状态
        if (data.data) {
          updateOnlineStatus(data.data);
        }
        break;

      case "READ_RECEIPT":
        if (data.data) {
          chatStore.applyReadReceipt(data.data);
        }
        break;

      case "SYSTEM":
        // 处理系统消息
        if (data.data) {
           const systemMsg = data.data;
           const content = systemMsg.content || "";
           
           // 解析指令
           let command = "";
           let messageText = content;
           
           if (content.includes("::CMD:")) {
             const parts = content.split("::CMD:");
             messageText = parts[0];
             command = parts[1];
           }
           
           // 如果有指令，优先执行指令逻辑
           if (command === "REFRESH_FRIEND_REQUESTS") {
               // 刷新好友申请列表
               await chatStore.loadFriendRequests();
               ElNotification({
                 title: '好友通知',
                 message: messageText || '收到新的好友申请',
                 type: 'info',
                 duration: 3000
               });
           } else if (command === "REFRESH_FRIEND_LIST") {
               // 刷新好友列表和会话
               await Promise.all([
                 chatStore.loadFriends(),
                 chatStore.loadSessions()
               ]);
               ElNotification({
                 title: '好友通知',
                 message: messageText || '已添加新好友',
                 type: 'success',
                 duration: 3000
               });
           } else if (content.includes("好友申请") || content.includes("同意")) {
               // 兼容旧逻辑：模糊匹配
               await Promise.all([
                 chatStore.loadFriendRequests(),
                 chatStore.loadFriends(),
                 chatStore.loadSessions()
               ]);
               
               ElNotification({
                 title: '系统通知',
                 message: content,
                 type: 'info',
                 duration: 3000
               });
           } else if (systemMsg.message) {
               ElMessage.info(systemMsg.message);
           }
        }
        break;

      case "HEARTBEAT":
        // 心跳响应
        console.log("收到心跳响应");
        break;

      default:
        console.log("未知消息类型:", data.type);
    }
  };

  // 显示消息通知
  const showMessageNotification = (message: Message) => {
    if (document.hidden) {
      ElNotification({
        title: message.senderName || "新消息",
        message: message.content,
        type: "info",
        duration: 3000,
      });
    }
  };

  // 更新在线状态
  const updateOnlineStatus = (status: OnlineStatus) => {
    const wasOnline = onlineUsers.value.has(status.userId);
    const isNowOnline = status.status === "ONLINE";
    
    if (isNowOnline) {
      onlineUsers.value.add(status.userId);
    } else {
      onlineUsers.value.delete(status.userId);
    }
    
    // 使用更精确的状态变化触发机制
    if (wasOnline !== isNowOnline) {
      // 发送一个自定义事件来通知状态变化
      window.dispatchEvent(new CustomEvent('onlineStatusChanged', {
        detail: { userId: status.userId, isOnline: isNowOnline }
      }));
    }
  };

  // 检查用户是否在线
  const isUserOnline = (userId: string): boolean => {
    return onlineUsers.value.has(userId);
  };

  // 开始心跳
  const startHeartbeat = () => {
    stopHeartbeat();

    heartbeatTimer.value = setInterval(() => {
      if (isConnected.value && socket.value) {
        const heartbeatMessage: WebSocketMessage = {
          type: "HEARTBEAT",
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
        };

        try {
          socket.value.send(JSON.stringify(heartbeatMessage));
        } catch (error) {
          console.error("发送心跳失败:", error);
        }
      }
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
  };

  // 停止心跳
  const stopHeartbeat = () => {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value);
      heartbeatTimer.value = null;
    }
  };

  // 安排重连
  const scheduleReconnect = (userId: string) => {
    if (reconnectAttempts.value >= WS_CONFIG.RECONNECT_ATTEMPTS) {
      console.log("重连次数已达上限，停止重连");
      ElMessage.error("连接失败，请手动重新连接");
      return;
    }

    reconnectAttempts.value++;
    const delay = WS_CONFIG.RECONNECT_INTERVAL * reconnectAttempts.value;

    console.log(`第${reconnectAttempts.value}次重连，${delay}ms后开始`);

    reconnectTimer.value = setTimeout(() => {
      connect(userId);
    }, delay);
  };

  // 停止重连
  const stopReconnect = () => {
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
    reconnectAttempts.value = 0;
  };

  // 保存连接缓存
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

  // 加载连接缓存
  const loadConnectionCache = () => {
    try {
      const cached = localStorage.getItem(STORAGE_CONFIG.WS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error("加载连接缓存失败:", error);
    }
    return null;
  };

  // 清除连接缓存
  const clearConnectionCache = () => {
    localStorage.removeItem(STORAGE_CONFIG.WS_CACHE_KEY);
  };

  // 心跳检测API
  const heartbeat = async (userIds: string[]) => {
    try {
      const response = await imApi.heartbeat(userIds);

      if (response && response.code === 200 && response.data) {
        // 更新在线状态
        const statusMap = response.data as unknown as Record<string, boolean>;
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
      console.error("心跳检测失败:", error);
    }
    return {};
  };

  return {
    // 状态
    socket,
    isConnected,
    isConnecting,
    onlineUsers,
    reconnectAttempts,

    // 计算属性
    connectionStatus,

    // 方法
    connect,
    disconnect,
    sendMessage,
    isUserOnline,
    heartbeat,
    loadConnectionCache,
    clearConnectionCache,
  };
});
