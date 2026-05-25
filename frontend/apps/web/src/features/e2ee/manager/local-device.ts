import { logger } from "@/utils/logger";
import type { RustLocalE2eeKeyMaterial, RustPublicPreKeyBundle } from "@im/shared-e2ee-core";

import { keyService } from "../api/key-service";
import { webE2eeRuntime } from "../runtime";
import {
  clearLegacyE2eeState,
  clearLocalKeyMaterial,
  getLocalKeyMaterial,
  saveLocalKeyMaterial,
} from "../store/key-store";
import { resolveDeviceId } from "./device-identity";

const SIGNED_PRE_KEY_ID = 1;
const ONE_TIME_PRE_KEY_START_ID = 1;
const ONE_TIME_PRE_KEY_COUNT = 100;

const OTK_PUBLISHED_PREFIX = "e2ee:otk_published:";

function getPublishedOtkIds(deviceId: string): Set<number> {
  try {
    const raw = localStorage.getItem(OTK_PUBLISHED_PREFIX + deviceId);
    if (raw) {
      const ids = JSON.parse(raw) as number[];
      if (Array.isArray(ids)) {
        return new Set(ids);
      }
    }
  } catch {
    // corrupted state
  }
  return new Set();
}

function setPublishedOtkIds(deviceId: string, ids: number[]): void {
  try {
    localStorage.setItem(OTK_PUBLISHED_PREFIX + deviceId, JSON.stringify(ids));
  } catch {
    // localStorage unavailable
  }
}

let registrationInFlight: Promise<string> | null = null;
let legacyCleanupDone = false;

export async function ensureLocalE2eeDeviceRegistered(): Promise<string> {
  if (registrationInFlight) {
    return registrationInFlight;
  }

  registrationInFlight = ensureLocalE2eeDeviceRegisteredInternal().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}

export async function getLocalRustKeyMaterial(): Promise<RustLocalE2eeKeyMaterial> {
  const keys = await getLocalKeyMaterial();
  if (!keys) {
    await ensureLocalE2eeDeviceRegistered();
  }
  const resolved = await getLocalKeyMaterial();
  if (!resolved) {
    throw new Error("local Rust E2EE key material not found");
  }
  return resolved;
}

async function ensureLocalE2eeDeviceRegisteredInternal(): Promise<string> {
  const deviceId = await resolveDeviceId();
  if (!legacyCleanupDone) {
    await clearLegacyE2eeState();
    legacyCleanupDone = true;
  }

  const keys = await getLocalKeyMaterial();
  if (!keys || !isLocalBundleConsistent(keys)) {
    const generated = await webE2eeRuntime.generatePreKeyBundle({
      signedPreKeyId: SIGNED_PRE_KEY_ID,
      oneTimePreKeyStartId: ONE_TIME_PRE_KEY_START_ID,
      oneTimePreKeyCount: ONE_TIME_PRE_KEY_COUNT,
    });
    await saveLocalKeyMaterial(generated);
    await uploadPublicBundle(deviceId, generated.publicBundle);
    const otkIds = (generated.publicBundle.oneTimePreKeys ?? []).map((k) => k.id);
    setPublishedOtkIds(deviceId, otkIds);
    logger.info("[E2EE] Rust key bundle generated and uploaded", { deviceId });
    return deviceId;
  }

  // Device already registered — do NOT re-upload one-time prekeys.
  // The server's upload_bundle performs a full replace (DELETE old OTKs + INSERT new OTKs),
  // so re-uploading the same OTK batch would be idempotent but unnecessary.
  // We send only a heartbeat to keep the device active.
  const publishedIds = getPublishedOtkIds(deviceId);
  if (publishedIds.size === 0) {
    logger.warn(
      "[E2EE] OTK published state missing for registered device — skipping OTK upload to avoid re-publishing consumed keys",
      { deviceId },
    );
  }

  try {
    await keyService.heartbeat(deviceId);
    logger.info("[E2EE] device already registered, heartbeat sent", { deviceId });
    return deviceId;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      logger.warn(
        "[E2EE] device not found on server, clearing stale local state and re-registering",
        { deviceId },
      );
      localStorage.removeItem(OTK_PUBLISHED_PREFIX + deviceId);
      await clearLocalKeyMaterial();
      // Retry — will hit the first-time registration branch above
      return ensureLocalE2eeDeviceRegisteredInternal();
    }
    logger.warn("[E2EE] device heartbeat failed", err);
    logger.info("[E2EE] device already registered, heartbeat sent", { deviceId });
    return deviceId;
  }
}

function isLocalBundleConsistent(keys: RustLocalE2eeKeyMaterial): boolean {
  const bundle = keys.publicBundle;
  return (
    keys.version === 2 &&
    typeof keys.identityKeyPairBincode === "string" &&
    typeof keys.signedPreKeyPairBincode === "string" &&
    bundle.identityKey.length > 0 &&
    bundle.signingKey.length > 0 &&
    bundle.signedPreKey.id === SIGNED_PRE_KEY_ID &&
    bundle.signedPreKey.key.length > 0 &&
    bundle.signedPreKeySignature.length > 0
  );
}

async function uploadPublicBundle(deviceId: string, bundle: RustPublicPreKeyBundle): Promise<void> {
  await keyService.uploadBundle({
    deviceId,
    identityKey: bundle.identityKey,
    signingIdentityKey: bundle.signingKey,
    signedPreKey: bundle.signedPreKey.key,
    signedPreKeySignature: bundle.signedPreKeySignature,
    oneTimePreKeys: bundle.oneTimePreKeys ?? [],
  });
}
