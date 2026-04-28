<template>
  <div class="profile-page">
    <div class="profile-shell">
      <header class="profile-topbar">
        <button
          type="button"
          class="icon-button"
          :aria-label="t('profile.back')"
          @click="router.back()"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <div class="topbar-copy">
          <h1>{{ t("profile.title") }}</h1>
          <p>{{ t("profile.subtitle") }}</p>
        </div>
      </header>

      <section class="profile-hero glass-card">
        <div class="avatar-block">
          <el-avatar :size="88" :src="userInfo?.avatar" class="profile-avatar">
            {{ avatarText }}
          </el-avatar>
          <button type="button" class="avatar-button" @click="openAvatarPicker">
            {{ t("profile.changeAvatar") }}
          </button>
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleAvatarSelect"
          />
        </div>

        <div class="hero-main">
          <div class="section-kicker">{{ t("profile.accountInfo") }}</div>
          <h2>{{ displayName }}</h2>
          <p>@{{ profileForm.username || userInfo?.username || "-" }}</p>
          <span class="avatar-tip">{{ t("profile.avatarTip") }}</span>
        </div>

        <div class="hero-status">
          <div class="status-chip">
            <span>{{ t("profile.emailVerify") }}</span>
            <strong>{{
              userInfo?.email ? t("profile.bound") : t("profile.unbound")
            }}</strong>
          </div>
          <div class="status-chip">
            <span>{{ t("profile.phoneVerify") }}</span>
            <strong>{{
              userInfo?.phone ? t("profile.bound") : t("profile.unbound")
            }}</strong>
          </div>
        </div>
      </section>

      <div class="profile-grid">
        <section class="glass-card form-card">
          <div class="section-heading">
            <div>
              <div class="section-kicker">{{ t("profile.accountInfo") }}</div>
              <h2>{{ t("profile.title") }}</h2>
            </div>
          </div>

          <el-form
            ref="profileFormRef"
            :model="profileForm"
            :rules="profileRules"
            label-position="top"
            class="profile-form"
          >
            <div class="form-grid">
              <el-form-item :label="t('profile.username')">
                <el-input v-model="profileForm.username" disabled />
              </el-form-item>

              <el-form-item :label="t('profile.nickname')" prop="nickname">
                <el-input
                  v-model="profileForm.nickname"
                  maxlength="20"
                  show-word-limit
                />
              </el-form-item>

              <el-form-item :label="t('profile.email')" prop="email">
                <el-input v-model="profileForm.email" />
              </el-form-item>

              <el-form-item :label="t('profile.phone')" prop="phone">
                <el-input v-model="profileForm.phone" maxlength="11" />
              </el-form-item>

              <el-form-item :label="t('profile.gender')">
                <el-radio-group
                  v-model="profileForm.gender"
                  class="flat-radio-group"
                >
                  <el-radio-button label="MALE">
                    {{ t("profile.genderMale") }}
                  </el-radio-button>
                  <el-radio-button label="FEMALE">
                    {{ t("profile.genderFemale") }}
                  </el-radio-button>
                  <el-radio-button label="UNKNOWN">
                    {{ t("profile.genderSecret") }}
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item :label="t('profile.birthday')">
                <el-date-picker
                  v-model="profileForm.birthday"
                  type="date"
                  format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD"
                  class="full-control"
                />
              </el-form-item>

              <el-form-item :label="t('profile.location')">
                <el-input v-model="profileForm.location" maxlength="50" />
              </el-form-item>

              <el-form-item
                :label="t('profile.signature')"
                class="form-item-span-2"
              >
                <el-input
                  v-model="profileForm.signature"
                  type="textarea"
                  :rows="2"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="primary-button"
                :disabled="updatingProfile"
                @click="updateProfile"
              >
                {{ t("profile.save") }}
              </button>
              <button type="button" class="secondary-button" @click="resetForm">
                {{ t("profile.reset") }}
              </button>
            </div>
          </el-form>
        </section>

        <aside class="side-stack">
          <section class="glass-card side-card">
            <div class="section-kicker">{{ t("profile.security") }}</div>
            <div class="side-row">
              <div>
                <div class="side-title">{{ t("profile.password") }}</div>
                <div class="side-desc">••••••••</div>
              </div>
              <button
                type="button"
                class="mini-button"
                @click="showChangePassword = true"
              >
                {{ t("profile.change") }}
              </button>
            </div>
            <div class="side-row">
              <div>
                <div class="side-title">{{ t("profile.emailVerify") }}</div>
                <div class="side-desc">{{ userInfo?.email || "-" }}</div>
              </div>
              <span class="status-text">
                {{
                  userInfo?.email ? t("profile.bound") : t("profile.unbound")
                }}
              </span>
            </div>
            <div class="side-row">
              <div>
                <div class="side-title">{{ t("profile.phoneVerify") }}</div>
                <div class="side-desc">{{ userInfo?.phone || "-" }}</div>
              </div>
              <span class="status-text">
                {{
                  userInfo?.phone ? t("profile.bound") : t("profile.unbound")
                }}
              </span>
            </div>
          </section>

          <section class="glass-card side-card">
            <div class="section-kicker">{{ t("profile.privacy") }}</div>
            <div class="switch-row">
              <div>
                <div class="side-title">
                  {{ t("profile.allowStrangerAdd") }}
                </div>
                <div class="side-desc">
                  {{ t("profile.allowStrangerAddDesc") }}
                </div>
              </div>
              <el-switch
                v-model="privacySettings.allowStrangerAdd"
                @change="savePrivacySettings"
              />
            </div>
            <div class="switch-row">
              <div>
                <div class="side-title">
                  {{ t("profile.showOnlineStatus") }}
                </div>
                <div class="side-desc">
                  {{ t("profile.showOnlineStatusDesc") }}
                </div>
              </div>
              <el-switch
                v-model="privacySettings.showOnlineStatus"
                @change="savePrivacySettings"
              />
            </div>
            <div class="switch-row">
              <div>
                <div class="side-title">
                  {{ t("profile.allowViewMoments") }}
                </div>
                <div class="side-desc">
                  {{ t("profile.allowViewMomentsDesc") }}
                </div>
              </div>
              <el-switch
                v-model="privacySettings.allowViewMoments"
                @change="savePrivacySettings"
              />
            </div>
          </section>
        </aside>
      </div>
    </div>

    <el-dialog
      v-model="showChangePassword"
      :title="t('profile.changePassword')"
      width="420px"
      append-to-body
      class="chat-shell-dialog"
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-position="top"
      >
        <el-form-item
          :label="t('profile.currentPassword')"
          prop="currentPassword"
        >
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item :label="t('profile.newPassword')" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item
          :label="t('profile.confirmPassword')"
          prop="confirmPassword"
        >
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showChangePassword = false">{{
          t("common.cancel")
        }}</el-button>
        <el-button
          type="primary"
          :loading="changingPassword"
          @click="changePassword"
        >
          {{ t("common.confirm") }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, reactive, ref} from "vue";
import {useRouter} from "vue-router";
import {type FormInstance, type FormRules} from "element-plus";
import {ArrowLeft} from "@element-plus/icons-vue";
import {useErrorHandler} from "@/hooks/useErrorHandler";
import {defaultUserSettings} from "@/normalizers/user";
import {fileService} from "@/services/file";
import {userService} from "@/services/user";
import {useI18nStore} from "@/stores/i18n";
import {useUserStore} from "@/stores/user";
import {useUserSettingsStore} from "@/stores/user-settings";

const router = useRouter();
const userStore = useUserStore();
const settingsStore = useUserSettingsStore();
const { capture, notifySuccess } = useErrorHandler("profile-page");
const { t } = useI18nStore();

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
const displayName = computed(
  () =>
    profileForm.nickname ||
    userInfo.value?.nickname ||
    userInfo.value?.username ||
    userStore.nickname ||
    "IM",
);
const avatarText = computed(
  () => displayName.value.charAt(0).toUpperCase() || "U",
);

const profileRules: FormRules = {
  nickname: [
    { required: true, message: t("profile.nicknameRequired"), trigger: "blur" },
    { min: 1, max: 20, message: t("profile.nicknameLength"), trigger: "blur" },
  ],
  email: [
    { type: "email", message: t("profile.emailInvalid"), trigger: "blur" },
  ],
  phone: [
    {
      pattern: /^1[3-9]\d{9}$/,
      message: t("profile.phoneInvalid"),
      trigger: "blur",
    },
  ],
};

const passwordRules: FormRules = {
  currentPassword: [
    {
      required: true,
      message: t("profile.currentPasswordRequired"),
      trigger: "blur",
    },
  ],
  newPassword: [
    {
      required: true,
      message: t("profile.newPasswordRequired"),
      trigger: "blur",
    },
    { min: 6, max: 20, message: t("profile.passwordLength"), trigger: "blur" },
  ],
  confirmPassword: [
    {
      required: true,
      message: t("profile.confirmPasswordRequired"),
      trigger: "blur",
    },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error(t("profile.passwordMismatch")));
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
    capture(error, t("profile.loadPrivacyFailed"));
  }
};

const updateProfile = async () => {
  if (!profileFormRef.value) {
    return;
  }
  try {
    await profileFormRef.value.validate();
    updatingProfile.value = true;
    const response = await userService.updateProfile({
      nickname: profileForm.nickname,
      email: profileForm.email || undefined,
      phone: profileForm.phone || undefined,
      gender: profileForm.gender || undefined,
      birthday: profileForm.birthday || undefined,
      signature: profileForm.signature || undefined,
      location: profileForm.location || undefined,
    });
    userStore.setCurrentUser(response.data);
    notifySuccess(t("profile.profileUpdated"));
  } catch (error) {
    capture(error, t("profile.updateFailed"));
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
      throw new Error(response.message || t("profile.uploadFailed"));
    }
    const updateResponse = await userService.updateProfile({
      avatar: response.data.url,
    });
    userStore.setCurrentUser(updateResponse.data);
    notifySuccess(t("profile.avatarUpdated"));
  } catch (error) {
    capture(error, t("profile.uploadFailed"));
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
    notifySuccess(t("profile.passwordUpdated"));
    showChangePassword.value = false;
    Object.assign(passwordForm, {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  } catch (error) {
    capture(error, t("profile.changePasswordFailed"));
  } finally {
    changingPassword.value = false;
  }
};

const savePrivacySettings = async () => {
  try {
    await settingsStore.updatePrivacySettings({ ...privacySettings });
    notifySuccess(t("profile.privacySaved"));
  } catch (error) {
    capture(error, t("profile.savePrivacyFailed"));
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
  overflow-y: auto;
  padding: 24px;
  background:
    radial-gradient(
      circle at 16% 10%,
      rgba(37, 99, 235, 0.12),
      transparent 26%
    ),
    radial-gradient(circle at 84% 4%, rgba(16, 185, 129, 0.1), transparent 28%),
    var(--chat-shell-bg);
}

.profile-shell {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.profile-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.topbar-copy h1,
.hero-main h2,
.section-heading h2 {
  margin: 0;
  color: var(--chat-text-primary);
}

.topbar-copy h1 {
  font-size: 24px;
  font-weight: 800;
}

.topbar-copy p,
.hero-main p,
.avatar-tip,
.side-desc {
  color: var(--chat-text-tertiary);
}

.topbar-copy p {
  margin: 2px 0 0;
}

.glass-card {
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: var(--chat-panel-bg);
  box-shadow: var(--chat-surface-shadow);
  backdrop-filter: var(--chat-glass-blur);
}

.profile-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 22px;
  margin-bottom: 14px;
  padding: 18px;
}

.avatar-block {
  display: flex;
  align-items: center;
  gap: 14px;
}

.profile-avatar {
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: var(--chat-panel-strong);
}

.avatar-button,
.primary-button,
.secondary-button,
.mini-button,
.icon-button {
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.avatar-button,
.primary-button {
  min-height: 36px;
  padding: 0 14px;
  background: var(--chat-accent);
  color: #fff;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.2);
}

.avatar-button:hover,
.primary-button:hover {
  transform: translateY(-1px);
  background: var(--chat-accent-strong);
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.secondary-button,
.mini-button,
.icon-button {
  min-height: 36px;
  padding: 0 12px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--chat-text-secondary);
}

.icon-button {
  width: 38px;
  padding: 0;
}

.secondary-button:hover,
.mini-button:hover,
.icon-button:hover {
  transform: translateY(-1px);
  color: var(--chat-accent-strong);
  background: rgba(37, 99, 235, 0.1);
}

.section-kicker {
  margin-bottom: 5px;
  color: var(--chat-accent-strong);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.hero-main {
  min-width: 0;
}

.hero-main h2 {
  font-size: 24px;
  font-weight: 850;
}

.hero-main p {
  margin: 2px 0 8px;
}

.avatar-tip {
  font-size: 12px;
}

.hero-status {
  display: flex;
  gap: 8px;
}

.status-chip {
  min-width: 112px;
  padding: 10px 12px;
  border: 1px solid var(--chat-panel-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
}

.status-chip span {
  display: block;
  color: var(--chat-text-tertiary);
  font-size: 12px;
}

.status-chip strong {
  display: block;
  margin-top: 2px;
  color: var(--chat-text-primary);
  font-size: 14px;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: stretch;
}

.form-card,
.side-card {
  padding: 16px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-heading h2 {
  font-size: 18px;
  font-weight: 800;
}

.profile-form :deep(.el-form-item__label) {
  color: var(--chat-text-secondary);
  font-weight: 700;
}

.profile-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 14px;
}

.form-item-full {
  grid-column: 1 / -1;
}

.form-item-span-2 {
  grid-column: span 2;
}

.full-control {
  width: 100%;
}

.flat-radio-group {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.flat-radio-group :deep(.el-radio-button__inner) {
  width: 100%;
}

.profile-form :deep(.el-input__wrapper),
.profile-form :deep(.el-textarea__inner) {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 0 0 1px var(--chat-panel-border) inset;
}

.profile-form :deep(.el-input__wrapper.is-focus),
.profile-form :deep(.el-textarea__inner:focus) {
  box-shadow:
    0 0 0 1px rgba(37, 99, 235, 0.48) inset,
    0 0 0 3px rgba(37, 99, 235, 0.1);
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-row,
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 0;
  border-bottom: 1px solid var(--chat-divider);
}

.side-row:last-child,
.switch-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.side-title {
  color: var(--chat-text-primary);
  font-weight: 800;
}

.side-desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
}

.status-text {
  flex-shrink: 0;
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 980px) {
  .profile-grid {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .profile-hero {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .hero-status {
    grid-column: 1 / -1;
    width: 100%;
  }

  .status-chip {
    flex: 1;
  }
}

@media (max-width: 640px) {
  .profile-page {
    padding: 14px;
  }

  .profile-topbar,
  .profile-hero,
  .avatar-block,
  .form-actions {
    align-items: stretch;
  }

  .profile-hero,
  .avatar-block,
  .profile-topbar {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-item-span-2 {
    grid-column: 1;
  }

  .hero-status {
    flex-direction: column;
  }

  .primary-button,
  .secondary-button {
    width: 100%;
  }
}
</style>
