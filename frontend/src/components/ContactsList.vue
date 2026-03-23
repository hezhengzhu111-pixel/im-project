<template>
  <div class="contacts-list">
    <!-- 操作按钮 -->
    <div class="contacts-header">
      <el-button type="primary" size="small" @click="showAddFriend = true">
        <el-icon><Plus /></el-icon>
        添加好友
      </el-button>
      <el-button size="small" @click="$router.push('/friends')">
        <el-icon><Setting /></el-icon>
        好友管理
      </el-button>
    </div>

    <!-- 搜索框 -->
    <div class="search-section">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索联系人..."
        clearable
        size="small"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 好友申请提醒 -->
    <div v-if="pendingRequestsCount > 0" class="friend-requests-notice">
      <el-alert
        :title="`您有 ${pendingRequestsCount} 条好友申请待处理`"
        type="info"
        :closable="false"
        @click="$router.push('/friends?tab=requests')"
        class="clickable-alert"
      >
        <template #default>
          <span>您有 {{ pendingRequestsCount }} 条好友申请待处理</span>
          <el-button link size="small">查看</el-button>
        </template>
      </el-alert>
    </div>

    <!-- 联系人列表 -->
    <div class="friends-list">
      <div
        v-for="friend in filteredFriends"
        :key="friend.friendId"
        class="friend-item"
        @click="startChat(friend)"
      >
        <el-avatar :size="40" :src="friend.avatar">
          {{ friend.nickname?.charAt(0) || friend.username?.charAt(0) }}
        </el-avatar>

        <div class="friend-info">
          <div class="friend-name">
            {{ friend.nickname || friend.username }}
          </div>
          <div
            class="friend-status"
            :class="
              getFriendOnlineStatus(friend.friendId) === 'online'
                ? 'online'
                : 'offline'
            "
          >
            <span class="status-dot"></span>
            {{
              getFriendOnlineStatus(friend.friendId) === "online"
                ? "在线"
                : "离线"
            }}
          </div>
        </div>

        <div class="friend-actions">
          <el-button
            type="primary"
            size="small"
            @click.stop="startChat(friend)"
          >
            聊天
          </el-button>
        </div>
      </div>

      <!-- 空状态 -->
      <el-empty v-if="filteredFriends.length === 0" description="暂无联系人" />
    </div>

    <!-- 添加好友对话框 -->
    <el-dialog
      v-model="showAddFriend"
      title="添加好友"
      width="400px"
      :before-close="handleCloseAddFriend"
    >
      <el-form :model="addFriendForm" label-width="80px">
        <el-form-item label="搜索用户">
          <el-select
            v-model="addFriendForm.targetUserId"
            placeholder="请输入用户名搜索"
            filterable
            remote
            :remote-method="searchUsers"
            :loading="searchLoading"
            clearable
          >
            <el-option
              v-for="user in searchResults"
              :key="user.id"
              :label="`${user.nickname || user.username} (${user.username})`"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="申请理由">
          <el-input
            v-model="addFriendForm.reason"
            type="textarea"
            placeholder="请输入申请理由（可选）"
            :rows="3"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAddFriend = false">取消</el-button>
          <el-button
            type="primary"
            @click="handleAddFriend"
            :loading="addFriendLoading"
          >
            发送申请
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { Plus, Setting, Search } from "@element-plus/icons-vue";
import { friendService } from "@/services/friend";
import type { Friendship } from "@/types/user";
import { userService } from "@/services/user";
import type { UserDTO } from "@/types/user";
import { useChatStore } from "@/stores/chat";
import { useWebSocketStore } from "@/stores/websocket";
import { useRouter } from "vue-router";
import { heartbeatService } from "@/services/heartbeat";

const router = useRouter();
const chatStore = useChatStore();

// 响应式数据
const searchKeyword = ref("");
const friends = computed(() => chatStore.friends);
const pendingRequestsCount = ref(0);
const showAddFriend = ref(false);
const addFriendLoading = ref(false);

// 添加好友表单
const addFriendForm = ref({
  targetUserId: "",
  reason: "",
});

// 搜索用户相关
const searchLoading = ref(false);
const searchResults = ref<UserDTO[]>([]);

// 计算属性
const filteredFriends = computed(() => {
  if (!searchKeyword.value) {
    return friends.value;
  }

  const keyword = searchKeyword.value.toLowerCase();
  return friends.value.filter(
    (friend) =>
      friend.nickname?.toLowerCase().includes(keyword) ||
      friend.username?.toLowerCase().includes(keyword),
  );
});

// 方法
const loadFriends = async () => {
  try {
    await chatStore.loadFriends();
  } catch (error) {
    console.error("加载好友列表失败:", error);
  }
};

const loadPendingRequests = async () => {
  try {
    const response = await friendService.getRequests();
    if (response.code === 200) {
      const requests = (response.data as any).content || response.data || [];
      pendingRequestsCount.value = requests.filter(
        (req: any) => req.status === "PENDING" || req.status === "待处理" || req.status === 0,
      ).length;
    }
  } catch (error) {
    console.error("加载好友申请失败:", error);
  }
};

// 获取好友在线状态
const getFriendOnlineStatus = (friendId: string) => {
  const wsStore = useWebSocketStore();
  return wsStore.isUserOnline(friendId) ? "online" : "offline";
};

// 监听在线状态变化事件
const handleOnlineStatusChange = (event: CustomEvent) => {
  const { userId, isOnline } = event.detail;
  const friendIndex = friends.value.findIndex(
    (friend) => friend.userId === userId,
  );
  if (friendIndex !== -1) {
    pendingRequestsCount.value = pendingRequestsCount.value + 0;
  }
};

const startChat = (friend: Friendship) => {
  // 开始与好友聊天
  const session = chatStore.createOrGetSession(
    "private",
    friend.friendId,
    friend.remark || friend.nickname || friend.username,
    friend.avatar,
  );
  if (session) {
    chatStore.setCurrentSession(session);
  }
  // 跳转到聊天页面
  router.push("/chat");
};

// 搜索用户方法
const searchUsers = async (query: string) => {
  if (!query.trim()) {
    searchResults.value = [];
    return;
  }

  searchLoading.value = true;
  try {
    const response = await userService.search(query);
    if (response.code === 200) {
      searchResults.value = response.data || [];
    } else {
      searchResults.value = [];
    }
  } catch (error) {
    console.error("搜索用户失败:", error);
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
};

const handleAddFriend = async () => {
  if (!addFriendForm.value.targetUserId) {
    ElMessage.warning("请选择要添加的用户");
    return;
  }

  addFriendLoading.value = true;
  try {
    const response = await friendService.add({
      userId: addFriendForm.value.targetUserId.toString(),
      message: addFriendForm.value.reason,
    });

    if (response.code === 200) {
      ElMessage.success("好友申请已发送");
      showAddFriend.value = false;
      addFriendForm.value = { targetUserId: "", reason: "" };
      searchResults.value = [];
    } else {
      ElMessage.error(response.message || "发送好友申请失败");
    }
  } catch (error) {
    console.error("发送好友申请失败:", error);
    ElMessage.error("发送好友申请失败");
  } finally {
    addFriendLoading.value = false;
  }
};

const handleCloseAddFriend = () => {
  addFriendForm.value = { targetUserId: "", reason: "" };
  searchResults.value = [];
  showAddFriend.value = false;
};

// 生命周期
onMounted(() => {
  // 加载好友列表
  loadFriends();

  // 加载待处理的好友申请
  loadPendingRequests();

  // 监听在线状态变化事件
  window.addEventListener(
    "onlineStatusChanged",
    handleOnlineStatusChange as EventListener,
  );
});

onUnmounted(() => {
  // 移除在线状态变化事件监听
  window.removeEventListener(
    "onlineStatusChanged",
    handleOnlineStatusChange as EventListener,
  );
});

// 暴露方法供父组件调用
defineExpose({
  loadFriends,
  loadPendingRequests,
});
</script>

<style lang="scss" scoped>
.contacts-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.contacts-header {
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  gap: 8px;
}

.search-section {
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
}

.friend-requests-notice {
  padding: 8px 12px;

  .clickable-alert {
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: #f0f9ff;
    }
  }
}

.friends-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.friend-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f5f7fa;
  }
}

.friend-info {
  flex: 1;
  margin-left: 12px;
  min-width: 0;
}

.friend-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-status {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 4px;
    background-color: #909399;
  }

  &.online .status-dot {
    background-color: #67c23a;
  }

  &.busy .status-dot {
    background-color: #f56c6c;
  }

  &.away .status-dot {
    background-color: #e6a23c;
  }
}

.friend-actions {
  margin-left: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
