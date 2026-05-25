import {
  asBase64String,
  bytesToBase64,
  bytesToUtf8,
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  type RustE2eeEnvelope,
  type RustPublicPreKeyBundle,
} from "@im/shared-e2ee-core";

import { keyService } from "../api/key-service";
import { webE2eeRuntime } from "../runtime";
import {
  deleteSessionState,
  getSessionStateBytes,
  saveSessionStateBytes,
  type SaveSessionMeta,
} from "../store/session-store";
import type { E2eeSessionStatus } from "../types";
import { resolveDeviceId } from "./device-identity";
import { ensureLocalE2eeDeviceRegistered, getLocalRustKeyMaterial } from "./local-device";
import { getLocalSessionStatus, setLocalSessionStatus } from "./negotiation";

export interface EncryptedPayload {
  ciphertext: string;
  deviceId: string;
}

class E2eeManager {
  private deviceId = "";
  /** Track sessions currently loaded in the WASM runtime to avoid duplicate restore. */
  private readonly loadedSessions = new Set<string>();

  async init(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
  }

  private async resolveCurrentDeviceId(): Promise<string> {
    if (!this.deviceId) {
      this.deviceId = await resolveDeviceId();
    }
    return this.deviceId;
  }

  getSessionStatus(sessionId: string): E2eeSessionStatus {
    return getLocalSessionStatus(sessionId);
  }

  /** @deprecated 旧 header/ciphertext 入口已移除，使用 encryptToEnvelope。 */
  async encryptMessage(_sessionId: string, _plaintext: string): Promise<EncryptedPayload | null> {
    throw new Error(
      "Legacy E2EE header/ciphertext API is removed; use encryptToEnvelope",
    );
  }

  async encryptToEnvelope(params: {
    conversationId: string;
    clientMsgId: string;
    senderUserId: string;
    recipientUserId?: string;
    recipientDeviceIds?: string[];
    plaintext: string;
  }): Promise<RustE2eeEnvelope> {
    const sessionId = params.conversationId;
    const senderDeviceId = await this.resolveCurrentDeviceId();
    await ensureLocalE2eeDeviceRegistered();

    const { recipientDeviceId, handshake } = await this.ensureOutboundSession({
      sessionId,
      recipientUserId: params.recipientUserId,
      recipientDeviceId: params.recipientDeviceIds?.[0],
    });

    const wire = await webE2eeRuntime.encrypt(sessionId, params.plaintext);
    const meta: SaveSessionMeta = {
      localDeviceId: senderDeviceId,
      remoteUserId: params.recipientUserId,
      remoteDeviceId: recipientDeviceId,
      direction: "outbound",
    };
    await saveSessionStateBytes(sessionId, await webE2eeRuntime.exportSession(sessionId), meta);
    setLocalSessionStatus(sessionId, "encrypted");

    return {
      version: RUST_E2EE_ENVELOPE_VERSION,
      algorithm: RUST_E2EE_ALGORITHM,
      senderDeviceId,
      recipientDeviceId,
      sessionId,
      handshake,
      wire: bytesToBase64(wire),
    };
  }

  async decryptEnvelope(envelope: RustE2eeEnvelope, senderUserId: string): Promise<string> {
    if (!envelope.senderDeviceId || envelope.senderDeviceId.length === 0) {
      throw new Error("E2EE envelope sender device id unavailable");
    }
    const localDeviceId = await this.resolveCurrentDeviceId();
    const state = await getSessionStateBytes(
      envelope.sessionId,
      localDeviceId,
      senderUserId,
      envelope.senderDeviceId,
    );
    if (state) {
      await this.restoreSessionIfNeeded(envelope.sessionId, state);
    } else if (envelope.handshake) {
      const localKeys = await getLocalRustKeyMaterial();
      const remoteIdentityKey = await this.resolveSenderIdentityKey(senderUserId, envelope.senderDeviceId);
      await webE2eeRuntime.createInboundSession({
        sessionId: envelope.sessionId,
        localKeys,
        remoteIdentityKey,
        handshake: asBase64String(envelope.handshake, "e2ee envelope handshake"),
      });
      this.loadedSessions.add(envelope.sessionId);
    } else {
      throw new Error("Rust E2EE session not found and envelope has no handshake");
    }

    const plaintext = await webE2eeRuntime.decrypt(envelope.sessionId, envelope);
    const meta: SaveSessionMeta = {
      localDeviceId,
      remoteUserId: senderUserId,
      remoteDeviceId: envelope.senderDeviceId,
      direction: "inbound",
    };
    await saveSessionStateBytes(envelope.sessionId, await webE2eeRuntime.exportSession(envelope.sessionId), meta);
    setLocalSessionStatus(envelope.sessionId, "encrypted");
    return bytesToUtf8(plaintext);
  }

  /** @deprecated 旧 header/ciphertext 入口已移除，使用 decryptEnvelope。 */
  async decryptMessage(
    _sessionId: string,
    _senderId: string,
    _header: unknown,
    _ciphertext: string,
  ): Promise<string> {
    throw new Error(
      "Legacy E2EE header/ciphertext API is removed; use decryptEnvelope",
    );
  }

  async clearSession(sessionId: string): Promise<void> {
    localStorage.removeItem("e2ee:status:" + sessionId);
    await deleteSessionState(sessionId);
    await webE2eeRuntime.removeSession(sessionId);
    this.loadedSessions.delete(sessionId);
  }

  /**
   * Restore a session from persisted state, skipping if already loaded in memory.
   *
   * After the first encrypt / decrypt in a page load the session is resident in
   * the WASM runtime. Calling restore_session again would fail with
   * SessionAlreadyExists. We track loaded sessions locally so the encrypt /
   * decrypt path does not trigger a duplicate restore.
   */
  private async restoreSessionIfNeeded(sessionId: string, state: Uint8Array): Promise<void> {
    if (this.loadedSessions.has(sessionId)) {
      return;
    }
    try {
      await webE2eeRuntime.restoreSession(sessionId, state);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (message.includes("session already exists")) {
        // Session was created outside e2eeManager (e.g., by initiateNegotiation
        // in negotiation.ts) and is still resident in WASM memory. Mark it as
        // loaded so we can use it directly without a duplicate restore.
        this.loadedSessions.add(sessionId);
        return;
      }
      throw err;
    }
    this.loadedSessions.add(sessionId);
  }

  private async ensureOutboundSession(input: {
    sessionId: string;
    recipientUserId?: string;
    recipientDeviceId?: string;
  }): Promise<{ recipientDeviceId: string; handshake?: string }> {
    const localDeviceId = await this.resolveCurrentDeviceId();

    // Read stored remote device ID first so we can attempt session
    // restore even when input.recipientDeviceId is not provided.
    const storedRemoteDeviceId = localStorage.getItem(`e2ee:remote_device:${input.sessionId}`) ?? "";
    const expectedRemoteUserId = input.recipientUserId ?? "";
    const expectedRemoteDeviceId = input.recipientDeviceId ?? storedRemoteDeviceId;

    // Only attempt restore when we have a valid remote device ID to
    // match against the v3 envelope context.
    if (expectedRemoteDeviceId) {
      const existingState = await getSessionStateBytes(
        input.sessionId,
        localDeviceId,
        expectedRemoteUserId,
        expectedRemoteDeviceId,
      );
      if (existingState) {
        await this.restoreSessionIfNeeded(input.sessionId, existingState);
        const recipientDeviceId = input.recipientDeviceId || storedRemoteDeviceId;
        if (!recipientDeviceId) {
          throw new Error("E2EE session state restored but remote device ID is empty");
        }
        return { recipientDeviceId };
      }
    }

    if (!input.recipientUserId) {
      throw new Error("missing recipient user id for Rust E2EE session");
    }

    const localKeys = await getLocalRustKeyMaterial();
    const requesterDeviceId = await this.resolveCurrentDeviceId();
    const remoteBundle = await this.fetchRemoteBundle(
      input.recipientUserId,
      input.recipientDeviceId,
      input.sessionId,
      requesterDeviceId,
    );
    await webE2eeRuntime.removeSession(input.sessionId);
    this.loadedSessions.delete(input.sessionId);
    const handshakeBytes = await webE2eeRuntime.createOutboundSession({
      sessionId: input.sessionId,
      localKeys,
      remoteBundle,
    });
    this.loadedSessions.add(input.sessionId);

    const resolvedDeviceId = remoteBundle.deviceId ?? input.recipientDeviceId ?? "";
    if (!resolvedDeviceId || resolvedDeviceId.length === 0) {
      throw new Error("E2EE session state requires remoteDeviceId");
    }

    const meta: SaveSessionMeta = {
      localDeviceId,
      remoteUserId: input.recipientUserId,
      remoteDeviceId: resolvedDeviceId,
      direction: "outbound",
    };
    await saveSessionStateBytes(input.sessionId, await webE2eeRuntime.exportSession(input.sessionId), meta);

    localStorage.setItem(`e2ee:remote_device:${input.sessionId}`, resolvedDeviceId);

    return {
      recipientDeviceId: resolvedDeviceId,
      handshake: bytesToBase64(handshakeBytes),
    };
  }

  private async fetchRemoteBundle(
    userId: string,
    deviceId: string | undefined,
    conversationId: string,
    requesterDeviceId: string,
  ): Promise<RustPublicPreKeyBundle> {
    const devicesResp = await keyService.getDevices(userId);
    const targetDevice =
      deviceId != null
        ? (devicesResp.data || []).find((device) => device.deviceId === deviceId)
        : [...(devicesResp.data || [])].sort((a, b) => {
            const left = new Date(a.lastActiveAt || a.last_active_at || 0).getTime();
            const right = new Date(b.lastActiveAt || b.last_active_at || 0).getTime();
            return right - left;
          })[0];

    if (!targetDevice?.deviceId) {
      throw new Error("remote user has no active Rust E2EE device");
    }

    const bundleResp = await keyService.getBundle(
      userId,
      targetDevice.deviceId,
      conversationId,
      requesterDeviceId,
    );
    if (!bundleResp.data) {
      throw new Error("remote user has no Rust E2EE bundle");
    }

    // Backend returns signingIdentityKey / signedPreKey(string) / oneTimePreKey(string|null),
    // but RustPublicPreKeyBundle needs signingKey / signedPreKey({id,key}) / oneTimePreKey({id,key}|null).
    const raw = bundleResp.data as unknown as Record<string, unknown>;
    const identityKey = (raw.identityKey as string) ?? "";
    const signingIdKey = ((raw.signingIdentityKey ?? raw.signingKey) as string) ?? identityKey;
    const spkString = (raw.signedPreKey as string) ?? "";
    const maybeOtk =
      typeof raw.oneTimePreKey === "string" && raw.oneTimePreKey.length > 0
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
      userId,
      deviceId: (raw.deviceId as string) ?? targetDevice.deviceId,
    };
  }

  private async resolveSenderIdentityKey(senderUserId: string, senderDeviceId: string): Promise<string> {
    const devicesResp = await keyService.getDevices(senderUserId);
    const device = (devicesResp.data || []).find((item) => item.deviceId === senderDeviceId);
    if (device?.identityKey) {
      return device.identityKey;
    }
    throw new Error("sender Rust identity key not found");
  }
}

export const e2eeManager = new E2eeManager();
