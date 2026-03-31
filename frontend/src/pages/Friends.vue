<template>
  <div class="friends-page">
    <div class="page-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>联系人</h2>
      <el-button type="primary" :icon="Plus" @click="showAddFriend = true">
        添加好友
      </el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索联系人"
        :prefix-icon="Search"
        clearable
      />
      <el-select v-model="sortBy" class="sort-select">
        <el-option label="按姓名" value="name" />
        <el-option label="按添加时间" value="time" />
        <el-option label="按在线状态" value="online" />
      </el-select>
    </div>

    <el-card class="panel-card">
      <template #header>
        <div class="card-header">
          <span>好友申请</span>
          <el-badge :value="friendRequests.length" />
        </div>
      </template>

      <div v-if="friendRequests.length === 0" class="empty-state">
        暂无好友申请
      </div>

      <div v-else class="request-list">
        <div
          v-for="request in friendRequests"
          :key="request.id"
          class="request-item"
        >
          <el-avatar :size="42" :src="requestAvatar(request)" shape="square">
            {{ requestDisplayName(request).charAt(0) || "?" }}
          </el-avatar>

          <div class="request-content">
            <div class="request-name">
              {{ requestDisplayName(request) }}
            </div>
            <div class="request-message">
              {{ request.reason || "请求添加您为好友" }}
            </div>
            <div class="request-time">{{ formatTime(request.createTime) }}</div>
          </div>

          <div class="request-actions">
            <template v-if="isPendingIncomingRequest(request)">
              <el-button
                size="small"
                type="primary"
                :loading="processingRequestId === request.id"
                @click="acceptFriendRequest(request.id)"
              >
                同意
              </el-button>
              <el-button
                size="small"
                :loading="processingRequestId === request.id"
                @click="rejectFriendRequest(request.id)"
              >
                拒绝
              </el-button>
            </template>
            <el-tag
              v-else
              :type="request.status === 'ACCEPTED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'info'"
              size="small"
            >
              {{ requestStatusLabel(request.status) }}
            </el-tag>
          </div>
        </div>
      </div>
    </el-card>

    <el-card class="panel-card">
      <template #header>
        <div class="card-header">
          <span>我的好友</span>
          <span class="subtle-text">{{ filteredFriends.length }} 位联系人</span>
        </div>
      </template>

      <div v-if="loading" class="loading-block">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="filteredFriends.length === 0" class="empty-state">
        暂无联系人
      </div>

      <div v-else class="friend-list">
        <div
          v-for="friend in filteredFriends"
          :key="friend.friendId"
          class="friend-item"
          @click="openChat(friend)"
        >
          <div class="friend-avatar-wrap">
            <el-avatar :size="48" :src="friend.avatar" shape="square">
              {{ (friend.nickname || friend.username || "U").charAt(0) }}
            </el-avatar>
            <span
              class="presence-dot"
              :class="{ online: isOnline(friend.friendId) }"
            ></span>
          </div>

          <div class="friend-main">
            <div class="friend-title-row">
              <div class="friend-name">
                {{ friend.remark || friend.nickname || friend.username }}
              </div>
              <div class="friend-status">
                {{ isOnline(friend.friendId) ? "在线" : getLastSeenText(friend.lastSeen) }}
              </div>
            </div>
            <div class="friend-subtitle">
              {{ friend.signature || friend.username || friend.friendId }}
            </div>
          </div>

          <el-dropdown trigger="click" @command="handleFriendAction($event, friend)">
            <el-button link :icon="MoreFilled" @click.stop />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="chat">发送消息</el-dropdown-item>
                <el-dropdown-item command="remark">设置备注</el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  删除好友
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-card>

    <el-dialog v-model="showAddFriend" title="添加好友" width="520px">
      <el-form
        ref="addFriendFormRef"
        :model="addFriendForm"
        :rules="addFriendRules"
        label-width="90px"
      >
        <el-form-item label="搜索方式">
          <el-radio-group v-model="searchType">
            <el-radio label="username">用户名</el-radio>
            <el-radio label="email">邮箱</el-radio>
            <el-radio label="phone">手机号</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="搜索内容" prop="keyword">
          <el-input
            v-model="addFriendForm.keyword"
            :placeholder="searchPlaceholder"
            clearable
          >
            <template #append>
              <el-button :loading="searching" @click="searchUsers">搜索</el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item v-if="searchResults.length > 0" label="搜索结果">
          <div class="search-results">
            <button
              v-for="user in searchResults"
              :key="user.id"
              type="button"
              class="search-result-item interactive-reset"
              :class="{ active: selectedSearchUser?.id === user.id }"
              @click="selectedSearchUser = user"
            >
              <el-avatar :size="42" :src="user.avatar" shape="square">
                {{ (user.nickname || user.username || "U").charAt(0) }}
              </el-avatar>
              <div class="search-result-content">
                <div class="search-result-name">
                  {{ user.nickname || user.username }}
                </div>
                <div class="search-result-desc">
                  {{ user.signature || user.username }}
                </div>
              </div>
              <el-tag v-if="isFriend(user.id)" type="success" size="small">
                已是好友
              </el-tag>
            </button>
          </div>
        </el-form-item>

        <el-form-item v-if="selectedSearchUser && !isFriend(selectedSearchUser.id)" label="验证消息">
          <el-input
            v-model="addFriendForm.message"
            type="textarea"
            :rows="3"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAddFriend = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!selectedSearchUser || isFriend(selectedSearchUser.id)"
          :loading="sendingRequest"
          @click="sendFriendRequest"
        >
          发送申请
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSetRemark" title="设置备注" width="420px">
      <el-form ref="remarkFormRef" :model="remarkForm" :rules="remarkRules" label-width="80px">
        <el-form-item label="好友备注" prop="remark">
          <el-input
            v-model="remarkForm.remark"
            maxlength="20"
            show-word-limit
            placeholder="请输入好友备注"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showSetRemark = false">取消</el-button>
        <el-button type="primary" :loading="updatingRemark" @click="updateRemark">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from "element-plus";
import { ArrowLeft, MoreFilled, Plus, Search } from "@element-plus/icons-vue";
import {
  getFriendRequestAvatar,
  getFriendRequestDisplayName,
  getFriendRequestStatusLabel,
  isPendingIncomingFriendRequest,
} from "@/features/contacts/requestDisplay";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import type { Friend, FriendRequest, User } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

type SortMode = "name" | "time" | "online";
type SearchType = "username" | "email" | "phone";

const router = useRouter();
const chatStore = useChatStore();
const userStore = useUserStore();
const wsStore = useWebSocketStore();
const { capture, notifySuccess } = useErrorHandler("friends-page");

const addFriendFormRef = ref<FormInstance | null>(null);
const remarkFormRef = ref<FormInstance | null>(null);

const loading = ref(false);
const searching = ref(false);
const sendingRequest = ref(false);
const processingRequestId = ref("");
const updatingRemark = ref(false);
const showAddFriend = ref(false);
const showSetRemark = ref(false);
const searchKeyword = ref("");
const searchType = ref<SearchType>("username");
const sortBy = ref<SortMode>("name");
const searchResults = ref<User[]>([]);
const selectedSearchUser = ref<User | null>(null);
const currentFriend = ref<Friend | null>(null);

const addFriendForm = reactive({
  keyword: "",
  message: "你好，我想加你为好友。",
});

const remarkForm = reactive({
  remark: "",
});

const friends = computed(() => chatStore.friends);
const friendRequests = computed(() => chatStore.friendRequests);
const currentUserId = computed(() => String(userStore.userId || ""));
const onlineUsers = computed(() => wsStore.onlineUsers);

const searchPlaceholder = computed(() => {
  if (searchType.value === "email") return "请输入邮箱地址";
  if (searchType.value === "phone") return "请输入手机号";
  return "请输入用户名";
});

const filteredFriends = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const list = friends.value.filter((friend) => {
    if (!keyword) {
      return true;
    }
    return [friend.remark, friend.nickname, friend.username, friend.friendId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  return list.slice().sort((left, right) => {
    if (sortBy.value === "time") {
      return (
        new Date(right.createTime || right.createdAt || 0).getTime() -
        new Date(left.createTime || left.createdAt || 0).getTime()
      );
    }
    if (sortBy.value === "online") {
      const leftOnline = isOnline(left.friendId);
      const rightOnline = isOnline(right.friendId);
      if (leftOnline === rightOnline) {
        return displayFriendName(left).localeCompare(displayFriendName(right), "zh-CN");
      }
      return leftOnline ? -1 : 1;
    }
    return displayFriendName(left).localeCompare(displayFriendName(right), "zh-CN");
  });
});

const addFriendRules: FormRules = {
  keyword: [{ required: true, message: "请输入搜索内容", trigger: "blur" }],
};

const remarkRules: FormRules = {
  remark: [{ max: 20, message: "备注长度不能超过 20 个字符", trigger: "blur" }],
};

const displayFriendName = (friend: Friend) =>
  friend.remark || friend.nickname || friend.username || friend.friendId;

const requestDisplayName = (request: FriendRequest) =>
  getFriendRequestDisplayName(request, currentUserId.value);

const requestAvatar = (request: FriendRequest) =>
  getFriendRequestAvatar(request, currentUserId.value);

const requestStatusLabel = (status: FriendRequest["status"]) =>
  getFriendRequestStatusLabel(status);

const isPendingIncomingRequest = (request: FriendRequest) =>
  isPendingIncomingFriendRequest(request, currentUserId.value);

const isOnline = (userId: string) => onlineUsers.value.has(String(userId));

const isFriend = (userId: string) =>
  friends.value.some((friend) => String(friend.friendId) === String(userId));

const getLastSeenText = (lastSeen?: string) => {
  if (!lastSeen) return "离线";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "刚刚在线";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前在线`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前在线`;
  return `${Math.floor(diff / 86_400_000)} 天前在线`;
};

const formatTime = (value?: string) => {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const loadData = async () => {
  loading.value = true;
  try {
    await Promise.all([
      chatStore.loadFriends(),
      chatStore.loadFriendRequests(),
    ]);
  } catch (error) {
    capture(error, "加载联系人失败");
  } finally {
    loading.value = false;
  }
};

const searchUsers = async () => {
  if (!addFriendFormRef.value) {
    return;
  }
  try {
    await addFriendFormRef.value.validate();
    searching.value = true;
    const users = await chatStore.searchUsers({
      type: searchType.value,
      keyword: addFriendForm.keyword.trim(),
    });
    searchResults.value = users.filter((user) => user.id !== currentUserId.value);
    selectedSearchUser.value = searchResults.value[0] || null;
  } catch (error) {
    capture(error, "搜索用户失败");
  } finally {
    searching.value = false;
  }
};

const sendFriendRequest = async () => {
  if (!selectedSearchUser.value) {
    return;
  }
  try {
    sendingRequest.value = true;
    await chatStore.sendFriendRequest({
      userId: selectedSearchUser.value.id,
      message: addFriendForm.message,
    });
    notifySuccess("好友申请已发送");
    showAddFriend.value = false;
    searchResults.value = [];
    selectedSearchUser.value = null;
    Object.assign(addFriendForm, {
      keyword: "",
      message: "你好，我想加你为好友。",
    });
    await chatStore.loadFriendRequests();
  } catch (error) {
    capture(error, "发送好友申请失败");
  } finally {
    sendingRequest.value = false;
  }
};

const acceptFriendRequest = async (requestId: string) => {
  try {
    processingRequestId.value = requestId;
    await chatStore.acceptFriendRequest(requestId);
    notifySuccess("已通过好友申请");
  } catch (error) {
    capture(error, "处理好友申请失败");
  } finally {
    processingRequestId.value = "";
  }
};

const rejectFriendRequest = async (requestId: string) => {
  try {
    processingRequestId.value = requestId;
    await chatStore.rejectFriendRequest(requestId);
    notifySuccess("已拒绝好友申请");
  } catch (error) {
    capture(error, "处理好友申请失败");
  } finally {
    processingRequestId.value = "";
  }
};

const openChat = async (friend: Friend) => {
  try {
    await chatStore.openPrivateSession({
      targetId: friend.friendId,
      targetName: displayFriendName(friend),
      targetAvatar: friend.avatar,
    });
    await router.push("/chat");
  } catch (error) {
    capture(error, "打开会话失败");
  }
};

const deleteFriend = async (friend: Friend) => {
  try {
    await ElMessageBox.confirm(
      `确定删除好友“${displayFriendName(friend)}”吗？`,
      "删除好友",
      {
        type: "warning",
        confirmButtonText: "确定",
        cancelButtonText: "取消",
      },
    );
    await chatStore.deleteFriend(friend.friendId);
    notifySuccess("好友已删除");
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "删除好友失败");
    }
  }
};

const updateRemark = async () => {
  if (!remarkFormRef.value || !currentFriend.value) {
    return;
  }
  try {
    await remarkFormRef.value.validate();
    updatingRemark.value = true;
    await chatStore.updateFriendRemark(currentFriend.value.friendId, remarkForm.remark.trim());
    notifySuccess("备注已更新");
    showSetRemark.value = false;
  } catch (error) {
    capture(error, "更新备注失败");
  } finally {
    updatingRemark.value = false;
  }
};

const handleFriendAction = async (command: string, friend: Friend) => {
  if (command === "chat") {
    await openChat(friend);
    return;
  }
  if (command === "remark") {
    currentFriend.value = friend;
    remarkForm.remark = friend.remark || "";
    showSetRemark.value = true;
    return;
  }
  if (command === "delete") {
    await deleteFriend(friend);
  }
};

onMounted(() => {
  void loadData();
});
</script>

<style scoped lang="scss">
.interactive-reset {
  border: 0;
  background: transparent;
  padding: 0;
  width: 100%;
  text-align: left;
}

.friends-page {
  min-height: 100%;
  padding: 20px;
  background: #f5f7fa;
}

.page-header,
.toolbar,
.card-header,
.request-item,
.friend-item,
.friend-title-row {
  display: flex;
  align-items: center;
}

.page-header {
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.toolbar {
  gap: 12px;
  margin-bottom: 20px;
}

.sort-select {
  width: 140px;
}

.panel-card + .panel-card {
  margin-top: 20px;
}

.card-header {
  justify-content: space-between;
  width: 100%;
}

.subtle-text {
  color: #909399;
  font-size: 13px;
}

.request-list,
.friend-list,
.search-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.request-item,
.friend-item,
.search-result-item {
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  background: #f8fafc;
}

.friend-item {
  cursor: pointer;
}

.friend-item:hover,
.search-result-item:hover,
.search-result-item.active {
  background: #eef5ff;
}

.request-content,
.friend-main,
.search-result-content {
  flex: 1;
  min-width: 0;
}

.request-name,
.friend-name,
.search-result-name {
  font-weight: 600;
  color: #303133;
}

.request-message,
.request-time,
.friend-status,
.friend-subtitle,
.search-result-desc {
  font-size: 13px;
  color: #909399;
}

.friend-avatar-wrap {
  position: relative;
}

.presence-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c0c4cc;
  border: 2px solid #fff;
}

.presence-dot.online {
  background: #67c23a;
}

.empty-state,
.loading-block {
  padding: 24px 0;
}

@media (max-width: 768px) {
  .friends-page {
    padding: 16px;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .sort-select {
    width: 100%;
  }
}
</style>
