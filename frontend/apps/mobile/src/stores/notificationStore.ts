import { create } from 'zustand';
import { getFcmToken } from '@/services/notification/notificationService';
import { kvStorage } from '@/services/storage/kvStorage';
import {
  notificationEventRepository,
  type NotificationEventRecord,
} from '@/services/storage/notificationEventRepository';
import { STORAGE_KEYS } from '@/constants/config';

interface NotificationState {
  fcmToken: string;
  tokenBound: boolean;
  events: NotificationEventRecord[];
  refreshToken: () => Promise<string>;
  refreshEvents: () => void;
  clearEvents: () => void;
  markBound: () => void;
  clearBinding: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  fcmToken: kvStorage.getString(STORAGE_KEYS.fcmToken),
  tokenBound: false,
  events: notificationEventRepository.listRecent(),

  async refreshToken() {
    const token = await getFcmToken();
    set({ fcmToken: token });
    return token;
  },

  refreshEvents() {
    set({ events: notificationEventRepository.listRecent() });
  },

  clearEvents() {
    notificationEventRepository.clear();
    set({ events: [] });
  },

  markBound() {
    set({ tokenBound: true });
  },

  clearBinding() {
    set({ tokenBound: false });
  },
}));
