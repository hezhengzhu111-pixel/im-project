import type { EncodedBundle, EncodedEcdhKeyPair, EncodedEcdsaKeyPair, KeyBundle } from '@im/shared-e2ee-core';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';

export interface LocalE2eeKeyMaterial {
  userId: string;
  deviceId: string;
  identityKeyPair: EncodedEcdhKeyPair;
  signingIdentityKeyPair: EncodedEcdsaKeyPair;
  signedPreKeyPair: EncodedEcdhKeyPair;
  oneTimePreKeyPairs: EncodedEcdhKeyPair[];
  bundle: EncodedBundle;
}

export const e2eeKeyStore = {
  async getDeviceId(userId: string): Promise<string> {
    return e2eeSecureStorage.getDeviceId(userId);
  },

  async getOrCreateDeviceId(userId: string): Promise<string> {
    return e2eeSecureStorage.getOrCreateDeviceId(userId);
  },

  async saveKeyMaterial(userId: string, deviceId: string, bundle: KeyBundle): Promise<LocalE2eeKeyMaterial> {
    const material: LocalE2eeKeyMaterial = {
      userId,
      deviceId,
      identityKeyPair: bundle.identityKeyPair,
      signingIdentityKeyPair: bundle.signingIdentityKeyPair,
      signedPreKeyPair: bundle.signedPreKeyPair,
      oneTimePreKeyPairs: bundle.oneTimePreKeyPairs,
      bundle: bundle.bundle,
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
      const parsed = JSON.parse(raw) as LocalE2eeKeyMaterial;
      if (!parsed.identityKeyPair?.privateKey || !parsed.signedPreKeyPair?.privateKey || !parsed.bundle?.identityKey) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  async clearAccount(userId: string): Promise<void> {
    await e2eeSecureStorage.clearAccount(userId);
  },
};

