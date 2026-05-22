import { asBase64String, base64ToBytes, bytesToBase64, parseRustHandshake } from "@im/shared-e2ee-core";

import { keyService } from "../api/key-service";
import { webE2eeRuntime } from "../runtime";
import { markOneTimePreKeyConsumed } from "../store/key-store";
import {
  deleteSessionState,
  getSessionStateBytes,
  saveSessionStateBytes,
} from "../store/session-store";
import type { E2eeDevice, E2eeSessionStatus, PreKeyBundle } from "../types";
import { emitE2eeStatusChange } from "../status-events";
import { ensureLocalE2eeDeviceRegistered, getLocalRustKeyMaterial } from "./local-device";

const SESSION_STATUS_PREFIX = "e2ee:status:";
const INITIAL_HANDSHAKE_PREFIX = "e2ee:initial-handshake:";

export interface InitialE2eeHandshake {
  senderIdentityKey: string;
  handshake: string;
  deviceId: string;
}

export function getLocalSessionStatus(sessionId: string): E2eeSessionStatus {
  const raw = localStorage.getItem(SESSION_STATUS_PREFIX + sessionId);
  if (raw === "encrypted" || raw === "negotiating" || raw === "failed") return raw;
  return "plaintext";
}

export function setLocalSessionStatus(sessionId: string, status: E2eeSessionStatus): void {
  localStorage.setItem(SESSION_STATUS_PREFIX + sessionId, status);
  emitE2eeStatusChange(sessionId, status);
}

export function getPendingInitialHandshake(sessionId: string): InitialE2eeHandshake | null {
  const raw = localStorage.getItem(INITIAL_HANDSHAKE_PREFIX + sessionId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InitialE2eeHandshake>;
    if (
      typeof parsed.senderIdentityKey === "string" &&
      typeof parsed.handshake === "string" &&
      typeof parsed.deviceId === "string"
    ) {
      return {
        senderIdentityKey: parsed.senderIdentityKey,
        handshake: parsed.handshake,
        deviceId: parsed.deviceId,
      };
    }
  } catch {
    // ignore corrupt local metadata
  }
  localStorage.removeItem(INITIAL_HANDSHAKE_PREFIX + sessionId);
  return null;
}

export function clearPendingInitialHandshake(sessionId: string): void {
  localStorage.removeItem(INITIAL_HANDSHAKE_PREFIX + sessionId);
}

export function markNegotiationAccepted(sessionId: string): void {
  clearPendingInitialHandshake(sessionId);
  setLocalSessionStatus(sessionId, "encrypted");
}

function savePendingInitialHandshake(sessionId: string, handshake: InitialE2eeHandshake): void {
  localStorage.setItem(INITIAL_HANDSHAKE_PREFIX + sessionId, JSON.stringify(handshake));
}

function newestDevice(devices: E2eeDevice[]): E2eeDevice | undefined {
  return [...devices].sort((a, b) => {
    const left = new Date(a.lastActiveAt || a.last_active_at || 0).getTime();
    const right = new Date(b.lastActiveAt || b.last_active_at || 0).getTime();
    return right - left;
  })[0];
}

async function fetchRemoteBundle(
  remoteUserId: string,
  remoteDeviceId: string | undefined,
  conversationId: string,
  requesterDeviceId: string,
): Promise<PreKeyBundle> {
  const devicesResp = await keyService.getDevices(remoteUserId);
  const targetDevice = remoteDeviceId
    ? (devicesResp.data || []).find((device) => device.deviceId === remoteDeviceId)
    : newestDevice(devicesResp.data || []);
  if (!targetDevice?.deviceId) {
    throw new Error("remote user has no active Rust E2EE device");
  }

  const bundleResp = await keyService.getBundle(
    remoteUserId,
    targetDevice.deviceId,
    conversationId,
    requesterDeviceId,
  );
  if (!bundleResp.data) {
    throw new Error("remote user has no Rust E2EE key bundle");
  }

  // Backend returns signingIdentityKey / signedPreKey(string) / oneTimePreKey(string|null),
  // but RustPublicPreKeyBundle needs signingKey / signedPreKey({id,key}) / oneTimePreKey({id,key}|null).
  const raw = bundleResp.data as unknown as Record<string, unknown>;
  const identityKey = (raw.identityKey as string) ?? "";
  const signingIdKey = ((raw.signingIdentityKey ?? raw.signingKey) as string) ?? identityKey;
  const spkString = (raw.signedPreKey as string) ?? "";

  const maybeOtk = typeof raw.oneTimePreKey === "string" && raw.oneTimePreKey.length > 0
    ? { id: (raw.oneTimePreKeyId as number) ?? 0, key: raw.oneTimePreKey as string }
    : null;

  return {
    identityKey,
    signingKey: signingIdKey,
    signedPreKey: { id: 1, key: spkString },
    signedPreKeySignature: (raw.signedPreKeySignature as string) ?? "",
    oneTimePreKey: maybeOtk,
    userId: remoteUserId,
    deviceId: (raw.deviceId as string) ?? targetDevice.deviceId,
  };
}

export async function initiateNegotiation(
  sessionId: string,
  remoteUserId: string,
  remoteDeviceId?: string,
): Promise<boolean> {
  setLocalSessionStatus(sessionId, "negotiating");
  try {
    const deviceId = await ensureLocalE2eeDeviceRegistered();
    const localKeys = await getLocalRustKeyMaterial();
    const remoteBundle = await fetchRemoteBundle(
      remoteUserId,
      remoteDeviceId,
      sessionId,
      deviceId,
    );

    await deleteSessionState(sessionId);
    await webE2eeRuntime.removeSession(sessionId);
    const handshakeBytes = await webE2eeRuntime.createOutboundSession({
      sessionId,
      localKeys,
      remoteBundle,
    });
    await saveSessionStateBytes(sessionId, await webE2eeRuntime.exportSession(sessionId), {
      localDeviceId: deviceId,
      remoteUserId,
      remoteDeviceId: remoteBundle.deviceId ?? "",
      direction: "outbound",
    });

    // Store remote device ID for subsequent message encryption
    if (remoteBundle.deviceId) {
      localStorage.setItem(`e2ee:remote_device:${sessionId}`, remoteBundle.deviceId);
    }

    const handshake: InitialE2eeHandshake = {
      senderIdentityKey: localKeys.publicBundle.identityKey,
      handshake: bytesToBase64(handshakeBytes),
      deviceId: remoteBundle.deviceId ?? "",
    };
    savePendingInitialHandshake(sessionId, handshake);

    await keyService.requestEncryption(
      sessionId,
      localKeys.publicBundle.identityKey,
      localKeys.publicBundle.signedPreKey.key,
      JSON.stringify(handshake),
    );
    setLocalSessionStatus(sessionId, "negotiating");
    return true;
  } catch (error) {
    console.error("[E2EE] Rust negotiation initiation failed:", error instanceof Error ? error.message : "unknown");
    clearPendingInitialHandshake(sessionId);
    setLocalSessionStatus(sessionId, "failed");
    return false;
  }
}

export async function respondToNegotiation(
  sessionId: string,
  remoteIdentityKeyBase64: string,
  handshakeBase64: string,
  senderUserId: string,
  expectedDeviceId?: string,
): Promise<boolean> {
  setLocalSessionStatus(sessionId, "negotiating");
  try {
    const deviceId = await ensureLocalE2eeDeviceRegistered();
    if (expectedDeviceId && deviceId !== expectedDeviceId) {
      throw new Error("E2EE negotiation request targets a different device");
    }

    const localKeys = await getLocalRustKeyMaterial();
    await deleteSessionState(sessionId);
    await webE2eeRuntime.removeSession(sessionId);
    const encodedHandshake = asBase64String(handshakeBase64, "handshake");
    await webE2eeRuntime.createInboundSession({
      sessionId,
      localKeys,
      remoteIdentityKey: remoteIdentityKeyBase64,
      handshake: encodedHandshake,
    });

    const handshake = parseRustHandshake(base64ToBytes(encodedHandshake));
    if (handshake.oneTimePreKeyId != null) {
      await markOneTimePreKeyConsumed(handshake.oneTimePreKeyId);
    }

    await saveSessionStateBytes(sessionId, await webE2eeRuntime.exportSession(sessionId), {
      localDeviceId: deviceId,
      remoteUserId: senderUserId,
      remoteDeviceId: expectedDeviceId ?? "",
      direction: "inbound",
    });
    // Store initiator's device ID for subsequent message encryption
    if (expectedDeviceId) {
      localStorage.setItem(`e2ee:remote_device:${sessionId}`, expectedDeviceId);
    }
    setLocalSessionStatus(sessionId, "encrypted");
    return true;
  } catch (error) {
    console.error("[E2EE] Rust negotiation response failed:", error instanceof Error ? error.message : "unknown");
    setLocalSessionStatus(sessionId, "failed");
    return false;
  }
}

export async function restoreE2eeSession(sessionId: string): Promise<boolean> {
  if (getLocalSessionStatus(sessionId) !== "encrypted") {
    return false;
  }
  // TODO: restoreE2eeSession needs localDeviceId + remote context to validate
  // the envelope. Since this function has no caller currently, it is retained
  // for future use. When wiring it up, accept (localDeviceId, remoteUserId,
  // remoteDeviceId) parameters and pass them to getSessionStateBytes.
  return false;
}

export async function resetNegotiation(sessionId: string, status: E2eeSessionStatus = "plaintext"): Promise<void> {
  clearPendingInitialHandshake(sessionId);
  await deleteSessionState(sessionId);
  await webE2eeRuntime.removeSession(sessionId);
  setLocalSessionStatus(sessionId, status);
}
