import { generateKeyBundle, sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { e2eeKeyStore, type LocalE2eeKeyMaterial } from '@/e2ee/store/keyStore';
import { logger } from '@/utils/logger';
import { requireCurrentE2eeUserId } from './context';

let ensureInFlight: Promise<LocalE2eeKeyMaterial> | null = null;

const isUsableMaterial = (material: LocalE2eeKeyMaterial | null): material is LocalE2eeKeyMaterial =>
  Boolean(
    material?.identityKeyPair?.privateKey &&
    material.signingIdentityKeyPair?.privateKey &&
    material.signedPreKeyPair?.privateKey &&
    material.bundle?.identityKey &&
    material.bundle?.signingIdentityKey &&
    material.bundle?.signedPreKey &&
    material.bundle?.signedPreKeySignature,
  );

const uploadPublicBundle = async (material: LocalE2eeKeyMaterial): Promise<void> => {
  await mobileE2eeKeyService.uploadBundle({
    deviceId: material.deviceId,
    identityKey: material.bundle.identityKey,
    signingIdentityKey: material.bundle.signingIdentityKey,
    signedPreKey: material.bundle.signedPreKey,
    signedPreKeySignature: material.bundle.signedPreKeySignature,
    oneTimePreKeys: [],
  });
};

const ensureInternal = async (): Promise<LocalE2eeKeyMaterial> => {
  const userId = requireCurrentE2eeUserId();
  const deviceId = await e2eeKeyStore.getOrCreateDeviceId(userId);
  let material = await e2eeKeyStore.getKeyMaterial(userId, deviceId);

  if (!isUsableMaterial(material)) {
    material = await e2eeKeyStore.saveKeyMaterial(
      userId,
      deviceId,
      generateKeyBundle({ oneTimePreKeyCount: 0 }),
    );
  }

  await uploadPublicBundle(material);
  await mobileE2eeKeyService.heartbeat(deviceId).catch((error: unknown) => {
    logger.warn('e2ee', 'device heartbeat failed', sanitizeE2eeLogValue(error));
  });
  return material;
};

export const ensureLocalE2eeDeviceRegistered = async (): Promise<LocalE2eeKeyMaterial> => {
  if (!ensureInFlight) {
    ensureInFlight = ensureInternal().finally(() => {
      ensureInFlight = null;
    });
  }
  return ensureInFlight;
};

export const heartbeatLocalE2eeDevice = async (): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  const deviceId = await e2eeKeyStore.getDeviceId(userId);
  if (deviceId) {
    await mobileE2eeKeyService.heartbeat(deviceId);
  }
};

