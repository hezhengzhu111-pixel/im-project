/**
 * E2EE 待解密消息缓存
 *
 * 当接收方没有 ratchet state 时，将无法解密的消息暂存于此。
 * 协商完成后取出重试解密。
 */

export interface PendingEncryptedMessage {
  sessionId: string;
  peerId: string;
  content: string;
  header: unknown;
  senderIdentityKey?: string;
  ephemeralPublicKey?: string;
  /** 用于更新 UI 中的消息内容 */
  messageRef: { content: string; encrypted: boolean | number };
}

const pending = new Map<string, PendingEncryptedMessage[]>();

export function cachePendingMessage(msg: PendingEncryptedMessage): void {
  const list = pending.get(msg.sessionId) || [];
  list.push(msg);
  pending.set(msg.sessionId, list);
}

export function getPendingMessages(sessionId: string): PendingEncryptedMessage[] {
  return pending.get(sessionId) || [];
}

export function clearPendingMessages(sessionId: string): void {
  pending.delete(sessionId);
}
