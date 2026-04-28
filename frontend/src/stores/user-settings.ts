import {defineStore} from "pinia";
import {ref} from "vue";
import {ElMessage} from "element-plus";
import {userService} from "@/services/user";
import {defaultUserSettings} from "@/normalizers/user";
import {useUserStore} from "@/stores/user";
import type {
    BindEmailRequest,
    BindPhoneRequest,
    ChangePasswordRequest,
    DeleteAccountRequest,
    UserSettings,
} from "@/types";

const ALLOW_INSECURE_VOICE_RECORDING_KEY = "im_allow_insecure_voice_recording";

const readLocalBoolean = (key: string, fallback: boolean) => {
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  const saved = localStorage.getItem(key);
  if (saved === "true") {
    return true;
  }
  if (saved === "false") {
    return false;
  }
  return fallback;
};

const writeLocalBoolean = (key: string, value: boolean) => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(key, String(value));
};

export const useUserSettingsStore = defineStore("user-settings", () => {
  const settings = ref<UserSettings>(defaultUserSettings());
  const loading = ref(false);
  const allowInsecureVoiceRecording = ref(
    readLocalBoolean(ALLOW_INSECURE_VOICE_RECORDING_KEY, false),
  );

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

  const updateAllowInsecureVoiceRecording = (value: boolean) => {
    allowInsecureVoiceRecording.value = value;
    writeLocalBoolean(ALLOW_INSECURE_VOICE_RECORDING_KEY, value);
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
    allowInsecureVoiceRecording.value = readLocalBoolean(
      ALLOW_INSECURE_VOICE_RECORDING_KEY,
      false,
    );
  };

  return {
    settings,
    loading,
    allowInsecureVoiceRecording,
    loadSettings,
    getUserSettings,
    updatePrivacySettings,
    updateMessageSettings,
    updateGeneralSettings,
    updateAllowInsecureVoiceRecording,
    changePassword,
    sendPhoneCode,
    sendEmailCode,
    bindPhone,
    bindEmail,
    deleteAccount,
    clear,
  };
});
