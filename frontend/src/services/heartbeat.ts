import { ref, computed } from "vue";
import { userService } from "@/services/user";
import { friendService } from "@/services/friend";
import type { Friendship } from "@/types/user";
import { useUserStore } from "@/stores/user";
import { ElMessage } from "element-plus";

// 心跳检测服务
export class HeartbeatService {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private userStatusTimer: NodeJS.Timeout | null = null;
  public friendsOnlineStatus = ref<Record<string, string>>({});
  private isCurrentUserOnline = ref(true);
  public friends = ref<Friendship[]>([]);
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly retryDelay = 5000; // 5秒

  // 心跳检测间隔（毫秒）
  private readonly HEARTBEAT_INTERVAL = 30000; // 30秒
  private readonly USER_STATUS_CHECK_INTERVAL = 60000; // 60秒检查一次用户在线状态

  constructor() {
    this.loadFriends();
    if (typeof window !== "undefined") {
      window.addEventListener(
        "onlineStatusChanged",
        this.handleOnlineStatusChanged as EventListener,
      );
    }
  }

  private handleOnlineStatusChanged = (event: Event) => {
    const customEvent = event as CustomEvent<{ userId: string; isOnline: boolean }>;
    const userId = customEvent?.detail?.userId;
    if (!userId) {
      return;
    }
    this.friendsOnlineStatus.value[userId] = customEvent.detail.isOnline
      ? "ONLINE"
      : "OFFLINE";
  };

  // 获取好友在线状态
  getFriendOnlineStatus(friendId: string): string {
    return this.friendsOnlineStatus.value[friendId] || "OFFLINE";
  }

  // 获取当前用户在线状态
  getCurrentUserOnlineStatus(): boolean {
    return this.isCurrentUserOnline.value;
  }

  // 获取所有好友的在线状态
  getAllFriendsOnlineStatus() {
    return computed(() => this.friendsOnlineStatus.value);
  }

  // 加载好友列表
  private async loadFriends() {
    try {
      const response = await friendService.getList();
      if (response.code === 200 && response.data) {
        this.friends.value = (response.data as unknown as Friendship[]) || [];
        console.log(
          "心跳服务：已加载好友列表，共",
          this.friends.value.length,
          "个好友",
        );
      }
    } catch (error) {
      console.error("心跳服务：加载好友列表失败:", error);
    }
  }

  // 开始心跳检测
  start() {
    console.log("心跳服务：开始心跳检测");

    // 重置重试计数
    this.retryCount = 0;

    // 立即执行一次检测
    this.checkFriendsOnlineStatus();
    this.checkCurrentUserStatus();

    // 定时检测好友在线状态
    this.heartbeatTimer = setInterval(() => {
      this.checkFriendsOnlineStatus();
    }, this.HEARTBEAT_INTERVAL);

    // 定时检测当前用户在线状态
    this.userStatusTimer = setInterval(() => {
      this.checkCurrentUserStatus();
    }, this.USER_STATUS_CHECK_INTERVAL);
  }

  // 停止心跳检测
  stop() {
    console.log("心跳服务：停止心跳检测");

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.userStatusTimer) {
      clearInterval(this.userStatusTimer);
      this.userStatusTimer = null;
    }

    // 重置重试计数
    this.retryCount = 0;
  }

  // 检查好友在线状态
  private async checkFriendsOnlineStatus() {
    if (this.friends.value.length === 0) {
      return;
    }

    try {
      // 获取所有好友的ID
      const friendIds = this.friends.value.map((friend) => friend.friendId);

      // 调用用户在线状态检测接口
      const response = await userService.checkOnlineStatus(friendIds);

      // 更新好友在线状态
      if (response.code === 200 && response.data) {
        // 将boolean状态转换为字符串状态
        const statusMap: Record<string, string> = {};
        Object.entries(response.data).forEach(([userId, isOnline]) => {
          statusMap[userId] = isOnline ? "ONLINE" : "OFFLINE";
        });
        this.friendsOnlineStatus.value = statusMap;
        console.log("心跳服务：已更新好友在线状态", response.data);
      } else {
        console.warn("心跳服务：获取好友在线状态失败:", response.message);
      }
    } catch (error) {
      console.error("心跳服务：检查好友在线状态失败:", error);
      // 网络错误时，保持当前状态，避免频繁重试
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(
          () => this.checkFriendsOnlineStatus(),
          this.retryDelay * this.retryCount,
        );
      }
    }
  }

  // 检查当前用户在线状态
  private async checkCurrentUserStatus() {
    const userStore = useUserStore();

    if (!userStore.userInfo?.id) {
      this.isCurrentUserOnline.value = false;
      return;
    }

    try {
      const response = await userService.heartbeat([userStore.userInfo.id]);

      if (response.code === 200 && response.data) {
        const userStatus = (
          response.data as unknown as Record<string, boolean>
        )?.[userStore.userInfo.id];
        this.isCurrentUserOnline.value = userStatus === true;
        this.retryCount = 0; // 成功后重置重试计数

        // 如果用户离线，显示警告
        if (!this.isCurrentUserOnline.value) {
          console.warn("心跳服务：检测到当前用户离线");
          ElMessage.warning("检测到您可能已离线，请检查网络连接");
        }
      } else {
        this.isCurrentUserOnline.value = false;
        console.warn("心跳服务：获取当前用户在线状态失败:", response.message);
      }
    } catch (error) {
      console.error("心跳服务：检查当前用户在线状态失败:", error);
      this.isCurrentUserOnline.value = false;
      // 网络错误时，保持当前状态，避免频繁重试
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(
          () => this.checkCurrentUserStatus(),
          this.retryDelay * this.retryCount,
        );
      }
    }
  }

  // 刷新好友列表
  async refreshFriends() {
    await this.loadFriends();
  }

  // 手动检查指定好友的在线状态
  async checkSpecificFriend(friendId: string): Promise<string> {
    try {
      const response = await userService.checkOnlineStatus([friendId]);

      if (response.code === 200 && response.data) {
        const friendStatus = (
          response.data as unknown as Record<string, boolean>
        )?.[friendId]
          ? "ONLINE"
          : "OFFLINE";
        this.friendsOnlineStatus.value[friendId] = friendStatus;
        return friendStatus;
      }
    } catch (error) {
      console.error("心跳服务：检查指定好友在线状态失败:", error);
    }

    return "OFFLINE";
  }
}

// 创建全局心跳服务实例
export const heartbeatService = new HeartbeatService();
