<template>
  <div class="register-container">
    <div class="register-card">
      <div class="register-header">
        <h1 class="register-title">IM聊天应用</h1>
        <p class="register-subtitle">创建您的账户，开始聊天之旅</p>
      </div>

      <el-form
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        class="register-form"
        @submit.prevent="handleRegister"
      >
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            placeholder="请输入用户名"
            size="large"
            prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            placeholder="请输入邮箱"
            size="large"
            prefix-icon="Message"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            prefix-icon="Lock"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            placeholder="请确认密码"
            size="large"
            prefix-icon="Lock"
            show-password
            clearable
            @keyup.enter="handleRegister"
          />
        </el-form-item>

        <el-form-item prop="agreement">
          <el-checkbox v-model="registerForm.agreement">
            我已阅读并同意
            <el-link type="primary" @click="showAgreement = true">
              用户协议
            </el-link>
            和
            <el-link type="primary" @click="showPrivacy = true">
              隐私政策
            </el-link>
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="register-button"
            :loading="userStore.loading"
            @click="handleRegister"
          >
            注册
          </el-button>
        </el-form-item>
      </el-form>

      <div class="register-footer">
        <span>已有账户？</span>
        <el-link type="primary" @click="$router.push('/login')">
          立即登录
        </el-link>
      </div>
    </div>

    <!-- 用户协议对话框 -->
    <el-dialog
      v-model="showAgreement"
      title="用户协议"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="agreement-content">
        <h3>1. 服务条款</h3>
        <p>
          欢迎使用IM聊天应用。在使用本服务前，请仔细阅读并理解本协议的所有条款。
        </p>

        <h3>2. 用户责任</h3>
        <p>用户应当遵守相关法律法规，不得利用本服务从事违法违规活动。</p>

        <h3>3. 隐私保护</h3>
        <p>我们重视用户隐私，将按照隐私政策保护用户个人信息。</p>

        <h3>4. 服务变更</h3>
        <p>我们保留随时修改或终止服务的权利，恕不另行通知。</p>
      </div>

      <template #footer>
        <el-button @click="showAgreement = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 隐私政策对话框 -->
    <el-dialog
      v-model="showPrivacy"
      title="隐私政策"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="privacy-content">
        <h3>1. 信息收集</h3>
        <p>我们仅收集为提供服务所必需的用户信息。</p>

        <h3>2. 信息使用</h3>
        <p>收集的信息仅用于提供和改善服务，不会用于其他目的。</p>

        <h3>3. 信息保护</h3>
        <p>我们采用行业标准的安全措施保护用户信息安全。</p>

        <h3>4. 信息共享</h3>
        <p>除法律要求外，我们不会与第三方共享用户个人信息。</p>
      </div>

      <template #footer>
        <el-button @click="showPrivacy = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElForm } from "element-plus";
import { useUserStore } from "@/stores/user";
import type { RegisterForm } from "@/types";

// 路由
const router = useRouter();

// 状态管理
const userStore = useUserStore();

// 表单引用
const registerFormRef = ref<InstanceType<typeof ElForm>>();

// 对话框状态
const showAgreement = ref(false);
const showPrivacy = ref(false);

// 注册表单数据
const registerForm = reactive<RegisterForm>({
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  agreement: false,
});

// 表单验证规则
const registerRules = {
  username: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    {
      min: 3,
      max: 20,
      message: "用户名长度在 3 到 20 个字符",
      trigger: "blur",
    },
    {
      pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
      message: "用户名只能包含字母、数字、下划线和中文",
      trigger: "blur",
    },
  ],
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度在 6 到 20 个字符", trigger: "blur" },
    {
      pattern: /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$/,
      message: "密码必须包含字母和数字",
      trigger: "blur",
    },
  ],
  confirmPassword: [
    { required: true, message: "请确认密码", trigger: "blur" },
    {
      validator: (rule: any, value: string, callback: Function) => {
        if (value !== registerForm.password) {
          callback(new Error("两次输入密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur",
    },
  ],
  agreement: [
    {
      validator: (rule: any, value: boolean, callback: Function) => {
        if (!value) {
          callback(new Error("请阅读并同意用户协议和隐私政策"));
        } else {
          callback();
        }
      },
      trigger: "change",
    },
  ],
};

// 处理注册
const handleRegister = async () => {
  if (!registerFormRef.value) return;

  try {
    const valid = await registerFormRef.value.validate();
    if (!valid) return;

    await userStore.register(registerForm);

    ElMessage.success("注册成功，请登录");

    // 跳转到登录页面
    router.push("/login");
  } catch (error: any) {
    console.error("注册失败:", error);
    ElMessage.error(error.message || "注册失败，请重试");
  }
};

// 组件挂载时的处理
onMounted(() => {
  // 如果已经登录，直接跳转到聊天页面
  if (userStore.isLoggedIn) {
    router.push("/chat");
  }
});
</script>

<style scoped>
.register-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  padding: 20px;
}

.register-card {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  padding: 40px;
}

.register-header {
  text-align: center;
  margin-bottom: 40px;
}

.register-title {
  font-size: 24px;
  font-weight: 500;
  color: #333;
  margin: 0 0 8px 0;
}

.register-subtitle {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.register-form {
  margin-bottom: 24px;
}

.register-form .el-form-item {
  margin-bottom: 24px;
}

.register-button {
  width: 100%;
  height: 40px;
  font-size: 16px;
  font-weight: 400;
  background-color: #07c160;
  border-color: #07c160;
  
  &:hover, &:focus {
    background-color: #06ad56;
    border-color: #06ad56;
  }
}

.register-footer {
  text-align: center;
  font-size: 14px;
  color: #999;
}

.register-footer .el-link {
  margin-left: 8px;
  font-weight: 400;
  color: #576b95;
  
  &:hover {
    color: #07c160;
  }
}

.agreement-content,
.privacy-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 0 8px;
}

.agreement-content h3,
.privacy-content h3 {
  color: #333;
  font-size: 16px;
  margin: 16px 0 8px 0;
}

.agreement-content p,
.privacy-content p {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 12px 0;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .register-card {
    padding: 30px 20px;
    box-shadow: none;
    background: transparent;
  }
}
</style>
