import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { friendService } from "@/services/friend";
import { userService } from "@/services/user";
import type { Friendship } from "@/types";
import { useUserStore } from "@/stores/user";
import { logger } from "@/utils/logger";

export class HeartbeatService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private userStatusTimer: ReturnType<typeof setInterval> | null = null;
  public friendsOnlineStatus = ref<Record<string, string>>({});
  private isCurrentUserOnline = ref(true);
  public friends = ref<Friendship[]>([]);
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly retryDelay = 5000;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly USER_STATUS_CHECK_INTERVAL = 60000;

  constructor() {
    void this.loadFriends();
    if (typeof window !== "undefined") {
      window.addEventListener(
        "onlineStatusChanged",
        this.handleOnlineStatusChanged as EventListener,
      );
    }
  }

  private handleOnlineStatusChanged = (event: Event) => {
    const customEvent = event as CustomEvent<{
      userId: string;
      isOnline: boolean;
    }>;
    const userId = customEvent?.detail?.userId;
    if (!userId) {
      return;
    }
    this.friendsOnlineStatus.value[userId] = customEvent.detail.isOnline
      ? "ONLINE"
      : "OFFLINE";
  };

  getFriendOnlineStatus(friendId: string): string {
    return this.friendsOnlineStatus.value[friendId] || "OFFLINE";
  }

  getCurrentUserOnlineStatus(): boolean {
    return this.isCurrentUserOnline.value;
  }

  getAllFriendsOnlineStatus() {
    return computed(() => this.friendsOnlineStatus.value);
  }

  private async loadFriends() {
    try {
      const response = await friendService.getList();
      if (response.code === 200) {
        this.friends.value = response.data;
      }
    } catch (error) {
      logger.warn("heartbeat: failed to load friends", error);
    }
  }

  start() {
    this.retryCount = 0;
    void this.checkFriendsOnlineStatus();
    void this.checkCurrentUserStatus();

    this.heartbeatTimer = setInterval(() => {
      void this.checkFriendsOnlineStatus();
    }, this.HEARTBEAT_INTERVAL);

    this.userStatusTimer = setInterval(() => {
      void this.checkCurrentUserStatus();
    }, this.USER_STATUS_CHECK_INTERVAL);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.userStatusTimer) {
      clearInterval(this.userStatusTimer);
      this.userStatusTimer = null;
    }
    this.retryCount = 0;
  }

  private async checkFriendsOnlineStatus() {
    if (this.friends.value.length === 0) {
      return;
    }
    try {
      const response = await userService.checkOnlineStatus(
        this.friends.value.map((friend) => friend.friendId),
      );
      if (response.code === 200) {
        const statusMap: Record<string, string> = {};
        Object.entries(response.data).forEach(([userId, isOnline]) => {
          statusMap[userId] = isOnline ? "ONLINE" : "OFFLINE";
        });
        this.friendsOnlineStatus.value = statusMap;
        return;
      }
      logger.warn("heartbeat: failed to update friend status", response.message);
    } catch (error) {
      logger.warn("heartbeat: failed to check friend status", error);
      if (this.retryCount < this.maxRetries) {
        this.retryCount += 1;
        setTimeout(
          () => void this.checkFriendsOnlineStatus(),
          this.retryDelay * this.retryCount,
        );
      }
    }
  }

  private async checkCurrentUserStatus() {
    const userStore = useUserStore();
    if (!userStore.userInfo?.id) {
      this.isCurrentUserOnline.value = false;
      return;
    }
    try {
      const response = await userService.heartbeat([userStore.userInfo.id]);
      if (response.code === 200) {
        this.isCurrentUserOnline.value =
          response.data[userStore.userInfo.id] === true;
        this.retryCount = 0;
        if (!this.isCurrentUserOnline.value) {
          ElMessage.warning("检测到您可能已离线，请检查网络连接");
        }
        return;
      }
      this.isCurrentUserOnline.value = false;
    } catch (error) {
      logger.warn("heartbeat: failed to check current user status", error);
      this.isCurrentUserOnline.value = false;
      if (this.retryCount < this.maxRetries) {
        this.retryCount += 1;
        setTimeout(
          () => void this.checkCurrentUserStatus(),
          this.retryDelay * this.retryCount,
        );
      }
    }
  }

  async refreshFriends() {
    await this.loadFriends();
  }

  async checkSpecificFriend(friendId: string): Promise<string> {
    try {
      const response = await userService.checkOnlineStatus([friendId]);
      if (response.code === 200) {
        const status = response.data[friendId] ? "ONLINE" : "OFFLINE";
        this.friendsOnlineStatus.value[friendId] = status;
        return status;
      }
    } catch (error) {
      logger.warn("heartbeat: failed to check specific friend status", error);
    }
    return "OFFLINE";
  }
}

export const heartbeatService = new HeartbeatService();
