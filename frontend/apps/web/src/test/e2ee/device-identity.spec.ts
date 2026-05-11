/**
 * 设备标识测试
 *
 * 使用 fake-indexeddb polyfill 模拟 jsdom 中缺失的 IndexedDB。
 * 测试 resolveDeviceId 的 ID 生成、缓存和持久化行为。
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveDeviceId, resetDeviceIdCache } from '@/features/e2ee/manager/device-identity';
import { clearAllKeys, getDeviceId } from '@/features/e2ee/store/key-store';

describe('e2ee device-identity', () => {
  beforeEach(async () => {
    resetDeviceIdCache();
    await clearAllKeys();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // resolveDeviceId — 基本行为
  // ---------------------------------------------------------------------------

  it('should generate a UUID on first call', async () => {
    const id = await resolveDeviceId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    // UUID v4 格式: 8-4-4-4-12
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('should return the same ID on subsequent calls', async () => {
    const id1 = await resolveDeviceId();
    const id2 = await resolveDeviceId();
    const id3 = await resolveDeviceId();
    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('should persist the ID in IndexedDB', async () => {
    const id = await resolveDeviceId();
    const stored = await getDeviceId();
    expect(stored).toBe(id);
  });

  it('should persist the ID in localStorage', async () => {
    const id = await resolveDeviceId();
    const lsValue = localStorage.getItem('e2ee_device_id');
    expect(lsValue).toBe(id);
  });

  // ---------------------------------------------------------------------------
  // resolveDeviceId — 缓存优先级
  // ---------------------------------------------------------------------------

  it('should use IndexedDB cache when available', async () => {
    // 第一次调用生成并缓存
    const id1 = await resolveDeviceId();

    // 清除 localStorage，保留 IndexedDB
    localStorage.removeItem('e2ee_device_id');

    // 第二次调用应从 IndexedDB 读取
    const id2 = await resolveDeviceId();
    expect(id2).toBe(id1);
  });

  it('should fall back to localStorage when IndexedDB is empty', async () => {
    // 手动写入 localStorage
    const manualId = 'manual-test-uuid-12345';
    localStorage.setItem('e2ee_device_id', manualId);

    // IndexedDB 为空，应从 localStorage 读取
    const id = await resolveDeviceId();
    expect(id).toBe(manualId);

    // 读取后应写入 IndexedDB
    const stored = await getDeviceId();
    expect(stored).toBe(manualId);
  });

  it('should generate new UUID when both caches are empty', async () => {
    const id = await resolveDeviceId();
    expect(id).toBeTruthy();
    expect(id.length).toBe(36); // UUID 格式长度
  });

  // ---------------------------------------------------------------------------
  // resolveDeviceId — 唯一性
  // ---------------------------------------------------------------------------

  it('should generate unique IDs for different sessions', async () => {
    const id1 = await resolveDeviceId();

    // 清除所有缓存（包括内存缓存）
    resetDeviceIdCache();
    await clearAllKeys();
    localStorage.clear();

    const id2 = await resolveDeviceId();
    expect(id1).not.toBe(id2);
  });

  // ---------------------------------------------------------------------------
  // resolveDeviceId — UUID 格式验证
  // ---------------------------------------------------------------------------

  it('should generate valid UUID v4 format', async () => {
    const id = await resolveDeviceId();

    // 分段验证
    const parts = id.split('-');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toHaveLength(8);
    expect(parts[1]).toHaveLength(4);
    expect(parts[2]).toHaveLength(4);
    // 第三段第一位必须是 4（version 4）
    expect(parts[2][0]).toBe('4');
    expect(parts[3]).toHaveLength(4);
    // 第四段第一位必须是 8, 9, a, 或 b（variant）
    expect(['8', '9', 'a', 'b']).toContain(parts[3][0]);
    expect(parts[4]).toHaveLength(12);
  });

  // ---------------------------------------------------------------------------
  // resolveDeviceId — 幂等性
  // ---------------------------------------------------------------------------

  it('should be idempotent across many calls', async () => {
    const ids = await Promise.all([
      resolveDeviceId(),
      resolveDeviceId(),
      resolveDeviceId(),
      resolveDeviceId(),
      resolveDeviceId(),
    ]);

    // 所有并发调用应返回相同 ID
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(1);
  });
});
