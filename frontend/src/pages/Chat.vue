<template>
  <div class="chat-container">
    <SideNavBar
      :active-tab="activeTab"
      :unread-count="chatStore.totalUnreadCount"
      :pending-requests="pendingRequestsCount"
      @change-tab="handleTabChange"
      @settings="$router.push('/settings')"
      class="side-nav-bar"
    />

    <!-- 列表区域 -->
    <div class="list-panel" :class="{ 'hidden-mobile': isChatActiveOnMobile }">
      <!-- 搜索框 -->
      <div class="search-box">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索"
          prefix-icon="Search"
          clearable
          aria-label="搜索联系人或群组"
          @input="handleSearch"
        />
        <div class="add-btn" v-if="activeTab !== 'chat'">
          <el-button
            v-if="activeTab === 'contacts'"
            size="small"
            :icon="Plus"
            circle
            aria-label="添加好友"
            @click="showAddFriend = true"
            title="添加好友"
          />
          <el-button
            v-if="activeTab === 'groups'"
            size="small"
            :icon="Plus"
            circle
            aria-label="创建群组"
            @click="showCreateGroup = true"
            title="创建群组"
          />
        </div>
      </div>

      <!-- 好友申请提示 (仅在联系人Tab显示) -->
      <div
        v-if="activeTab === 'contacts' && pendingRequestsCount > 0"
        class="friend-request-alert"
        @click="$router.push('/contacts')"
      >
        <el-alert
          :title="`新的朋友 (${pendingRequestsCount})`"
          type="info"
          :closable="false"
          show-icon
        />
      </div>

      <!-- 会话列表 -->
      <div class="session-list" v-show="activeTab === 'chat'" role="list">
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="session-item"
          :class="{
            active:
              currentSession &&
              String(currentSession.id) === String(session.id),
          }"
          @click="selectSession(session)"
          role="listitem"
          tabindex="0"
          @keydown.enter="selectSession(session)"
        >
          <el-avatar :size="40" :src="session.targetAvatar" shape="square">
            {{ session.targetName?.charAt(0) || "U" }}
          </el-avatar>
          <div class="session-info">
            <div class="session-header">
              <span class="session-name">{{ session.targetName }}</span>
              <span class="session-time">{{
                formatTime(session.lastActiveTime || "")
              }}</span>
            </div>
            <div class="session-content">
              <span class="last-message">{{
                getLastMessagePreview(session.lastMessage)
              }}</span>
              <el-badge
                v-if="session.unreadCount > 0"
                :value="session.unreadCount"
                class="unread-badge"
                :max="99"
              />
            </div>
          </div>
        </div>

        <el-empty
          v-if="filteredSessions.length === 0"
          description="暂无消息"
          :image-size="60"
        />
      </div>

      <!-- 联系人列表 -->
      <div class="contact-list" v-show="activeTab === 'contacts'" role="list">
        <template v-if="groupedContacts.length > 0">
          <div
            v-for="group in groupedContacts"
            :key="group.key"
            class="contact-group"
          >
            <div class="group-header">{{ group.key }}</div>
            <div
              v-for="contact in group.contacts"
              :key="contact.id"
              class="contact-item"
              @click="startChat(contact)"
              role="listitem"
              tabindex="0"
            >
              <el-avatar :size="36" :src="contact.avatar" shape="square">
                {{ contact.nickname?.charAt(0) || "U" }}
              </el-avatar>
              <div class="contact-info">
                <div class="contact-name">{{ contact.nickname }}</div>
              </div>
            </div>
          </div>
        </template>

        <el-empty v-else description="暂无联系人" :image-size="60" />
      </div>

      <!-- 群组列表 -->
      <div class="group-list" v-show="activeTab === 'groups'" role="list">
        <div
          v-for="group in filteredGroups"
          :key="group.id"
          class="group-item"
          @click="startGroupChat(group)"
          role="listitem"
          tabindex="0"
        >
          <el-avatar :size="36" :src="group.avatar" shape="square">
            {{ group.groupName?.charAt(0) || "G" }}
          </el-avatar>
          <div class="group-info">
            <div class="group-name">{{ group.groupName }}</div>
          </div>
        </div>

        <el-empty
          v-if="filteredGroups.length === 0"
          description="暂无群组"
          :image-size="60"
        />
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-main" :class="{ 'active-mobile': isChatActiveOnMobile }">
      <div v-if="!currentSession" class="chat-welcome">
        <div class="welcome-content">
          <el-icon :size="60" color="#dcdfe6"><ChatDotRound /></el-icon>
          <p>微信，连接你我他</p>
        </div>
      </div>

      <div v-else class="chat-content">
        <!-- 聊天头部 -->
        <div class="chat-header">
          <div class="mobile-back" @click="clearSession">
            <el-icon><ArrowLeft /></el-icon>
          </div>
          <div class="chat-title">
            {{ currentSession.targetName }}
            <span v-if="currentSession.type === 'group'"
              >({{ (currentSession as any).memberCount || 0 }})</span
            >
          </div>
          <div class="chat-actions">
            <el-button link :icon="MoreFilled" aria-label="更多选项" />
          </div>
        </div>

        <!-- 消息列表 -->
        <div
          ref="messageListRef"
          class="message-list"
          role="log"
          aria-live="polite"
          @scroll="handleMessageScroll"
        >
          <MessageItem
            v-for="message in currentMessages"
            :key="message.id"
            :message="message"
            :current-user-id="String(userStore.userId)"
            :current-user-name="
              userStore.userInfo?.username || userStore.nickname
            "
            :current-user-avatar="userStore.avatar"
            @show-group-readers="openGroupReadDialog"
          />
        </div>

        <!-- 输入区域 -->
        <div class="input-area">
          <div class="input-toolbar">
            <el-button
              link
              :icon="Picture"
              title="发送图片"
              aria-label="发送图片"
              @click="selectImage"
            />
            <el-button
              link
              :icon="Paperclip"
              title="发送文件"
              aria-label="发送文件"
              @click="selectFile"
            />
            <el-button
              link
              :icon="isVoiceMode ? 'ChatLineSquare' : Microphone"
              :title="isVoiceMode ? '切换键盘' : '语音消息'"
              :aria-label="isVoiceMode ? '切换键盘' : '语音消息'"
              @click="toggleVoiceMode"
            />
          </div>
          <div class="input-box">
            <textarea
              v-if="!isVoiceMode"
              v-model="messageInput"
              class="chat-textarea"
              placeholder=""
              aria-label="消息输入框"
              @keydown.enter.exact.prevent="sendMessage"
              @keydown.enter.shift.exact="handleShiftEnter"
            ></textarea>

            <div v-else class="voice-input-area">
              <el-button
                class="voice-record-btn"
                :class="{ 'is-recording': isRecording }"
                @mousedown="startRecording"
                @mouseup="stopRecording"
                @mouseleave="cancelRecording"
                @touchstart.prevent="startRecording"
                @touchend.prevent="stopRecording"
              >
                {{ isRecording ? "松开 发送" : "按住 说话" }}
              </el-button>
              <div v-if="isRecording" class="recording-indicator">
                <div class="recording-waves">
                  <span></span><span></span><span></span><span></span
                  ><span></span>
                </div>
                <div class="recording-text">正在录音...</div>
              </div>
            </div>
          </div>
          <div class="input-actions" v-if="!isVoiceMode">
            <span class="tip">Enter 发送，Shift + Enter 换行</span>
            <el-button
              class="send-btn"
              @click="sendMessage"
              :disabled="!messageInput.trim()"
              :loading="isSending"
            >
              发送
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加好友对话框 -->
    <el-dialog
      v-model="showAddFriend"
      title="添加好友"
      width="400px"
      append-to-body
    >
      <el-form :model="addFriendForm" label-width="80px">
        <el-form-item label="用户名">
          <el-select
            v-model="addFriendForm.targetUserId"
            filterable
            remote
            reserve-keyword
            placeholder="输入用户名搜索"
            :remote-method="handleUserSearch"
            :loading="isSearchingUsers"
            style="width: 100%"
          >
            <el-option
              v-for="item in userSearchResults"
              :key="item.id"
              :label="item.nickname || item.username"
              :value="item.id"
            >
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                "
              >
                <span>{{ item.nickname || item.username }}</span>
                <span
                  style="color: #8492a6; font-size: 13px; margin-left: 10px"
                  >{{ item.username }}</span
                >
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="验证消息">
          <el-input
            v-model="addFriendForm.message"
            placeholder="请输入验证消息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddFriend = false">取消</el-button>
        <el-button type="primary" @click="addFriend">发送请求</el-button>
      </template>
    </el-dialog>

    <!-- 创建群组对话框 -->
    <el-dialog
      v-model="showCreateGroup"
      title="创建群组"
      width="500px"
      append-to-body
    >
      <el-form :model="createGroupForm" label-width="80px">
        <el-form-item label="群组名称">
          <el-input
            v-model="createGroupForm.name"
            placeholder="请输入群组名称"
          />
        </el-form-item>
        <el-form-item label="群组描述">
          <el-input
            v-model="createGroupForm.description"
            placeholder="请输入群组描述"
          />
        </el-form-item>
        <el-form-item label="选择成员">
          <el-transfer
            v-model="createGroupForm.memberIds"
            :data="contactsForTransfer"
            :titles="['可选联系人', '群组成员']"
            filterable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateGroup = false">取消</el-button>
        <el-button type="primary" @click="createGroup">创建群组</el-button>
      </template>
    </el-dialog>
    <el-dialog
      v-model="showGroupReadDialog"
      :title="groupReadDialogTitle"
      width="360px"
      append-to-body
    >
      <div v-if="groupReadUsers.length === 0" class="group-read-empty">
        暂无已读成员
      </div>
      <div v-else class="group-read-list">
        <div
          v-for="reader in groupReadUsers"
          :key="reader.userId"
          class="group-read-item"
        >
          <span class="group-read-name">{{ reader.displayName }}</span>
          <span class="group-read-id">ID: {{ reader.userId }}</span>
        </div>
      </div>
    </el-dialog>

    <!-- 隐藏的文件输入 -->
    <input
      ref="imageInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleImageSelect"
    />
    <input
      ref="fileInputRef"
      type="file"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  ChatDotRound,
  Plus,
  MoreFilled,
  Picture,
  Paperclip,
  Microphone,
  ChatLineSquare,
  Search,
  ArrowLeft,
} from "@element-plus/icons-vue";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import { useChatStore } from "@/stores/chat";
import { fileService } from "@/services";
import MessageItem from "@/components/MessageItem.vue";
import SideNavBar from "@/components/layout/SideNavBar.vue";
import type { ChatSession, UserInfo } from "@/types";
import type { Friendship } from "@/types/user";
import type { Group } from "@/types/group";

// Composables
import { useVoice } from "@/hooks/useVoice";
import { useChatLogic } from "@/hooks/useChatLogic";

// 路由
const router = useRouter();

// 状态管理
const userStore = useUserStore();
const wsStore = useWebSocketStore();
const chatStore = useChatStore();

// Composable usage
const {
  isVoiceMode,
  isRecording,
  toggleVoiceMode,
  startRecording,
  stopRecording,
  cancelRecording,
} = useVoice();

const {
  activeTab,
  searchKeyword,
  showAddFriend,
  showCreateGroup,
  userSearchResults,
  isSearchingUsers,
  addFriendForm,
  createGroupForm,
  filteredSessions,
  groupedContacts,
  filteredGroups,
  contactsForTransfer,
  handleSearch,
  handleUserSearch,
  addFriend,
  createGroup,
} = useChatLogic();

// 引用
const messageListRef = ref<HTMLElement>();
const imageInputRef = ref<HTMLInputElement>();
const fileInputRef = ref<HTMLInputElement>();

// 响应式数据
const messageInput = ref("");
const isSending = ref(false);

// 计算属性
const currentMessages = computed(() => {
  return chatStore.currentMessages;
});

const currentSession = computed(() => {
  return chatStore.currentSession;
});

const showGroupReadDialog = ref(false);
const groupReadDialogTitle = ref("群消息已读成员");
const groupReadUsers = ref<Array<{ userId: string; displayName: string }>>([]);

const pendingRequestsCount = computed(() => {
  return (
    chatStore.friendRequests?.filter((req) => req.status === "PENDING")
      .length || 0
  );
});

const isChatActiveOnMobile = computed(() => {
  return !!currentSession.value;
});

// 方法
const handleTabChange = (tabName: string) => {
  activeTab.value = tabName;
  searchKeyword.value = "";
};

const selectSession = (session: ChatSession) => {
  chatStore.setCurrentSession(session);
  chatStore.markAsRead(session.id);
  chatStore.loadMessages(session.id);
  scrollToBottom();
};

const clearSession = () => {
  chatStore.currentSession = null;
};

const startChat = (contact: any) => {
  const session = chatStore.createOrGetSession(
    "private",
    contact.friendId,
    contact.nickname ||
      contact.friend?.nickname ||
      contact.friend?.username ||
      contact.username ||
      "",
    contact.avatar || contact.friend?.avatar || "",
  );
  if (session) {
    selectSession(session);
    activeTab.value = "chat";
  } else {
    ElMessage.error("无法创建聊天会话，请先登录");
  }
};

const startGroupChat = (group: Group) => {
  const session = chatStore.createOrGetSession(
    "group",
    group.id?.toString() || "",
    group.groupName || "",
    group.avatar,
  );
  if (session) {
    selectSession(session);
    activeTab.value = "chat";
  } else {
    ElMessage.error("无法创建群聊会话，请先登录");
  }
};

const sendMessage = async () => {
  if (!messageInput.value.trim() || !currentSession.value) return;

  isSending.value = true;
  try {
    await chatStore.sendMessage(messageInput.value.trim(), "TEXT");
    messageInput.value = "";
    scrollToBottom();
  } catch (error: any) {
    ElMessage.error(error.message || "发送失败");
  } finally {
    isSending.value = false;
  }
};

const handleShiftEnter = (event: KeyboardEvent) => {
  const textarea = event.target as HTMLTextAreaElement;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  messageInput.value =
    messageInput.value.substring(0, start) +
    "\n" +
    messageInput.value.substring(end);
  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 1;
  });
};

const selectImage = () => {
  imageInputRef.value?.click();
};

const selectFile = () => {
  fileInputRef.value?.click();
};

const handleImageSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  (event.target as HTMLInputElement).value = "";

  try {
    ElMessage.info("正在上传图片...");
    const response = await fileService.upload(file);
    if (response.code !== 200 || !response.data?.url) {
      throw new Error(response.message || "图片上传失败");
    }
    await chatStore.sendMessage(response.data.url, "IMAGE");
    scrollToBottom();
  } catch (error: any) {
    console.error("发送图片失败", error);
    ElMessage.error(error.message || "发送图片失败");
  }
};

const handleFileSelect = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (event.target as HTMLInputElement).value = "";
  handleGenericFileUpload(file);
};

const handleGenericFileUpload = async (file: File) => {
  try {
    ElMessage.info("正在上传文件...");
    const response = await fileService.upload(file);
    if (response.code !== 200 || !response.data?.url) {
      throw new Error(response.message || "文件上传失败");
    }
    await chatStore.sendMessage(response.data.url, "FILE");
    scrollToBottom();
  } catch (error: any) {
    console.error("发送文件失败", error);
    ElMessage.error(error.message || "发送文件失败");
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
};

let ackTimer: number | null = null;
let loadingMore = false;
const handleMessageScroll = () => {
  if (ackTimer != null) {
    window.clearTimeout(ackTimer);
  }
  ackTimer = window.setTimeout(() => {
    void (async () => {
      if (!currentSession.value?.id) return;
      if (!messageListRef.value) return;
      const { scrollTop, scrollHeight, clientHeight } = messageListRef.value;

      if (!loadingMore && scrollTop < 80) {
        loadingMore = true;
        const prevHeight = scrollHeight;
        await chatStore.loadMessages(currentSession.value.id, 1, 20);
        await nextTick();
        if (messageListRef.value) {
          const newHeight = messageListRef.value.scrollHeight;
          messageListRef.value.scrollTop = newHeight - prevHeight + scrollTop;
        }
        loadingMore = false;
      }

      if (document.hidden) return;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 120;
      if (nearBottom) {
        chatStore.markAsRead(currentSession.value.id);
      }
    })();
  }, 300);
};

const formatTime = (time: string | Date) => {
  const normalized =
    typeof time === "string"
      ? time.replace(
          /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
          "$1.$2",
        )
      : time;
  const date = new Date(normalized as any);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

  return date.toLocaleDateString();
};

const openGroupReadDialog = (message: any) => {
  const readBy: string[] = Array.isArray(message?.readBy)
    ? message.readBy.map((id: any) => String(id))
    : [];
  const uniqueUserIds: string[] = Array.from(
    new Set(readBy.filter((id): id is string => !!id)),
  );
  const userNameMap = new Map<string, string>();
  const currentUserId = String(userStore.userId || "");
  if (currentUserId) {
    userNameMap.set(
      currentUserId,
      userStore.userInfo?.nickname ||
        userStore.userInfo?.username ||
        userStore.nickname ||
        currentUserId,
    );
  }
  for (const friend of chatStore.friends) {
    const friendId = String(friend.friendId || "");
    if (!friendId) continue;
    userNameMap.set(
      friendId,
      friend.remark ||
        friend.friend?.nickname ||
        friend.friend?.username ||
        friend.nickname ||
        friend.username ||
        friendId,
    );
  }
  for (const msg of currentMessages.value as any[]) {
    const senderId = String(msg?.senderId || "");
    if (!senderId) continue;
    const senderName = String(
      msg?.senderName || msg?.sender?.username || "",
    ).trim();
    if (senderName) {
      userNameMap.set(senderId, senderName);
    }
  }
  groupReadUsers.value = uniqueUserIds.map((userId) => ({
    userId,
    displayName: userNameMap.get(userId) || `用户${userId}`,
  }));
  groupReadDialogTitle.value = `群消息已读成员（${groupReadUsers.value.length}）`;
  showGroupReadDialog.value = true;
};

const getLastMessagePreview = (msg: any) => {
  if (!msg) return "";
  const type = msg.messageType || msg.type;
  switch (type) {
    case "TEXT":
      return msg.content || "";
    case "IMAGE":
      return "[图片]";
    case "FILE":
      return msg.fileName ? `[文件] ${msg.fileName}` : "[文件]";
    case "VOICE":
      return "[语音]";
    case "VIDEO":
      return "[视频]";
    case "SYSTEM":
      return msg.content || "[系统消息]";
    default:
      return msg.content || "";
  }
};

watch(
  currentMessages,
  (newVal, oldVal) => {
    const isNewMessage = newVal.length > (oldVal?.length || 0);

    if (isNewMessage) {
      const lastMessage = newVal[newVal.length - 1];
      const isMyMessage =
        String(lastMessage?.senderId) === String(userStore.userId);

      if (isMyMessage) {
        scrollToBottom();
      } else {
        if (messageListRef.value) {
          const { scrollTop, scrollHeight, clientHeight } =
            messageListRef.value;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
          if (isNearBottom) {
            scrollToBottom();
          }
        } else {
          scrollToBottom();
        }
      }
    }
  },
  { deep: true },
);

onMounted(async () => {
  await chatStore.init();
  if (userStore.isLoggedIn && userStore.userId) {
    wsStore.connect(userStore.userId);
  }
});

const tryAckRead = () => {
  if (document.hidden) return;
  if (!currentSession.value?.id) return;
  chatStore.markAsRead(currentSession.value.id);
};

const onFocus = () => tryAckRead();
const onVisibility = () => {
  if (!document.hidden) tryAckRead();
};

onMounted(() => {
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
});

onUnmounted(() => {
  window.removeEventListener("focus", onFocus);
  document.removeEventListener("visibilitychange", onVisibility);
  if (ackTimer != null) {
    window.clearTimeout(ackTimer);
    ackTimer = null;
  }
});
</script>

<style scoped lang="scss">
.chat-container {
  display: flex;
  height: 100%;
  background-color: #f5f7fa;
  position: relative;
  overflow: hidden;
}

.list-panel {
  width: 280px;
  background-color: #fff;
  border-right: 1px solid #dcdfe6;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
}

.search-box {
  padding: 15px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 8px;

  .add-btn {
    flex-shrink: 0;
  }
}

.friend-request-alert {
  padding: 10px;
  cursor: pointer;
}

.session-list,
.contact-list,
.group-list {
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #dcdfe6;
    border-radius: 3px;
  }
}

.session-item,
.contact-item,
.group-item {
  padding: 12px 15px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f5f7fa;
  }

  &.active {
    background-color: #ecf5ff;
  }

  .session-info,
  .contact-info,
  .group-info {
    flex: 1;
    margin-left: 10px;
    overflow: hidden;
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;

    .session-name {
      font-weight: 500;
      color: #303133;
    }

    .session-time {
      font-size: 12px;
      color: #909399;
    }
  }

  .session-content {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .last-message {
      font-size: 13px;
      color: #909399;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
  }
}

.contact-group {
  .group-header {
    padding: 5px 15px;
    background-color: #f5f7fa;
    color: #909399;
    font-size: 12px;
  }
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  min-width: 0; // 防止flex子项溢出
}

.chat-welcome {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #909399;

  .welcome-content {
    text-align: center;

    p {
      margin-top: 20px;
    }
  }
}

.chat-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  height: 60px;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;

  .chat-title {
    font-size: 18px;
    font-weight: 500;
  }

  .mobile-back {
    display: none;
    cursor: pointer;
    margin-right: 10px;
  }
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f5f7fa;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #dcdfe6;
    border-radius: 3px;
  }
}

.input-area {
  border-top: 1px solid #dcdfe6;
  padding: 10px 20px;
  background-color: #fff;

  .input-toolbar {
    margin-bottom: 10px;
    display: flex;
    gap: 10px;
  }

  .input-box {
    min-height: 80px;
    margin-bottom: 10px;

    .chat-textarea {
      width: 100%;
      height: 80px;
      border: none;
      resize: none;
      outline: none;
      font-family: inherit;
      font-size: 14px;
    }
  }

  .input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .tip {
      font-size: 12px;
      color: #909399;
    }
  }
}

.voice-input-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80px;

  .voice-record-btn {
    width: 200px;
    transition: all 0.3s;

    &.is-recording {
      background-color: #f56c6c;
      color: #fff;
      border-color: #f56c6c;
    }
  }

  .recording-indicator {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #f56c6c;
    font-size: 12px;
  }
}

.recording-waves {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 15px;

  span {
    display: block;
    width: 2px;
    height: 100%;
    background-color: #f56c6c;
    animation: wave 1s infinite ease-in-out;

    &:nth-child(1) {
      animation-delay: 0s;
    }
    &:nth-child(2) {
      animation-delay: 0.1s;
    }
    &:nth-child(3) {
      animation-delay: 0.2s;
    }
    &:nth-child(4) {
      animation-delay: 0.3s;
    }
    &:nth-child(5) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes wave {
  0%,
  100% {
    height: 20%;
  }
  50% {
    height: 100%;
  }
}

.group-read-empty {
  color: #909399;
  text-align: center;
  padding: 12px 0;
}

.group-read-list {
  max-height: 320px;
  overflow-y: auto;
}

.group-read-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 2px;
  border-bottom: 1px solid #f0f2f5;
}

.group-read-name {
  color: #303133;
  font-size: 14px;
}

.group-read-id {
  color: #909399;
  font-size: 12px;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .side-nav-bar {
    display: none; // Hide side nav on mobile for now, or move to bottom
  }

  .list-panel {
    width: 100%;
    &.hidden-mobile {
      display: none;
    }
  }

  .chat-main {
    display: none;
    &.active-mobile {
      display: flex;
      width: 100%;
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      z-index: 10;
    }
  }

  .chat-header {
    .mobile-back {
      display: block;
    }
  }

  .input-actions {
    .tip {
      display: none;
    }
  }
}
</style>
