import { sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { clearAllPendingEncryptedMessages } from '@/e2ee/store/pendingDecryptStore';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { logger } from '@/utils/logger';

export const clearCurrentE2eeAccountState = async (userId?: string): Promise<void> => {
  if (userId) {
    await e2eeKeyStore.clearAccount(userId).catch((error: unknown) => {
      logger.warn('e2ee', 'E2EE account clear failed', sanitizeE2eeLogValue(error));
    });
  }
  clearAllPendingEncryptedMessages();
  e2eeSessionStore.clearRuntime();
};
