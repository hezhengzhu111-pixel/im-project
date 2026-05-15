import { create } from 'zustand';
import { kvStorage } from '@/services/storage/kvStorage';
import { pushDeviceService } from '@/services/push/pushDeviceService';
import { userService } from '@/services/user/userService';
import { STORAGE_KEYS } from '@/constants/config';
import type { UserSettings } from '@/types/models';

interface SettingsState {
  settings: UserSettings;
  theme: 'light' | 'dark' | 'system';
  locale: 'zh-CN' | 'en-US';
  notificationEnabled: boolean;
  soundEnabled: boolean;
  readReceiptEnabled: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateMessageSetting: (key: string, value: boolean) => Promise<void>;
  updatePrivacySetting: (key: string, value: boolean) => Promise<void>;
  updateGeneralSetting: (key: string, value: unknown) => Promise<void>;
  setTheme: (theme: SettingsState['theme']) => void;
  setLocale: (locale: SettingsState['locale']) => void;
}

const defaults: UserSettings = {
  general: {
    language: 'zh-CN',
    theme: 'system',
    fontSize: 'medium',
    autoLogin: true,
    minimizeOnStart: false,
  },
  privacy: {
    allowStrangerAdd: true,
    showOnlineStatus: true,
    allowViewMoments: true,
    messageReadReceipt: true,
  },
  message: {
    enableNotification: true,
    enableSound: true,
    enableVibration: false,
    muteGroupMessages: false,
    autoDownloadImages: true,
  },
  notifications: {
    sound: true,
    desktop: true,
    preview: true,
  },
};

const cachedPushSettings = pushDeviceService.getCachedSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: kvStorage.getJson(STORAGE_KEYS.settings, defaults),
  theme: kvStorage.getString('theme', 'system') as SettingsState['theme'],
  locale: kvStorage.getString('locale', 'zh-CN') as SettingsState['locale'],
  notificationEnabled: cachedPushSettings.enabled,
  soundEnabled: cachedPushSettings.soundEnabled,
  readReceiptEnabled: kvStorage.getBoolean('readReceipt.enabled', true),
  loading: false,

  async loadSettings() {
    set({ loading: true });
    try {
      const response = await userService.getSettings();
      const settings = response.data;
      let notificationEnabled = settings.message.enableNotification !== false;
      let soundEnabled = settings.message.enableSound !== false;
      try {
        const pushSettings = await pushDeviceService.getSettings();
        notificationEnabled = pushSettings.enabled;
        soundEnabled = pushSettings.soundEnabled;
        settings.message = {
          ...settings.message,
          enableNotification: pushSettings.enabled,
          enableSound: pushSettings.soundEnabled,
        };
      } catch (error) {
        pushDeviceService.logOptionalFailure('load push settings', error);
      }
      kvStorage.setJson(STORAGE_KEYS.settings, settings);
      set({
        settings,
        notificationEnabled,
        soundEnabled,
        readReceiptEnabled: settings.privacy.messageReadReceipt !== false,
      });
    } finally {
      set({ loading: false });
    }
  },

  async updateMessageSetting(key, value) {
    await userService.updateSettings('message', { [key]: value });
    if (key === 'enableNotification' || key === 'enableSound') {
      const patch = key === 'enableNotification' ? { enabled: value } : { soundEnabled: value };
      await pushDeviceService.updateSettings(patch).catch((error: unknown) => {
        pushDeviceService.logOptionalFailure('update push settings', error);
      });
    }
    const settings = { ...get().settings, message: { ...get().settings.message, [key]: value } };
    kvStorage.setJson(STORAGE_KEYS.settings, settings);
    if (key === 'enableNotification') {
      kvStorage.setBoolean('notification.enabled', value);
      set({ notificationEnabled: value });
    }
    if (key === 'enableSound') {
      kvStorage.setBoolean('sound.enabled', value);
      set({ soundEnabled: value });
    }
    set({ settings });
  },

  async updatePrivacySetting(key, value) {
    await userService.updateSettings('privacy', { [key]: value });
    const settings = { ...get().settings, privacy: { ...get().settings.privacy, [key]: value } };
    kvStorage.setJson(STORAGE_KEYS.settings, settings);
    if (key === 'messageReadReceipt') {
      kvStorage.setBoolean('readReceipt.enabled', value);
      set({ readReceiptEnabled: value });
    }
    set({ settings });
  },

  async updateGeneralSetting(key, value) {
    await userService.updateSettings('general', { [key]: value });
    const settings = { ...get().settings, general: { ...get().settings.general, [key]: value } };
    kvStorage.setJson(STORAGE_KEYS.settings, settings);
    set({ settings });
  },

  setTheme(theme) {
    kvStorage.setString('theme', theme);
    set({ theme });
  },

  setLocale(locale) {
    kvStorage.setString('locale', locale);
    set({ locale });
  },
}));
