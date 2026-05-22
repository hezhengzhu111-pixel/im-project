/**
 * E2EE 消息解密统一调度器。
 *
 * 设计目标：
 * - 按 sessionId 串行执行解密，保证 Double Ratchet 状态不会因并发而乱序推进。
 * - 按 messageId/clientMessageId 去重，避免同一消息重复推进 ratchet。
 * - 历史批量消息和 WebSocket 实时消息使用同一套解密逻辑。
 * - 解密失败时保留 encrypted=true + decryptStatus，不永久吞掉错误。
 * - 自己的加密消息不尝试解密，标记 decryptStatus="skipped_own"。
 */
import type { Message } from "@/types";
import { classifyE2eeError, isRustE2eeEnvelope, OLD_E2EE_UNREADABLE_TEXT } from "@im/shared-e2ee-core";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecryptResult {
  /** 解密是否成功 */
  success: boolean;
  /** 结构化结果码 */
  code:
    | "success"
    | "skipped_own_message"
    | "missing_envelope"
    | "missing_session"
    | "crypto_failed"
    | "otk_missing"
    | "duplicate"
    | "unsupported_envelope"
    | "session_created_from_handshake";
  /** 用户可见的错误信息（仅在失败时有值） */
  displayMessage?: string;
}

export interface DecryptContext {
  currentUserId: string;
  /** 可选的消息去重缓存: Map<dedupKey, true> */
  dedupCache?: Map<string, true>;
}

// ---------------------------------------------------------------------------
// Per-session serial queue
// ---------------------------------------------------------------------------

const sessionQueues = new Map<string, Promise<void>>();

function enqueueSessionTask(sessionId: string, task: () => Promise<void>): Promise<void> {
  const prev = sessionQueues.get(sessionId) ?? Promise.resolve();
  const next = prev.then(task, task);
  sessionQueues.set(sessionId, next);
  return next;
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

/** 已成功解密的 message 标识集合。key = `${messageId}|${clientMessageId}` */
const decryptedMessageIds = new Map<string, true>();
const MAX_DECRYPTED_CACHE = 500;

function markDecrypted(message: Message): void {
  const keys = [message.messageId, message.clientMessageId, message.id]
    .filter(Boolean) as string[];
  for (const key of keys) {
    decryptedMessageIds.set(key, true);
  }
  // 限制缓存大小
  if (decryptedMessageIds.size > MAX_DECRYPTED_CACHE) {
    const entries = Array.from(decryptedMessageIds.keys());
    for (let i = 0; i < entries.length - MAX_DECRYPTED_CACHE + 50; i++) {
      decryptedMessageIds.delete(entries[i]);
    }
  }
}

function isAlreadyDecrypted(message: Message): boolean {
  return [message.messageId, message.clientMessageId, message.id]
    .filter(Boolean)
    .some((key) => decryptedMessageIds.has(key as string));
}

// ---------------------------------------------------------------------------
// Core decrypt logic
// ---------------------------------------------------------------------------

async function decryptOneMessage(
  msg: Message,
  ctx: DecryptContext,
): Promise<DecryptResult> {
  const senderId = String(msg.senderId || "");

  // 1. Own message — skip (content is user's own input, already set)
  if (senderId === ctx.currentUserId) {
    msg.decryptStatus = "skipped_own";
    return { success: true, code: "skipped_own_message" };
  }

  // 2. Validate envelope exists
  const envelope = msg.e2eeEnvelope;
  if (!isRustE2eeEnvelope(envelope)) {
    msg.decryptStatus = "failed";
    return { success: false, code: "unsupported_envelope", displayMessage: OLD_E2EE_UNREADABLE_TEXT };
  }

  // 3. Dedup check
  if (isAlreadyDecrypted(msg)) {
    return { success: true, code: "duplicate" };
  }

  // 4. Decrypt
  try {
    const { e2eeManager } = await import("@/features/e2ee/manager/e2ee-manager");
    const plaintext = await e2eeManager.decryptEnvelope(envelope, senderId);
    msg.content = plaintext;
    msg.decryptStatus = "success";
    markDecrypted(msg);

    logger.info("[E2EE] decrypt success", {
      messageId: msg.id,
      clientMessageId: msg.clientMessageId,
      sessionId: envelope.sessionId,
      senderId,
      senderDeviceId: envelope.senderDeviceId,
      hasHandshake: !!envelope.handshake,
      code: envelope.handshake ? "session_created_from_handshake" : "success",
    });

    return {
      success: true,
      code: envelope.handshake ? "session_created_from_handshake" : "success",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error ?? "");
    const hasHandshake = !!envelope.handshake;

    // 判断失败类型
    const classification = classifyE2eeError(error);
    const isMissingSession =
      errMsg.includes("session not found") ||
      errMsg.includes("no handshake") ||
      errMsg.includes("Rust E2EE session not found");

    const code = isMissingSession && !hasHandshake
      ? "missing_session"
      : classification.code === "E2EE_ONE_TIME_PREKEY_MISSING"
        ? "otk_missing"
        : "crypto_failed";

    // 保留 encrypted=true，content 留空，UI 根据 decryptStatus 显示占位文案
    msg.content = "";
    msg.decryptStatus = "failed";

    logger.warn("[E2EE] decrypt failed", {
      messageId: msg.id,
      clientMessageId: msg.clientMessageId,
      sessionId: envelope.sessionId,
      senderId,
      senderDeviceId: envelope.senderDeviceId,
      recipientDeviceId: envelope.recipientDeviceId,
      hasHandshake,
      errorCode: classification.code,
      errorMessage: errMsg,
      resultCode: code,
    });

    return {
      success: false,
      code,
      displayMessage: classification.safeMessage !== "Unknown E2EE error"
        ? classification.safeMessage
        : OLD_E2EE_UNREADABLE_TEXT,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 对单条消息执行 E2EE 解密（用于 WebSocket 实时消息）。
 *
 * 会自动按 sessionId 排队，保证同一会话的 ratchet 状态顺序推进。
 * 如果是当前用户自己发的加密消息，标记 decryptStatus="skipped_own" 并保留 displayContent。
 */
export async function decryptSingleMessage(
  message: Message,
  ctx: DecryptContext,
): Promise<DecryptResult> {
  const isEncrypted =
    message.encrypted === true || message.encrypted === 1;
  if (!isEncrypted || message.messageType === "SYSTEM") {
    return { success: true, code: "skipped_own_message" };
  }

  const envelope = message.e2eeEnvelope;
  const sessionId =
    (isRustE2eeEnvelope(envelope) ? envelope.sessionId : "") ||
    `session_${message.id}`;

  let result: DecryptResult = { success: true, code: "skipped_own_message" };

  await enqueueSessionTask(sessionId, async () => {
    result = await decryptOneMessage(message, ctx);
  });

  return result;
}

/**
 * 对一批消息（如历史加载）按时间升序串行解密。
 *
 * - 自动跳过自己的消息、已解密消息、非加密消息。
 * - 按 sendTime + messageId 升序排列。
 * - 每个 sessionId 内部串行，保证 ratchet 状态正确推进。
 */
export async function decryptMessageBatch(
  messages: Message[],
  ctx: DecryptContext,
): Promise<void> {
  // 分组：按 sessionId
  const bySession = new Map<string, Message[]>();

  for (const msg of messages) {
    const isEncrypted =
      msg.encrypted === true || msg.encrypted === 1;
    if (!isEncrypted || msg.messageType === "SYSTEM") continue;

    const senderId = String(msg.senderId || "");
    // 跳过自己的消息（content 是自己存的明文，已持久化或内存中）
    if (senderId === ctx.currentUserId) {
      msg.decryptStatus = "skipped_own";
      continue;
    }

    // 跳过已成功解密且有明文的（Double Ratchet 不能重解密同一消息）
    if (msg.decryptStatus === "success" && msg.content) continue;
    // 跳过已解密失败的消息（保留状态，等待 session 恢复后重试）
    if (msg.decryptStatus === "failed") continue;
    if (isAlreadyDecrypted(msg)) continue;

    const envelope = msg.e2eeEnvelope;
    const sessionId =
      (isRustE2eeEnvelope(envelope) ? envelope.sessionId : "") ||
      `session_${msg.id}`;

    const list = bySession.get(sessionId) || [];
    list.push(msg);
    bySession.set(sessionId, list);
  }

  // 对每个 session 的消息按时间升序排列
  for (const [sessionId, sessionMessages] of bySession) {
    sessionMessages.sort((a, b) => {
      const ta = new Date(a.sendTime || 0).getTime();
      const tb = new Date(b.sendTime || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });

    // 串行解密
    await enqueueSessionTask(sessionId, async () => {
      for (const msg of sessionMessages) {
        await decryptOneMessage(msg, ctx);
      }
    });
  }
}

/**
 * 清理指定 session 的队列引用（当 session 被重置/禁用时调用）。
 */
export function clearDecryptorSession(sessionId: string): void {
  sessionQueues.delete(sessionId);
}
