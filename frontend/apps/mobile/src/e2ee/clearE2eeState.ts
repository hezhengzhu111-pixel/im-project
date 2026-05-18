import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { clearAllPendingEncryptedMessages } from '@/e2ee/store/pendingDecryptStore';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';

export const clearCurrentE2eeAccountState = async (userId?: string): Promise<void> => {
  if (userId) {
    await e2eeKeyStore.clearAccount(userId).catch(() => undefined);
  }
  clearAllPendingEncryptedMessages();
  e2eeSessionStore.clearRuntime();
};
