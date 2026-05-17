import * as Keychain from 'react-native-keychain';
import { createMMKV } from 'react-native-mmkv';
import { hasSecureRandomSource } from '@im/shared-e2ee-core';
import { useAuthStore } from '@/stores/authStore';
import { E2EE_SEND_DISABLED_TEXT, E2EE_UNSUPPORTED_TEXT } from './e2eeDeferred';

export type E2eeCapabilityMode = 'full' | 'failed';

export interface MobileE2eeCapability {
  supported: boolean;
  mode: E2eeCapabilityMode;
  canSendEncrypted: boolean;
  canDecryptEncrypted: boolean;
  reason: string;
}

const FULL_CAPABILITY: MobileE2eeCapability = {
  supported: true,
  mode: 'full',
  canSendEncrypted: true,
  canDecryptEncrypted: true,
  reason: '端到端加密已可用。',
};

const failedCapability = (reason: string): MobileE2eeCapability => ({
  supported: false,
  mode: 'failed',
  canSendEncrypted: false,
  canDecryptEncrypted: false,
  reason,
});

export const getMobileE2eeCapability = (): MobileE2eeCapability => {
  if (!useAuthStore.getState().currentUser?.id) {
    return failedCapability('当前账号信息不可用，端到端加密不可用。');
  }
  if (!hasSecureRandomSource()) {
    return failedCapability('安全随机数不可用，端到端加密不可用。');
  }
  if (!Keychain?.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY) {
    return failedCapability('安全存储不可用，端到端加密不可用。');
  }
  try {
    createMMKV({ id: 'im-mobile-e2ee-capability-check' });
  } catch {
    return failedCapability('本地加密状态存储不可用，端到端加密不可用。');
  }
  return FULL_CAPABILITY;
};

export const getDecryptDisplayText = (capability?: MobileE2eeCapability): string => {
  const cap = capability ?? getMobileE2eeCapability();
  return cap.canDecryptEncrypted ? '' : E2EE_UNSUPPORTED_TEXT;
};

export const getSendBlockText = (capability?: MobileE2eeCapability): string => {
  const cap = capability ?? getMobileE2eeCapability();
  return cap.canSendEncrypted ? '' : E2EE_SEND_DISABLED_TEXT;
};

export const assertEncryptedSendAllowed = (capability?: MobileE2eeCapability): void => {
  const cap = capability ?? getMobileE2eeCapability();
  if (!cap.canSendEncrypted) {
    throw new Error(cap.reason);
  }
};
