import { initializeStorage } from '@/services/storage/messageDatabase';
import { initializeNotifications } from '@/services/notification/notificationService';
import { bindLifecycleHandlers } from '@/services/platform/appLifecycle';
import { bindNetworkHandlers } from '@/services/platform/networkStatus';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/authStore';

let bootstrapped = false;

/** 测试用：重置 bootstrap 幂等标记 */
export const resetBootstrapFlag = () => { bootstrapped = false; };

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
    // retryPending 由 chatStore.bootstrap 末尾统一处理，此处不再重复调用。
  } catch (error) {
    logger.error('bootstrap', 'bootstrap failed', error);
  }
}
