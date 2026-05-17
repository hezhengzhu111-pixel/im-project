import { useAuthStore } from '@/stores/authStore';

export const getCurrentE2eeUserId = (): string => useAuthStore.getState().currentUser?.id || '';

export const requireCurrentE2eeUserId = (): string => {
  const userId = getCurrentE2eeUserId();
  if (!userId) {
    throw new Error('Current user unavailable for E2EE');
  }
  return userId;
};

