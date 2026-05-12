import { initializeStorage } from '@/services/storage/messageDatabase';
import { initializeNotifications } from '@/services/notification/notificationService';
import { bindLifecycleHandlers } from '@/services/platform/appLifecycle';
import { bindNetworkHandlers } from '@/services/platform/networkStatus';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';

let bootstrapped = false;

export async function bootstrapApp(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  bootstrapped = true;
  try {
    await initializeStorage();
    await initializeNotifications();
    bindLifecycleHandlers();
    bindNetworkHandlers();
    await useAuthStore.getState().restoreSession();
    await useChatStore.getState().retryPending();
  } catch (error) {
    logger.error('bootstrap', 'bootstrap failed', error);
  }
}
