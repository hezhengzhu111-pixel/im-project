<template>
  <div class="groups-page">
    <div class="page-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>群组</h2>
      <el-button type="primary" :icon="Plus" @click="showCreateGroup = true">
        创建群组
      </el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索群组"
        :prefix-icon="Search"
        clearable
      />
      <el-select v-model="sortBy" class="sort-select">
        <el-option label="按名称" value="name" />
        <el-option label="按创建时间" value="time" />
        <el-option label="按成员数量" value="members" />
      </el-select>
    </div>

    <el-card class="panel-card">
      <template #header>
        <div class="card-header">
          <span>我的群组</span>
          <span class="subtle-text">{{ filteredGroups.length }} 个群聊</span>
        </div>
      </template>

      <div v-if="loading" class="loading-block">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="filteredGroups.length === 0" class="empty-state">
        暂无群组
      </div>

      <div v-else class="group-list">
        <div
          v-for="group in filteredGroups"
          :key="group.id"
          class="group-item"
          @click="openChat(group)"
        >
          <div class="group-avatar-wrap">
            <el-avatar :size="52" :src="group.avatar" shape="square">
              {{ (group.groupName || group.name || "G").charAt(0) }}
            </el-avatar>
            <el-badge
              v-if="(group.unreadCount || 0) > 0"
              :value="group.unreadCount"
              :max="99"
              class="group-unread"
            />
          </div>

          <div class="group-main">
            <div class="group-title-row">
              <div class="group-name">{{ group.groupName || group.name }}</div>
              <div class="group-time">
                {{ formatTime(group.lastMessageTime || group.lastActivityAt || group.createTime) }}
              </div>
            </div>
            <div class="group-desc">
              {{ group.description || group.announcement || "暂无群组描述" }}
            </div>
            <div class="group-meta">
              {{ group.memberCount || 0 }} 位成员
            </div>
          </div>

          <el-dropdown trigger="click" @command="handleGroupAction($event, group)">
            <el-button link :icon="MoreFilled" @click.stop />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="chat">进入群聊</el-dropdown-item>
                <el-dropdown-item command="members">查看成员</el-dropdown-item>
                <el-dropdown-item command="leave" divided>
                  退出群组
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-card>

    <el-dialog v-model="showCreateGroup" title="创建群组" width="620px">
      <el-form
        ref="createGroupFormRef"
        :model="createGroupForm"
        :rules="createGroupRules"
        label-width="90px"
      >
        <el-form-item label="群组头像">
          <div class="avatar-upload">
            <el-avatar :size="64" :src="createGroupForm.avatar" shape="square">
              {{ (createGroupForm.name || "G").charAt(0) }}
            </el-avatar>
            <div class="avatar-actions">
              <el-button @click="openAvatarPicker">上传头像</el-button>
              <span class="subtle-text">建议上传正方形图片</span>
            </div>
            <input
              ref="avatarInputRef"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleAvatarChange"
            />
          </div>
        </el-form-item>

        <el-form-item label="群组名称" prop="name">
          <el-input
            v-model="createGroupForm.name"
            maxlength="20"
            show-word-limit
            placeholder="请输入群组名称"
          />
        </el-form-item>

        <el-form-item label="群组描述">
          <el-input
            v-model="createGroupForm.description"
            type="textarea"
            :rows="3"
            maxlength="100"
            show-word-limit
            placeholder="请输入群组描述"
          />
        </el-form-item>

        <el-form-item label="选择成员">
          <el-transfer
            v-model="createGroupForm.memberIds"
            :data="transferFriends"
            :titles="['可选联系人', '已选成员']"
            filterable
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateGroup = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createGroup">
          创建群组
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
import { fileService } from "@/services/file";
import { groupService } from "@/services/group";
import { useChatStore } from "@/stores/chat";
import type { Group } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

type SortMode = "name" | "time" | "members";

const router = useRouter();
const chatStore = useChatStore();
const { capture, notifySuccess } = useErrorHandler("groups-page");

const createGroupFormRef = ref<FormInstance | null>(null);
const avatarInputRef = ref<HTMLInputElement | null>(null);

const loading = ref(false);
const creating = ref(false);
const showCreateGroup = ref(false);
const searchKeyword = ref("");
const sortBy = ref<SortMode>("name");

const createGroupForm = reactive({
  name: "",
  description: "",
  avatar: "",
  memberIds: [] as string[],
});

const createGroupRules: FormRules = {
  name: [
    { required: true, message: "请输入群组名称", trigger: "blur" },
    { min: 2, max: 20, message: "群组名称长度为 2 到 20 个字符", trigger: "blur" },
  ],
};

const transferFriends = computed(() =>
  chatStore.friends.map((friend) => ({
    key: friend.friendId,
    label: friend.remark || friend.nickname || friend.username || friend.friendId,
  })),
);

const filteredGroups = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const list = chatStore.groups.filter((group) => {
    if (!keyword) {
      return true;
    }
    return [group.groupName, group.name, group.description, group.announcement]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  return list.slice().sort((left, right) => {
    if (sortBy.value === "time") {
      return (
        new Date(right.createTime || right.lastActivityAt || 0).getTime() -
        new Date(left.createTime || left.lastActivityAt || 0).getTime()
      );
    }
    if (sortBy.value === "members") {
      return (right.memberCount || 0) - (left.memberCount || 0);
    }
    return String(left.groupName || left.name || "").localeCompare(
      String(right.groupName || right.name || ""),
      "zh-CN",
    );
  });
});

const formatTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
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
    await Promise.all([chatStore.loadGroups(), chatStore.loadFriends()]);
  } catch (error) {
    capture(error, "加载群组失败");
  } finally {
    loading.value = false;
  }
};

const openAvatarPicker = () => {
  avatarInputRef.value?.click();
};

const handleAvatarChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  try {
    const response = await fileService.uploadImage(file);
    if (response.code !== 200 || !response.data?.url) {
      throw new Error(response.message || "头像上传失败");
    }
    createGroupForm.avatar = response.data.url;
  } catch (error) {
    capture(error, "头像上传失败");
  }
};

const createGroup = async () => {
  if (!createGroupFormRef.value) {
    return;
  }
  try {
    await createGroupFormRef.value.validate();
    creating.value = true;
    await chatStore.createGroup({
      name: createGroupForm.name.trim(),
      description: createGroupForm.description.trim(),
      avatar: createGroupForm.avatar,
      memberIds: createGroupForm.memberIds,
    });
    notifySuccess("群组创建成功");
    showCreateGroup.value = false;
    Object.assign(createGroupForm, {
      name: "",
      description: "",
      avatar: "",
      memberIds: [],
    });
    await router.push("/chat");
  } catch (error) {
    capture(error, "创建群组失败");
  } finally {
    creating.value = false;
  }
};

const openChat = async (group: Group) => {
  try {
    await chatStore.openGroupSession(group);
    await router.push("/chat");
  } catch (error) {
    capture(error, "打开群聊失败");
  }
};

const viewMembers = async (group: Group) => {
  try {
    const response = await groupService.getMembers(group.id);
    const content =
      response.data.length === 0
        ? "暂无成员"
        : response.data
            .slice(0, 100)
            .map((member) => {
              const role =
                member.role === "OWNER"
                  ? "群主"
                  : member.role === "ADMIN"
                    ? "管理员"
                    : "成员";
              return `${member.nickname || member.username || member.userId}（${role}）`;
            })
            .join("\n");
    await ElMessageBox.alert(content, `${group.groupName || group.name} 成员列表`, {
      confirmButtonText: "关闭",
    });
  } catch (error) {
    capture(error, "加载群成员失败");
  }
};

const leaveGroup = async (group: Group) => {
  try {
    await ElMessageBox.confirm(
      `确定退出群组“${group.groupName || group.name}”吗？`,
      "退出群组",
      {
        type: "warning",
        confirmButtonText: "确定",
        cancelButtonText: "取消",
      },
    );
    await chatStore.leaveGroup(group.id);
    notifySuccess("已退出群组");
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "退出群组失败");
    }
  }
};

const handleGroupAction = async (command: string, group: Group) => {
  if (command === "chat") {
    await openChat(group);
    return;
  }
  if (command === "members") {
    await viewMembers(group);
    return;
  }
  if (command === "leave") {
    await leaveGroup(group);
  }
};

onMounted(() => {
  void loadData();
});
</script>

<style scoped lang="scss">
.groups-page {
  min-height: 100%;
  padding: 20px;
  background: #f5f7fa;
}

.page-header,
.toolbar,
.card-header,
.group-item,
.group-title-row,
.avatar-upload {
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

.panel-card {
  border-radius: 16px;
}

.card-header {
  justify-content: space-between;
  width: 100%;
}

.subtle-text {
  color: #909399;
  font-size: 13px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-item {
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
}

.group-item:hover {
  background: #eef5ff;
}

.group-avatar-wrap {
  position: relative;
}

.group-unread {
  position: absolute;
  right: -4px;
  top: -4px;
}

.group-main {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-weight: 600;
  color: #303133;
}

.group-time,
.group-desc,
.group-meta {
  color: #909399;
  font-size: 13px;
}

.group-desc {
  margin-top: 4px;
}

.loading-block,
.empty-state {
  padding: 24px 0;
}

.avatar-upload {
  gap: 16px;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 768px) {
  .groups-page {
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
