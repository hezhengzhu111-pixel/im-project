import { e2eeManager } from "./e2ee-manager";
import { setLocalSessionStatus } from "./negotiation";
import { keyService } from "../api/key-service";
import { http } from "@/utils/request";
import { MESSAGE_ENDPOINTS } from "@im/shared-api-contract";
import { useUserStore } from "@/stores/user";
import { ElMessage } from "element-plus";
import { logger } from "@/utils/logger";

const PING_INTERVAL_MS = 30 * 60 * 1000;
const PING_TIMEOUT_MS = 30 * 1000;
const PING_RETRY_MS = 10 * 1000;
const VERIFY_PHRASE_PREFIX = "e2ee:verify_phrase:";
const PING_PREFIX = "E2EE_PING|";
const PONG_PREFIX = "E2EE_PONG|";

// ── 验证短语 ──

export function generateVerifyPhrase(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function saveVerifyPhrase(sessionId: string, phrase: string): void {
  localStorage.setItem(VERIFY_PHRASE_PREFIX + sessionId, phrase);
}

export function getVerifyPhrase(sessionId: string): string | null {
  return localStorage.getItem(VERIFY_PHRASE_PREFIX + sessionId);
}

export function deleteVerifyPhrase(sessionId: string): void {
  localStorage.removeItem(VERIFY_PHRASE_PREFIX + sessionId);
}

// ── 消息检测 ──

export function isPingMessage(plaintext: string): boolean {
  return plaintext.startsWith(PING_PREFIX);
}

export function isPongMessage(plaintext: string): boolean {
  return plaintext.startsWith(PONG_PREFIX);
}

interface PingPayload {
  phrase: string;
  timestamp: number;
}

function parsePayload(plaintext: string, prefix: string): PingPayload | null {
  const body = plaintext.slice(prefix.length);
  const sep = body.lastIndexOf("|");
  if (sep < 0) return null;
  return {
    phrase: body.slice(0, sep),
    timestamp: Number(body.slice(sep + 1)),
  };
}

// ── 超时管理 ──

const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function setPendingTimeout(sessionId: string, fn: () => void, ms: number): void {
  clearPendingTimeout(sessionId);
  pendingTimeouts.set(
    sessionId,
    setTimeout(() => {
      pendingTimeouts.delete(sessionId);
      fn();
    }, ms),
  );
}

function clearPendingTimeout(sessionId: string): void {
  const timer = pendingTimeouts.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    pendingTimeouts.delete(sessionId);
  }
}

// ── 定时器管理 ──

const pingTimers = new Map<string, ReturnType<typeof setInterval>>();

const FIRST_PING_DELAY_MS = 3_000;

export function startPingTimer(sessionId: string, remoteUserId: string): void {
  stopPingTimer(sessionId);

  const tick = () => {
    void sendPing(sessionId, remoteUserId);
  };

  // 延迟首次 ping，确保协商阶段的 IndexedDB session 写入完成，
  // 避免 ensureOutboundSession 因找不到 session 而创建新的 X3DH 握手
  setTimeout(tick, FIRST_PING_DELAY_MS);

  pingTimers.set(sessionId, setInterval(tick, PING_INTERVAL_MS));
}

export function stopPingTimer(sessionId: string): void {
  const timer = pingTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    pingTimers.delete(sessionId);
  }
  clearPendingTimeout(sessionId);
}

export function stopAllPingTimers(): void {
  for (const [sessionId] of pingTimers) {
    stopPingTimer(sessionId);
  }
}

// ── 发送 Ping/Pong ──

async function sendPing(sessionId: string, remoteUserId: string): Promise<void> {
  const phrase = getVerifyPhrase(sessionId);
  if (!phrase) {
    logger.warn("[E2EE Ping] verify phrase missing, skipping ping", { sessionId });
    return;
  }

  const userStore = useUserStore();
  const senderUserId = String(userStore.userId);
  if (!senderUserId) return;

  // 显式解析远端设备 ID，帮助 ensureOutboundSession 精确匹配已有 session
  const remoteDeviceId =
    localStorage.getItem(`e2ee:remote_device:${sessionId}`) || undefined;

  const plaintext = `${PING_PREFIX}${phrase}|${Date.now()}`;

  try {
    const envelope = await e2eeManager.encryptToEnvelope({
      conversationId: sessionId,
      clientMsgId: crypto.randomUUID(),
      senderUserId,
      recipientUserId: remoteUserId,
      recipientDeviceIds: remoteDeviceId ? [remoteDeviceId] : undefined,
      plaintext,
    });

    await http.post(MESSAGE_ENDPOINTS.SEND_PRIVATE, {
      receiverId: remoteUserId,
      clientMessageId: crypto.randomUUID(),
      messageType: "TEXT",
      encrypted: true,
      e2eeEnvelope: envelope,
      e2eeDeviceId: envelope.senderDeviceId,
    });

    setPendingTimeout(
      sessionId,
      () => {
        logger.warn("[E2EE Ping] pong timeout, exiting encryption", { sessionId });
        void exitEncryption(sessionId);
      },
      PING_TIMEOUT_MS,
    );
  } catch (error) {
    logger.warn("[E2EE Ping] send failed, retrying once", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    setTimeout(() => {
      void sendPing(sessionId, remoteUserId);
    }, PING_RETRY_MS);
  }
}

async function sendPong(sessionId: string, remoteUserId: string): Promise<void> {
  const phrase = getVerifyPhrase(sessionId);
  if (!phrase) return;

  const userStore = useUserStore();
  const senderUserId = String(userStore.userId);
  if (!senderUserId) return;

  const remoteDeviceId =
    localStorage.getItem(`e2ee:remote_device:${sessionId}`) || undefined;

  const plaintext = `${PONG_PREFIX}${phrase}|${Date.now()}`;

  try {
    const envelope = await e2eeManager.encryptToEnvelope({
      conversationId: sessionId,
      clientMsgId: crypto.randomUUID(),
      senderUserId,
      recipientUserId: remoteUserId,
      recipientDeviceIds: remoteDeviceId ? [remoteDeviceId] : undefined,
      plaintext,
    });

    await http.post(MESSAGE_ENDPOINTS.SEND_PRIVATE, {
      receiverId: remoteUserId,
      clientMessageId: crypto.randomUUID(),
      messageType: "TEXT",
      encrypted: true,
      e2eeEnvelope: envelope,
      e2eeDeviceId: envelope.senderDeviceId,
    });
  } catch (error) {
    logger.warn("[E2EE Ping] send pong failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── 处理收到的 Ping/Pong ──

export function handleIncomingPing(
  plaintext: string,
  sessionId: string,
  remoteUserId: string,
): void {
  const payload = parsePayload(plaintext, PING_PREFIX);
  if (!payload) return;

  const expected = getVerifyPhrase(sessionId);
  if (!expected || payload.phrase !== expected) {
    logger.warn("[E2EE Ping] received ping with mismatched phrase", { sessionId });
    void exitEncryption(sessionId);
    return;
  }

  void sendPong(sessionId, remoteUserId);
}

export function handleIncomingPong(
  plaintext: string,
  sessionId: string,
): boolean {
  const payload = parsePayload(plaintext, PONG_PREFIX);
  if (!payload) return false;

  const expected = getVerifyPhrase(sessionId);
  if (!expected || payload.phrase !== expected) {
    logger.warn("[E2EE Ping] received pong with mismatched phrase", { sessionId });
    void exitEncryption(sessionId);
    return false;
  }

  clearPendingTimeout(sessionId);
  return true;
}

// ── 退出加密 ──

async function exitEncryption(sessionId: string): Promise<void> {
  stopPingTimer(sessionId);
  deleteVerifyPhrase(sessionId);

  try {
    await e2eeManager.clearSession(sessionId);
  } catch {
    // best-effort
  }

  setLocalSessionStatus(sessionId, "plaintext");

  try {
    await keyService.disableEncryption(sessionId);
  } catch (err) {
    logger.warn("[E2EE Ping] disable encryption API failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  ElMessage.warning("加密通道验证失败，已切换为明文模式");
}
