/**
 * E2EE 管理器 — 单例
 *
 * 封装加密/解密操作，管理会话状态和消息缓冲。
 * 对上层（消息发送队列、WebSocket 处理器）提供透明的加密/解密接口。
 */

import { ratchetEncrypt, ratchetDecrypt } from '../engine/double-ratchet';
import { getRatchetState, saveRatchetState } from '../store/session-store';
import { MessageBuffer } from '../engine/message-buffer';
import { initiateNegotiation, getLocalSessionStatus } from './negotiation';
import type { RatchetHeader, E2eeSessionStatus } from '../types';
import { resolveDeviceId } from './device-identity';

export interface EncryptedPayload {
  ciphertext: string;
  header: RatchetHeader;
  deviceId: string;
}

class E2eeManager {
  private buffers = new Map<string, MessageBuffer>();
  private deviceId: string = '';

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

  private getBuffer(sessionId: string): MessageBuffer {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, new MessageBuffer());
    }
    return this.buffers.get(sessionId)!;
  }

  /**
   * 加密一条消息
   *
   * @returns 加密后的载荷，如果没有 ratchet state 则返回 null
   */
  async encryptMessage(sessionId: string, plaintext: string): Promise<EncryptedPayload | null> {
    const state = await getRatchetState(sessionId);
    if (!state) return null;

    const { header, ciphertext } = await ratchetEncrypt(state, plaintext);
    await saveRatchetState(sessionId, state);

    return { ciphertext, header, deviceId: await this.resolveCurrentDeviceId() };
  }

  /**
   * 解密一条消息
   *
   * 如果没有会话状态且提供了对方的 identityKey 和 ephemeralKey，
   * 会自动作为响应方进行协商。
   *
   * @returns 解密后的明文；如果消息被缓冲则返回空字符串
   */
  async decryptMessage(
    sessionId: string,
    senderId: string,
    header: RatchetHeader,
    ciphertext: string,
    senderIdentityKey?: string,
    ephemeralPublicKey?: string,
  ): Promise<string> {
    let state = await getRatchetState(sessionId);

    // 接收方必须先在协商弹窗中显式确认，不能在收到首条密文时静默建链。
    if (!state && senderIdentityKey && ephemeralPublicKey) {
      throw new Error('E2EE negotiation has not been accepted');
    }

    if (!state) throw new Error(`No ratchet state for session ${sessionId}`);

    const buffer = this.getBuffer(sessionId);
    const result = buffer.enqueue(header.counter, header, ciphertext, state.receiveCounter);

    if (result.action === 'drop') return '';
    if (result.action === 'renegotiate') {
      await initiateNegotiation(sessionId, senderId);
      throw new Error('Session renegotiation required');
    }
    if (result.action === 'buffer') return '';

    const decryptedParts: string[] = [];
    for (const msg of result.messages) {
      const plaintext = await ratchetDecrypt(state, msg.header, msg.ciphertext);
      decryptedParts.push(plaintext);
    }
    await saveRatchetState(sessionId, state);

    return decryptedParts.join('');
  }

  async clearSession(sessionId: string): Promise<void> {
    this.buffers.delete(sessionId);
    localStorage.removeItem('e2ee:status:' + sessionId);
  }
}

export const e2eeManager = new E2eeManager();
