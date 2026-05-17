import {
  DEFAULT_MAX_COUNTER_GAP,
  ratchetDecryptSafely,
  ratchetEncrypt,
  sanitizeE2eeLogValue,
  type RatchetHeader,
} from '@im/shared-e2ee-core';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { logger } from '@/utils/logger';
import { requireCurrentE2eeUserId } from './context';
import { ensureLocalE2eeDeviceRegistered } from './localDevice';
import { loadLocalSessionStatus } from './negotiation';

interface EncryptResult {
  ciphertext: string;
  header: RatchetHeader;
  deviceId: string;
}

class MobileE2eeManager {
  private readonly queues = new Map<string, Promise<unknown>>();

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) || Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(sessionId, next.catch(() => undefined));
    return next.finally(() => {
      if (this.queues.get(sessionId) === next) {
        this.queues.delete(sessionId);
      }
    });
  }

  async encryptMessage(sessionId: string, plaintext: string): Promise<EncryptResult> {
    return this.enqueue(sessionId, async () => {
      const userId = requireCurrentE2eeUserId();
      const status = await loadLocalSessionStatus(sessionId);
      if (status !== 'encrypted') {
        throw new Error('E2EE negotiation has not been accepted');
      }
      const local = await ensureLocalE2eeDeviceRegistered();
      const state = await e2eeSessionStore.getRatchetState(userId, sessionId);
      if (!state) {
        await e2eeSessionStore.setStatus(userId, sessionId, 'failed');
        throw new Error('No ratchet state for session');
      }
      const encrypted = ratchetEncrypt(state, plaintext);
      await e2eeSessionStore.saveRatchetState(userId, sessionId, state);
      return {
        ciphertext: encrypted.ciphertext,
        header: encrypted.header,
        deviceId: local.deviceId,
      };
    });
  }

  async decryptMessage(
    sessionId: string,
    _senderId: string,
    header: RatchetHeader,
    ciphertext: string,
  ): Promise<string> {
    return this.enqueue(sessionId, async () => {
      const userId = requireCurrentE2eeUserId();
      const status = await loadLocalSessionStatus(sessionId);
      if (status !== 'encrypted') {
        throw new Error('E2EE negotiation has not been accepted');
      }
      const state = await e2eeSessionStore.getRatchetState(userId, sessionId);
      if (!state) {
        await e2eeSessionStore.setStatus(userId, sessionId, 'failed');
        throw new Error('No ratchet state for session');
      }
      try {
        const result = ratchetDecryptSafely(state, header, ciphertext, { maxCounterGap: DEFAULT_MAX_COUNTER_GAP });
        await e2eeSessionStore.saveRatchetState(userId, sessionId, state);
        if (result.repaired) {
          logger.info('e2ee', 'ratchet inbound chain recovered', sanitizeE2eeLogValue({
            sessionId,
            repairChainInfo: result.repairChainInfo,
          }));
        }
        return result.plaintext;
      } catch (error) {
        logger.warn('e2ee', 'message decrypt failed', sanitizeE2eeLogValue({
          sessionId,
          headerCounter: header.counter,
          hasCiphertext: Boolean(ciphertext),
          error,
        }));
        throw error;
      }
    });
  }

  async clearSession(sessionId: string): Promise<void> {
    const userId = requireCurrentE2eeUserId();
    await e2eeSessionStore.deleteRatchetState(userId, sessionId);
  }
}

export const e2eeManager = new MobileE2eeManager();
