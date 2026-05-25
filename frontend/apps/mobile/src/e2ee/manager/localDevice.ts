import { sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeKeyStore, type LocalE2eeKeyMaterial } from '@/e2ee/store/keyStore';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { logger } from '@/utils/logger';
import { requireCurrentE2eeSessionContext, requireCurrentE2eeUserId } from './context';

const SIGNED_PRE_KEY_ID = 1;
const ONE_TIME_PRE_KEY_START_ID = 1;
const ONE_TIME_PRE_KEY_COUNT = 100;

// TODO: When the server exposes an OTK count/stock query endpoint (e.g.
// GET /keys/otk-status), use it to drive data-based replenishment decisions.
// Without a server-side query we cannot know how many OTKs have been consumed
// and must conservatively avoid re-uploading any previously-published OTK.

let ensureInFlight: {
  userId: string;
  sessionGeneration: number;
  promise: Promise<LocalE2eeKeyMaterial>;
} | null = null;

const getPublishedOtkIds = async (userId: string, deviceId: string): Promise<Set<number>> => {
  const state = await e2eeSecureStorage.getPublishedOtkState(userId, deviceId);
  if (state && Array.isArray(state.publishedIds)) {
    return new Set(state.publishedIds);
  }
  return new Set();
};

const setPublishedOtkIds = async (
  userId: string,
  deviceId: string,
  ids: number[],
): Promise<void> => {
  await e2eeSecureStorage.setPublishedOtkState(userId, deviceId, {
    publishedIds: ids,
    publishedAt: Date.now(),
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

    // First registration: upload the full bundle including one-time prekeys.
    await mobileE2eeKeyService.uploadBundle({
      deviceId: material.deviceId,
      identityKey: material.publicBundle.identityKey,
      signingIdentityKey: material.publicBundle.signingKey,
      signedPreKey: material.publicBundle.signedPreKey.key,
      signedPreKeySignature: material.publicBundle.signedPreKeySignature,
      oneTimePreKeys: material.publicBundle.oneTimePreKeys ?? [],
    });

    const otkIds = (material.publicBundle.oneTimePreKeys ?? []).map((k) => k.id);
    await setPublishedOtkIds(userId, deviceId, otkIds);
  } else {
    // Device already registered — do NOT re-upload one-time prekeys.
    // If the published-OTK state is missing (upgrade from an older version or
    // local corruption), we must NOT blindly re-upload old OTKs because the
    // server may have already consumed some of them. Instead we warn and skip
    // OTK upload, preserving any unconsumed server-side OTKs.
    const publishedIds = await getPublishedOtkIds(userId, deviceId);
    if (publishedIds.size === 0) {
      logger.warn(
        'e2ee',
        'OTK published state missing for registered device — skipping OTK upload to avoid re-publishing consumed keys',
        {
          userId: sanitizeE2eeLogValue(userId),
          deviceId: sanitizeE2eeLogValue(deviceId),
        },
      );
    }
  }

  try {
    await mobileE2eeKeyService.heartbeat(deviceId);
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      logger.warn(
        'e2ee',
        'device not found on server, clearing stale local state and re-registering',
        {
          userId: sanitizeE2eeLogValue(userId),
          deviceId: sanitizeE2eeLogValue(deviceId),
        },
      );
      await e2eeSecureStorage.clearPublishedOtkState(userId, deviceId);
      await e2eeSecureStorage.removeKeyMaterial(userId, deviceId);
      return ensureInternal(userId);
    }
    logger.warn('e2ee', 'device heartbeat failed', sanitizeE2eeLogValue(error));
  }
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
  if (!deviceId) return;
  try {
    await mobileE2eeKeyService.heartbeat(deviceId);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      logger.warn(
        'e2ee',
        'heartbeatLocalE2eeDevice: device not found on server, re-registering',
        { userId: sanitizeE2eeLogValue(userId), deviceId: sanitizeE2eeLogValue(deviceId) },
      );
      try {
        await ensureLocalE2eeDeviceRegistered();
      } catch (reRegErr: unknown) {
        logger.warn('e2ee', 'heartbeatLocalE2eeDevice: re-registration failed', sanitizeE2eeLogValue(reRegErr));
      }
    }
  }
};

/**
 * Generate and upload new one-time prekeys for the current device.
 *
 * New OTK IDs are assigned starting from max(publishedIds) + 1 to guarantee
 * they never collide with previously-published keys. The existing identity
 * key and signed prekey are preserved — only the OTK material is extended.
 *
 * TODO: Before calling this, query the server-side OTK stock endpoint to
 * determine if replenishment is actually needed. Without a server query the
 * caller must decide the appropriate threshold and timing.
 *
 * TODO: The current {@link getMobileE2eeRuntime().generatePreKeyBundle} API
 * regenerates the full key material (identity + signed prekey + OTKs). A
 * lighter-weight "generate only OTKs" API in the Rust layer would avoid
 * unnecessary computation and make replenishment cheaper.
 */
/**
 * Generate and upload new one-time prekeys for the current device.
 *
 * **DEPRECATED — DO NOT USE**: The server's `uploadBundle` performs a full
 * replace (DELETE all existing OTKs, then INSERT the request OTKs). Using it
 * for replenishment with only new OTKs would delete all unconsumed server-side
 * OTKs, causing OTK exhaustion and potential security issues.
 *
 * Replenishment requires an append-only server API (e.g. `POST /keys/otk`).
 * Until that endpoint exists, this function throws unconditionally.
 *
 * @throws {Error} always — replenishment requires append-only server API.
 */
export const replenishOneTimePreKeys = async (_count?: number): Promise<void> => {
  throw new Error(
    'OTK replenishment requires append-only server API; uploadBundle must not be used for replenishment',
  );
};

export const __resetLocalE2eeDeviceRegistrationForTests = (): void => {
  ensureInFlight = null;
};
