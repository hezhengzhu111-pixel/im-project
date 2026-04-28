<template>
  <div class="settings-page">
    <header class="settings-hero">
      <div class="hero-actions">
        <button
          type="button"
          class="icon-button"
          :aria-label="t('settings.back')"
          @click="router.back()"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </div>

      <div class="hero-copy">
        <h1>{{ t("settings.title") }}</h1>
        <p>{{ t("settings.subtitle") }}</p>
      </div>

      <button
        type="button"
        class="logout-button"
        :disabled="loggingOut"
        @click="logout"
      >
        <el-icon><SwitchButton /></el-icon>
        <span>{{ t("settings.logout") }}</span>
      </button>
    </header>

    <main class="settings-content">
      <section
        class="settings-card account-card"
        @click="router.push('/profile')"
      >
        <div class="account-avatar">
          <el-avatar :size="54" :src="userStore.avatar">
            {{ avatarText }}
          </el-avatar>
        </div>
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.account") }}</div>
          <h2>{{ userDisplayName }}</h2>
          <p>{{ t("settings.profileDesc") }}</p>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.language") }}</div>
          <h2>{{ localeName }}</h2>
          <p>{{ t("settings.languageDesc") }}</p>
        </div>
        <div class="segmented-control">
          <button
            v-for="option in localeOptions"
            :key="option.value"
            type="button"
            :class="{ active: locale === option.value }"
            @click="setLocale(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.appearance") }}</div>
          <h2>{{ t("settings.theme") }}</h2>
          <p>{{ t("settings.themeDesc") }}</p>
        </div>
        <div class="segmented-control">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            :class="{ active: theme === option.value }"
            @click="theme = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.notifications") }}</div>
          <h2>{{ t("settings.notifications") }}</h2>
          <p>{{ t("settings.notificationDesc") }}</p>
        </div>
        <el-switch
          v-model="notificationEnabled"
          size="large"
          @change="updateMessageSetting('enableNotification', Boolean($event))"
        />
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.sound") }}</div>
          <h2>{{ t("settings.sound") }}</h2>
          <p>{{ t("settings.soundDesc") }}</p>
        </div>
        <el-switch
          v-model="soundEnabled"
          size="large"
          @change="updateMessageSetting('enableSound', Boolean($event))"
        />
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.voice") }}</div>
          <h2>{{ t("settings.insecureVoice") }}</h2>
          <p>{{ t("settings.insecureVoiceDesc") }}</p>
        </div>
        <el-switch
          v-model="allowInsecureVoiceRecording"
          size="large"
          @change="updateInsecureVoiceSetting(Boolean($event))"
        />
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.privacy") }}</div>
          <h2>{{ t("settings.readReceipt") }}</h2>
          <p>{{ t("settings.readReceiptDesc") }}</p>
        </div>
        <el-switch
          v-model="readReceiptEnabled"
          size="large"
          @change="updatePrivacySetting('messageReadReceipt', Boolean($event))"
        />
      </section>

      <section class="settings-card">
        <div class="settings-copy">
          <div class="settings-kicker">{{ t("settings.storage") }}</div>
          <h2>{{ t("settings.clearCache") }}</h2>
          <p>{{ t("settings.clearCacheDesc") }}</p>
        </div>
        <button type="button" class="flat-button" @click="clearCache">
          {{ t("settings.clearCache") }}
        </button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {ElMessage, ElMessageBox} from "element-plus";
import {ArrowLeft, SwitchButton} from "@element-plus/icons-vue";
import {useErrorHandler} from "@/hooks/useErrorHandler";
import {defaultUserSettings} from "@/normalizers/user";
import {useI18nStore} from "@/stores/i18n";
import {useUserStore} from "@/stores/user";
import {useUserSettingsStore} from "@/stores/user-settings";
import {getAvatarText} from "@/utils/common";
import type {UserSettings} from "@/types";

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
  allowInsecureVoiceRecording.value =
    settingsStore.allowInsecureVoiceRecording;
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
  allowInsecureVoiceRecording.value =
    settingsStore.allowInsecureVoiceRecording;
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
  padding: 24px;
  overflow-y: auto;
  background:
    radial-gradient(circle at 12% 8%, rgba(37, 99, 235, 0.14), transparent 28%),
    radial-gradient(
      circle at 88% 0%,
      rgba(16, 185, 129, 0.12),
      transparent 30%
    ),
    var(--chat-shell-bg);
}

.settings-hero,
.settings-card {
  border: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  box-shadow: var(--chat-surface-shadow);
  backdrop-filter: var(--chat-glass-blur);
}

.settings-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  max-width: 980px;
  margin: 0 auto 18px;
  padding: 18px;
  border-radius: 8px;
}

.hero-copy h1,
.settings-copy h2 {
  margin: 0;
  color: var(--chat-text-primary);
}

.hero-copy h1 {
  font-size: 24px;
  font-weight: 800;
}

.hero-copy p,
.settings-copy p {
  margin: 4px 0 0;
  color: var(--chat-text-tertiary);
}

.settings-content {
  max-width: 980px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-card {
  min-height: 108px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border-radius: 8px;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.settings-card:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.28);
}

.account-card {
  grid-column: 1 / -1;
  justify-content: flex-start;
  cursor: pointer;
}

.account-avatar {
  flex-shrink: 0;
  padding: 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
}

.settings-copy {
  min-width: 0;
}

.settings-kicker {
  margin-bottom: 4px;
  color: var(--chat-accent-strong);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.settings-copy h2 {
  font-size: 16px;
  font-weight: 800;
}

.settings-copy p {
  font-size: 13px;
}

.icon-button,
.logout-button,
.flat-button,
.segmented-control button {
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.icon-button {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.72);
  color: var(--chat-text-secondary);
}

.logout-button,
.flat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--chat-text-secondary);
  font-weight: 800;
  white-space: nowrap;
}

.logout-button:hover,
.flat-button:hover,
.icon-button:hover {
  transform: translateY(-1px);
  color: var(--chat-accent-strong);
  background: rgba(37, 99, 235, 0.1);
}

.logout-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.segmented-control {
  flex-shrink: 0;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.06);
}

.segmented-control button {
  min-width: 72px;
  min-height: 32px;
  padding: 0 10px;
  background: transparent;
  color: var(--chat-text-secondary);
  font-weight: 800;
}

.segmented-control button.active {
  background: rgba(255, 255, 255, 0.88);
  color: var(--chat-accent-strong);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
}

@media (max-width: 860px) {
  .settings-page {
    padding: 16px;
  }

  .settings-hero,
  .settings-content {
    max-width: none;
  }

  .settings-hero {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .logout-button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .settings-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .settings-card {
    align-items: stretch;
    flex-direction: column;
  }

  .segmented-control,
  .flat-button {
    width: 100%;
  }

  .segmented-control button {
    flex: 1;
  }
}
</style>
