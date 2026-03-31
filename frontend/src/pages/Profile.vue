<template>
  <div class="profile-page">
    <div class="page-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>个人资料</h2>
      <div></div>
    </div>

    <div class="profile-layout">
      <el-card class="profile-card">
        <div class="avatar-section">
          <el-avatar :size="112" :src="userInfo?.avatar" shape="square">
            {{ (userInfo?.nickname || userInfo?.username || "U").charAt(0) }}
          </el-avatar>
        <div class="avatar-actions">
          <el-button type="primary" @click="openAvatarPicker">
            更换头像
          </el-button>
            <span class="subtle-text">支持 jpg、png 等常见图片格式</span>
          </div>
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleAvatarSelect"
          />
        </div>

        <el-form
          ref="profileFormRef"
          :model="profileForm"
          :rules="profileRules"
          label-width="90px"
        >
          <el-form-item label="用户名">
            <el-input v-model="profileForm.username" disabled />
          </el-form-item>
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model="profileForm.nickname" maxlength="20" show-word-limit />
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="profileForm.email" />
          </el-form-item>
          <el-form-item label="手机号" prop="phone">
            <el-input v-model="profileForm.phone" maxlength="11" />
          </el-form-item>
          <el-form-item label="性别">
            <el-radio-group v-model="profileForm.gender">
              <el-radio label="MALE">男</el-radio>
              <el-radio label="FEMALE">女</el-radio>
              <el-radio label="UNKNOWN">保密</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="生日">
            <el-date-picker
              v-model="profileForm.birthday"
              type="date"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="签名">
            <el-input
              v-model="profileForm.signature"
              type="textarea"
              :rows="3"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="地区">
            <el-input v-model="profileForm.location" maxlength="50" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="updatingProfile" @click="updateProfile">
              保存修改
            </el-button>
            <el-button @click="resetForm">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="side-card">
        <template #header>
          <div class="card-header">
            <span>账户安全</span>
          </div>
        </template>

        <div class="info-row">
          <span>登录密码</span>
          <el-button link @click="showChangePassword = true">修改</el-button>
        </div>
        <div class="info-row">
          <span>邮箱验证</span>
          <span class="subtle-text">{{ userInfo?.email ? "已绑定" : "未绑定" }}</span>
        </div>
        <div class="info-row">
          <span>手机验证</span>
          <span class="subtle-text">{{ userInfo?.phone ? "已绑定" : "未绑定" }}</span>
        </div>
      </el-card>

      <el-card class="side-card">
        <template #header>
          <div class="card-header">
            <span>隐私设置</span>
          </div>
        </template>

        <div class="info-row">
          <div>
            <div class="info-title">允许陌生人添加</div>
            <div class="subtle-text">允许通过搜索找到您并发起好友申请</div>
          </div>
          <el-switch
            v-model="privacySettings.allowStrangerAdd"
            @change="savePrivacySettings"
          />
        </div>

        <div class="info-row">
          <div>
            <div class="info-title">显示在线状态</div>
            <div class="subtle-text">好友可看到您的在线状态</div>
          </div>
          <el-switch
            v-model="privacySettings.showOnlineStatus"
            @change="savePrivacySettings"
          />
        </div>

        <div class="info-row">
          <div>
            <div class="info-title">允许查看朋友圈</div>
            <div class="subtle-text">控制朋友圈对外可见范围</div>
          </div>
          <el-switch
            v-model="privacySettings.allowViewMoments"
            @change="savePrivacySettings"
          />
        </div>
      </el-card>
    </div>

    <el-dialog v-model="showChangePassword" title="修改密码" width="420px">
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="90px"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input v-model="passwordForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showChangePassword = false">取消</el-button>
        <el-button type="primary" :loading="changingPassword" @click="changePassword">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  type FormInstance,
  type FormRules,
} from "element-plus";
import { ArrowLeft } from "@element-plus/icons-vue";
import { fileService } from "@/services/file";
import { defaultUserSettings } from "@/normalizers/user";
import { useUserStore } from "@/stores/user";
import { useUserSettingsStore } from "@/stores/user-settings";
import { useErrorHandler } from "@/hooks/useErrorHandler";

const userStore = useUserStore();
const settingsStore = useUserSettingsStore();
const { capture, notifySuccess } = useErrorHandler("profile-page");

const defaults = defaultUserSettings();

const profileFormRef = ref<FormInstance | null>(null);
const passwordFormRef = ref<FormInstance | null>(null);
const avatarInputRef = ref<HTMLInputElement | null>(null);

const updatingProfile = ref(false);
const changingPassword = ref(false);
const showChangePassword = ref(false);
const privacySettings = reactive({ ...defaults.privacy });

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
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const userInfo = computed(() => userStore.userInfo);

const profileRules: FormRules = {
  nickname: [
    { required: true, message: "请输入昵称", trigger: "blur" },
    { min: 1, max: 20, message: "昵称长度为 1 到 20 个字符", trigger: "blur" },
  ],
  email: [{ type: "email", message: "请输入正确的邮箱地址", trigger: "blur" }],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: "请输入正确的手机号", trigger: "blur" },
  ],
};

const passwordRules: FormRules = {
  currentPassword: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度为 6 到 20 个字符", trigger: "blur" },
  ],
  confirmPassword: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error("两次输入的密码不一致"));
          return;
        }
        callback();
      },
      trigger: "blur",
    },
  ],
};

const initForm = () => {
  const user = userStore.userInfo;
  if (!user) {
    return;
  }
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
};

const openAvatarPicker = () => {
  avatarInputRef.value?.click();
};

const loadPrivacySettings = async () => {
  try {
    const settings = await settingsStore.getUserSettings();
    Object.assign(privacySettings, settings.privacy);
  } catch (error) {
    capture(error, "加载隐私设置失败");
  }
};

const updateProfile = async () => {
  if (!profileFormRef.value) {
    return;
  }
  try {
    await profileFormRef.value.validate();
    updatingProfile.value = true;
    await userStore.updateUserInfo({
      nickname: profileForm.nickname,
      email: profileForm.email || undefined,
      phone: profileForm.phone || undefined,
      gender: profileForm.gender || undefined,
      birthday: profileForm.birthday || undefined,
      signature: profileForm.signature || undefined,
      location: profileForm.location || undefined,
    });
    notifySuccess("个人资料已更新");
  } catch (error) {
    capture(error, "更新个人资料失败");
  } finally {
    updatingProfile.value = false;
  }
};

const resetForm = () => {
  initForm();
};

const handleAvatarSelect = async (event: Event) => {
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
    await userStore.updateUserInfo({ avatar: response.data.url });
    notifySuccess("头像已更新");
  } catch (error) {
    capture(error, "头像上传失败");
  }
};

const changePassword = async () => {
  if (!passwordFormRef.value) {
    return;
  }
  try {
    await passwordFormRef.value.validate();
    changingPassword.value = true;
    await settingsStore.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    notifySuccess("密码修改成功");
    showChangePassword.value = false;
    Object.assign(passwordForm, {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  } catch (error) {
    capture(error, "修改密码失败");
  } finally {
    changingPassword.value = false;
  }
};

const savePrivacySettings = async () => {
  try {
    await settingsStore.updatePrivacySettings({ ...privacySettings });
    notifySuccess("隐私设置已保存");
  } catch (error) {
    capture(error, "更新隐私设置失败");
    await loadPrivacySettings();
  }
};

onMounted(() => {
  initForm();
  void loadPrivacySettings();
});
</script>

<style scoped lang="scss">
.profile-page {
  min-height: 100%;
  padding: 20px;
  background: #f5f7fa;
}

.page-header,
.avatar-section,
.avatar-actions,
.info-row {
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

.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: 20px;
}

.profile-card,
.side-card {
  border-radius: 16px;
}

.avatar-section {
  gap: 16px;
  margin-bottom: 24px;
}

.avatar-actions {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.subtle-text {
  color: #909399;
  font-size: 13px;
}

.card-header {
  font-weight: 600;
}

.info-row {
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid #f0f2f5;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-title {
  color: #303133;
  font-weight: 600;
  margin-bottom: 4px;
}

@media (max-width: 960px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .profile-page {
    padding: 16px;
  }

  .avatar-section {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
