import { logger } from "@/utils/logger";
import type { RustLocalE2eeKeyMaterial, RustPublicPreKeyBundle } from "@im/shared-e2ee-core";

import { keyService } from "../api/key-service";
import { webE2eeRuntime } from "../runtime";
import {
  clearLegacyE2eeState,
  getLocalKeyMaterial,
  saveLocalKeyMaterial,
} from "../store/key-store";
import { resolveDeviceId } from "./device-identity";

const SIGNED_PRE_KEY_ID = 1;
const ONE_TIME_PRE_KEY_START_ID = 1;
const ONE_TIME_PRE_KEY_COUNT = 100;

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
    logger.info("[E2EE] Rust key bundle generated and uploaded", { deviceId });
    return deviceId;
  }

  await uploadPublicBundle(deviceId, keys.publicBundle);
  logger.info("[E2EE] Rust key bundle uploaded for current account", { deviceId });
  return deviceId;
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
    oneTimePreKeys: (bundle.oneTimePreKeys ?? []).map(k => k.key),
  });
}
