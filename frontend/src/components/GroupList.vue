<template>
  <div class="group-list">
    <!-- 搜索框 -->
    <div class="search-section">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索群组"
        :prefix-icon="Search"
        clearable
        size="small"
      />
    </div>

    <!-- 群组列表 -->
    <div class="groups-container">
      <div
        v-for="group in filteredGroups"
        :key="group.id"
        class="group-item"
        :class="{ active: group.id === activeGroupId }"
        @click="handleSelectGroup(group)"
      >
        <div class="group-avatar">
          <el-avatar :size="40" :src="group.avatar" shape="square">
            {{ getAvatarText(group.groupName) }}
          </el-avatar>

          <!-- 群组类型标识 -->
          <div
            class="group-type-badge"
            :class="{
              public: group.type === GROUP_TYPES.PUBLIC,
              private: group.type === GROUP_TYPES.PRIVATE,
            }"
          >
            <el-icon v-if="group.type === GROUP_TYPES.PUBLIC">
              <Unlock />
            </el-icon>
            <el-icon v-else>
              <Lock />
            </el-icon>
          </div>
        </div>

        <div class="group-info">
          <div class="group-name">{{ group.groupName }}</div>
          <div class="group-desc">
            <span class="member-count">{{ group.memberCount }}人</span>
            <span v-if="group.description" class="description">
              · {{ group.description }}
            </span>
          </div>
          <div class="group-status">
            <span class="last-activity">{{
              formatTime(group.lastActivityAt || "")
            }}</span>
            <span v-if="(group.unreadCount || 0) > 0" class="unread-indicator">
              {{ (group.unreadCount || 0) > 99 ? "99+" : group.unreadCount || 0 }}
            </span>
          </div>
        </div>

        <div class="group-actions">
          <el-dropdown trigger="click" @command="handleGroupAction">
            <el-button size="small" :icon="MoreFilled" circle @click.stop />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :command="{ action: 'info', group }">
                  <el-icon><InfoFilled /></el-icon>
                  群组信息
                </el-dropdown-item>
                <el-dropdown-item :command="{ action: 'members', group }">
                  <el-icon><User /></el-icon>
                  成员管理
                </el-dropdown-item>
                <el-dropdown-item :command="{ action: 'settings', group }">
                  <el-icon><Setting /></el-icon>
                  群组设置
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="canManageGroup(group)"
                  :command="{ action: 'edit', group }"
                  divided
                >
                  <el-icon><Edit /></el-icon>
                  编辑群组
                </el-dropdown-item>
                <el-dropdown-item :command="{ action: 'leave', group }" divided>
                  <el-icon><SwitchButton /></el-icon>
                  退出群组
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="canDeleteGroup(group)"
                  :command="{ action: 'delete', group }"
                >
                  <el-icon><Delete /></el-icon>
                  解散群组
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 空状态 -->
      <el-empty
        v-if="filteredGroups.length === 0 && searchKeyword"
        description="未找到相关群组"
        :image-size="80"
      />

      <el-empty
        v-else-if="groups.length === 0"
        description="暂无群组"
        :image-size="80"
      >
        <el-button type="primary" @click="$emit('create-group')">
          创建群组
        </el-button>
      </el-empty>
    </div>

    <!-- 创建群组对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="创建群组"
      width="500px"
      :before-close="handleCloseCreateDialog"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="80px"
      >
        <el-form-item label="群组头像">
          <div class="avatar-upload">
            <el-upload
              class="avatar-uploader"
              :show-file-list="false"
              :before-upload="beforeAvatarUpload"
              :http-request="handleAvatarUpload"
            >
              <el-avatar
                v-if="createForm.avatar"
                :size="60"
                :src="createForm.avatar"
                shape="square"
              />
              <el-icon v-else class="avatar-uploader-icon">
                <Plus />
              </el-icon>
            </el-upload>
          </div>
        </el-form-item>

        <el-form-item label="群组名称" prop="name">
          <el-input
            v-model="createForm.name"
            placeholder="请输入群组名称"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="群组描述" prop="description">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入群组描述"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="群组类型">
          <el-radio-group v-model="createForm.type">
            <el-radio :label="GROUP_TYPES.PUBLIC">
              <div class="radio-option">
                <div class="option-title">
                  <el-icon><Unlock /></el-icon>
                  公开群组
                </div>
                <div class="option-desc">任何人都可以搜索并加入</div>
              </div>
            </el-radio>
            <el-radio :label="GROUP_TYPES.PRIVATE">
              <div class="radio-option">
                <div class="option-title">
                  <el-icon><Lock /></el-icon>
                  私有群组
                </div>
                <div class="option-desc">仅通过邀请才能加入</div>
              </div>
            </el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="handleCloseCreateDialog">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          @click="handleCreateGroup"
        >
          创建群组
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Search,
  MoreFilled,
  InfoFilled,
  User,
  Setting,
  Edit,
  SwitchButton,
  Delete,
  Plus,
  Unlock,
  Lock,
} from "@element-plus/icons-vue";
import { formatTime, getAvatarText } from "@/utils/common";
import { GROUP_TYPES, GROUP_ROLES } from "@/constants";
import type { Group } from "@/types/group";
import type { User as UserType } from "@/types/user";

interface Props {
  groups: Group[];
  activeGroupId?: string;
  currentUser?: UserType | null;
}

interface Emits {
  (e: "select", group: Group): void;
  (e: "leave", groupId: string): void;
  (e: "delete", groupId: string): void;
  (e: "create-group"): void;
  (e: "view-info", groupId: string): void;
  (e: "manage-members", groupId: string): void;
  (e: "edit-settings", groupId: string): void;
  (e: "edit-group", groupId: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  groups: () => [],
});

const emit = defineEmits<Emits>();

// 响应式数据
const searchKeyword = ref("");
const showCreateDialog = ref(false);
const creating = ref(false);
const createFormRef = ref();

const createForm = reactive({
  name: "",
  description: "",
  type: GROUP_TYPES.PUBLIC,
  avatar: "",
});

const createRules = {
  name: [
    { required: true, message: "请输入群组名称", trigger: "blur" },
    { min: 2, max: 20, message: "群组名称长度为2-20个字符", trigger: "blur" },
  ],
};

// 计算属性
const filteredGroups = computed(() => {
  if (!searchKeyword.value) {
    return props.groups;
  }

  const keyword = searchKeyword.value.toLowerCase();
  return props.groups.filter((group) => {
    return (
      group.groupName.toLowerCase().includes(keyword) ||
      (group.description && group.description.toLowerCase().includes(keyword))
    );
  });
});

// 方法
const handleSelectGroup = (group: Group) => {
  emit("select", group);
};

const canManageGroup = (group: Group) => {
  if (!props.currentUser) return false;

  // 检查当前用户是否是群主或管理员
  const member = group.members?.find((m) => m.userId === props.currentUser?.id);
  return (
    member &&
    (member.role === GROUP_ROLES.OWNER || member.role === GROUP_ROLES.ADMIN)
  );
};

const canDeleteGroup = (group: Group) => {
  if (!props.currentUser) return false;

  // 只有群主可以解散群组
  const member = group.members?.find((m) => m.userId === props.currentUser?.id);
  return member && member.role === GROUP_ROLES.OWNER;
};

const handleGroupAction = ({
  action,
  group,
}: {
  action: string;
  group: Group;
}) => {
  switch (action) {
    case "info":
      emit("view-info", group.id);
      break;
    case "members":
      emit("manage-members", group.id);
      break;
    case "settings":
      emit("edit-settings", group.id);
      break;
    case "edit":
      emit("edit-group", group.id);
      break;
    case "leave":
      ElMessageBox.confirm(
        `确定要退出群组 "${group.groupName}" 吗？`,
        "退出群组",
        {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning",
        },
      )
        .then(() => {
          emit("leave", group.id);
        })
        .catch(() => {
          // 用户取消
        });
      break;
    case "delete":
      ElMessageBox.confirm(
        `确定要解散群组 "${group.groupName}" 吗？此操作不可恢复！`,
        "解散群组",
        {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "error",
        },
      )
        .then(() => {
          emit("delete", group.id);
        })
        .catch(() => {
          // 用户取消
        });
      break;
  }
};

const beforeAvatarUpload = (file: File) => {
  const isImage = file.type.startsWith("image/");
  const isLt2M = file.size / 1024 / 1024 < 2;

  if (!isImage) {
    ElMessage.error("只能上传图片文件！");
    return false;
  }
  if (!isLt2M) {
    ElMessage.error("图片大小不能超过 2MB！");
    return false;
  }
  return true;
};

const handleAvatarUpload = async (options: any) => {
  // 这里应该调用文件上传API
  // 暂时使用本地预览
  const file = options.file;
  const reader = new FileReader();
  reader.onload = (e) => {
    createForm.avatar = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const handleCreateGroup = async () => {
  if (!createFormRef.value) return;

  try {
    await createFormRef.value.validate();

    creating.value = true;

    // 这里应该调用创建群组API
    // 暂时模拟
    await new Promise((resolve) => setTimeout(resolve, 1000));

    ElMessage.success("群组创建成功");
    emit("create-group");
    handleCloseCreateDialog();
  } catch (error) {
    console.error("创建群组失败:", error);
    ElMessage.error("创建群组失败");
  } finally {
    creating.value = false;
  }
};

const handleCloseCreateDialog = () => {
  showCreateDialog.value = false;
  createFormRef.value?.resetFields();
  createForm.avatar = "";
};

// 暴露方法给父组件
defineExpose({
  showCreateDialog: () => {
    showCreateDialog.value = true;
  },
});
</script>

<style lang="scss" scoped>
.group-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-section {
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  background-color: #fff;
}

.groups-container {
  flex: 1;
  overflow-y: auto;
  background-color: #fff;
}

.group-item {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f0f0f0;

  &:hover {
    background-color: #f5f7fa;
  }

  &.active {
    background-color: #e6f7ff;
    border-right: 3px solid #409eff;
  }

  &:last-child {
    border-bottom: none;
  }
}

.group-avatar {
  position: relative;
  margin-right: 12px;
}

.group-type-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;

  &.public {
    background-color: #67c23a;
    color: #fff;
  }

  &.private {
    background-color: #e6a23c;
    color: #fff;
  }
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.member-count {
  color: #67c23a;
  font-weight: 500;
}

.description {
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.last-activity {
  font-size: 11px;
  color: #c0c4cc;
}

.unread-indicator {
  background-color: #f56c6c;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

.group-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.group-item:hover .group-actions {
  opacity: 1;
}

// 创建群组对话框样式
.avatar-upload {
  display: flex;
  justify-content: center;
}

.avatar-uploader {
  :deep(.el-upload) {
    border: 1px dashed #d9d9d9;
    border-radius: 6px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: 0.2s;

    &:hover {
      border-color: #409eff;
    }
  }
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 60px;
  height: 60px;
  text-align: center;
  line-height: 60px;
}

.radio-option {
  margin-left: 8px;
}

.option-title {
  display: flex;
  align-items: center;
  font-weight: 500;
  margin-bottom: 4px;

  .el-icon {
    margin-right: 4px;
  }
}

.option-desc {
  font-size: 12px;
  color: #909399;
}

// 滚动条样式
.groups-container::-webkit-scrollbar {
  width: 4px;
}

.groups-container::-webkit-scrollbar-track {
  background: transparent;
}

.groups-container::-webkit-scrollbar-thumb {
  background-color: #c0c4cc;
  border-radius: 2px;

  &:hover {
    background-color: #909399;
  }
}
</style>
