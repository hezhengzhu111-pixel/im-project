import { asBase64String, base64ToBytes, bytesToBase64, parseRustHandshake } from "@im/shared-e2ee-core";

import { logger } from "@/utils/logger";
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
import {
  generateVerifyPhrase,
  saveVerifyPhrase,
  startPingTimer,
} from "./channel-ping";

const SESSION_STATUS_PREFIX = "e2ee:status:";
const INITIAL_HANDSHAKE_PREFIX = "e2ee:initial-handshake:";

export interface InitialE2eeHandshake {
  senderIdentityKey: string;
  handshake: string;
  senderDeviceId: string;
  targetDeviceId: string;
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
      typeof parsed.senderDeviceId === "string" &&
      typeof parsed.targetDeviceId === "string"
    ) {
      return {
        senderIdentityKey: parsed.senderIdentityKey,
        handshake: parsed.handshake,
        senderDeviceId: parsed.senderDeviceId,
        targetDeviceId: parsed.targetDeviceId,
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

export function markNegotiationAccepted(sessionId: string, remoteUserId?: string): void {
  clearPendingInitialHandshake(sessionId);
  setLocalSessionStatus(sessionId, "encrypted");
  if (remoteUserId) {
    startPingTimer(sessionId, remoteUserId);
  }
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
    ? typeof raw.oneTimePreKeyId === "number" && Number.isFinite(raw.oneTimePreKeyId)
      ? { id: raw.oneTimePreKeyId, key: raw.oneTimePreKey as string }
      : (() => { throw new Error("E2EE bundle contains oneTimePreKey without oneTimePreKeyId"); })()
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
  // 清理上一次协商的残留状态（本地 session、服务端状态）
  await resetNegotiation(sessionId, "plaintext");
  try {
    await keyService.disableEncryption(sessionId);
  } catch {
    // 服务端可能还没有 session 记录，忽略错误
  }

  setLocalSessionStatus(sessionId, "negotiating");
  try {
    const deviceId = await ensureLocalE2eeDeviceRegistered();
    const localKeys = await getLocalRustKeyMaterial();
    // 使用唯一 claimId 绕过 e2ee_pre_key_claims 幂等声明，
    // 避免复用上一次协商已消耗的 OTK
    const claimId = `${sessionId}:${Date.now()}`;
    const remoteBundle = await fetchRemoteBundle(
      remoteUserId,
      remoteDeviceId,
      claimId,
      deviceId,
    );

    if (!remoteBundle.deviceId || remoteBundle.deviceId.length === 0) {
      throw new Error("E2EE negotiation requires remote device id");
    }

    // Backup any existing session before replacing it so that in-flight
    // messages encrypted with the old session can still be decrypted.
    const existingRemoteDeviceId =
      localStorage.getItem(`e2ee:remote_device:${sessionId}`) ?? "";
    if (existingRemoteDeviceId) {
      const oldState = await getSessionStateBytes(
        sessionId,
        deviceId,
        remoteUserId,
        existingRemoteDeviceId,
      );
      if (oldState) {
        try {
          const backupId = sessionId + ":backup";
          await webE2eeRuntime.removeSession(backupId);
          await webE2eeRuntime.restoreSession(backupId, oldState);
          await saveSessionStateBytes(backupId, oldState, {
            localDeviceId: deviceId,
            remoteUserId,
            remoteDeviceId: existingRemoteDeviceId,
            direction: "outbound",
          });
        } catch {
          // best-effort backup
        }
      }
    }

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
      remoteDeviceId: remoteBundle.deviceId,
      direction: "outbound",
    });

    localStorage.setItem(`e2ee:remote_device:${sessionId}`, remoteBundle.deviceId);

    const handshake: InitialE2eeHandshake = {
      senderIdentityKey: localKeys.publicBundle.identityKey,
      handshake: bytesToBase64(handshakeBytes),
      senderDeviceId: deviceId,
      targetDeviceId: remoteBundle.deviceId,
    };
    const verifyPhrase = generateVerifyPhrase();
    saveVerifyPhrase(sessionId, verifyPhrase);
    savePendingInitialHandshake(sessionId, handshake);

    await keyService.requestEncryption(
      sessionId,
      localKeys.publicBundle.identityKey,
      localKeys.publicBundle.signedPreKey.key,
      JSON.stringify({ ...handshake, verifyPhrase }),
    );
    setLocalSessionStatus(sessionId, "negotiating");
    return true;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;

    // 409 Conflict: server already has a pending request → idempotent, treat as success.
    if (status === 409) {
      logger.info("[E2EE] encryption request already pending, continuing wait", { sessionId });
      setLocalSessionStatus(sessionId, "negotiating");
      return true;
    }

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
  senderDeviceId: string,
  targetDeviceId: string,
  verifyPhrase?: string,
): Promise<boolean> {
  if (!senderDeviceId || senderDeviceId.length === 0) {
    console.error("[E2EE] respondToNegotiation failed: missing sender device id");
    setLocalSessionStatus(sessionId, "failed");
    return false;
  }
  if (!targetDeviceId || targetDeviceId.length === 0) {
    console.error("[E2EE] respondToNegotiation failed: missing target device id");
    setLocalSessionStatus(sessionId, "failed");
    return false;
  }

  setLocalSessionStatus(sessionId, "negotiating");
  try {
    const deviceId = await ensureLocalE2eeDeviceRegistered();
    if (deviceId !== targetDeviceId) {
      throw new Error("E2EE negotiation request targets a different device");
    }

    const localKeys = await getLocalRustKeyMaterial();

    // Backup any existing session before replacing it.
    const oldState = await getSessionStateBytes(
      sessionId,
      deviceId,
      senderUserId,
      senderDeviceId,
    );
    if (oldState) {
      try {
        const backupId = sessionId + ":backup";
        await webE2eeRuntime.removeSession(backupId);
        await webE2eeRuntime.restoreSession(backupId, oldState);
        await saveSessionStateBytes(backupId, oldState, {
          localDeviceId: deviceId,
          remoteUserId: senderUserId,
          remoteDeviceId: senderDeviceId,
          direction: "inbound",
        });
      } catch {
        // best-effort backup
      }
    }

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
      try {
        await markOneTimePreKeyConsumed(handshake.oneTimePreKeyId);
      } catch (otkErr: unknown) {
        logger.error("[E2EE] failed to mark OTK as consumed after negotiation", {
          sessionId,
          oneTimePreKeyId: handshake.oneTimePreKeyId,
          error:
            otkErr instanceof Error
              ? otkErr.message
              : String(otkErr ?? ""),
        });
      }
    }

    await saveSessionStateBytes(sessionId, await webE2eeRuntime.exportSession(sessionId), {
      localDeviceId: deviceId,
      remoteUserId: senderUserId,
      remoteDeviceId: senderDeviceId,
      direction: "inbound",
    });
    localStorage.setItem(`e2ee:remote_device:${sessionId}`, senderDeviceId);
    if (verifyPhrase && verifyPhrase.length > 0) {
      saveVerifyPhrase(sessionId, verifyPhrase);
    }
    setLocalSessionStatus(sessionId, "encrypted");

    // Update server-side negotiation state to "encrypted".
    try {
      await keyService.acceptEncryption(
        sessionId,
        localKeys.publicBundle.signedPreKey.key,
      );
    } catch (acceptErr: unknown) {
      logger.warn("[E2EE] accept encryption API call failed", {
        sessionId,
        error:
          acceptErr instanceof Error
            ? acceptErr.message
            : String(acceptErr ?? ""),
      });
      // Session is already established locally; do not fail the negotiation.
    }

    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error ?? "");

    if (errMsg.includes("missing one-time pre-key")) {
      logger.warn("[E2EE] OTK referenced by handshake not available locally, forcing re-registration", { sessionId });
      try {
        const { clearLocalKeyMaterial } = await import("../store/key-store");
        await clearLocalKeyMaterial();
      } catch {
        // best-effort cleanup
      }
      setLocalSessionStatus(sessionId, "failed");
      throw new Error(
        "一次性密钥已过期，请通知对方重新发起加密请求。",
      );
    }

    console.error("[E2EE] Rust negotiation response failed:", errMsg);
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
