<template>
  <div class="friends-container">
    <div class="friends-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>联系人</h2>
      <el-button type="primary" :icon="Plus" @click="showAddFriend = true"
        >添加好友</el-button
      >
    </div>

    <div class="friends-content">
      <!-- 搜索栏 -->
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索联系人"
          :prefix-icon="Search"
          clearable
          @input="handleSearch"
          class="search-input"
        />
      </div>

      <!-- 好友申请 -->
      <el-card class="requests-card">
        <template #header>
          <div class="card-header">
            <span>好友申请 (调试可见)</span>
            <el-badge :value="friendRequests.length" class="badge" />
          </div>
        </template>
        
        <div v-if="friendRequests.length === 0" style="padding: 20px; text-align: center; color: #999;">
          暂无好友申请数据，或正在加载...
        </div>

        <div class="request-list" v-else>
          <div
            v-for="request in friendRequests"
            :key="request.id"
            class="request-item"
          >
            <!-- 头像和信息展示：如果是别人发给我的，显示申请人；如果是我发给别人的，显示目标用户 -->
            <el-avatar
                :size="40"
                :src="String(request.applicantId) === String(userStore.userId) ? request.targetAvatar : (request.applicantAvatar || request.avatar || request.fromUser?.avatar)"
              >
                {{
                  String(request.applicantId) === String(userStore.userId) ?
                  (request.targetNickname?.charAt(0) || request.targetUsername?.charAt(0) || "?") :
                  (request.applicantNickname?.charAt(0) ||
                  request.applicantUsername?.charAt(0) ||
                  request.nickname?.charAt(0) ||
                  request.fromUser?.nickname?.charAt(0) ||
                  request.username?.charAt(0) ||
                  request.fromUser?.username?.charAt(0) ||
                  "?")
                }}
              </el-avatar>
              <div class="request-info">
                <div class="request-name">
                  <span v-if="String(request.applicantId) === String(userStore.userId)" style="color: #909399; font-size: 12px; margin-right: 4px;">发给:</span>
                  {{
                    String(request.applicantId) === String(userStore.userId) ?
                    (request.targetNickname || request.targetUsername) :
                    (request.applicantNickname ||
                    request.applicantUsername ||
                    request.nickname ||
                    request.fromUser?.nickname ||
                    request.username ||
                    request.fromUser?.username)
                  }}
                </div>
                <div class="request-message">
                  {{ request.reason || request.message || "请求添加为好友" }}
                </div>
              <div class="request-time">
                {{ formatTime(request.createTime) }}
              </div>
            </div>

            <!-- 操作按钮：只允许操作别人发给我的请求，且状态为待处理(0/待处理) -->
            <div class="request-actions">
              <template v-if="String(request.applicantId) !== String(userStore.userId) && (request.status === 0 || request.status === '待处理' || request.status === 'PENDING')">
                <el-button
                  type="primary"
                  size="small"
                  @click="acceptFriendRequest(request.id)"
                  :loading="processingRequest === request.id"
                >
                  同意
                </el-button>
                <el-button
                  size="small"
                  @click="rejectFriendRequest(request.id)"
                  :loading="processingRequest === request.id"
                >
                  拒绝
                </el-button>
              </template>
              <template v-else-if="String(request.applicantId) === String(userStore.userId) && (request.status === 0 || request.status === '待处理' || request.status === 'PENDING')">
                <el-tag type="info" size="small">等待验证</el-tag>
              </template>
              <template v-else>
                <el-tag :type="request.status === 1 || request.status === '已同意' || request.status === 'ACCEPTED' ? 'success' : 'danger'" size="small">
                  {{ request.status === 1 || request.status === '已同意' || request.status === 'ACCEPTED' ? '已同意' : '已拒绝' }}
                </el-tag>
              </template>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 好友列表 -->
      <el-card class="friends-card">
        <template #header>
          <div class="card-header">
            <span>我的好友 ({{ filteredFriends.length }})</span>
            <el-dropdown @command="handleSortCommand">
              <el-button link :icon="Sort">
                排序 <el-icon class="el-icon--right"><arrow-down /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="name">按姓名</el-dropdown-item>
                  <el-dropdown-item command="time">按添加时间</el-dropdown-item>
                  <el-dropdown-item command="online"
                    >按在线状态</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>

        <div v-if="loading" class="loading-container">
          <el-skeleton :rows="5" animated />
        </div>

        <div v-else-if="filteredFriends.length === 0" class="empty-container">
          <el-empty description="暂无好友" />
        </div>

        <div v-else class="friends-list">
          <div
            v-for="friend in filteredFriends"
            :key="friend.id"
            class="friend-item"
            @click="openChat(friend)"
          >
            <div class="friend-avatar-container">
              <el-avatar :size="50" :src="friend.avatar">
                {{
                  friend.nickname?.charAt(0) ||
                  friend.username?.charAt(0) ||
                  "U"
                }}
              </el-avatar>
              <div v-if="isOnline(friend.friendId)" class="online-indicator"></div>
            </div>

            <div class="friend-info">
              <div class="friend-name">
                {{ friend.nickname || friend.username }}
              </div>
              <div class="friend-status">
                <span v-if="isOnline(friend.friendId)" class="online-text">在线</span>
                <span v-else class="offline-text">{{
                  getLastSeenText(friend.lastSeen)
                }}</span>
              </div>
              <div v-if="friend.signature" class="friend-signature">
                {{ friend.signature }}
              </div>
            </div>

            <div class="friend-actions">
              <el-dropdown @command="handleFriendAction($event, friend)">
                <el-button link :icon="MoreFilled" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="chat">
                      <el-icon><ChatDotRound /></el-icon>
                      发送消息
                    </el-dropdown-item>
                    <el-dropdown-item command="profile">
                      <el-icon><User /></el-icon>
                      查看资料
                    </el-dropdown-item>
                    <el-dropdown-item command="remark">
                      <el-icon><Edit /></el-icon>
                      设置备注
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
                      <el-icon><Delete /></el-icon>
                      删除好友
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 添加好友对话框 -->
    <el-dialog v-model="showAddFriend" title="添加好友" width="500px">
      <el-form
        ref="addFriendFormRef"
        :model="addFriendForm"
        :rules="addFriendRules"
        label-width="100px"
      >
        <el-form-item label="搜索方式">
          <el-radio-group v-model="searchType">
            <el-radio label="username">用户名</el-radio>
            <el-radio label="email">邮箱</el-radio>
            <el-radio label="phone">手机号</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="getSearchLabel()" prop="keyword">
          <el-input
            v-model="addFriendForm.keyword"
            :placeholder="getSearchPlaceholder()"
            clearable
          >
            <template #append>
              <el-button @click="searchUser" :loading="searching">
                搜索
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <!-- 搜索结果 -->
        <div v-if="searchResult" class="search-result">
          <div class="user-card">
            <el-avatar :size="60" :src="searchResult.avatar">
              {{
                searchResult.nickname?.charAt(0) ||
                searchResult.username?.charAt(0) ||
                "U"
              }}
            </el-avatar>

            <div class="user-info">
              <div class="user-name">
                {{ searchResult.nickname || searchResult.username }}
              </div>
              <div class="user-desc">
                {{ searchResult.signature || "这个人很懒，什么都没留下" }}
              </div>
            </div>

            <el-button
              v-if="!isFriend(searchResult.id)"
              type="primary"
              @click="sendFriendRequest"
              :loading="sendingRequest"
            >
              添加好友
            </el-button>
            <el-tag v-else type="success">已是好友</el-tag>
          </div>

          <el-form-item
            v-if="!isFriend(searchResult.id)"
            label="验证消息"
            prop="message"
          >
            <el-input
              v-model="addFriendForm.message"
              type="textarea"
              :rows="3"
              placeholder="请输入验证消息"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="showAddFriend = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- 设置备注对话框 -->
    <el-dialog v-model="showSetRemark" title="设置备注" width="400px">
      <el-form
        ref="remarkFormRef"
        :model="remarkForm"
        :rules="remarkRules"
        label-width="80px"
      >
        <el-form-item label="好友备注" prop="remark">
          <el-input
            v-model="remarkForm.remark"
            placeholder="请输入好友备注"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showSetRemark = false">取消</el-button>
        <el-button
          type="primary"
          @click="updateRemark"
          :loading="updatingRemark"
        >
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from "element-plus";
import {
  ArrowLeft,
  Plus,
  Search,
  Sort,
  MoreFilled,
  ChatDotRound,
  User,
  Edit,
  Delete,
  ArrowDown,
} from "@element-plus/icons-vue";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import type { Friend, UserInfo } from "@/types";

// 路由
const router = useRouter();

// 状态管理
const chatStore = useChatStore();
const userStore = useUserStore();
const wsStore = useWebSocketStore();

// 引用
const addFriendFormRef = ref<FormInstance>();
const remarkFormRef = ref<FormInstance>();

// 响应式数据
const loading = ref(false);
const searching = ref(false);
const sendingRequest = ref(false);
const processingRequest = ref("");
const updatingRemark = ref(false);
const showAddFriend = ref(false);
const showSetRemark = ref(false);
const searchKeyword = ref("");
const searchType = ref("username");
const sortBy = ref("name");
const searchResult = ref<UserInfo | null>(null);
const currentFriend = ref<Friend | null>(null);

// 表单数据
const addFriendForm = reactive({
  keyword: "",
  message: "我是通过搜索添加您为好友的，请通过验证。",
});

const remarkForm = reactive({
  remark: "",
});

// 计算属性
const friends = computed(() => chatStore.friends || []);
const friendRequests = computed(() => chatStore.friendRequests || []);
const onlineUsers = computed(() => wsStore.onlineUsers || new Set());

const filteredFriends = computed(() => {
  let result = [...friends.value];

  // 搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    result = result.filter(
      (friend) =>
        (friend.nickname || friend.username || "")
          .toLowerCase()
          .includes(keyword) ||
        (friend.remark || "").toLowerCase().includes(keyword),
    );
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case "name":
        return (a.nickname || a.username || "").localeCompare(
          b.nickname || b.username || "",
        );
      case "time":
        return (
          new Date(b.createTime || 0).getTime() -
          new Date(a.createTime || 0).getTime()
        );
      case "online": {
        const aOnline = isOnline(a.friendId);
        const bOnline = isOnline(b.friendId);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return 0;
      }
      default:
        return 0;
    }
  });

  return result;
});

// 表单验证规则
const addFriendRules: FormRules = {
  keyword: [{ required: true, message: "请输入搜索关键词", trigger: "blur" }],
};

const remarkRules: FormRules = {
  remark: [{ max: 20, message: "备注长度不能超过20个字符", trigger: "blur" }],
};

// 方法
const isOnline = (userId: string): boolean => {
  return onlineUsers.value.has(userId);
};

const getLastSeenText = (lastSeen?: string): string => {
  if (!lastSeen) return "很久之前在线";

  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diff = now.getTime() - lastSeenDate.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "刚刚在线";
  if (minutes < 60) return `${minutes}分钟前在线`;
  if (hours < 24) return `${hours}小时前在线`;
  if (days < 7) return `${days}天前在线`;
  return "很久之前在线";
};

const formatTime = (time?: string): string => {
  if (!time) return "";

  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

  return date.toLocaleDateString("zh-CN");
};

const getSearchLabel = (): string => {
  switch (searchType.value) {
    case "username":
      return "用户名";
    case "email":
      return "邮箱";
    case "phone":
      return "手机号";
    default:
      return "关键词";
  }
};

const getSearchPlaceholder = (): string => {
  switch (searchType.value) {
    case "username":
      return "请输入用户名";
    case "email":
      return "请输入邮箱地址";
    case "phone":
      return "请输入手机号";
    default:
      return "请输入搜索关键词";
  }
};

const isFriend = (userId: string): boolean => {
  return friends.value.some((friend) => friend.id === userId);
};

const handleSearch = () => {
  // 实时搜索，这里可以添加防抖逻辑
};

const handleSortCommand = (command: string) => {
  sortBy.value = command;
};

const searchUser = async () => {
  if (!addFriendFormRef.value) return;

  try {
    await addFriendFormRef.value.validate();
    searching.value = true;

    const result = await chatStore.searchUsers({
      type: searchType.value,
      keyword: addFriendForm.keyword,
    });

    if (result && result.length > 0) {
      searchResult.value = result[0];
    } else {
      searchResult.value = null;
      ElMessage.warning("未找到相关用户");
    }
  } catch (error: any) {
    ElMessage.error(error.message || "搜索失败");
  } finally {
    searching.value = false;
  }
};

const sendFriendRequest = async () => {
  if (!searchResult.value) return;

  try {
    sendingRequest.value = true;

    await chatStore.sendFriendRequest({
      userId: searchResult.value.id,
      message: addFriendForm.message,
    });

    ElMessage.success("好友申请已发送");
    showAddFriend.value = false;

    // 主动刷新好友申请列表
    await chatStore.loadFriendRequests();

    // 重置表单
    Object.assign(addFriendForm, {
      keyword: "",
      message: "我是通过搜索添加您为好友的，请通过验证。",
    });
    searchResult.value = null;
  } catch (error: any) {
    ElMessage.error(error.message || "发送好友申请失败");
  } finally {
    sendingRequest.value = false;
  }
};

const acceptFriendRequest = async (requestId: string) => {
  try {
    processingRequest.value = requestId;

    await chatStore.acceptFriendRequest(requestId);
    ElMessage.success("已同意好友申请");
  } catch (error: any) {
    ElMessage.error(error.message || "处理好友申请失败");
  } finally {
    processingRequest.value = "";
  }
};

const rejectFriendRequest = async (requestId: string) => {
  try {
    processingRequest.value = requestId;

    await chatStore.rejectFriendRequest(requestId);
    ElMessage.success("已拒绝好友申请");
  } catch (error: any) {
    ElMessage.error(error.message || "处理好友申请失败");
  } finally {
    processingRequest.value = "";
  }
};

const openChat = (friend: Friend) => {
  chatStore.setCurrentSession({
    id: `private_${friend.friendId}`,
    type: "private",
    targetId: friend.friendId,
    targetName: friend.nickname || friend.username || "",
    targetAvatar: friend.avatar,
    lastMessage: "",
    lastActiveTime: "",
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
  });

  router.push("/chat");
};

const handleFriendAction = async (command: string, friend: Friend) => {
  switch (command) {
    case "chat":
      openChat(friend);
      break;

    case "profile":
      router.push({
        path: "/profile",
        query: { userId: friend.friendId },
      });
      break;

    case "remark":
      currentFriend.value = friend;
      remarkForm.remark = friend.remark || "";
      showSetRemark.value = true;
      break;

    case "delete":
      try {
        await ElMessageBox.confirm(
          `确定要删除好友 "${friend.nickname || friend.username}" 吗？`,
          "删除好友",
          {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            type: "warning",
          },
        );

        await chatStore.deleteFriend(friend.id);
        ElMessage.success("已删除好友");
      } catch (error: any) {
        if (error !== "cancel") {
          ElMessage.error(error.message || "删除好友失败");
        }
      }
      break;
  }
};

const updateRemark = async () => {
  if (!remarkFormRef.value || !currentFriend.value) return;

  try {
    await remarkFormRef.value.validate();
    updatingRemark.value = true;

    await chatStore.updateFriendRemark(
      currentFriend.value.id,
      remarkForm.remark,
    );

    ElMessage.success("备注设置成功");
    showSetRemark.value = false;
  } catch (error: any) {
    ElMessage.error(error.message || "设置备注失败");
  } finally {
    updatingRemark.value = false;
  }
};

const loadFriends = async () => {
  try {
    loading.value = true;
    await chatStore.loadFriends();
    await chatStore.loadFriendRequests();
  } catch (error: any) {
    ElMessage.error(error.message || "加载好友列表失败");
  } finally {
    loading.value = false;
  }
};

// 监听搜索类型变化，清空搜索结果
watch(searchType, () => {
  addFriendForm.keyword = "";
  searchResult.value = null;
});

// 组件挂载
onMounted(() => {
  loadFriends();
});
</script>

<style scoped>
.friends-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px;
}

.friends-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 20px;
}

.friends-header h2 {
  margin: 0;
  color: #2c3e50;
  font-weight: 500;
}

.friends-content {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-section {
  display: flex;
  justify-content: center;
}

.search-input {
  max-width: 400px;
}

.requests-card,
.friends-card {
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
  color: #2c3e50;
}

.badge {
  margin-left: 8px;
}

.loading-container,
.empty-container {
  padding: 40px 0;
  text-align: center;
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.request-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.request-info {
  flex: 1;
}

.request-name {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.request-message {
  color: #6c757d;
  font-size: 14px;
  margin-bottom: 4px;
}

.request-time {
  color: #95a5a6;
  font-size: 12px;
}

.request-actions {
  display: flex;
  gap: 8px;
}

.friends-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e9ecef;
  cursor: pointer;
  transition: all 0.2s;
}

.friend-item:hover {
  background: #f8f9fa;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.friend-avatar-container {
  position: relative;
}

.online-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  background: #52c41a;
  border: 2px solid white;
  border-radius: 50%;
}

.friend-info {
  flex: 1;
}

.friend-name {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.friend-status {
  margin-bottom: 4px;
}

.online-text {
  color: #52c41a;
  font-size: 12px;
}

.offline-text {
  color: #95a5a6;
  font-size: 12px;
}

.friend-signature {
  color: #6c757d;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.friend-item:hover .friend-actions {
  opacity: 1;
}

.search-result {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e9ecef;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
  margin-bottom: 20px;
}

.user-info {
  flex: 1;
}

.user-name {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.user-desc {
  color: #6c757d;
  font-size: 14px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .friends-container {
    padding: 10px;
  }

  .friends-header {
    padding: 0 10px;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }

  .request-item,
  .friend-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .request-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .friend-actions {
    opacity: 1;
  }

  .user-card {
    flex-direction: column;
    text-align: center;
  }
}
</style>
