import { useAuthStore } from '@/stores/authStore';

export interface CurrentE2eeSessionContext {
  userId: string;
  sessionGeneration: number;
}

export const getCurrentE2eeUserId = (): string => useAuthStore.getState().currentUser?.id || '';

export const requireCurrentE2eeUserId = (): string => {
  const userId = getCurrentE2eeUserId();
  if (!userId) {
    throw new Error('Current user unavailable for E2EE');
  }
  return userId;
};

export const requireCurrentE2eeSessionContext = (): CurrentE2eeSessionContext => {
  const authState = useAuthStore.getState();
  const userId = authState.currentUser?.id || '';
  if (!userId) {
    throw new Error('Current user unavailable for E2EE');
  }
  return {
    userId,
    sessionGeneration: authState.sessionGeneration,
  };
};
