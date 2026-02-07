<template>
  <div class="settings-container">
    <div class="settings-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>设置</h2>
    </div>

    <div class="settings-content">
      <!-- 账户设置 -->
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><User /></el-icon>
            <span>账户设置</span>
          </div>
        </template>

        <div class="settings-list">
          <div class="setting-item" @click="$router.push('/profile')">
            <div class="setting-info">
              <div class="setting-title">个人资料</div>
              <div class="setting-desc">修改头像、昵称、个人信息等</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item" @click="showChangePassword = true">
            <div class="setting-info">
              <div class="setting-title">修改密码</div>
              <div class="setting-desc">更改登录密码</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item" @click="showBindPhone = true">
            <div class="setting-info">
              <div class="setting-title">手机号绑定</div>
              <div class="setting-desc">{{ userInfo?.phone || "未绑定" }}</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item" @click="showBindEmail = true">
            <div class="setting-info">
              <div class="setting-title">邮箱绑定</div>
              <div class="setting-desc">{{ userInfo?.email || "未绑定" }}</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
      </el-card>

      <!-- 隐私设置 -->
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><Lock /></el-icon>
            <span>隐私设置</span>
          </div>
        </template>

        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">允许陌生人添加</div>
              <div class="setting-desc">允许陌生人通过搜索添加您为好友</div>
            </div>
            <el-switch
              v-model="privacySettings.allowStrangerAdd"
              @change="updatePrivacySetting('allowStrangerAdd', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">显示在线状态</div>
              <div class="setting-desc">向好友显示您的在线状态</div>
            </div>
            <el-switch
              v-model="privacySettings.showOnlineStatus"
              @change="updatePrivacySetting('showOnlineStatus', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">允许查看朋友圈</div>
              <div class="setting-desc">允许好友查看您的朋友圈动态</div>
            </div>
            <el-switch
              v-model="privacySettings.allowViewMoments"
              @change="updatePrivacySetting('allowViewMoments', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">消息已读回执</div>
              <div class="setting-desc">向对方显示消息已读状态</div>
            </div>
            <el-switch
              v-model="privacySettings.messageReadReceipt"
              @change="updatePrivacySetting('messageReadReceipt', $event)"
            />
          </div>
        </div>
      </el-card>

      <!-- 消息设置 -->
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><ChatDotRound /></el-icon>
            <span>消息设置</span>
          </div>
        </template>

        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">消息通知</div>
              <div class="setting-desc">接收新消息时显示通知</div>
            </div>
            <el-switch
              v-model="messageSettings.enableNotification"
              @change="updateMessageSetting('enableNotification', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">声音提醒</div>
              <div class="setting-desc">接收新消息时播放提示音</div>
            </div>
            <el-switch
              v-model="messageSettings.enableSound"
              @change="updateMessageSetting('enableSound', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">震动提醒</div>
              <div class="setting-desc">接收新消息时震动提醒（移动设备）</div>
            </div>
            <el-switch
              v-model="messageSettings.enableVibration"
              @change="updateMessageSetting('enableVibration', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">群组消息免打扰</div>
              <div class="setting-desc">群组消息不显示通知</div>
            </div>
            <el-switch
              v-model="messageSettings.muteGroupMessages"
              @change="updateMessageSetting('muteGroupMessages', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">自动下载图片</div>
              <div class="setting-desc">自动下载聊天中的图片</div>
            </div>
            <el-switch
              v-model="messageSettings.autoDownloadImages"
              @change="updateMessageSetting('autoDownloadImages', $event)"
            />
          </div>
        </div>
      </el-card>

      <!-- 通用设置 -->
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>通用设置</span>
          </div>
        </template>

        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">语言</div>
              <div class="setting-desc">选择界面语言</div>
            </div>
            <el-select
              v-model="generalSettings.language"
              @change="updateGeneralSetting('language', $event)"
              style="width: 120px"
            >
              <el-option label="中文" value="zh-CN" />
              <el-option label="English" value="en-US" />
            </el-select>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">主题</div>
              <div class="setting-desc">选择界面主题</div>
            </div>
            <el-select
              v-model="generalSettings.theme"
              @change="updateGeneralSetting('theme', $event)"
              style="width: 120px"
            >
              <el-option label="浅色" value="light" />
              <el-option label="深色" value="dark" />
              <el-option label="自动" value="auto" />
            </el-select>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">字体大小</div>
              <div class="setting-desc">调整界面字体大小</div>
            </div>
            <el-select
              v-model="generalSettings.fontSize"
              @change="updateGeneralSetting('fontSize', $event)"
              style="width: 120px"
            >
              <el-option label="小" value="small" />
              <el-option label="中" value="medium" />
              <el-option label="大" value="large" />
            </el-select>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">自动登录</div>
              <div class="setting-desc">启动时自动登录</div>
            </div>
            <el-switch
              v-model="generalSettings.autoLogin"
              @change="updateGeneralSetting('autoLogin', $event)"
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">启动时最小化</div>
              <div class="setting-desc">启动时最小化到系统托盘</div>
            </div>
            <el-switch
              v-model="generalSettings.minimizeOnStart"
              @change="updateGeneralSetting('minimizeOnStart', $event)"
            />
          </div>
        </div>
      </el-card>

      <!-- 数据管理 -->
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><FolderOpened /></el-icon>
            <span>数据管理</span>
          </div>
        </template>

        <div class="settings-list">
          <div class="setting-item" @click="clearCache">
            <div class="setting-info">
              <div class="setting-title">清理缓存</div>
              <div class="setting-desc">清理应用缓存数据</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item" @click="exportData">
            <div class="setting-info">
              <div class="setting-title">导出数据</div>
              <div class="setting-desc">导出聊天记录和个人数据</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item" @click="showDeleteAccount = true">
            <div class="setting-info">
              <div class="setting-title">注销账户</div>
              <div class="setting-desc">永久删除账户和所有数据</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
      </el-card>

      <!-- 关于 -->
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><InfoFilled /></el-icon>
            <span>关于</span>
          </div>
        </template>

        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">版本信息</div>
              <div class="setting-desc">v1.0.0</div>
            </div>
          </div>

          <div class="setting-item" @click="checkUpdate">
            <div class="setting-info">
              <div class="setting-title">检查更新</div>
              <div class="setting-desc">检查是否有新版本</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">用户协议</div>
              <div class="setting-desc">查看用户服务协议</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">隐私政策</div>
              <div class="setting-desc">查看隐私保护政策</div>
            </div>
            <el-icon class="setting-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
      </el-card>

      <!-- 退出登录 -->
      <div class="logout-section">
        <el-button
          type="danger"
          size="large"
          @click="logout"
          :loading="loggingOut"
        >
          退出登录
        </el-button>
      </div>
    </div>

    <!-- 修改密码对话框 -->
    <el-dialog v-model="showChangePassword" title="修改密码" width="400px">
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="100px"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
          />
        </el-form-item>

        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="请输入新密码"
            show-password
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showChangePassword = false">取消</el-button>
        <el-button
          type="primary"
          @click="changePassword"
          :loading="changingPassword"
        >
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 绑定手机号对话框 -->
    <el-dialog v-model="showBindPhone" title="绑定手机号" width="400px">
      <el-form
        ref="phoneFormRef"
        :model="phoneForm"
        :rules="phoneRules"
        label-width="100px"
      >
        <el-form-item label="手机号" prop="phone">
          <el-input
            v-model="phoneForm.phone"
            placeholder="请输入手机号"
            maxlength="11"
          />
        </el-form-item>

        <el-form-item label="验证码" prop="code">
          <div class="code-input">
            <el-input
              v-model="phoneForm.code"
              placeholder="请输入验证码"
              maxlength="6"
            />
            <el-button
              @click="sendPhoneCode"
              :disabled="phoneCodeCountdown > 0"
              :loading="sendingPhoneCode"
            >
              {{
                phoneCodeCountdown > 0 ? `${phoneCodeCountdown}s` : "发送验证码"
              }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showBindPhone = false">取消</el-button>
        <el-button type="primary" @click="bindPhone" :loading="bindingPhone">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 绑定邮箱对话框 -->
    <el-dialog v-model="showBindEmail" title="绑定邮箱" width="400px">
      <el-form
        ref="emailFormRef"
        :model="emailForm"
        :rules="emailRules"
        label-width="100px"
      >
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="emailForm.email" placeholder="请输入邮箱地址" />
        </el-form-item>

        <el-form-item label="验证码" prop="code">
          <div class="code-input">
            <el-input
              v-model="emailForm.code"
              placeholder="请输入验证码"
              maxlength="6"
            />
            <el-button
              @click="sendEmailCode"
              :disabled="emailCodeCountdown > 0"
              :loading="sendingEmailCode"
            >
              {{
                emailCodeCountdown > 0 ? `${emailCodeCountdown}s` : "发送验证码"
              }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showBindEmail = false">取消</el-button>
        <el-button type="primary" @click="bindEmail" :loading="bindingEmail">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 注销账户确认对话框 -->
    <el-dialog v-model="showDeleteAccount" title="注销账户" width="400px">
      <div class="delete-account-content">
        <el-alert
          title="警告"
          type="warning"
          description="注销账户将永久删除您的所有数据，包括聊天记录、好友关系等，此操作不可恢复！"
          show-icon
          :closable="false"
        />

        <el-form
          ref="deleteFormRef"
          :model="deleteForm"
          :rules="deleteRules"
          label-width="100px"
          style="margin-top: 20px"
        >
          <el-form-item label="确认密码" prop="password">
            <el-input
              v-model="deleteForm.password"
              type="password"
              placeholder="请输入登录密码确认"
              show-password
            />
          </el-form-item>

          <el-form-item label="确认操作" prop="confirm">
            <el-input
              v-model="deleteForm.confirm"
              placeholder="请输入 '确认注销' 来确认操作"
            />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="showDeleteAccount = false">取消</el-button>
        <el-button
          type="danger"
          @click="deleteAccount"
          :loading="deletingAccount"
        >
          确认注销
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from "element-plus";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Lock,
  ChatDotRound,
  Setting,
  FolderOpened,
  InfoFilled,
} from "@element-plus/icons-vue";
import { useUserStore } from "@/stores/user";

// 路由
const router = useRouter();

// 状态管理
const userStore = useUserStore();

// 引用
const passwordFormRef = ref<FormInstance>();
const phoneFormRef = ref<FormInstance>();
const emailFormRef = ref<FormInstance>();
const deleteFormRef = ref<FormInstance>();

// 响应式数据
const loggingOut = ref(false);
const changingPassword = ref(false);
const bindingPhone = ref(false);
const bindingEmail = ref(false);
const deletingAccount = ref(false);
const sendingPhoneCode = ref(false);
const sendingEmailCode = ref(false);
const phoneCodeCountdown = ref(0);
const emailCodeCountdown = ref(0);

// 对话框状态
const showChangePassword = ref(false);
const showBindPhone = ref(false);
const showBindEmail = ref(false);
const showDeleteAccount = ref(false);

// 设置数据
const privacySettings = reactive({
  allowStrangerAdd: true,
  showOnlineStatus: true,
  allowViewMoments: true,
  messageReadReceipt: true,
});

const messageSettings = reactive({
  enableNotification: true,
  enableSound: true,
  enableVibration: true,
  muteGroupMessages: false,
  autoDownloadImages: true,
});

const generalSettings = reactive({
  language: "zh-CN",
  theme: "light",
  fontSize: "medium",
  autoLogin: true,
  minimizeOnStart: false,
});

// 表单数据
const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const phoneForm = reactive({
  phone: "",
  code: "",
});

const emailForm = reactive({
  email: "",
  code: "",
});

const deleteForm = reactive({
  password: "",
  confirm: "",
});

// 计算属性
const userInfo = computed(() => userStore.userInfo);

// 表单验证规则
const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: "请输入当前密码", trigger: "blur" },
  ],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度在 6 到 20 个字符", trigger: "blur" },
  ],
  confirmPassword: [
    { required: true, message: "请确认新密码", trigger: "blur" },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error("两次输入的密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur",
    },
  ],
};

const phoneRules: FormRules = {
  phone: [
    { required: true, message: "请输入手机号", trigger: "blur" },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: "请输入正确的手机号",
      trigger: "blur",
    },
  ],
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码为6位数字", trigger: "blur" },
  ],
};

const emailRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱地址", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱地址", trigger: "blur" },
  ],
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码为6位数字", trigger: "blur" },
  ],
};

const deleteRules: FormRules = {
  password: [{ required: true, message: "请输入登录密码", trigger: "blur" }],
  confirm: [
    { required: true, message: "请输入确认文字", trigger: "blur" },
    {
      validator: (rule, value, callback) => {
        if (value !== "确认注销") {
          callback(new Error('请输入 "确认注销"'));
        } else {
          callback();
        }
      },
      trigger: "blur",
    },
  ],
};

// 定时器
let phoneTimer: NodeJS.Timeout | null = null;
let emailTimer: NodeJS.Timeout | null = null;

// 方法
const updatePrivacySetting = async (key: string, value: boolean) => {
  try {
    // TODO: 调用API更新隐私设置
    await userStore.updatePrivacySettings({ [key]: value });
    ElMessage.success("设置已更新");
  } catch (error: any) {
    ElMessage.error(error.message || "更新设置失败");
    // 恢复原值
    (privacySettings as any)[key] = !value;
  }
};

const updateMessageSetting = async (key: string, value: boolean) => {
  try {
    // TODO: 调用API更新消息设置
    await userStore.updateMessageSettings({ [key]: value });
    ElMessage.success("设置已更新");
  } catch (error: any) {
    ElMessage.error(error.message || "更新设置失败");
    // 恢复原值
    (messageSettings as any)[key] = !value;
  }
};

const updateGeneralSetting = async (key: string, value: any) => {
  try {
    // TODO: 调用API更新通用设置
    await userStore.updateGeneralSettings({ [key]: value });
    ElMessage.success("设置已更新");

    // 应用主题变化
    if (key === "theme") {
      applyTheme(value);
    }
  } catch (error: any) {
    ElMessage.error(error.message || "更新设置失败");
  }
};

const applyTheme = (theme: string) => {
  // TODO: 实现主题切换逻辑
  document.documentElement.setAttribute("data-theme", theme);
};

const changePassword = async () => {
  if (!passwordFormRef.value) return;

  try {
    await passwordFormRef.value.validate();
    changingPassword.value = true;

    await userStore.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });

    ElMessage.success("密码修改成功");
    showChangePassword.value = false;

    // 重置表单
    Object.assign(passwordForm, {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  } catch (error: any) {
    ElMessage.error(error.message || "密码修改失败");
  } finally {
    changingPassword.value = false;
  }
};

const sendPhoneCode = async () => {
  if (!phoneForm.phone) {
    ElMessage.error("请先输入手机号");
    return;
  }

  if (!/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
    ElMessage.error("请输入正确的手机号");
    return;
  }

  try {
    sendingPhoneCode.value = true;

    // TODO: 调用API发送手机验证码
    await userStore.sendPhoneCode(phoneForm.phone);

    ElMessage.success("验证码已发送");

    // 开始倒计时
    phoneCodeCountdown.value = 60;
    phoneTimer = setInterval(() => {
      phoneCodeCountdown.value--;
      if (phoneCodeCountdown.value <= 0) {
        clearInterval(phoneTimer!);
        phoneTimer = null;
      }
    }, 1000);
  } catch (error: any) {
    ElMessage.error(error.message || "发送验证码失败");
  } finally {
    sendingPhoneCode.value = false;
  }
};

const sendEmailCode = async () => {
  if (!emailForm.email) {
    ElMessage.error("请先输入邮箱地址");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)) {
    ElMessage.error("请输入正确的邮箱地址");
    return;
  }

  try {
    sendingEmailCode.value = true;

    // TODO: 调用API发送邮箱验证码
    await userStore.sendEmailCode(emailForm.email);

    ElMessage.success("验证码已发送");

    // 开始倒计时
    emailCodeCountdown.value = 60;
    emailTimer = setInterval(() => {
      emailCodeCountdown.value--;
      if (emailCodeCountdown.value <= 0) {
        clearInterval(emailTimer!);
        emailTimer = null;
      }
    }, 1000);
  } catch (error: any) {
    ElMessage.error(error.message || "发送验证码失败");
  } finally {
    sendingEmailCode.value = false;
  }
};

const bindPhone = async () => {
  if (!phoneFormRef.value) return;

  try {
    await phoneFormRef.value.validate();
    bindingPhone.value = true;

    await userStore.bindPhone({
      phone: phoneForm.phone,
      code: phoneForm.code,
    });

    ElMessage.success("手机号绑定成功");
    showBindPhone.value = false;

    // 重置表单
    Object.assign(phoneForm, {
      phone: "",
      code: "",
    });
  } catch (error: any) {
    ElMessage.error(error.message || "手机号绑定失败");
  } finally {
    bindingPhone.value = false;
  }
};

const bindEmail = async () => {
  if (!emailFormRef.value) return;

  try {
    await emailFormRef.value.validate();
    bindingEmail.value = true;

    await userStore.bindEmail({
      email: emailForm.email,
      code: emailForm.code,
    });

    ElMessage.success("邮箱绑定成功");
    showBindEmail.value = false;

    // 重置表单
    Object.assign(emailForm, {
      email: "",
      code: "",
    });
  } catch (error: any) {
    ElMessage.error(error.message || "邮箱绑定失败");
  } finally {
    bindingEmail.value = false;
  }
};

const clearCache = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要清理缓存吗？这将清除所有本地缓存数据。",
      "清理缓存",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    // TODO: 清理缓存逻辑
    localStorage.clear();
    sessionStorage.clear();

    ElMessage.success("缓存清理成功");
  } catch (error) {
    // 用户取消
  }
};

const exportData = async () => {
  try {
    // TODO: 实现数据导出功能
    ElMessage.info("数据导出功能开发中");
  } catch (error: any) {
    ElMessage.error(error.message || "数据导出失败");
  }
};

const deleteAccount = async () => {
  if (!deleteFormRef.value) return;

  try {
    await deleteFormRef.value.validate();
    deletingAccount.value = true;

    await userStore.deleteAccount({
      password: deleteForm.password,
    });

    ElMessage.success("账户注销成功");

    // 清理本地数据并跳转到登录页
    await userStore.logout();
    router.push("/login");
  } catch (error: any) {
    ElMessage.error(error.message || "账户注销失败");
  } finally {
    deletingAccount.value = false;
  }
};

const checkUpdate = async () => {
  try {
    // TODO: 检查更新逻辑
    ElMessage.info("当前已是最新版本");
  } catch (error: any) {
    ElMessage.error(error.message || "检查更新失败");
  }
};

const logout = async () => {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "退出登录", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    loggingOut.value = true;

    await userStore.logout();
    router.push("/login");
  } catch (error) {
    // 用户取消
  } finally {
    loggingOut.value = false;
  }
};

const loadSettings = async () => {
  try {
    // TODO: 从API加载用户设置
    const settings = await userStore.getUserSettings();

    if (settings.privacy) {
      Object.assign(privacySettings, settings.privacy);
    }

    if (settings.message) {
      Object.assign(messageSettings, settings.message);
    }

    if (settings.general) {
      Object.assign(generalSettings, settings.general);
      applyTheme(settings.general.theme);
    }
  } catch (error: any) {
    console.error("加载设置失败:", error);
  }
};

// 组件挂载
onMounted(() => {
  loadSettings();
});

// 组件卸载
onUnmounted(() => {
  if (phoneTimer) {
    clearInterval(phoneTimer);
  }
  if (emailTimer) {
    clearInterval(emailTimer);
  }
});
</script>

<style scoped>
.settings-container {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: #f5f5f5;
  padding: 20px;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
  padding: 0 20px;
}

.settings-header h2 {
  margin: 0;
  color: #2c3e50;
  font-weight: 500;
}

.settings-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  color: #2c3e50;
}

.settings-list {
  display: flex;
  flex-direction: column;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-item:hover {
  background: #f8f9fa;
  margin: 0 -20px;
  padding-left: 20px;
  padding-right: 20px;
}

.setting-info {
  flex: 1;
}

.setting-title {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 4px;
}

.setting-desc {
  font-size: 13px;
  color: #6c757d;
  line-height: 1.4;
}

.setting-arrow {
  color: #c0c4cc;
  font-size: 14px;
}

.logout-section {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.code-input {
  display: flex;
  gap: 10px;
}

.code-input .el-input {
  flex: 1;
}

.delete-account-content {
  padding: 10px 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .settings-container {
    padding: 10px;
  }

  .settings-header {
    padding: 0 10px;
  }

  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .setting-item:hover {
    margin: 0;
    padding: 16px 0;
  }

  .code-input {
    flex-direction: column;
  }
}

/* 主题样式 */
[data-theme="dark"] .settings-container {
  background: #1a1a1a;
}

[data-theme="dark"] .settings-card {
  background: #2d2d2d;
  border-color: #404040;
}

[data-theme="dark"] .card-header {
  color: #e0e0e0;
}

[data-theme="dark"] .setting-title {
  color: #e0e0e0;
}

[data-theme="dark"] .setting-desc {
  color: #a0a0a0;
}

[data-theme="dark"] .setting-item {
  border-bottom-color: #404040;
}

[data-theme="dark"] .setting-item:hover {
  background: #3a3a3a;
}
</style>
