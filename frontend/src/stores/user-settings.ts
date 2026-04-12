import { defineStore } from "pinia";
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { userService } from "@/services/user";
import { defaultUserSettings } from "@/normalizers/user";
import { useUserStore } from "@/stores/user";
import type {
  BindEmailRequest,
  BindPhoneRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  UserSettings,
} from "@/types";

export const useUserSettingsStore = defineStore("user-settings", () => {
  const settings = ref<UserSettings>(defaultUserSettings());
  const loading = ref(false);

  const loadSettings = async (): Promise<UserSettings> => {
    const response = await userService.getSettings();
    settings.value = response.data;
    return settings.value;
  };

  const getUserSettings = async (): Promise<UserSettings> => {
    if (!settings.value) {
      return loadSettings();
    }
    if (settings.value.general.language) {
      return settings.value;
    }
    return loadSettings();
  };

  const updatePrivacySettings = async (data: Record<string, boolean>) => {
    const response = await userService.updateSettings("privacy", data);
    if (response.code === 200) {
      settings.value = {
        ...settings.value,
        privacy: {
          ...settings.value.privacy,
          ...data,
        },
      };
      return true;
    }
    throw new Error(response.message || "更新隐私设置失败");
  };

  const updateMessageSettings = async (data: Record<string, boolean>) => {
    const response = await userService.updateSettings("message", data);
    if (response.code === 200) {
      settings.value = {
        ...settings.value,
        message: {
          ...settings.value.message,
          ...data,
        },
      };
      return true;
    }
    throw new Error(response.message || "更新消息设置失败");
  };

  const updateGeneralSettings = async (data: Record<string, unknown>) => {
    const response = await userService.updateSettings("general", data);
    if (response.code === 200) {
      settings.value = {
        ...settings.value,
        general: {
          ...settings.value.general,
          ...data,
        },
      };
      return true;
    }
    throw new Error(response.message || "更新通用设置失败");
  };

  const changePassword = async (data: ChangePasswordRequest) => {
    await userService.changePassword(data);
    return true;
  };

  const sendPhoneCode = async (phone: string) => {
    await userService.sendPhoneCode(phone);
    ElMessage.success("验证码已发送到手机");
    return true;
  };

  const sendEmailCode = async (email: string) => {
    await userService.sendEmailCode(email);
    ElMessage.success("验证码已发送到邮箱");
    return true;
  };

  const bindPhone = async (data: BindPhoneRequest) => {
    await userService.bindPhone(data);
    const userStore = useUserStore();
    if (userStore.currentUser) {
      userStore.currentUser.phone = data.phone;
    }
    return true;
  };

  const bindEmail = async (data: BindEmailRequest) => {
    await userService.bindEmail(data);
    const userStore = useUserStore();
    if (userStore.currentUser) {
      userStore.currentUser.email = data.email;
    }
    return true;
  };

  const deleteAccount = async (data: DeleteAccountRequest) => {
    loading.value = true;
    try {
      await userService.deleteAccount(data);
      useUserStore().clearSession();
      return true;
    } finally {
      loading.value = false;
    }
  };

  const clear = () => {
    settings.value = defaultUserSettings();
  };

  return {
    settings,
    loading,
    loadSettings,
    getUserSettings,
    updatePrivacySettings,
    updateMessageSettings,
    updateGeneralSettings,
    changePassword,
    sendPhoneCode,
    sendEmailCode,
    bindPhone,
    bindEmail,
    deleteAccount,
    clear,
  };
});
