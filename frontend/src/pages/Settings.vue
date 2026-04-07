<template>
  <div class="settings-page">
    <div class="page-header">
      <el-button link :icon="ArrowLeft" @click="$router.back()">返回</el-button>
      <h2>设置</h2>
      <el-button type="danger" :loading="loggingOut" @click="logout">
        退出登录
      </el-button>
    </div>

    <div class="settings-grid">
      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><User /></el-icon>
            <span>账户设置</span>
          </div>
        </template>

        <div class="setting-row" @click="$router.push('/profile')">
          <div>
            <div class="setting-title">个人资料</div>
            <div class="setting-desc">修改头像、昵称和个人信息</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>

        <div class="setting-row" @click="showChangePassword = true">
          <div>
            <div class="setting-title">修改密码</div>
            <div class="setting-desc">定期更换密码可提升账户安全</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>

        <div class="setting-row" @click="showBindPhone = true">
          <div>
            <div class="setting-title">绑定手机号</div>
            <div class="setting-desc">{{ userInfo?.phone || '未绑定' }}</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>

        <div class="setting-row" @click="showBindEmail = true">
          <div>
            <div class="setting-title">绑定邮箱</div>
            <div class="setting-desc">{{ userInfo?.email || '未绑定' }}</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>
      </el-card>

      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><Lock /></el-icon>
            <span>隐私设置</span>
          </div>
        </template>

        <div class="setting-row">
          <div>
            <div class="setting-title">允许陌生人添加</div>
            <div class="setting-desc">允许通过搜索发起好友申请</div>
          </div>
          <el-switch
            v-model="privacySettings.allowStrangerAdd"
            @change="updatePrivacySetting('allowStrangerAdd', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">显示在线状态</div>
            <div class="setting-desc">允许好友看到在线状态</div>
          </div>
          <el-switch
            v-model="privacySettings.showOnlineStatus"
            @change="updatePrivacySetting('showOnlineStatus', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">允许查看朋友圈</div>
            <div class="setting-desc">控制朋友圈可见范围</div>
          </div>
          <el-switch
            v-model="privacySettings.allowViewMoments"
            @change="updatePrivacySetting('allowViewMoments', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">已读回执</div>
            <div class="setting-desc">向对方展示消息已读状态</div>
          </div>
          <el-switch
            v-model="privacySettings.messageReadReceipt"
            @change="updatePrivacySetting('messageReadReceipt', $event)"
          />
        </div>
      </el-card>

      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><ChatDotRound /></el-icon>
            <span>消息设置</span>
          </div>
        </template>

        <div class="setting-row">
          <div>
            <div class="setting-title">消息通知</div>
            <div class="setting-desc">收到新消息时弹出提醒</div>
          </div>
          <el-switch
            v-model="messageSettings.enableNotification"
            @change="updateMessageSetting('enableNotification', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">声音提醒</div>
            <div class="setting-desc">收到新消息时播放声音</div>
          </div>
          <el-switch
            v-model="messageSettings.enableSound"
            @change="updateMessageSetting('enableSound', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">震动提醒</div>
            <div class="setting-desc">移动端收到消息时触发震动</div>
          </div>
          <el-switch
            v-model="messageSettings.enableVibration"
            @change="updateMessageSetting('enableVibration', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">群消息免打扰</div>
            <div class="setting-desc">关闭群组通知但保留未读数</div>
          </div>
          <el-switch
            v-model="messageSettings.muteGroupMessages"
            @change="updateMessageSetting('muteGroupMessages', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">自动下载图片</div>
            <div class="setting-desc">在聊天中预加载图片资源</div>
          </div>
          <el-switch
            v-model="messageSettings.autoDownloadImages"
            @change="updateMessageSetting('autoDownloadImages', $event)"
          />
        </div>
      </el-card>

      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>通用设置</span>
          </div>
        </template>

        <div class="setting-row">
          <div>
            <div class="setting-title">语言</div>
            <div class="setting-desc">切换界面语言</div>
          </div>
          <el-select
            v-model="generalSettings.language"
            class="select-control"
            @change="updateGeneralSetting('language', $event)"
          >
            <el-option label="中文" value="zh-CN" />
            <el-option label="English" value="en-US" />
          </el-select>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">主题</div>
            <div class="setting-desc">切换界面主题</div>
          </div>
          <el-select
            v-model="generalSettings.theme"
            class="select-control"
            @change="updateGeneralSetting('theme', $event)"
          >
            <el-option label="浅色" value="light" />
            <el-option label="深色" value="dark" />
            <el-option label="自动" value="auto" />
          </el-select>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">字体大小</div>
            <div class="setting-desc">调整聊天与设置页的文字密度</div>
          </div>
          <el-select
            v-model="generalSettings.fontSize"
            class="select-control"
            @change="updateGeneralSetting('fontSize', $event)"
          >
            <el-option label="小" value="small" />
            <el-option label="中" value="medium" />
            <el-option label="大" value="large" />
          </el-select>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">自动登录</div>
            <div class="setting-desc">浏览器会话恢复时自动恢复登录状态</div>
          </div>
          <el-switch
            v-model="generalSettings.autoLogin"
            @change="updateGeneralSetting('autoLogin', $event)"
          />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">启动时最小化</div>
            <div class="setting-desc">桌面环境下以最小化方式打开应用</div>
          </div>
          <el-switch
            v-model="generalSettings.minimizeOnStart"
            @change="updateGeneralSetting('minimizeOnStart', $event)"
          />
        </div>
      </el-card>

      <el-card class="settings-card">
        <template #header>
          <div class="card-header">
            <el-icon><FolderOpened /></el-icon>
            <span>数据管理</span>
          </div>
        </template>

        <div class="setting-row" @click="clearCache">
          <div>
            <div class="setting-title">清理缓存</div>
            <div class="setting-desc">清理非敏感本地缓存与页面状态</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>

        <div class="setting-row" @click="exportData">
          <div>
            <div class="setting-title">导出数据</div>
            <div class="setting-desc">导出用户资料与设置快照</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>

        <div class="setting-row danger" @click="showDeleteAccount = true">
          <div>
            <div class="setting-title">注销账户</div>
            <div class="setting-desc">永久删除账户和数据，无法恢复</div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="showChangePassword" title="修改密码" width="420px">
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="90px"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showChangePassword = false">取消</el-button>
        <el-button type="primary" :loading="changingPassword" @click="changePassword">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBindPhone" title="绑定手机号" width="420px">
      <el-form ref="phoneFormRef" :model="phoneForm" :rules="phoneRules" label-width="90px">
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="phoneForm.phone" maxlength="11" />
        </el-form-item>
        <el-form-item label="验证码" prop="code">
          <div class="code-row">
            <el-input v-model="phoneForm.code" maxlength="6" />
            <el-button :disabled="phoneCodeCountdown > 0" :loading="sendingPhoneCode" @click="sendPhoneCode">
              {{ phoneCodeCountdown > 0 ? `${phoneCodeCountdown}s` : '发送验证码' }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showBindPhone = false">取消</el-button>
        <el-button type="primary" :loading="bindingPhone" @click="bindPhone">
          绑定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBindEmail" title="绑定邮箱" width="420px">
      <el-form ref="emailFormRef" :model="emailForm" :rules="emailRules" label-width="90px">
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="emailForm.email" />
        </el-form-item>
        <el-form-item label="验证码" prop="code">
          <div class="code-row">
            <el-input v-model="emailForm.code" maxlength="6" />
            <el-button :disabled="emailCodeCountdown > 0" :loading="sendingEmailCode" @click="sendEmailCode">
              {{ emailCodeCountdown > 0 ? `${emailCodeCountdown}s` : '发送验证码' }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showBindEmail = false">取消</el-button>
        <el-button type="primary" :loading="bindingEmail" @click="bindEmail">
          绑定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDeleteAccount" title="注销账户" width="420px">
      <el-alert
        title="该操作不可恢复"
        description="账户、好友关系和聊天数据都会被永久删除。"
        type="warning"
        show-icon
        :closable="false"
      />

      <el-form
        ref="deleteFormRef"
        :model="deleteForm"
        :rules="deleteRules"
        label-width="90px"
        class="delete-form"
      >
        <el-form-item label="登录密码" prop="password">
          <el-input v-model="deleteForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认操作" prop="confirm">
          <el-input v-model="deleteForm.confirm" placeholder="请输入“确认注销”" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDeleteAccount = false">取消</el-button>
        <el-button type="danger" :loading="deletingAccount" @click="deleteAccount">
          确认注销
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from "element-plus";
import {
  ArrowLeft,
  ArrowRight,
  ChatDotRound,
  FolderOpened,
  Lock,
  Setting,
  User,
} from "@element-plus/icons-vue";
import type { UserSettings } from "@/types";
import { defaultUserSettings } from "@/normalizers/user";
import { useUserStore } from "@/stores/user";
import { useUserSettingsStore } from "@/stores/user-settings";
import { useErrorHandler } from "@/hooks/useErrorHandler";

type PrivacyKey = keyof UserSettings["privacy"];
type MessageKey = keyof UserSettings["message"];
type GeneralKey = keyof UserSettings["general"];
type TimerHandle = ReturnType<typeof setInterval>;

const router = useRouter();
const userStore = useUserStore();
const settingsStore = useUserSettingsStore();
const { capture, notifySuccess } = useErrorHandler("settings-page");

const defaults = defaultUserSettings();

const passwordFormRef = ref<FormInstance | null>(null);
const phoneFormRef = ref<FormInstance | null>(null);
const emailFormRef = ref<FormInstance | null>(null);
const deleteFormRef = ref<FormInstance | null>(null);

const loggingOut = ref(false);
const changingPassword = ref(false);
const bindingPhone = ref(false);
const bindingEmail = ref(false);
const deletingAccount = ref(false);
const sendingPhoneCode = ref(false);
const sendingEmailCode = ref(false);
const phoneCodeCountdown = ref(0);
const emailCodeCountdown = ref(0);

const showChangePassword = ref(false);
const showBindPhone = ref(false);
const showBindEmail = ref(false);
const showDeleteAccount = ref(false);

const privacySettings = reactive<UserSettings["privacy"]>({ ...defaults.privacy });
const messageSettings = reactive<UserSettings["message"]>({ ...defaults.message });
const generalSettings = reactive<UserSettings["general"]>({ ...defaults.general });

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

const userInfo = computed(() => userStore.userInfo);

const passwordRules: FormRules = {
  currentPassword: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度为 6 到 20 个字符", trigger: "blur" },
  ],
  confirmPassword: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error("两次输入的密码不一致"));
          return;
        }
        callback();
      },
      trigger: "blur",
    },
  ],
};

const phoneRules: FormRules = {
  phone: [
    { required: true, message: "请输入手机号", trigger: "blur" },
    { pattern: /^1[3-9]\d{9}$/, message: "请输入正确的手机号", trigger: "blur" },
  ],
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码长度为 6 位", trigger: "blur" },
  ],
};

const emailRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱地址", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱地址", trigger: "blur" },
  ],
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码长度为 6 位", trigger: "blur" },
  ],
};

const deleteRules: FormRules = {
  password: [{ required: true, message: "请输入登录密码", trigger: "blur" }],
  confirm: [
    { required: true, message: "请输入确认文字", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        if (value !== "确认注销") {
          callback(new Error('请输入“确认注销”'));
          return;
        }
        callback();
      },
      trigger: "blur",
    },
  ],
};

let phoneTimer: TimerHandle | null = null;
let emailTimer: TimerHandle | null = null;

const applyTheme = (theme: UserSettings["general"]["theme"]) => {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.classList.toggle("theme-dark", theme === "dark");
};

const syncSettingsState = (settings: UserSettings) => {
  Object.assign(privacySettings, settings.privacy);
  Object.assign(messageSettings, settings.message);
  Object.assign(generalSettings, settings.general);
  applyTheme(settings.general.theme);
};

const loadSettings = async () => {
  try {
    const settings = await settingsStore.getUserSettings();
    syncSettingsState(settings);
  } catch (error) {
    capture(error, "加载设置失败");
  }
};

const updatePrivacySetting = async <K extends PrivacyKey>(key: K, value: boolean) => {
  const previous = privacySettings[key];
  try {
    await settingsStore.updatePrivacySettings({ [key]: value } as Pick<UserSettings["privacy"], K>);
    notifySuccess("隐私设置已更新");
  } catch (error) {
    privacySettings[key] = previous;
    capture(error, "更新隐私设置失败");
  }
};

const updateMessageSetting = async <K extends MessageKey>(key: K, value: boolean) => {
  const previous = messageSettings[key];
  try {
    await settingsStore.updateMessageSettings({ [key]: value } as Pick<UserSettings["message"], K>);
    notifySuccess("消息设置已更新");
  } catch (error) {
    messageSettings[key] = previous;
    capture(error, "更新消息设置失败");
  }
};

const updateGeneralSetting = async <K extends GeneralKey>(
  key: K,
  value: UserSettings["general"][K],
) => {
  const previous = generalSettings[key];
  try {
    await settingsStore.updateGeneralSettings({ [key]: value } as Pick<UserSettings["general"], K>);
    if (key === "theme") {
      applyTheme(value as UserSettings["general"]["theme"]);
    }
    notifySuccess("通用设置已更新");
  } catch (error) {
    generalSettings[key] = previous;
    capture(error, "更新通用设置失败");
  }
};

const startCountdown = (target: "phone" | "email") => {
  const countdown = target === "phone" ? phoneCodeCountdown : emailCodeCountdown;
  const timerRef = target === "phone" ? "phone" : "email";
  countdown.value = 60;
  const timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(timer);
      if (timerRef === "phone") {
        phoneTimer = null;
      } else {
        emailTimer = null;
      }
    }
  }, 1000);
  if (timerRef === "phone") {
    phoneTimer = timer;
  } else {
    emailTimer = timer;
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
    notifySuccess("密码修改成功");
    showChangePassword.value = false;
    Object.assign(passwordForm, {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  } catch (error) {
    capture(error, "修改密码失败");
  } finally {
    changingPassword.value = false;
  }
};

const sendPhoneCode = async () => {
  if (!phoneForm.phone) {
    capture(new Error("请先输入手机号"), "请先输入手机号");
    return;
  }
  try {
    sendingPhoneCode.value = true;
    await settingsStore.sendPhoneCode(phoneForm.phone);
    notifySuccess("验证码已发送");
    if (phoneTimer) {
      clearInterval(phoneTimer);
    }
    startCountdown("phone");
  } catch (error) {
    capture(error, "发送手机号验证码失败");
  } finally {
    sendingPhoneCode.value = false;
  }
};

const sendEmailCode = async () => {
  if (!emailForm.email) {
    capture(new Error("请先输入邮箱地址"), "请先输入邮箱地址");
    return;
  }
  try {
    sendingEmailCode.value = true;
    await settingsStore.sendEmailCode(emailForm.email);
    notifySuccess("验证码已发送");
    if (emailTimer) {
      clearInterval(emailTimer);
    }
    startCountdown("email");
  } catch (error) {
    capture(error, "发送邮箱验证码失败");
  } finally {
    sendingEmailCode.value = false;
  }
};

const bindPhone = async () => {
  if (!phoneFormRef.value) {
    return;
  }
  try {
    await phoneFormRef.value.validate();
    bindingPhone.value = true;
    await settingsStore.bindPhone({
      phone: phoneForm.phone,
      code: phoneForm.code,
    });
    notifySuccess("手机号绑定成功");
    showBindPhone.value = false;
    Object.assign(phoneForm, { phone: "", code: "" });
  } catch (error) {
    capture(error, "绑定手机号失败");
  } finally {
    bindingPhone.value = false;
  }
};

const bindEmail = async () => {
  if (!emailFormRef.value) {
    return;
  }
  try {
    await emailFormRef.value.validate();
    bindingEmail.value = true;
    await settingsStore.bindEmail({
      email: emailForm.email,
      code: emailForm.code,
    });
    notifySuccess("邮箱绑定成功");
    showBindEmail.value = false;
    Object.assign(emailForm, { email: "", code: "" });
  } catch (error) {
    capture(error, "绑定邮箱失败");
  } finally {
    bindingEmail.value = false;
  }
};

const clearCache = async () => {
  try {
    await ElMessageBox.confirm(
      "确定清理浏览器缓存吗？这不会影响当前 HttpOnly 登录态。",
      "清理缓存",
      {
        type: "warning",
        confirmButtonText: "确定",
        cancelButtonText: "取消",
      },
    );
    localStorage.clear();
    sessionStorage.clear();
    notifySuccess("缓存已清理");
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "清理缓存失败");
    }
  }
};

const exportData = async () => {
  try {
    const settings = await settingsStore.getUserSettings();
    const payload = {
      exportedAt: new Date().toISOString(),
      user: userStore.userInfo,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `im-export-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notifySuccess("数据导出成功");
  } catch (error) {
    capture(error, "导出数据失败");
  }
};

const deleteAccount = async () => {
  if (!deleteFormRef.value) {
    return;
  }
  try {
    await deleteFormRef.value.validate();
    deletingAccount.value = true;
    await settingsStore.deleteAccount({
      password: deleteForm.password,
    });
    notifySuccess("账户已注销");
    showDeleteAccount.value = false;
    await router.push("/login");
  } catch (error) {
    capture(error, "注销账户失败");
  } finally {
    deletingAccount.value = false;
  }
};

const logout = async () => {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "退出登录", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    loggingOut.value = true;
    await userStore.logout();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "退出登录失败");
    }
  } finally {
    loggingOut.value = false;
  }
};

onMounted(() => {
  void loadSettings();
});

onUnmounted(() => {
  if (phoneTimer) clearInterval(phoneTimer);
  if (emailTimer) clearInterval(emailTimer);
});
</script>

<style scoped lang="scss">
.settings-page {
  min-height: 100%;
  padding: 20px;
  background: #f5f7fa;
}

.page-header,
.card-header,
.setting-row,
.code-row {
  display: flex;
  align-items: center;
}

.page-header {
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.settings-card {
  border-radius: 16px;
}

.card-header {
  gap: 10px;
  font-weight: 600;
}

.setting-row {
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid #f0f2f5;
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-row:has(.el-icon):not(:has(.el-switch)):not(:has(.el-select)) {
  cursor: pointer;
}

.setting-title {
  color: #303133;
  font-weight: 600;
}

.setting-desc {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}

.select-control {
  width: 120px;
}

.code-row {
  width: 100%;
  gap: 10px;
}

.code-row .el-input {
  flex: 1;
}

.delete-form {
  margin-top: 20px;
}

.setting-row.danger .setting-title,
.setting-row.danger .el-icon {
  color: #f56c6c;
}

@media (max-width: 960px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .settings-page {
    padding: 16px;
  }

  .page-header {
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
