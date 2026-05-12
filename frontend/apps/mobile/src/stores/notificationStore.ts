import { create } from 'zustand';
import { getFcmToken } from '@/services/notification/notificationService';
import { kvStorage } from '@/services/storage/kvStorage';
import { STORAGE_KEYS } from '@/constants/config';

interface NotificationState {
  fcmToken: string;
  tokenBound: boolean;
  refreshToken: () => Promise<string>;
  markBound: () => void;
  clearBinding: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  fcmToken: kvStorage.getString(STORAGE_KEYS.fcmToken),
  tokenBound: false,

  async refreshToken() {
    const token = await getFcmToken();
    set({ fcmToken: token });
    return token;
  },

  markBound() {
    set({ tokenBound: true });
  },

  clearBinding() {
    set({ tokenBound: false });
  },
}));
