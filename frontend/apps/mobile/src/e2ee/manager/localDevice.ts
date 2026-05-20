import { sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeKeyStore, type LocalE2eeKeyMaterial } from '@/e2ee/store/keyStore';
import { logger } from '@/utils/logger';
import { requireCurrentE2eeSessionContext, requireCurrentE2eeUserId } from './context';

const SIGNED_PRE_KEY_ID = 1;
const ONE_TIME_PRE_KEY_START_ID = 1;
const ONE_TIME_PRE_KEY_COUNT = 100;

let ensureInFlight: {
  userId: string;
  sessionGeneration: number;
  promise: Promise<LocalE2eeKeyMaterial>;
} | null = null;

const uploadPublicBundle = async (material: LocalE2eeKeyMaterial): Promise<void> => {
  await mobileE2eeKeyService.uploadBundle({
    deviceId: material.deviceId,
    identityKey: material.publicBundle.identityKey,
    signingIdentityKey: material.publicBundle.signingKey,
    signedPreKey: material.publicBundle.signedPreKey.key,
    signedPreKeySignature: material.publicBundle.signedPreKeySignature,
    oneTimePreKeys: material.publicBundle.oneTimePreKeys ?? [],
  });
};

const ensureInternal = async (userId: string): Promise<LocalE2eeKeyMaterial> => {
  const deviceId = await e2eeKeyStore.getOrCreateDeviceId(userId);
  let material = await e2eeKeyStore.getKeyMaterial(userId, deviceId);

  if (!material) {
    const generated = await getMobileE2eeRuntime().generatePreKeyBundle({
      signedPreKeyId: SIGNED_PRE_KEY_ID,
      oneTimePreKeyStartId: ONE_TIME_PRE_KEY_START_ID,
      oneTimePreKeyCount: ONE_TIME_PRE_KEY_COUNT,
    });
    material = await e2eeKeyStore.saveKeyMaterial(userId, deviceId, generated);
  }

  await uploadPublicBundle(material);
  await mobileE2eeKeyService.heartbeat(deviceId).catch((error: unknown) => {
    logger.warn('e2ee', 'device heartbeat failed', sanitizeE2eeLogValue(error));
  });
  return material;
};

export const ensureLocalE2eeDeviceRegistered = (): Promise<LocalE2eeKeyMaterial> => {
  const context = requireCurrentE2eeSessionContext();
  if (
    ensureInFlight &&
    ensureInFlight.userId === context.userId &&
    ensureInFlight.sessionGeneration === context.sessionGeneration
  ) {
    return ensureInFlight.promise;
  }

  const promise = ensureInternal(context.userId).finally(() => {
    if (ensureInFlight?.promise === promise) {
      ensureInFlight = null;
    }
  });
  ensureInFlight = { ...context, promise };
  return promise;
};

export const getLocalRustKeyMaterial = async (): Promise<LocalE2eeKeyMaterial> => {
  const userId = requireCurrentE2eeUserId();
  const deviceId = await e2eeKeyStore.getOrCreateDeviceId(userId);
  const existing = await e2eeKeyStore.getKeyMaterial(userId, deviceId);
  if (existing) {
    return existing;
  }
  return ensureLocalE2eeDeviceRegistered();
};

export const heartbeatLocalE2eeDevice = async (): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  const deviceId = await e2eeKeyStore.getDeviceId(userId);
  if (deviceId) {
    await mobileE2eeKeyService.heartbeat(deviceId);
  }
};

export const __resetLocalE2eeDeviceRegistrationForTests = (): void => {
  ensureInFlight = null;
};
