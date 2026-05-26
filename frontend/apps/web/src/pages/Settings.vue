<template>
  <div class="settings-page fresh-page">
    <div class="settings-shell">
      <!-- 左侧导航面板 -->
      <aside class="settings-nav-panel">
        <div class="nav-user">
          <el-avatar :size="40" :src="userStore.avatar">
            {{ avatarText }}
          </el-avatar>
          <span class="nav-username">{{ userDisplayName }}</span>
        </div>
        <nav class="nav-items">
          <button type="button" class="nav-item">账号</button>
          <button type="button" class="nav-item">外观</button>
          <button type="button" class="nav-item">通知</button>
          <button type="button" class="nav-item">隐私</button>
          <button type="button" class="nav-item">存储</button>
          <button type="button" class="nav-item" @click="router.push('/settings/ai')">AI</button>
        </nav>
      </aside>

      <!-- 右侧主区域 -->
      <main class="settings-main">
        <div class="settings-primary">
          <!-- Hero -->
          <header class="settings-hero">
            <button type="button" class="icon-button" :aria-label="t('settings.back')" @click="router.back()">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <div class="hero-copy">
              <h1>{{ t("settings.title") }}</h1>
              <p>{{ t("settings.subtitle") }}</p>
            </div>
          </header>

          <!-- 账号 section -->
          <section class="setting-section account-section" @click="router.push('/profile')">
            <div class="account-row">
              <el-avatar :size="44" :src="userStore.avatar">{{ avatarText }}</el-avatar>
              <div class="account-info">
                <div class="account-name">{{ userDisplayName }}</div>
                <div class="account-desc">查看和编辑个人资料</div>
              </div>
              <el-icon class="account-arrow"><ArrowRight /></el-icon>
            </div>
          </section>

          <!-- 偏好 section -->
          <section class="setting-section">
            <div class="setting-row">
              <div class="setting-label">
                <div class="setting-title">语言</div>
                <div class="setting-desc">{{ localeName }}</div>
              </div>
              <div class="segmented-control">
                <button v-for="option in localeOptions" :key="option.value" type="button" :class="{ active: locale === option.value }" @click="setLocale(option.value)">
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.theme") }}</div>
                <div class="setting-desc">{{ t("settings.themeDesc") }}</div>
              </div>
              <div class="segmented-control">
                <button v-for="option in themeOptions" :key="option.value" type="button" :class="{ active: theme === option.value }" @click="theme = option.value">
                  {{ option.label }}
                </button>
              </div>
            </div>
          </section>

          <!-- 通知 section -->
          <section class="setting-section">
            <div class="setting-row">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.notifications") }}</div>
              </div>
              <el-switch v-model="notificationEnabled" size="large" @change="updateMessageSetting('enableNotification', Boolean($event))" />
            </div>
            <div class="setting-row">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.sound") }}</div>
              </div>
              <el-switch v-model="soundEnabled" size="large" @change="updateMessageSetting('enableSound', Boolean($event))" />
            </div>
            <div class="setting-row">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.insecureVoice") }}</div>
                <div class="setting-desc">{{ t("settings.insecureVoiceDesc") }}</div>
              </div>
              <el-switch v-model="allowInsecureVoiceRecording" size="large" @change="updateInsecureVoiceSetting(Boolean($event))" />
            </div>
          </section>

          <!-- 隐私 section -->
          <section class="setting-section">
            <div class="setting-row">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.readReceipt") }}</div>
                <div class="setting-desc">{{ t("settings.readReceiptDesc") }}</div>
              </div>
              <el-switch v-model="readReceiptEnabled" size="large" @change="updatePrivacySetting('messageReadReceipt', Boolean($event))" />
            </div>
          </section>
        </div>
        <div class="settings-secondary">
          <!-- 存储 + AI 双卡片 -->
          <div class="setting-grid-2">
            <section class="setting-section">
              <div class="setting-row" style="border-bottom:none">
                <div class="setting-label">
                  <div class="setting-title">{{ t("settings.clearCache") }}</div>
                  <div class="setting-desc">{{ t("settings.clearCacheDesc") }}</div>
                </div>
                <button type="button" class="flat-button" @click="clearCache">{{ t("settings.clearCache") }}</button>
              </div>
            </section>
            <section class="setting-section is-interactive" @click="router.push('/settings/ai')">
              <div class="setting-row" style="border-bottom:none">
                <div class="setting-label">
                  <div class="setting-title">{{ t("settings.aiAssistant") }}</div>
                  <div class="setting-desc">{{ t("settings.aiAssistantDesc") }}</div>
                </div>
                <el-icon class="account-arrow"><ArrowRight /></el-icon>
              </div>
            </section>
          </div>

          <!-- 退出登录 -->
          <section class="setting-section">
            <div class="setting-row" style="border-bottom:none;justify-content:center">
              <button type="button" class="logout-button" :disabled="loggingOut" @click="logout">
                <el-icon><SwitchButton /></el-icon>
                <span>{{ t("settings.logout") }}</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowLeft, ArrowRight, SwitchButton } from "@element-plus/icons-vue";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { defaultUserSettings } from "@/normalizers/user";
import { useI18nStore } from "@/stores/i18n";
import { useUserStore } from "@/stores/user";
import { useUserSettingsStore } from "@/stores/user-settings";
import { getAvatarText } from "@/utils/common";
import type { UserSettings } from "@/types";

type ThemeMode = "light" | "dark" | "auto";
type MessageKey = "enableNotification" | "enableSound";
type PrivacyKey = "messageReadReceipt";

const THEME_KEY = "im_theme";

const router = useRouter();
const userStore = useUserStore();
const settingsStore = useUserSettingsStore();
const { capture } = useErrorHandler("settings-page");
const { locale, localeName, localeOptions, setLocale, t } = useI18nStore();

const defaults = defaultUserSettings();
const loggingOut = ref(false);
const notificationEnabled = ref(defaults.message.enableNotification);
const soundEnabled = ref(defaults.message.enableSound);
const readReceiptEnabled = ref(defaults.privacy.messageReadReceipt);
const allowInsecureVoiceRecording = ref(
  settingsStore.allowInsecureVoiceRecording,
);
const theme = ref<ThemeMode>("auto");

const userDisplayName = computed(
  () =>
    userStore.userInfo?.nickname ||
    userStore.userInfo?.username ||
    userStore.nickname ||
    "IM",
);
const avatarText = computed(() => getAvatarText(userDisplayName.value));
const themeOptions = computed(() => [
  { label: t("settings.themeLight"), value: "light" as ThemeMode },
  { label: t("settings.themeDark"), value: "dark" as ThemeMode },
  { label: t("settings.themeAuto"), value: "auto" as ThemeMode },
]);

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "auto";

const getEffectiveTheme = (mode: ThemeMode) => {
  if (mode !== "auto") {
    return mode;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyTheme = (mode: ThemeMode) => {
  const effectiveTheme = getEffectiveTheme(mode);
  document.documentElement.dataset.theme = mode;
  document.body.classList.toggle("theme-dark", effectiveTheme === "dark");
  localStorage.setItem(THEME_KEY, mode);
};

const readTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  return isThemeMode(saved) ? saved : "auto";
};

const syncSettingsState = (settings: UserSettings) => {
  notificationEnabled.value = settings.message.enableNotification;
  soundEnabled.value = settings.message.enableSound;
  readReceiptEnabled.value = settings.privacy.messageReadReceipt;
  allowInsecureVoiceRecording.value = settingsStore.allowInsecureVoiceRecording;
};

const loadSettings = async () => {
  try {
    syncSettingsState(await settingsStore.getUserSettings());
  } catch (error) {
    capture(error, "load settings failed");
  }
};

const updateMessageSetting = async (key: MessageKey, value: boolean) => {
  const target =
    key === "enableNotification" ? notificationEnabled : soundEnabled;
  const previous = !value;
  try {
    await settingsStore.updateMessageSettings({ [key]: value });
  } catch (error) {
    target.value = previous;
    capture(error, "update message setting failed");
  }
};

const updatePrivacySetting = async (key: PrivacyKey, value: boolean) => {
  const previous = !value;
  try {
    await settingsStore.updatePrivacySettings({ [key]: value });
  } catch (error) {
    readReceiptEnabled.value = previous;
    capture(error, "update privacy setting failed");
  }
};

const updateInsecureVoiceSetting = (value: boolean) => {
  settingsStore.updateAllowInsecureVoiceRecording(value);
  allowInsecureVoiceRecording.value = settingsStore.allowInsecureVoiceRecording;
};

const clearCache = async () => {
  try {
    await ElMessageBox.confirm(
      t("settings.cacheMessage"),
      t("settings.cacheTitle"),
      {
        type: "warning",
        confirmButtonText: t("common.confirm"),
        cancelButtonText: t("common.cancel"),
      },
    );
    localStorage.removeItem("im_current_session");
    localStorage.removeItem("im_chat_clear_markers");
    localStorage.removeItem("im_ws_cache");
    sessionStorage.clear();
    ElMessage({
      type: "success",
      message: t("settings.cacheCleared"),
      duration: 1600,
      showClose: false,
      grouping: true,
    });
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "clear cache failed");
    }
  }
};

const logout = async () => {
  try {
    await ElMessageBox.confirm(
      t("settings.logoutMessage"),
      t("settings.logoutTitle"),
      {
        type: "warning",
        confirmButtonText: t("common.confirm"),
        cancelButtonText: t("common.cancel"),
      },
    );
    loggingOut.value = true;
    await userStore.logout();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "logout failed");
    }
  } finally {
    loggingOut.value = false;
  }
};

watch(theme, (value) => applyTheme(value));

onMounted(() => {
  theme.value = readTheme();
  applyTheme(theme.value);
  void loadSettings();
});
</script>

<style scoped lang="scss">
.settings-page {
  min-height: 100%;
  padding: 16px var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
}

.settings-shell {
  width: 100%;
  max-width: var(--web-content-max);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr);
  gap: var(--web-gap);
  align-items: start;
}

// ── 左侧导航面板 ──
.settings-nav-panel {
  position: sticky;
  top: 28px;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-page);
  padding: 20px 16px;
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  box-shadow: var(--fresh-glass-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-username {
  font-size: 15px;
  font-weight: 600;
  color: var(--fresh-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: var(--fresh-radius-control);
  background: transparent;
  color: var(--fresh-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: default;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.40);
    color: var(--fresh-text);
  }
}

.nav-logout {
  width: 100%;
  justify-content: center;
}

// ── 右侧主区域 ──
.settings-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--web-gap);
  align-items: start;
}

.settings-primary,
.settings-secondary {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.settings-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 52px;
  padding: 0 4px;
  margin-bottom: 8px;
}

.hero-copy h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--fresh-text);
}

.hero-copy p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--fresh-text-muted);
}

// ── Section 容器 ──
.setting-section {
  border-radius: var(--fresh-radius-page);
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  box-shadow: var(--fresh-glass-shadow-soft);
  margin-bottom: 12px;
  overflow: hidden;

  &.is-interactive {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: var(--fresh-glass-shadow);
    }
  }
}

.setting-row {
  min-height: 52px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.38);

  &:last-child {
    border-bottom: none;
  }
}

.setting-label {
  min-width: 0;
  flex: 1;
  padding-right: 16px;
}

.setting-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fresh-text);
}

.setting-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--fresh-text-muted);
}

.setting-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--fresh-section-gap);
}

// ── 账号卡片 ──
.account-section {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--fresh-glass-shadow);
  }
}

.account-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}

.account-info {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--fresh-text);
}

.account-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--fresh-text-muted);
}

.account-arrow {
  flex-shrink: 0;
  color: var(--fresh-text-muted);
  font-size: 18px;
}

// ── Segmented control ──
.segmented-control {
  flex-shrink: 0;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--fresh-radius-control);
  background: rgba(255, 255, 255, 0.42);

  button {
    min-width: 64px;
    min-height: 30px;
    padding: 0 10px;
    background: transparent;
    color: var(--fresh-text-muted);
    font-weight: 600;
    font-size: 13px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  button.active {
    background: linear-gradient(135deg, rgba(167, 243, 208, 0.9), rgba(186, 230, 253, 0.8));
    color: var(--fresh-text);
    box-shadow: 0 4px 14px rgba(7, 193, 96, 0.10);
  }
}

// ── Buttons ──
.icon-button {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-control);
  background: var(--fresh-glass-bg);
  color: var(--fresh-text);
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: var(--fresh-glass-bg-strong);
  }
}

.logout-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--fresh-radius-control);
  background: rgba(255, 255, 255, 0.42);
  color: var(--fresh-text);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover:not(:disabled) {
    background: rgba(7, 193, 96, 0.12);
    color: var(--fresh-green);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.flat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--fresh-radius-control);
  background: rgba(255, 255, 255, 0.42);
  color: var(--fresh-text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: rgba(7, 193, 96, 0.10);
    color: var(--fresh-green);
  }
}

// ── 移动端 ──
@media (max-width: 1200px) {
  .settings-main {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-nav-panel {
    display: none;
  }

  .setting-grid-2 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .settings-page {
    padding: 16px;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
</style>
