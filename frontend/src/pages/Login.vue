<template>
  <div class="login-page">
    <!-- 左侧品牌视觉区 -->
    <div class="login-brand">
      <div class="brand-content">
        <div class="brand-badge animate-slide-up">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>End-to-End Encrypted</span>
        </div>

        <h1 class="brand-title animate-slide-up" style="animation-delay: 80ms">
          Secure.<br />Private.<br />Instant.
        </h1>

        <p
          class="brand-subtitle animate-slide-up"
          style="animation-delay: 140ms"
        >
          端对端加密即时通信系统，您的消息仅在设备上解密。
        </p>

        <div
          class="brand-features animate-slide-up"
          style="animation-delay: 200ms"
        >
          <div class="feature-item">
            <div class="feature-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div class="feature-text">
              <span class="feature-label">E2EE Enabled</span>
              <span class="feature-desc">端对端加密</span>
            </div>
          </div>

          <div class="feature-item">
            <div class="feature-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div class="feature-text">
              <span class="feature-label">Realtime Delivery</span>
              <span class="feature-desc">实时消息同步</span>
            </div>
          </div>

          <div class="feature-item">
            <div class="feature-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div class="feature-text">
              <span class="feature-label">Device Trust</span>
              <span class="feature-desc">多设备安全登录</span>
            </div>
          </div>

          <div class="feature-item">
            <div class="feature-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <div class="feature-text">
              <span class="feature-label">AI Assistant Online</span>
              <span class="feature-desc">AI 助手接入</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 装饰性背景元素 -->
      <div class="brand-deco brand-deco-1"></div>
      <div class="brand-deco brand-deco-2"></div>
      <div class="brand-deco brand-deco-3"></div>
    </div>

    <!-- 右侧登录表单区 -->
    <div class="login-form-area">
      <div class="login-card animate-scale-in">
        <div class="login-header">
          <h1 class="login-title">欢迎回来</h1>
          <p class="login-subtitle">请登录您的加密通信账户</p>
        </div>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="请输入用户名"
              size="large"
              prefix-icon="User"
              clearable
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              prefix-icon="Lock"
              show-password
              clearable
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item class="login-options">
            <el-checkbox v-model="loginForm.rememberMe">记住我</el-checkbox>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              class="login-button"
              :loading="userStore.loading"
              @click="handleLogin"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>

        <div class="login-footer">
          <span>还没有账户？</span>
          <el-link type="primary" @click="$router.push('/register')"
            >立即注册</el-link
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElMessage, ElForm } from "element-plus";
import { useUserStore } from "@/stores/user";
import type { LoginForm } from "@/types";
import { logger } from "@/utils/logger";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const loginFormRef = ref<InstanceType<typeof ElForm>>();

const loginForm = reactive<LoginForm>({
  username: "",
  password: "",
  rememberMe: false,
});

const loginRules = {
  username: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    {
      min: 3,
      max: 20,
      message: "用户名长度在 3 到 20 个字符",
      trigger: "blur",
    },
    {
      pattern: /^[a-zA-Z0-9_]+$/,
      message: "用户名只能包含字母、数字和下划线",
      trigger: "blur",
    },
  ],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

const handleLogin = async () => {
  if (userStore.loading) return;
  try {
    if (!loginFormRef.value) return;
    const valid = await loginFormRef.value.validate().catch(() => false);
    if (!valid) {
      ElMessage.warning("请填写用户名和密码");
      return;
    }
    loginForm.username = loginForm.username.trim();
    let redirectPath = (route.query.redirect as string) || "/chat";
    if (redirectPath.includes("?")) {
      redirectPath = redirectPath.split("?")[0];
    }
    const success = await userStore.login(loginForm);
    if (success) {
      await nextTick();
      router.replace(redirectPath);
    }
  } catch (error: any) {
    logger.error("login flow failed", error);
  }
};

onMounted(async () => {
  if (await userStore.ensureAuthenticated()) {
    const redirectPath = (route.query.redirect as string) || "/chat";
    router.replace(redirectPath);
  }
});
</script>

<style scoped lang="scss">
.login-page {
  display: flex;
  min-height: 100vh;
  background: var(--bg-gradient);
  overflow: hidden;
}

/* === 左侧品牌区 === */
.login-brand {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px;
  overflow: hidden;
}

.brand-content {
  position: relative;
  z-index: 1;
  max-width: 480px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-full);
  background: var(--surface-overlay);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-light);
  color: var(--color-success);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.02em;
  margin-bottom: 32px;
}

.brand-title {
  font-size: 48px;
  font-weight: var(--weight-bold);
  line-height: 1.15;
  color: var(--text-primary);
  margin: 0 0 20px 0;
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: var(--text-md);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  margin: 0 0 40px 0;
  max-width: 400px;
}

.brand-features {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: var(--radius-md);
  background: var(--surface-overlay);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-light);
  transition:
    transform var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
  }
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-primary), transparent 90%);
  color: var(--color-primary);
  flex-shrink: 0;
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-label {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.feature-desc {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* 装饰性背景 */
.brand-deco {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.brand-deco-1 {
  width: 400px;
  height: 400px;
  top: -100px;
  right: -100px;
  background: radial-gradient(
    circle,
    rgba(99, 102, 241, 0.08) 0%,
    transparent 70%
  );
}

.brand-deco-2 {
  width: 300px;
  height: 300px;
  bottom: -80px;
  left: -80px;
  background: radial-gradient(
    circle,
    rgba(139, 92, 246, 0.06) 0%,
    transparent 70%
  );
}

.brand-deco-3 {
  width: 200px;
  height: 200px;
  top: 40%;
  right: 10%;
  background: radial-gradient(
    circle,
    rgba(34, 197, 94, 0.05) 0%,
    transparent 70%
  );
}

/* === 右侧表单区 === */
.login-form-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 520px;
  min-width: 420px;
  padding: 40px;
  position: relative;
  z-index: 1;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 44px 40px;
  background: var(--surface-overlay);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-title {
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: var(--text-base);
  color: var(--text-tertiary);
  margin: 0;
}

.login-form {
  margin-bottom: 24px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 22px;
}

.login-form :deep(.el-input__wrapper) {
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--surface-elevated);
  border: 1px solid var(--border-light);
  box-shadow: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);

  &:focus-within,
  &:hover {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-glow);
  }
}

.login-form :deep(.el-input__inner) {
  font-size: var(--text-base);
}

.login-options {
  margin-bottom: 28px !important;
}

.login-options :deep(.el-checkbox__label) {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.login-button {
  width: 100%;
  height: 48px;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    var(--color-primary),
    var(--color-primary-2)
  );
  border: none;
  color: var(--text-inverse);
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
  }

  &:active {
    transform: translateY(0);
  }

  &.is-loading {
    opacity: 0.85;
  }
}

.login-footer {
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.login-footer :deep(.el-link) {
  margin-left: 6px;
  font-weight: var(--weight-medium);
}

/* === 动画 === */
.animate-slide-up {
  animation: slideUp 0.6s var(--motion-out) both;
}

.animate-scale-in {
  animation: scaleIn 0.5s var(--motion-spring) both;
  animation-delay: 160ms;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* === 响应式 === */
@media (max-width: 1024px) {
  .login-brand {
    padding: 40px;
  }

  .brand-title {
    font-size: 36px;
  }

  .login-form-area {
    min-width: 380px;
    width: 460px;
    padding: 32px;
  }
}

@media (max-width: 768px) {
  .login-page {
    flex-direction: column;
  }

  .login-brand {
    padding: 40px 24px 24px;
    flex: none;
    min-height: auto;
  }

  .brand-title {
    font-size: 28px;
    margin-bottom: 12px;
  }

  .brand-subtitle {
    font-size: var(--text-sm);
    margin-bottom: 20px;
  }

  .brand-features {
    display: none;
  }

  .brand-badge {
    margin-bottom: 16px;
  }

  .login-form-area {
    width: 100%;
    min-width: auto;
    padding: 20px 24px 40px;
  }

  .login-card {
    padding: 32px 24px;
    box-shadow: none;
    background: var(--surface-overlay);
  }
}

@media (max-width: 390px) {
  .login-brand {
    padding: 24px 16px 16px;
  }

  .brand-title {
    font-size: 24px;
  }

  .login-form-area {
    padding: 16px 16px 32px;
  }

  .login-card {
    padding: 24px 20px;
  }
}
</style>
