<template>
  <div class="groups-container">
    <div class="groups-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>群组</h2>
      <el-button type="primary" :icon="Plus" @click="showCreateGroup = true"
        >创建群组</el-button
      >
    </div>

    <div class="groups-content">
      <!-- 搜索栏 -->
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索群组"
          :prefix-icon="Search"
          clearable
          @input="handleSearch"
          class="search-input"
        />
      </div>

      <!-- 群组邀请 -->
      <el-card v-if="groupInvites.length > 0" class="invites-card">
        <template #header>
          <div class="card-header">
            <span>群组邀请</span>
            <el-badge :value="groupInvites.length" class="badge" />
          </div>
        </template>

        <div class="invite-list">
          <div
            v-for="invite in groupInvites"
            :key="invite.id"
            class="invite-item"
          >
            <el-avatar :size="40" :src="invite.groupAvatar">
              {{ invite.groupName?.charAt(0) || "G" }}
            </el-avatar>

            <div class="invite-info">
              <div class="invite-group">{{ invite.groupName }}</div>
              <div class="invite-inviter">
                {{ invite.inviterName }} 邀请您加入群组
              </div>
              <div class="invite-time">{{ formatTime(invite.createTime) }}</div>
            </div>

            <div class="invite-actions">
              <el-button
                type="primary"
                size="small"
                @click="acceptGroupInvite(invite.id)"
                :loading="processingInvite === invite.id"
              >
                同意
              </el-button>
              <el-button
                size="small"
                @click="rejectGroupInvite(invite.id)"
                :loading="processingInvite === invite.id"
              >
                拒绝
              </el-button>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 群组列表 -->
      <el-card class="groups-card">
        <template #header>
          <div class="card-header">
            <span>我的群组 ({{ filteredGroups.length }})</span>
            <el-dropdown @command="handleSortCommand">
              <el-button link :icon="Sort">
                排序 <el-icon class="el-icon--right"><arrow-down /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="name">按名称</el-dropdown-item>
                  <el-dropdown-item command="time">按创建时间</el-dropdown-item>
                  <el-dropdown-item command="members"
                    >按成员数量</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>

        <div v-if="loading" class="loading-container">
          <el-skeleton :rows="5" animated />
        </div>

        <div v-else-if="filteredGroups.length === 0" class="empty-container">
          <el-empty description="暂无群组" />
        </div>

        <div v-else class="groups-list">
          <div
            v-for="group in filteredGroups"
            :key="group.id"
            class="group-item"
            @click="openChat(group)"
          >
            <div class="group-avatar-container">
              <el-avatar :size="50" :src="group.avatar">
                {{ group.groupName?.charAt(0) || "G" }}
              </el-avatar>
              <div v-if="(group.unreadCount || 0) > 0" class="unread-badge">
                {{
                  (group.unreadCount || 0) > 99 ? "99+" : group.unreadCount || 0
                }}
              </div>
            </div>

            <div class="group-info">
              <div class="group-name">{{ group.groupName }}</div>
              <div class="group-desc">
                {{ group.description || "暂无群组描述" }}
              </div>
              <div class="group-meta">
                <span class="member-count">{{ group.memberCount }} 人</span>
                <span class="last-message-time">{{
                  formatTime(group.lastMessageTime)
                }}</span>
              </div>
            </div>

            <div class="group-actions">
              <el-dropdown @command="handleGroupAction($event, group)">
                <el-button link :icon="MoreFilled" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="chat">
                      <el-icon><ChatDotRound /></el-icon>
                      进入群聊
                    </el-dropdown-item>
                    <el-dropdown-item command="info">
                      <el-icon><InfoFilled /></el-icon>
                      群组信息
                    </el-dropdown-item>
                    <el-dropdown-item command="members">
                      <el-icon><User /></el-icon>
                      群组成员
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="isGroupOwner(group)"
                      command="manage"
                    >
                      <el-icon><Setting /></el-icon>
                      群组管理
                    </el-dropdown-item>
                    <el-dropdown-item command="leave" divided>
                      <el-icon><SwitchButton /></el-icon>
                      退出群组
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 创建群组对话框 -->
    <el-dialog v-model="showCreateGroup" title="创建群组" width="600px">
      <el-form
        ref="createGroupFormRef"
        :model="createGroupForm"
        :rules="createGroupRules"
        label-width="100px"
      >
        <el-form-item label="群组名称" prop="name">
          <el-input
            v-model="createGroupForm.name"
            placeholder="请输入群组名称"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="群组描述" prop="description">
          <el-input
            v-model="createGroupForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入群组描述（可选）"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="群组头像">
          <div class="avatar-upload">
            <el-avatar :size="80" :src="createGroupForm.avatar">
              {{ createGroupForm.name?.charAt(0) || "G" }}
            </el-avatar>
            <el-button size="small" @click="selectAvatar">选择头像</el-button>
            <input
              ref="avatarInputRef"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleAvatarChange"
            />
          </div>
        </el-form-item>

        <el-form-item label="邀请成员">
          <div class="member-selection">
            <el-input
              v-model="memberSearchKeyword"
              placeholder="搜索好友"
              :prefix-icon="Search"
              clearable
              @input="searchFriends"
              class="member-search"
            />

            <div class="selected-members">
              <div class="selected-title">
                已选择成员 ({{ selectedMembers.length }})
              </div>
              <div class="selected-list">
                <el-tag
                  v-for="member in selectedMembers"
                  :key="member.id"
                  closable
                  @close="removeMember(member.id)"
                  class="member-tag"
                >
                  {{ member.nickname || member.username }}
                </el-tag>
              </div>
            </div>

            <div class="friend-list">
              <div class="friend-title">选择好友</div>
              <div class="friend-items">
                <div
                  v-for="friend in filteredFriends"
                  :key="friend.id"
                  class="friend-item"
                  :class="{ selected: isSelected(friend.id) }"
                  @click="toggleMember(friend)"
                >
                  <el-avatar :size="30" :src="friend.avatar">
                    {{
                      friend.nickname?.charAt(0) ||
                      friend.username?.charAt(0) ||
                      "U"
                    }}
                  </el-avatar>
                  <span class="friend-name">{{
                    friend.nickname || friend.username
                  }}</span>
                  <el-icon v-if="isSelected(friend.id)" class="check-icon"
                    ><Check
                  /></el-icon>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateGroup = false">取消</el-button>
        <el-button type="primary" @click="createGroup" :loading="creating">
          创建群组
        </el-button>
      </template>
    </el-dialog>

    <!-- 群组信息对话框 -->
    <el-dialog v-model="showGroupInfo" title="群组信息" width="500px">
      <div v-if="currentGroup" class="group-info-content">
        <div class="group-header">
          <el-avatar :size="80" :src="currentGroup.avatar">
            {{ currentGroup.groupName?.charAt(0) || "G" }}
          </el-avatar>
          <div class="group-details">
            <h3>{{ currentGroup.groupName }}</h3>
            <p>{{ currentGroup.description || "暂无群组描述" }}</p>
            <div class="group-stats">
              <span>成员: {{ currentGroup.memberCount }}</span>
              <span>创建时间: {{ formatTime(currentGroup.createTime) }}</span>
            </div>
          </div>
        </div>

        <div class="group-actions-section">
          <el-button @click="viewMembers">查看成员</el-button>
          <el-button v-if="isGroupOwner(currentGroup)" @click="manageGroup"
            >群组管理</el-button
          >
          <el-button type="danger" @click="leaveGroup(currentGroup)"
            >退出群组</el-button
          >
        </div>
      </div>
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
  InfoFilled,
  User,
  Setting,
  SwitchButton,
  ArrowDown,
  Check,
} from "@element-plus/icons-vue";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { groupService } from "@/services/group";
import { fileService } from "@/services/file";
import type { Group, Friend } from "@/types";

// 路由
const router = useRouter();

// 状态管理
const chatStore = useChatStore();
const userStore = useUserStore();

// 引用
const createGroupFormRef = ref<FormInstance>();
const avatarInputRef = ref<HTMLInputElement>();

// 响应式数据
const loading = ref(false);
const creating = ref(false);
const processingInvite = ref("");
const showCreateGroup = ref(false);
const showGroupInfo = ref(false);
const searchKeyword = ref("");
const memberSearchKeyword = ref("");
const sortBy = ref("name");
const currentGroup = ref<Group | null>(null);
const selectedMembers = ref<Friend[]>([]);

// 表单数据
const createGroupForm = reactive({
  name: "",
  description: "",
  avatar: "",
});

// 计算属性
const groups = computed(() => chatStore.groups || []);
const groupInvites = computed(() => chatStore.groupInvites || []);
const friends = computed(() => chatStore.friends || []);
const currentUserId = computed(() => userStore.userInfo?.id || "");

const filteredGroups = computed(() => {
  let result = [...groups.value];

  // 搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    result = result.filter(
      (group) =>
        (group.groupName || "").toLowerCase().includes(keyword) ||
        (group.description || "").toLowerCase().includes(keyword),
    );
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case "name":
        return (a.groupName || "").localeCompare(b.groupName || "");
      case "time":
        return (
          new Date(b.createTime || 0).getTime() -
          new Date(a.createTime || 0).getTime()
        );
      case "members":
        return (b.memberCount || 0) - (a.memberCount || 0);
      default:
        return 0;
    }
  });

  return result;
});

const filteredFriends = computed(() => {
  if (!memberSearchKeyword.value) return friends.value;

  const keyword = memberSearchKeyword.value.toLowerCase();
  return friends.value.filter((friend) =>
    (friend.nickname || friend.username || "").toLowerCase().includes(keyword),
  );
});

// 表单验证规则
const createGroupRules: FormRules = {
  name: [
    { required: true, message: "请输入群组名称", trigger: "blur" },
    {
      min: 2,
      max: 20,
      message: "群组名称长度在 2 到 20 个字符",
      trigger: "blur",
    },
  ],
};

// 方法
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

const isGroupOwner = (group: Group): boolean => {
  return group.ownerId === currentUserId.value;
};

const isSelected = (friendId: string): boolean => {
  return selectedMembers.value.some((member) => member.id === friendId);
};

const handleSearch = () => {
  // 实时搜索，这里可以添加防抖逻辑
};

const handleSortCommand = (command: string) => {
  sortBy.value = command;
};

const searchFriends = () => {
  // 搜索好友逻辑已在计算属性中处理
};

const toggleMember = (friend: Friend) => {
  const index = selectedMembers.value.findIndex(
    (member) => member.id === friend.id,
  );
  if (index > -1) {
    selectedMembers.value.splice(index, 1);
  } else {
    selectedMembers.value.push(friend);
  }
};

const removeMember = (friendId: string) => {
  const index = selectedMembers.value.findIndex(
    (member) => member.id === friendId,
  );
  if (index > -1) {
    selectedMembers.value.splice(index, 1);
  }
};

const selectAvatar = () => {
  avatarInputRef.value?.click();
};

const handleAvatarChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    void (async () => {
      try {
        const resp = await fileService.uploadImage(file);
        if (resp.code === 200 && resp.data?.url) {
          createGroupForm.avatar = resp.data.url;
        } else {
          throw new Error(resp.message || "上传群头像失败");
        }
      } catch (error: any) {
        ElMessage.error(error.message || "上传群头像失败");
      } finally {
        target.value = "";
      }
    })();
  }
};

const createGroup = async () => {
  if (!createGroupFormRef.value) return;

  try {
    await createGroupFormRef.value.validate();
    creating.value = true;

    await chatStore.createGroup({
      name: createGroupForm.name,
      description: createGroupForm.description,
      avatar: createGroupForm.avatar,
      memberIds: selectedMembers.value.map((member) => member.id),
    });

    ElMessage.success("群组创建成功");
    showCreateGroup.value = false;

    // 重置表单
    Object.assign(createGroupForm, {
      name: "",
      description: "",
      avatar: "",
    });
    selectedMembers.value = [];
    memberSearchKeyword.value = "";
  } catch (error: any) {
    ElMessage.error(error.message || "创建群组失败");
  } finally {
    creating.value = false;
  }
};

const acceptGroupInvite = async (inviteId: string) => {
  try {
    processingInvite.value = inviteId;

    await chatStore.acceptGroupInvite(inviteId);
    ElMessage.success("已加入群组");
  } catch (error: any) {
    ElMessage.error(error.message || "处理群组邀请失败");
  } finally {
    processingInvite.value = "";
  }
};

const rejectGroupInvite = async (inviteId: string) => {
  try {
    processingInvite.value = inviteId;

    await chatStore.rejectGroupInvite(inviteId);
    ElMessage.success("已拒绝群组邀请");
  } catch (error: any) {
    ElMessage.error(error.message || "处理群组邀请失败");
  } finally {
    processingInvite.value = "";
  }
};

const openChat = (group: Group) => {
  chatStore.setCurrentSession({
    id: group.id,
    type: "group",
    targetId: group.id, // Add targetId
    targetName: group.groupName || "", // Use targetName
    targetAvatar: group.avatar,
    lastMessage: undefined,
    lastActiveTime: "",
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
  });

  router.push("/chat");
};

const handleGroupAction = async (command: string, group: Group) => {
  switch (command) {
    case "chat":
      openChat(group);
      break;

    case "info":
      currentGroup.value = group;
      showGroupInfo.value = true;
      break;

    case "members":
      viewMembers(group);
      break;

    case "manage":
      manageGroup(group);
      break;

    case "leave":
      await leaveGroup(group);
      break;
  }
};

const viewMembers = async (group?: Group) => {
  const target = group || currentGroup.value;
  if (!target) return;
  try {
    const resp = await groupService.getMembers(target.id);
    if (resp.code !== 200) {
      throw new Error(resp.message || "加载成员失败");
    }
    const members = resp.data || [];
    const content =
      members.length === 0
        ? "暂无成员"
        : members
            .slice(0, 50)
            .map((m: any) => {
              const roleLabel =
                m.role === "OWNER"
                  ? "群主"
                  : m.role === "ADMIN"
                    ? "管理员"
                    : "成员";
              return `${m.nickname || m.username || m.userId}（${roleLabel}）`;
            })
            .join("\n");
    await ElMessageBox.alert(content, `${target.groupName} 成员列表`, {
      confirmButtonText: "关闭",
    });
  } catch (error: any) {
    ElMessage.error(error.message || "查看成员失败");
  }
};

const manageGroup = async (group?: Group) => {
  const target = group || currentGroup.value;
  if (!target) return;
  try {
    const namePrompt = await ElMessageBox.prompt("请输入群组名称", "群组管理", {
      inputValue: target.groupName || "",
      confirmButtonText: "下一步",
      cancelButtonText: "取消",
    });
    const descPrompt = await ElMessageBox.prompt("请输入群组描述", "群组管理", {
      inputValue: target.description || "",
      confirmButtonText: "保存",
      cancelButtonText: "取消",
    });
    const response = await groupService.update(target.id, {
      groupName: namePrompt.value || target.groupName,
      description: descPrompt.value || "",
    });
    if (response.code !== 200) {
      throw new Error(response.message || "群组更新失败");
    }
    await loadGroups();
    currentGroup.value = {
      ...target,
      groupName: namePrompt.value || target.groupName,
      description: descPrompt.value || "",
    };
    ElMessage.success("群组信息已更新");
  } catch (error: any) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(error.message || "群组更新失败");
    }
  }
};

const leaveGroup = async (group: Group) => {
  try {
    await ElMessageBox.confirm(
      `确定要退出群组 "${group.groupName}" 吗？`,
      "退出群组",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    await chatStore.leaveGroup(group.id);
    ElMessage.success("已退出群组");
    showGroupInfo.value = false;
  } catch (error: any) {
    if (error !== "cancel") {
      ElMessage.error(error.message || "退出群组失败");
    }
  }
};

const loadGroups = async () => {
  try {
    loading.value = true;
    await chatStore.loadGroups();
    await chatStore.loadGroupInvites();
  } catch (error: any) {
    ElMessage.error(error.message || "加载群组列表失败");
  } finally {
    loading.value = false;
  }
};

// 监听搜索关键词变化，清空选中成员
watch(memberSearchKeyword, () => {
  // 可以在这里添加防抖逻辑
});

// 组件挂载
onMounted(() => {
  loadGroups();
});
</script>

<style scoped>
.groups-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px;
}

.groups-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 20px;
}

.groups-header h2 {
  margin: 0;
  color: #2c3e50;
  font-weight: 500;
}

.groups-content {
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

.invites-card,
.groups-card {
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

.invite-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.invite-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.invite-info {
  flex: 1;
}

.invite-group {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.invite-inviter {
  color: #6c757d;
  font-size: 14px;
  margin-bottom: 4px;
}

.invite-time {
  color: #95a5a6;
  font-size: 12px;
}

.invite-actions {
  display: flex;
  gap: 8px;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.group-item {
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

.group-item:hover {
  background: #f8f9fa;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.group-avatar-container {
  position: relative;
}

.unread-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #f56c6c;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 18px;
  text-align: center;
}

.group-info {
  flex: 1;
}

.group-name {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.group-desc {
  color: #6c757d;
  font-size: 13px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-meta {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #95a5a6;
}

.group-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.group-item:hover .group-actions {
  opacity: 1;
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 15px;
}

.member-selection {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 15px;
  background: #f8f9fa;
}

.member-search {
  margin-bottom: 15px;
}

.selected-members {
  margin-bottom: 15px;
}

.selected-title,
.friend-title {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 10px;
}

.selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
  padding: 8px;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  background: white;
}

.member-tag {
  margin: 0;
}

.friend-list {
  border-top: 1px solid #e9ecef;
  padding-top: 15px;
}

.friend-items {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.friend-item:hover {
  background: #e9ecef;
}

.friend-item.selected {
  background: #e7f3ff;
  border: 1px solid #409eff;
}

.friend-name {
  flex: 1;
  font-size: 14px;
}

.check-icon {
  color: #409eff;
}

.group-info-content {
  padding: 20px 0;
}

.group-header {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e9ecef;
}

.group-details {
  flex: 1;
}

.group-details h3 {
  margin: 0 0 10px 0;
  color: #2c3e50;
}

.group-details p {
  margin: 0 0 15px 0;
  color: #6c757d;
  line-height: 1.5;
}

.group-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #95a5a6;
}

.group-actions-section {
  display: flex;
  gap: 10px;
  justify-content: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .groups-container {
    padding: 10px;
  }

  .groups-header {
    padding: 0 10px;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }

  .invite-item,
  .group-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .invite-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .group-actions {
    opacity: 1;
  }

  .avatar-upload {
    flex-direction: column;
    text-align: center;
  }

  .group-header {
    flex-direction: column;
    text-align: center;
  }

  .group-actions-section {
    flex-direction: column;
  }
}
</style>
