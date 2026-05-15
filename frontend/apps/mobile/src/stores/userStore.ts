import { create } from 'zustand';
import { userService } from '@/services/user/userService';
import { useAuthStore } from './authStore';
import type { User } from '@im/shared-types';

interface UserState {
  profile: User | null;
  loading: boolean;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  profile: useAuthStore.getState().currentUser,
  loading: false,
  async updateProfile(data) {
    set({ loading: true });
    try {
      const response = await userService.updateProfile(data);
      useAuthStore.setState({ currentUser: response.data });
      set({ profile: response.data });
    } finally {
      set({ loading: false });
    }
  },
}));
