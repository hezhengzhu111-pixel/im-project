<template>
  <div class="profile-container">
    <div class="profile-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>个人资料</h2>
      <div></div>
    </div>

    <div class="profile-content">
      <el-card class="profile-card">
        <div class="avatar-section">
          <el-avatar :size="120" :src="userInfo.avatar" class="profile-avatar">
            {{
              userInfo.nickname?.charAt(0) ||
              userInfo.username?.charAt(0) ||
              "U"
            }}
          </el-avatar>
          <el-button
            type="primary"
            size="small"
            @click="selectAvatar"
            class="change-avatar-btn"
          >
            <el-icon><Camera /></el-icon>
            更换头像
          </el-button>
        </div>

        <el-form
          ref="profileFormRef"
          :model="profileForm"
          :rules="profileRules"
          label-width="100px"
          class="profile-form"
        >
          <el-form-item label="用户名" prop="username">
            <el-input v-model="profileForm.username" disabled />
          </el-form-item>

          <el-form-item label="昵称" prop="nickname">
            <el-input
              v-model="profileForm.nickname"
              placeholder="请输入昵称"
              maxlength="20"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="profileForm.email"
              placeholder="请输入邮箱"
              type="email"
            />
          </el-form-item>

          <el-form-item label="手机号" prop="phone">
            <el-input
              v-model="profileForm.phone"
              placeholder="请输入手机号"
              maxlength="11"
            />
          </el-form-item>

          <el-form-item label="性别" prop="gender">
            <el-radio-group v-model="profileForm.gender">
              <el-radio label="MALE">男</el-radio>
              <el-radio label="FEMALE">女</el-radio>
              <el-radio label="UNKNOWN">保密</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="生日" prop="birthday">
            <el-date-picker
              v-model="profileForm.birthday"
              type="date"
              placeholder="请选择生日"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="个性签名" prop="signature">
            <el-input
              v-model="profileForm.signature"
              type="textarea"
              :rows="3"
              placeholder="请输入个性签名"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="地区" prop="location">
            <el-input
              v-model="profileForm.location"
              placeholder="请输入所在地区"
              maxlength="50"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              @click="updateProfile"
              :loading="updating"
            >
              保存修改
            </el-button>
            <el-button @click="resetForm">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 账户安全 -->
      <el-card class="security-card">
        <template #header>
          <div class="card-header">
            <span>账户安全</span>
          </div>
        </template>

        <div class="security-item">
          <div class="security-info">
            <el-icon><Lock /></el-icon>
            <div class="security-text">
              <div class="security-title">登录密码</div>
              <div class="security-desc">定期更换密码可以保护账户安全</div>
            </div>
          </div>
          <el-button link @click="showChangePassword = true">修改</el-button>
        </div>

        <div class="security-item">
          <div class="security-info">
            <el-icon><Message /></el-icon>
            <div class="security-text">
              <div class="security-title">邮箱验证</div>
              <div class="security-desc">
                {{ userInfo.email ? "已验证" : "未验证" }}
              </div>
            </div>
          </div>
          <el-button link v-if="!userInfo.email">验证</el-button>
        </div>

        <div class="security-item">
          <div class="security-info">
            <el-icon><Iphone /></el-icon>
            <div class="security-text">
              <div class="security-title">手机验证</div>
              <div class="security-desc">
                {{ userInfo.phone ? "已验证" : "未验证" }}
              </div>
            </div>
          </div>
          <el-button link v-if="!userInfo.phone">验证</el-button>
        </div>
      </el-card>

      <!-- 隐私设置 -->
      <el-card class="privacy-card">
        <template #header>
          <div class="card-header">
            <span>隐私设置</span>
          </div>
        </template>

        <div class="privacy-item">
          <div class="privacy-info">
            <div class="privacy-title">允许陌生人添加我为好友</div>
            <div class="privacy-desc">
              关闭后，只有通过手机号或邮箱才能添加您为好友
            </div>
          </div>
          <el-switch v-model="privacySettings.allowStrangerAdd" />
        </div>

        <div class="privacy-item">
          <div class="privacy-info">
            <div class="privacy-title">显示在线状态</div>
            <div class="privacy-desc">关闭后，好友将无法看到您的在线状态</div>
          </div>
          <el-switch v-model="privacySettings.showOnlineStatus" />
        </div>

        <div class="privacy-item">
          <div class="privacy-info">
            <div class="privacy-title">允许查看我的朋友圈</div>
            <div class="privacy-desc">关闭后，陌生人将无法查看您的朋友圈</div>
          </div>
          <el-switch v-model="privacySettings.allowViewMoments" />
        </div>

        <el-button
          type="primary"
          @click="updatePrivacySettings"
          :loading="updatingPrivacy"
          class="save-privacy-btn"
        >
          保存隐私设置
        </el-button>
      </el-card>
    </div>

    <!-- 修改密码对话框 -->
    <el-dialog v-model="showChangePassword" title="修改密码" width="400px">
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="100px"
      >
        <el-form-item label="当前密码" prop="oldPassword">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
          />
        </el-form-item>

        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="请输入新密码"
            show-password
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showChangePassword = false">取消</el-button>
        <el-button
          type="primary"
          @click="changePassword"
          :loading="changingPassword"
        >
          确认修改
        </el-button>
      </template>
    </el-dialog>

    <!-- 隐藏的文件输入 -->
    <input
      ref="avatarInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleAvatarSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import {
  ArrowLeft,
  Camera,
  Lock,
  Message,
  Iphone,
} from "@element-plus/icons-vue";
import { useUserStore } from "@/stores/user";
import { fileService } from "@/services/file";

// 状态管理
const userStore = useUserStore();

// 引用
const profileFormRef = ref<FormInstance>();
const passwordFormRef = ref<FormInstance>();
const avatarInputRef = ref<HTMLInputElement>();

// 响应式数据
const updating = ref(false);
const updatingPrivacy = ref(false);
const changingPassword = ref(false);
const showChangePassword = ref(false);

// 表单数据
const profileForm = reactive({
  username: "",
  nickname: "",
  email: "",
  phone: "",
  gender: "UNKNOWN",
  birthday: "",
  signature: "",
  location: "",
});

const passwordForm = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const privacySettings = reactive({
  allowStrangerAdd: true,
  showOnlineStatus: true,
  allowViewMoments: true,
});

// 计算属性
const userInfo = computed<any>(() => userStore.userInfo || {});

// 表单验证规则
const profileRules: FormRules = {
  nickname: [
    { required: true, message: "请输入昵称", trigger: "blur" },
    { min: 1, max: 20, message: "昵称长度在 1 到 20 个字符", trigger: "blur" },
  ],
  email: [{ type: "email", message: "请输入正确的邮箱地址", trigger: "blur" }],
  phone: [
    {
      pattern: /^1[3-9]\d{9}$/,
      message: "请输入正确的手机号",
      trigger: "blur",
    },
  ],
};

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度在 6 到 20 个字符", trigger: "blur" },
  ],
  confirmPassword: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error("两次输入的密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur",
    },
  ],
};

// 方法
const initForm = () => {
  const user = userStore.userInfo;
  if (user) {
    Object.assign(profileForm, {
      username: user.username || "",
      nickname: user.nickname || "",
      email: user.email || "",
      phone: user.phone || "",
      gender: user.gender || "UNKNOWN",
      birthday: user.birthday || "",
      signature: user.signature || "",
      location: user.location || "",
    });
  }
};

const updateProfile = async () => {
  if (!profileFormRef.value) return;

  try {
    await profileFormRef.value.validate();
    updating.value = true;

    await userStore.updateUserInfo({
      nickname: profileForm.nickname,
      email: profileForm.email,
      phone: profileForm.phone,
      gender: profileForm.gender,
      birthday: profileForm.birthday,
      signature: profileForm.signature,
      location: profileForm.location,
    });

    ElMessage.success("个人资料更新成功");
  } catch (error: any) {
    if (error.message) {
      ElMessage.error(error.message);
    }
  } finally {
    updating.value = false;
  }
};

const resetForm = () => {
  initForm();
  ElMessage.info("表单已重置");
};

const selectAvatar = () => {
  avatarInputRef.value?.click();
};

const handleAvatarSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // 检查文件大小（限制为2MB）
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error("头像文件大小不能超过2MB");
    return;
  }

  // 检查文件类型
  if (!file.type.startsWith("image/")) {
    ElMessage.error("请选择图片文件");
    return;
  }

  try {
    updating.value = true;
    const response = await fileService.uploadImage(file);
    if (response.code !== 200 || !response.data?.url) {
      throw new Error(response.message || "头像上传失败");
    }
    await userStore.updateUserInfo({ avatar: response.data.url });
    ElMessage.success("头像更新成功");

    // 清空文件输入
    if (avatarInputRef.value) {
      avatarInputRef.value.value = "";
    }
  } catch (error: any) {
    ElMessage.error(error.message || "头像上传失败");
  } finally {
    updating.value = false;
  }
};

const changePassword = async () => {
  if (!passwordFormRef.value) return;

  try {
    await passwordFormRef.value.validate();
    changingPassword.value = true;
    await userStore.changePassword({
      currentPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    ElMessage.success("密码修改成功");

    showChangePassword.value = false;
    Object.assign(passwordForm, {
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  } catch (error: any) {
    if (error.message) {
      ElMessage.error(error.message);
    }
  } finally {
    changingPassword.value = false;
  }
};

const updatePrivacySettings = async () => {
  try {
    updatingPrivacy.value = true;
    await userStore.updatePrivacySettings({ ...privacySettings });

    ElMessage.success("隐私设置已保存");
  } catch (error: any) {
    ElMessage.error(error.message || "保存隐私设置失败");
  } finally {
    updatingPrivacy.value = false;
  }
};

// 组件挂载
onMounted(() => {
  initForm();
});
</script>

<style scoped>
.profile-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px;
}

.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 20px;
}

.profile-header h2 {
  margin: 0;
  color: #2c3e50;
  font-weight: 500;
}

.profile-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-card {
  padding: 30px;
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
}

.profile-avatar {
  margin-bottom: 15px;
}

.change-avatar-btn {
  border-radius: 20px;
}

.profile-form {
  max-width: 500px;
  margin: 0 auto;
}

.security-card,
.privacy-card {
  padding: 20px;
}

.card-header {
  font-weight: 500;
  color: #2c3e50;
}

.security-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
}

.security-item:last-child {
  border-bottom: none;
}

.security-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.security-text {
  display: flex;
  flex-direction: column;
}

.security-title {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.security-desc {
  font-size: 13px;
  color: #95a5a6;
}

.privacy-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
}

.privacy-item:last-child {
  border-bottom: none;
  margin-bottom: 20px;
}

.privacy-info {
  flex: 1;
}

.privacy-title {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.privacy-desc {
  font-size: 13px;
  color: #95a5a6;
}

.save-privacy-btn {
  width: 100%;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .profile-container {
    padding: 10px;
  }

  .profile-header {
    padding: 0 10px;
  }

  .profile-card {
    padding: 20px;
  }

  .profile-form {
    max-width: 100%;
  }

  .security-item,
  .privacy-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
</style>
