import type { RustLocalE2eeKeyMaterial } from '@im/shared-e2ee-core';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';

export type LocalE2eeKeyMaterial = RustLocalE2eeKeyMaterial & {
  userId: string;
  deviceId: string;
};

const isRustKeyMaterial = (value: unknown): value is LocalE2eeKeyMaterial => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const material = value as Partial<LocalE2eeKeyMaterial>;
  return (
    material.version === 2 &&
    typeof material.userId === 'string' &&
    typeof material.deviceId === 'string' &&
    typeof material.identityKeyPairBincode === 'string' &&
    material.identityKeyPairBincode.length > 0 &&
    typeof material.signedPreKeyPairBincode === 'string' &&
    material.signedPreKeyPairBincode.length > 0 &&
    typeof material.publicBundle?.identityKey === 'string' &&
    material.publicBundle.identityKey.length > 0 &&
    typeof material.publicBundle.signingKey === 'string' &&
    material.publicBundle.signingKey.length > 0 &&
    typeof material.publicBundle.signedPreKey?.key === 'string' &&
    material.publicBundle.signedPreKey.key.length > 0 &&
    typeof material.publicBundle.signedPreKeySignature === 'string' &&
    material.publicBundle.signedPreKeySignature.length > 0
  );
};

export const e2eeKeyStore = {
  async getDeviceId(userId: string): Promise<string> {
    return e2eeSecureStorage.getDeviceId(userId);
  },

  async getOrCreateDeviceId(userId: string): Promise<string> {
    return e2eeSecureStorage.getOrCreateDeviceId(userId);
  },

  async saveKeyMaterial(
    userId: string,
    deviceId: string,
    generated: RustLocalE2eeKeyMaterial,
  ): Promise<LocalE2eeKeyMaterial> {
    const material: LocalE2eeKeyMaterial = {
      ...generated,
      userId,
      deviceId,
      publicBundle: {
        ...generated.publicBundle,
        userId,
        deviceId,
      },
    };
    await e2eeSecureStorage.setKeyMaterial(userId, deviceId, JSON.stringify(material));
    return material;
  },

  async getKeyMaterial(userId: string, deviceId: string): Promise<LocalE2eeKeyMaterial | null> {
    const raw = await e2eeSecureStorage.getKeyMaterial(userId, deviceId);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isRustKeyMaterial(parsed)) {
        return parsed;
      }
    } catch {
      // Invalid or legacy material is discarded below.
    }
    await e2eeSecureStorage.removeKeyMaterial(userId, deviceId).catch(() => undefined);
    return null;
  },

  async clearAccount(userId: string): Promise<void> {
    await e2eeSecureStorage.clearAccount(userId);
  },
};
