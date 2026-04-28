<template>
  <div id="app" class="app-container">
    <div
      v-if="loading"
      class="global-loading"
      v-loading="loading"
      :element-loading-text="t('app.loading')"
      element-loading-background="rgba(15, 23, 42, 0.72)"
    ></div>

    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <div id="notification-container"></div>
  </div>
</template>

<script setup lang="ts">
import {onMounted, onUnmounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {ElMessage} from "element-plus";
import {APP_CONFIG} from "@/config";
import {useChatStore} from "@/stores/chat";
import {useI18nStore} from "@/stores/i18n";
import {useUserStore} from "@/stores/user";
import {useWebSocketStore} from "@/stores/websocket";
import {logger} from "@/utils/logger";

const loading = ref(false);
const bootstrapped = ref(false);
const router = useRouter();
const chatStore = useChatStore();
const userStore = useUserStore();
const webSocketStore = useWebSocketStore();
const { t } = useI18nStore();

let isPageVisible = true;

const initUserServices = async () => {
  if (!userStore.isLoggedIn || !userStore.userId || bootstrapped.value) {
    return;
  }
  try {
    await chatStore.initChatBootstrap();
    await webSocketStore.connect(String(userStore.userId));
    bootstrapped.value = true;
  } catch (error) {
    logger.error("failed to initialize authenticated services", error);
  }
};

const resetUserServices = () => {
  bootstrapped.value = false;
  webSocketStore.disconnect();
  chatStore.clear();
};

const initApp = async () => {
  try {
    loading.value = true;
    await userStore.init();
    if (userStore.isLoggedIn) {
      await initUserServices();
    }
  } catch (error) {
    logger.error("app initialization failed", error);
    ElMessage.error(t("app.initFailed"));
  } finally {
    loading.value = false;
  }
};

const handleVisibilityChange = () => {
  const isVisible = !document.hidden;
  if (isVisible === isPageVisible) {
    return;
  }
  isPageVisible = isVisible;
  if (
    isVisible &&
    userStore.isLoggedIn &&
    userStore.userId &&
    !webSocketStore.isConnected
  ) {
    void webSocketStore.connect(String(userStore.userId));
  }
};

const handleBeforeUnload = () => {
  if (webSocketStore.isConnected) {
    webSocketStore.disconnect();
  }
};

watch(
  () => userStore.isLoggedIn,
  async (isLoggedIn) => {
    if (isLoggedIn) {
      await initUserServices();
      return;
    }
    resetUserServices();
  },
);

watch(
  () => router.currentRoute.value,
  (to) => {
    const pageTitle =
      typeof to.meta?.title === "string" ? to.meta.title : undefined;
    const appName = String(APP_CONFIG.NAME || "IM");
    document.title = pageTitle ? `${pageTitle} - ${appName}` : appName;
  },
  { immediate: true },
);

onMounted(async () => {
  await initApp();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  resetUserServices();
});
</script>

<style lang="scss">
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
  color: var(--chat-text-primary, #0f172a);
  background: var(--chat-shell-bg, #f3f6fa);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    "Helvetica Neue",
    Arial,
    sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

button,
input,
textarea,
select {
  font: inherit;
}

#app {
  height: 100vh;
  overflow: hidden;
}

.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.global-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(226, 232, 240, 0.52);
  border-radius: 999px;
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.82);
  border-radius: 999px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.88);
}

.el-message {
  left: 50% !important;
  top: 22px !important;
  min-width: 0 !important;
  width: auto !important;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 16px;
  border-radius: 999px;
  transform: translateX(-50%);
  box-shadow: 0 16px 44px rgba(15, 23, 42, 0.14);
}

.el-message .el-message__content {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.el-notification .el-notification__title {
  font-size: 16px;
  font-weight: 700;
}

.el-notification .el-notification__content {
  font-size: 14px;
  line-height: 1.4;
}

.text-center {
  text-align: center;
}

.flex {
  display: flex;
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.flex-column {
  display: flex;
  flex-direction: column;
}

.flex-1 {
  flex: 1;
}

.w-full {
  width: 100%;
}

.h-full {
  height: 100%;
}

.overflow-hidden {
  overflow: hidden;
}

.overflow-auto {
  overflow: auto;
}

.cursor-pointer {
  cursor: pointer;
}

.select-none {
  user-select: none;
}

@media (max-width: 768px) {
  .el-message {
    max-width: calc(100vw - 24px);
  }
}
</style>
