<template>
  <div id="app" class="app-container">
    <!-- 全局加载状态 -->
    <div
      v-if="loading"
      class="global-loading"
      v-loading="loading"
      element-loading-text="正在加载..."
      element-loading-background="rgba(0, 0, 0, 0.8)"
    ></div>

    <!-- 路由视图 -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- 全局通知容器 -->
    <div id="notification-container"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import { useChatStore } from "@/stores/chat";
import { APP_CONFIG } from "@/config";
import { ElMessage } from "element-plus";

// 状态
const loading = ref(false);
const router = useRouter();

// Store
const userStore = useUserStore();
const webSocketStore = useWebSocketStore();
const chatStore = useChatStore();

// 页面可见性状态
let isPageVisible = true;

// 初始化应用
const initApp = async () => {
  try {
    loading.value = true;

    // 初始化用户状态
    await userStore.init();

    // 如果用户已登录，初始化其他服务
    if (userStore.isLoggedIn) {
      await initUserServices();
    }
  } catch (error) {
    console.error("应用初始化失败:", error);
    ElMessage.error("应用初始化失败");
  } finally {
    loading.value = false;
  }
};

// 初始化用户相关服务
const initUserServices = async () => {
  try {
    // 初始化聊天数据
    await chatStore.init();

    // 连接WebSocket
    if (userStore.userId) {
      webSocketStore.connect(userStore.userId);
    }
  } catch (error) {
    console.error("用户服务初始化失败:", error);
  }
};

// 处理页面可见性变化
const handleVisibilityChange = () => {
  const isVisible = !document.hidden;

  if (isVisible !== isPageVisible) {
    isPageVisible = isVisible;

    if (userStore.isLoggedIn && userStore.userId) {
      if (isVisible) {
        // 页面变为可见，重新连接WebSocket
        if (!webSocketStore.isConnected) {
          console.log("页面变为可见，重新连接WebSocket");
          webSocketStore.connect(userStore.userId);
        }
      } else {
        // 页面变为隐藏，保持连接但可以降低心跳频率
        console.log("页面变为隐藏");
      }
    }
  }
};

// 处理窗口关闭前事件
const handleBeforeUnload = () => {
  if (webSocketStore.isConnected) {
    webSocketStore.disconnect();
  }
};

// 监听用户登录状态变化
watch(
  () => userStore.isLoggedIn,
  async (isLoggedIn) => {
    if (isLoggedIn) {
      // 用户登录，初始化服务
      await initUserServices();
    } else {
      // 用户登出，清理状态
      webSocketStore.disconnect();
      chatStore.clear();
    }
  },
);

// 监听路由变化
watch(
  () => router.currentRoute.value,
  (to) => {
    // 更新页面标题
    const pageTitle =
      typeof to.meta?.title === "string" ? to.meta.title : undefined;
    const appName = String(APP_CONFIG.NAME || "IM");
    if (pageTitle) {
      document.title = `${pageTitle} - ${appName}`;
    } else {
      document.title = appName;
    }
  },
  { immediate: true },
);

// 组件挂载
onMounted(async () => {
  // 初始化应用
  await initApp();

  // 添加事件监听器
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);

  // 请求通知权限
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn("请求通知权限失败:", error);
    }
  }
});

// 组件卸载
onUnmounted(() => {
  // 移除事件监听器
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("beforeunload", handleBeforeUnload);

  // 断开WebSocket连接
  if (webSocketStore.isConnected) {
    webSocketStore.disconnect();
  }
});
</script>

<style lang="scss">
// 全局样式
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background-color: #f5f5f5;
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

// 全局加载状态
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

// 路由过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 滚动条样式
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;

  &:hover {
    background: #a8a8a8;
  }
}

// Element Plus 样式覆盖
.el-message {
  min-width: 300px;

  .el-message__content {
    font-size: 14px;
  }
}

.el-notification {
  .el-notification__title {
    font-size: 16px;
    font-weight: 600;
  }

  .el-notification__content {
    font-size: 14px;
    line-height: 1.4;
  }
}

// 响应式设计
@media (max-width: 768px) {
  html,
  body {
    font-size: 12px;
  }

  .el-message {
    min-width: 250px;
  }
}

// 工具类
.text-center {
  text-align: center;
}

.text-left {
  text-align: left;
}

.text-right {
  text-align: right;
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
</style>
