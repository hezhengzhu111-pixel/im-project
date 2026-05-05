/**
 * E2EE 乱序消息缓冲队列
 *
 * 网络传输中消息可能乱序到达，但 Double Ratchet 要求按 counter 顺序解密。
 * 此模块缓冲提前到达的消息，等待缺失消息到达后一起解密。
 *
 * 行为:
 * - counter === expectedCounter: 立即解密 + 释放后续连续缓冲消息
 * - counter > expectedCounter: 缓冲等待
 * - counter < expectedCounter: 丢弃（已处理过）
 * - gap > MAX_GAP: 触发重新协商（可能是攻击或状态丢失）
 * - 超时: 自动清除过期缓冲消息
 */

import type { RatchetHeader } from '../types';

/** 缓冲的消息 */
interface BufferedMessage {
  header: RatchetHeader;
  ciphertext: string;
  receivedAt: number;
}

/** 最大允许的消息间隔（超过则触发重新协商） */
const MAX_GAP = 2000;

/** 缓冲消息超时时间（毫秒） */
const BUFFER_TIMEOUT_MS = 30_000;

/**
 * 乱序消息缓冲队列
 *
 * 使用场景: 接收到加密消息时，先通过此队列排序，再按序解密。
 *
 * 示例:
 * ```
 * const buffer = new MessageBuffer();
 *
 * // 收到 counter=5，但 expectedCounter=3 → 缓冲
 * buffer.enqueue(5, header5, ct5, 3); // { action: 'buffer' }
 *
 * // 收到 counter=3 → 立即解密 + 释放 counter=4,5（如果存在）
 * buffer.enqueue(3, header3, ct3, 3); // { action: 'decrypt', messages: [msg3, msg5?] }
 * ```
 */
export class MessageBuffer {
  /** 已缓冲的消息 (counter → message) */
  private pending = new Map<number, BufferedMessage>();

  /** 超时定时器 (counter → timer) */
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * 尝试按序处理消息
   *
   * @param counter - 消息的 counter 值
   * @param header - 消息头
   * @param ciphertext - Base64 编码的密文
   * @param expectedCounter - 期望的下一个 counter（即当前 receiveCounter）
   * @returns 处理决策 + 应立即解密的消息列表（按 counter 排序）
   */
  enqueue(
    counter: number,
    header: RatchetHeader,
    ciphertext: string,
    expectedCounter: number,
  ): { action: 'decrypt' | 'buffer' | 'renegotiate' | 'drop'; messages: BufferedMessage[] } {
    // 已处理过的消息 → 丢弃
    if (counter < expectedCounter) {
      return { action: 'drop', messages: [] };
    }

    // 正好是期望的消息 → 立即解密 + 释放后续连续缓冲
    if (counter === expectedCounter) {
      const result: BufferedMessage[] = [{ header, ciphertext, receivedAt: Date.now() }];

      // 释放 pending 中后续连续的消息
      let next = counter + 1;
      while (this.pending.has(next)) {
        const buffered = this.pending.get(next)!;
        this.pending.delete(next);
        this.clearTimer(next);
        result.push(buffered);
        next++;
      }

      return { action: 'decrypt', messages: result };
    }

    // counter > expectedCounter → 检查间隔是否过大
    if (counter - expectedCounter > MAX_GAP) {
      return { action: 'renegotiate', messages: [] };
    }

    // 缓冲等待
    this.pending.set(counter, { header, ciphertext, receivedAt: Date.now() });
    this.setTimer(counter);
    return { action: 'buffer', messages: [] };
  }

  /** 设置超时定时器 */
  private setTimer(counter: number): void {
    const timer = setTimeout(() => {
      this.pending.delete(counter);
      this.timers.delete(counter);
    }, BUFFER_TIMEOUT_MS);
    this.timers.set(counter, timer);
  }

  /** 清除超时定时器 */
  private clearTimer(counter: number): void {
    const timer = this.timers.get(counter);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(counter);
    }
  }

  /** 清除所有缓冲消息和定时器 */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    this.timers.clear();
  }

  /** 当前缓冲的消息数量 */
  get size(): number {
    return this.pending.size;
  }
}
