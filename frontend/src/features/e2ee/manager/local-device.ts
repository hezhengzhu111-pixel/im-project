import { logger } from "@/utils/logger";
import { keyService } from "../api/key-service";
import { generateKeyBundle } from "../engine/x3dh";
import {
  getLocalPublicBundle,
  hasIdentityKey,
  saveIdentityKeyPair,
  saveLocalPublicBundle,
  saveSignedPreKey,
  type LocalPublicBundle,
} from "../store/key-store";
import { resolveDeviceId } from "./device-identity";

const SIGNED_PRE_KEY_ID = 1;

let registrationInFlight: Promise<string> | null = null;

export async function ensureLocalE2eeDeviceRegistered(): Promise<string> {
  if (registrationInFlight) {
    return registrationInFlight;
  }

  registrationInFlight = ensureLocalE2eeDeviceRegisteredInternal().finally(
    () => {
      registrationInFlight = null;
    },
  );
  return registrationInFlight;
}

async function ensureLocalE2eeDeviceRegisteredInternal(): Promise<string> {
  const deviceId = await resolveDeviceId();
  const hasKey = await hasIdentityKey();
  const localBundle = await getLocalPublicBundle();

  if (!hasKey || !localBundle) {
    await generateAndUploadBundle(deviceId);
    return deviceId;
  }

  await uploadPublicBundle(deviceId, localBundle);
  logger.info("[E2EE] key bundle uploaded for current account", { deviceId });
  return deviceId;
}

async function generateAndUploadBundle(deviceId: string): Promise<void> {
  const bundle = await generateKeyBundle();

  await saveIdentityKeyPair(bundle.identityKeyPair);
  await saveSignedPreKey(SIGNED_PRE_KEY_ID, bundle.signedPreKeyPair);

  const localBundle: LocalPublicBundle = {
    version: 2,
    identityKey: bundle.bundle.identityKey,
    signingIdentityKey: bundle.bundle.signingIdentityKey,
    signedPreKey: bundle.bundle.signedPreKey,
    signedPreKeySignature: bundle.bundle.signedPreKeySignature,
  };

  await uploadPublicBundle(deviceId, localBundle);
  await saveLocalPublicBundle(localBundle);

  logger.info("[E2EE] key bundle generated and uploaded", { deviceId });
}

async function uploadPublicBundle(
  deviceId: string,
  bundle: LocalPublicBundle,
): Promise<void> {
  await keyService.uploadBundle({
    deviceId,
    identityKey: bundle.identityKey,
    signingIdentityKey: bundle.signingIdentityKey,
    signedPreKey: bundle.signedPreKey,
    signedPreKeySignature: bundle.signedPreKeySignature,
    oneTimePreKeys: [],
  });
}
