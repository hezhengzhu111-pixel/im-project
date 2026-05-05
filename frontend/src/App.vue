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
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { APP_CONFIG } from "@/config";
import { useChatStore } from "@/stores/chat";
import { useI18nStore } from "@/stores/i18n";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import { useIsMobile } from "@/composables/useIsMobile";
import { logger } from "@/utils/logger";

const { isMobile } = useIsMobile();
const loading = ref(false);
const bootstrapped = ref(false);
const router = useRouter();
const chatStore = useChatStore();
const userStore = useUserStore();
const webSocketStore = useWebSocketStore();
const { t } = useI18nStore();

let isPageVisible = true;
let cleanupLifecycle: (() => void) | null = null;

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

const setupLifecycleHooks = () => {
  cleanupLifecycle?.();
  cleanupLifecycle = webSocketStore.setupLifecycleListeners(() =>
    userStore.isLoggedIn && userStore.userId ? String(userStore.userId) : null,
  );
};

watch(
  () => userStore.isLoggedIn,
  async (isLoggedIn) => {
    if (isLoggedIn) {
      await initUserServices();
      setupLifecycleHooks();
      return;
    }
    cleanupLifecycle?.();
    cleanupLifecycle = null;
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

watch(
  isMobile,
  (mobile) => {
    document.body.classList.toggle("body-mobile", mobile);
  },
  { immediate: true },
);

onMounted(async () => {
  await initApp();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);
  if (userStore.isLoggedIn) {
    setupLifecycleHooks();
  }
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  cleanupLifecycle?.();
  cleanupLifecycle = null;
  resetUserServices();
});
</script>

<style lang="scss">
// App-specific layout only.
// All resets, utilities, scrollbar, Element Plus overrides
// are in @/styles/global.scss (loaded via index.scss).

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
  z-index: var(--z-max);
}
</style>
