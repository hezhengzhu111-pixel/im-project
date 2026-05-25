import {
  asBase64String,
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  parseRustHandshake,
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  type RustE2eeEnvelope,
  type RustPublicPreKeyBundle,
} from "@im/shared-e2ee-core";

import { keyService } from "../api/key-service";
import { webE2eeRuntime } from "../runtime";
import {
  clearLocalKeyMaterial,
  markOneTimePreKeyConsumed,
} from "../store/key-store";
import {
  deleteSessionState,
  findSessionByLocalDevice,
  getSessionStateBytes,
  saveSessionStateBytes,
  type SaveSessionMeta,
} from "../store/session-store";
import type { E2eeSessionStatus } from "../types";
import { resolveDeviceId } from "./device-identity";
import { ensureLocalE2eeDeviceRegistered, getLocalRustKeyMaterial } from "./local-device";
import { getLocalSessionStatus, setLocalSessionStatus } from "./negotiation";
import { logger } from "@/utils/logger";

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

    // When a handshake replaces an existing session (sender re-created their
    // ratchet), we keep the old session state in a backup slot so that
    // in-flight messages encrypted with the old session can still be decrypted.
    const BACKUP_SUFFIX = ":backup";
    const backupSessionId = envelope.sessionId + BACKUP_SUFFIX;
    let createdFromHandshake = false;
    let hadStoredState = state !== null;

    // ── Phase 1: Ensure a session is loaded in the WASM runtime ──
    let sessionReady = false;

    if (envelope.handshake) {
      // Handshake present — always try to establish a new inbound session.
      // This takes precedence over any stored session because the sender may
      // have re-created their session (e.g. device re-registration), making
      // the stored session's keys stale.
      const remoteIdentityKey = await this.resolveSenderIdentityKey(
        senderUserId,
        envelope.senderDeviceId,
      );

      // Save the old session state as a backup before replacing it.
      // In-flight messages encrypted with the old session can still be
      // decrypted using this backup if the new session fails.
      if (state) {
        try {
          await webE2eeRuntime.removeSession(backupSessionId);
          await webE2eeRuntime.restoreSession(backupSessionId, state);
          // Persist backup to IndexedDB so it survives page reloads
          await saveSessionStateBytes(backupSessionId, state, {
            localDeviceId,
            remoteUserId: senderUserId,
            remoteDeviceId: envelope.senderDeviceId,
            direction: "inbound",
          });
          logger.info("[E2EE] decryptEnvelope: saved old session as backup", {
            sessionId: envelope.sessionId,
            backupSessionId,
          });
        } catch (backupErr: unknown) {
          logger.warn("[E2EE] decryptEnvelope: failed to save backup session", {
            sessionId: envelope.sessionId,
            error: backupErr instanceof Error ? backupErr.message : String(backupErr ?? ""),
          });
        }
      }

      // Remove any old primary session from WASM to avoid SessionAlreadyExists
      await webE2eeRuntime.removeSession(envelope.sessionId);
      this.loadedSessions.delete(envelope.sessionId);

      try {
        const localKeys = await getLocalRustKeyMaterial();
        await webE2eeRuntime.createInboundSession({
          sessionId: envelope.sessionId,
          localKeys,
          remoteIdentityKey,
          handshake: asBase64String(envelope.handshake, "e2ee envelope handshake"),
        });
        this.loadedSessions.add(envelope.sessionId);
        createdFromHandshake = true;

        // Track OTK consumption to keep local key material in sync
        const parsed = parseRustHandshake(base64ToBytes(envelope.handshake));
        if (parsed.oneTimePreKeyId != null) {
          try {
            await markOneTimePreKeyConsumed(parsed.oneTimePreKeyId);
          } catch (otkErr: unknown) {
            logger.error("[E2EE] failed to mark OTK as consumed after decrypt", {
              sessionId: envelope.sessionId,
              oneTimePreKeyId: parsed.oneTimePreKeyId,
              error:
                otkErr instanceof Error
                  ? otkErr.message
                  : String(otkErr ?? ""),
            });
          }
        }

        logger.info("[E2EE] decryptEnvelope: inbound session created from handshake", {
          sessionId: envelope.sessionId,
          localDeviceId,
          senderUserId,
          senderDeviceId: envelope.senderDeviceId,
          oneTimePreKeyId: parsed.oneTimePreKeyId,
          hadStoredState,
        });
        sessionReady = true;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err ?? "");

        if (errMsg.includes("missing one-time pre-key")) {
          // The sender used an OTK that we no longer have locally (likely
          // already consumed by a concurrent negotiation). Mark this
          // session as failed so the sender will re-initiate with a fresh
          // bundle. Do NOT clear all key material — that would destroy
          // every other active E2EE session.
          logger.warn("[E2EE] decryptEnvelope: OTK referenced by handshake not available locally", {
            sessionId: envelope.sessionId,
            localDeviceId,
            senderUserId,
            senderDeviceId: envelope.senderDeviceId,
          });
          setLocalSessionStatus(envelope.sessionId, "failed");
          throw err;
        }

        // Non-OTK error: fall back to stored session if available
        if (state) {
          logger.warn("[E2EE] decryptEnvelope: handshake failed, falling back to stored session", {
            sessionId: envelope.sessionId,
            localDeviceId,
            senderUserId,
            senderDeviceId: envelope.senderDeviceId,
            errorMessage: errMsg,
          });
          await this.restoreSessionIfNeeded(envelope.sessionId, state);
          sessionReady = true;
        } else {
          logger.error("[E2EE] decryptEnvelope: handshake failed and no stored session fallback", {
            sessionId: envelope.sessionId,
            localDeviceId,
            senderUserId,
            senderDeviceId: envelope.senderDeviceId,
            errorMessage: errMsg,
          });
          throw err;
        }
      }
    } else if (state) {
      await this.restoreSessionIfNeeded(envelope.sessionId, state);
      sessionReady = true;
    } else {
      logger.warn("[E2EE] decryptEnvelope: no session available for decryption", {
        sessionId: envelope.sessionId,
        localDeviceId,
        senderUserId,
        senderDeviceId: envelope.senderDeviceId,
        recipientDeviceId: envelope.recipientDeviceId,
      });
      throw new Error("Rust E2EE session not found and envelope has no handshake");
    }

    // ── Phase 2: Decrypt ─────────────────────────────────────────────
    let plaintext: Uint8Array;
    let usedBackup = false;
    try {
      plaintext = await webE2eeRuntime.decrypt(envelope.sessionId, envelope);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? "");

      // If we just created a new session from handshake and decryption fails,
      // the message may have been encrypted with the OLD session. Try the backup.
      if (createdFromHandshake && (msg.includes("AES-GCM") || msg.includes("authentication"))) {
        logger.warn("[E2EE] decryptEnvelope: new session decrypt failed, trying backup session", {
          sessionId: envelope.sessionId,
          backupSessionId,
          errorMessage: msg,
        });
        try {
          // Swap: move the new session to a temp slot, restore backup as primary
          const tempSessionId = envelope.sessionId + ":temp";
          await webE2eeRuntime.removeSession(tempSessionId);
          const newState = await webE2eeRuntime.exportSession(envelope.sessionId);
          await webE2eeRuntime.restoreSession(tempSessionId, newState);

          await webE2eeRuntime.removeSession(envelope.sessionId);
          this.loadedSessions.delete(envelope.sessionId);

          // Restore the backup session — try WASM first, then IndexedDB
          let backupState: Uint8Array;
          try {
            backupState = await webE2eeRuntime.exportSession(backupSessionId);
          } catch {
            // Backup not in WASM (e.g. page reload) — try IndexedDB
            const storedBackup = await getSessionStateBytes(
              backupSessionId,
              localDeviceId,
              senderUserId,
              envelope.senderDeviceId,
            );
            if (!storedBackup) {
              throw new Error("backup session not found in WASM or IndexedDB");
            }
            await webE2eeRuntime.restoreSession(backupSessionId, storedBackup);
            backupState = await webE2eeRuntime.exportSession(backupSessionId);
          }
          await webE2eeRuntime.restoreSession(envelope.sessionId, backupState);
          this.loadedSessions.add(envelope.sessionId);

          // Try decrypting with the backup (old session)
          plaintext = await webE2eeRuntime.decrypt(envelope.sessionId, envelope);
          usedBackup = true;

          // Move the new session back to backup slot — future messages
          // (encrypted with the new session) will have their own handshake
          // or the new session will be restored from storage.
          await webE2eeRuntime.removeSession(backupSessionId);
          const currentNewState = await webE2eeRuntime.exportSession(tempSessionId);
          await webE2eeRuntime.restoreSession(backupSessionId, currentNewState);
          await webE2eeRuntime.removeSession(tempSessionId);

          logger.info("[E2EE] decryptEnvelope: backup session decrypted successfully", {
            sessionId: envelope.sessionId,
            backupSessionId,
          });
        } catch (backupErr: unknown) {
          // Both primary and backup failed — clean up and report
          logger.error("[E2EE] decryptEnvelope: both primary and backup sessions failed", {
            sessionId: envelope.sessionId,
            primaryError: msg,
            backupError: backupErr instanceof Error ? backupErr.message : String(backupErr ?? ""),
          });
          await webE2eeRuntime.removeSession(envelope.sessionId);
          this.loadedSessions.delete(envelope.sessionId);
          await webE2eeRuntime.removeSession(backupSessionId);
          await deleteSessionState(envelope.sessionId);
          localStorage.removeItem(`e2ee:remote_device:${envelope.sessionId}`);
          setLocalSessionStatus(envelope.sessionId, "plaintext");
          throw err;
        }
      } else if (msg.includes("AES-GCM") || msg.includes("authentication")) {
        logger.error("[E2EE] decryptEnvelope: AES-GCM authentication failed — session key mismatch", {
          sessionId: envelope.sessionId,
          localDeviceId,
          senderDeviceId: envelope.senderDeviceId,
          recipientDeviceId: envelope.recipientDeviceId,
          senderUserId,
          hasHandshake: !!envelope.handshake,
          hadStoredState,
          errorMessage: msg,
        });
        await deleteSessionState(envelope.sessionId);
        await webE2eeRuntime.removeSession(envelope.sessionId);
        this.loadedSessions.delete(envelope.sessionId);
        await webE2eeRuntime.removeSession(backupSessionId);
        localStorage.removeItem(`e2ee:remote_device:${envelope.sessionId}`);
        setLocalSessionStatus(envelope.sessionId, "plaintext");
      }
      throw err;
    }

    // ── Phase 3: Persist updated session state ────────────────────────
    const meta: SaveSessionMeta = {
      localDeviceId,
      remoteUserId: senderUserId,
      remoteDeviceId: envelope.senderDeviceId,
      direction: "inbound",
    };

    if (usedBackup) {
      // Save the backup (old session) as the primary since it was used to
      // decrypt this message. Also save the new session state from the
      // backup slot so future messages with the new handshake can still
      // establish a fresh session.
      await saveSessionStateBytes(
        envelope.sessionId,
        await webE2eeRuntime.exportSession(envelope.sessionId),
        meta,
      );
      // Persist the new (future) session state under the backup slot
      // so that when the next handshake arrives, it can be promoted.
      try {
        const futureState = await webE2eeRuntime.exportSession(backupSessionId);
        await saveSessionStateBytes(
          backupSessionId,
          futureState,
          { ...meta, direction: "inbound" },
        );
      } catch {
        // Backup save is best-effort; next handshake will recreate anyway
      }
    } else {
      await saveSessionStateBytes(
        envelope.sessionId,
        await webE2eeRuntime.exportSession(envelope.sessionId),
        meta,
      );
      // On successful decrypt with the primary (new) session, clean up the
      // backup — we no longer need the old session state.
      if (createdFromHandshake) {
        try {
          await webE2eeRuntime.removeSession(backupSessionId);
          await deleteSessionState(backupSessionId);
        } catch {
          // Already gone or never existed
        }
      }
    }

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
    localStorage.removeItem("e2ee:remote_device:" + sessionId);
    await deleteSessionState(sessionId);
    await webE2eeRuntime.removeSession(sessionId);
    this.loadedSessions.delete(sessionId);
  }

  /**
   * 清除所有 E2EE 状态，退出加密通道。
   *
   * 用途：手动调试/恢复时清理损坏的加密状态，回到 plaintext 重新开始。
   */
  async resetAllE2eeState(): Promise<void> {
    // 1. 清除所有 WASM 会话
    for (const sid of this.loadedSessions) {
      await webE2eeRuntime.removeSession(sid);
    }
    this.loadedSessions.clear();

    // 2. 清除 localStorage 中的 E2EE 标记
    try {
      for (const key of Object.keys(localStorage)) {
        if (
          key.startsWith("e2ee:status:") ||
          key.startsWith("e2ee:remote_device:") ||
          key.startsWith("e2ee:initial-handshake:") ||
          key.startsWith("e2ee:otk_published:")
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // localStorage may be unavailable
    }

    // 3. 清除 IndexedDB 中的会话和密钥
    const { clearLocalKeyMaterial, clearAllSessionState } = await import("../store/key-store");
    await clearLocalKeyMaterial();
    await clearAllSessionState();
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
        // The caller will export and persist the updated state after
        // encrypt/decrypt, so IndexedDB stays in sync with WASM.
        this.loadedSessions.add(sessionId);
        logger.info("[E2EE] restoreSessionIfNeeded: session already in WASM, skipping restore", {
          sessionId,
        });
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
    let expectedRemoteUserId = input.recipientUserId ?? "";
    let expectedRemoteDeviceId = input.recipientDeviceId ?? storedRemoteDeviceId;

    // When the localStorage mapping has been lost (e.g. browser data cleared),
    // scan IndexedDB directly to recover the session. Without this fallback
    // every message would create a new X3DH session with a fresh handshake,
    // causing the peer's session to diverge and producing AES-GCM failures.
    if (!expectedRemoteDeviceId) {
      const recovered = await findSessionByLocalDevice(
        input.sessionId,
        localDeviceId,
      );
      if (recovered) {
        expectedRemoteDeviceId = recovered.remoteDeviceId;
        // Reconstruct the localStorage mapping so subsequent calls hit
        // the fast path.
        localStorage.setItem(
          `e2ee:remote_device:${input.sessionId}`,
          recovered.remoteDeviceId,
        );
        logger.info("[E2EE] ensureOutboundSession: recovered remote device id from IndexedDB", {
          sessionId: input.sessionId,
          remoteDeviceId: recovered.remoteDeviceId,
        });
      }
    }

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
        logger.info("[E2EE] ensureOutboundSession: reusing stored session (no handshake)", {
          sessionId: input.sessionId,
          localDeviceId,
          remoteDeviceId: expectedRemoteDeviceId,
          remoteUserId: expectedRemoteUserId,
        });
        await this.restoreSessionIfNeeded(input.sessionId, existingState);
        const recipientDeviceId = input.recipientDeviceId || expectedRemoteDeviceId;
        if (!recipientDeviceId) {
          throw new Error("E2EE session state restored but remote device ID is empty");
        }
        return { recipientDeviceId };
      }
    }

    if (!input.recipientUserId) {
      throw new Error("missing recipient user id for Rust E2EE session");
    }

    logger.info("[E2EE] ensureOutboundSession: creating new outbound session (with handshake)", {
      sessionId: input.sessionId,
      localDeviceId,
      remoteUserId: input.recipientUserId,
      remoteDeviceId: input.recipientDeviceId ?? storedRemoteDeviceId,
      reason: "no_stored_session_found",
    });

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
