<template>
  <div class="user-profile">
    <!-- 用户头像和基本信息 -->
    <div class="user-header">
      <div class="avatar-section">
        <el-avatar
          :size="80"
          :src="avatarUrl"
          class="user-avatar"
          @error="handleAvatarError"
        >
          {{ userInfo?.nickname?.charAt(0) || "U" }}
        </el-avatar>
        <div class="upload-overlay" @click="handleAvatarUpload">
          <el-icon><Camera /></el-icon>
        </div>
      </div>

      <div class="user-info">
        <h3 class="user-name">{{ userInfo?.nickname || "未知用户" }}</h3>
        <p class="user-status" :class="`status-${userStatus.toLowerCase()}`">
          <el-icon class="status-icon">
            <SuccessFilled v-if="userStatus === 'online'" />
            <Clock v-else-if="userStatus === 'away'" />
            <Minus v-else-if="userStatus === 'busy'" />
            <CircleCloseFilled v-else />
          </el-icon>
          {{ getStatusText(userInfo?.status) }}
        </p>
      </div>

      <!-- 操作按钮 -->
      <div class="user-actions">
        <el-dropdown trigger="click">
          <el-button :icon="Setting" circle />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="editProfile">
                <el-icon><Edit /></el-icon>
                编辑资料
              </el-dropdown-item>
              <el-dropdown-item @click="changeStatus">
                <el-icon><Switch /></el-icon>
                更改状态
              </el-dropdown-item>
              <el-dropdown-item divided @click="logout">
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 用户详细信息 -->
    <div v-if="showDetails" class="user-details">
      <div class="detail-item">
        <span class="detail-label">用户ID:</span>
        <span class="detail-value">{{ userInfo?.userId }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">邮箱:</span>
        <span class="detail-value">{{ userInfo?.email || "未设置" }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">手机:</span>
        <span class="detail-value">{{ userInfo?.phone || "未设置" }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">注册时间:</span>
        <span class="detail-value">{{ formatTime(userInfo?.createTime) }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">最后登录:</span>
        <span class="detail-value">{{
          formatTime(userInfo?.lastLoginTime)
        }}</span>
      </div>
    </div>

    <!-- 展开/收起按钮 -->
    <div class="toggle-details">
      <el-button link size="small" @click="showDetails = !showDetails">
        {{ showDetails ? "收起" : "展开" }}
        <el-icon class="toggle-icon" :class="{ rotated: showDetails }">
          <ArrowDown />
        </el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Setting,
  Edit,
  Switch,
  SwitchButton,
  SuccessFilled,
  CircleCloseFilled,
  Clock,
  Minus,
  ArrowDown,
  Camera,
} from "@element-plus/icons-vue";
import { useUserStore } from "@/stores/user";
import { formatTime } from "@/utils/common";
import { USER_STATUS } from "@/constants";
import type { User } from "@/types/user";
import { uploadFile } from "@/utils/upload";

interface Props {
  userInfo?: User | null;
}

interface Emits {
  (e: "edit-profile"): void;
  (e: "change-status", status: string): void;
  (e: "logout"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const router = useRouter();
const userStore = useUserStore();

// 响应式数据
const showDetails = ref(false);

// 状态转换
const userStatus = computed(() => {
  const status = props.userInfo?.status;
  if (typeof status === "number") {
    switch (status) {
      case 1:
        return USER_STATUS.ONLINE;
      case 2:
        return USER_STATUS.AWAY;
      case 3:
        return USER_STATUS.BUSY;
      case 0:
      default:
        return USER_STATUS.OFFLINE;
    }
  }
  return status || USER_STATUS.OFFLINE;
});

// 头像URL处理
const avatarUrl = computed(() => {
  const avatar = props.userInfo?.avatar;
  if (!avatar) return "";

  // 如果是相对路径，添加基础URL
  if (avatar.startsWith("/")) {
    return `${import.meta.env.VITE_API_BASE_URL}${avatar}`;
  }

  // 如果是完整URL，直接返回
  if (avatar.startsWith("http")) {
    return avatar;
  }

  // 其他情况，添加基础URL
  return `${import.meta.env.VITE_API_BASE_URL}/${avatar}`;
});

// 头像加载错误处理
const handleAvatarError = () => {
  console.warn("头像加载失败:", avatarUrl.value);
};

// 头像上传处理
const handleAvatarUpload = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // 验证文件大小（限制为2MB）
    if (file.size > 2 * 1024 * 1024) {
      ElMessage.error("头像文件大小不能超过2MB");
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      ElMessage.error("请选择图片文件");
      return;
    }

    try {
      const result = await uploadFile(file);
      await userStore.updateProfile({ avatar: result.url });
      ElMessage.success("头像更新成功");
    } catch (error) {
      console.error("头像上传失败:", error);
      ElMessage.error("头像上传失败");
    }
  };

  input.click();
};

// 方法
const getStatusText = (status?: string | number): string => {
  // 如果是数字状态，转换为字符串状态
  let statusStr: string;
  if (typeof status === "number") {
    switch (status) {
      case 1:
        statusStr = USER_STATUS.ONLINE;
        break;
      case 2:
        statusStr = USER_STATUS.AWAY;
        break;
      case 3:
        statusStr = USER_STATUS.BUSY;
        break;
      case 0:
      default:
        statusStr = USER_STATUS.OFFLINE;
        break;
    }
  } else {
    statusStr = status || USER_STATUS.OFFLINE;
  }

  switch (statusStr) {
    case USER_STATUS.ONLINE:
      return "在线";
    case USER_STATUS.AWAY:
      return "离开";
    case USER_STATUS.BUSY:
      return "忙碌";
    case USER_STATUS.OFFLINE:
      return "离线";
    default:
      return "未知";
  }
};

const editProfile = () => {
  emit("edit-profile");
};

const changeStatus = () => {
  emit("change-status", userStatus.value);
};

const logout = async () => {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    await userStore.logout();
    ElMessage.success("已退出登录");
    router.push("/login");
  } catch (error) {
    if (error !== "cancel") {
      console.error("退出登录失败:", error);
      ElMessage.error("退出登录失败");
    }
  }
};
</script>

<style lang="scss" scoped>
.user-profile {
  padding: 16px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.avatar-section {
  position: relative;
  flex-shrink: 0;

  .user-avatar {
    cursor: pointer;
  }

  .upload-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s;
    cursor: pointer;
    color: white;
    font-size: 20px;

    &:hover {
      opacity: 1;
    }
  }
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-status {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #909399;

  .status-icon {
    font-size: 12px;
  }

  &.status-online .status-icon {
    color: #67c23a;
  }

  &.status-away .status-icon {
    color: #e6a23c;
  }

  &.status-busy .status-icon {
    color: #f56c6c;
  }

  &.status-offline .status-icon {
    color: #909399;
  }
}

.user-actions {
  flex-shrink: 0;
}

.user-details {
  border-top: 1px solid #e4e7ed;
  padding-top: 16px;
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;

  &:not(:last-child) {
    border-bottom: 1px solid #f5f7fa;
  }
}

.detail-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.detail-value {
  font-size: 14px;
  color: #303133;
  text-align: right;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-details {
  text-align: center;
  border-top: 1px solid #e4e7ed;
  padding-top: 12px;

  .toggle-icon {
    margin-left: 4px;
    transition: transform 0.3s;

    &.rotated {
      transform: rotate(180deg);
    }
  }
}
</style>
