<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">IM聊天应用</h1>
        <p class="login-subtitle">欢迎回来，请登录您的账户</p>
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

        <el-form-item>
          <el-checkbox v-model="loginForm.rememberMe"> 记住我 </el-checkbox>
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
        <el-link type="primary" @click="$router.push('/register')">
          立即注册
        </el-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElForm } from "element-plus";
import { useUserStore } from "@/stores/user";
import type { LoginForm } from "@/types";

// 路由
const router = useRouter();
const route = useRoute();

// 状态管理
const userStore = useUserStore();

// 表单引用
const loginFormRef = ref<InstanceType<typeof ElForm>>();

// 登录状态标志
const isLoggingIn = ref(false);

// 登录表单数据
const loginForm = reactive<LoginForm>({
  username: "",
  password: "",
  rememberMe: false,
});

// 表单验证规则
const loginRules = {
  username: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    {
      min: 3,
      max: 20,
      message: "用户名长度在 3 到 20 个字符",
      trigger: "blur",
    },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度在 6 到 20 个字符", trigger: "blur" },
  ],
};

// 登录处理
const handleLogin = async () => {
  try {
    const valid = await loginFormRef.value.validate();
    if (!valid) return;

    isLoggingIn.value = true;
    // 处理重定向路径
    let redirectPath = (route.query.redirect as string) || "/chat";
    if (redirectPath.includes("?")) {
      redirectPath = redirectPath.split("?")[0];
    }

    // 调用 store 的 login action
    const success = await userStore.login(loginForm);

    if (success) {
      await nextTick();
      router.replace(redirectPath);
    }
  } catch (error: any) {
    console.error("登录流程失败:", error);
    // 错误消息已在 store 中处理
  } finally {
    isLoggingIn.value = false;
  }
};

// 组件挂载时的处理
onMounted(() => {
  // 如果已经登录且不在登录过程中，直接跳转到目标页面
  if (userStore.isLoggedIn && !isLoggingIn.value) {
    const redirectPath = (route.query.redirect as string) || "/chat";
    router.replace(redirectPath);
  }
});
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  padding: 40px;
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.login-title {
  font-size: 24px;
  font-weight: 500;
  color: #333;
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.login-form {
  margin-bottom: 24px;
}

.login-form .el-form-item {
  margin-bottom: 24px;
}

.login-button {
  width: 100%;
  height: 40px;
  font-size: 16px;
  font-weight: 400;
  background-color: #07c160;
  border-color: #07c160;

  &:hover,
  &:focus {
    background-color: #06ad56;
    border-color: #06ad56;
  }
}

.login-footer {
  text-align: center;
  font-size: 14px;
  color: #999;
}

.login-footer .el-link {
  margin-left: 8px;
  font-weight: 400;
  color: #576b95;

  &:hover {
    color: #07c160;
  }
}

/* 响应式设计 */
@media (max-width: 480px) {
  .login-card {
    padding: 30px 20px;
    box-shadow: none;
    background: transparent;
  }
}
</style>
