import { buildHistoryParams } from '@/services/chat/messageTypes';

describe('buildHistoryParams', () => {
  test('returns empty object when no options provided', () => {
    expect(buildHistoryParams({})).toEqual({});
  });

  test('filters undefined values', () => {
    const result = buildHistoryParams({
      size: undefined,
      beforeId: undefined,
      beforeTime: undefined,
      afterId: undefined,
      afterTime: undefined,
      direction: undefined,
    });
    expect(result).toEqual({});
  });

  test('filters null values', () => {
    const result = buildHistoryParams({
      size: null as unknown as undefined,
      beforeId: null as unknown as undefined,
    });
    expect(result).toEqual({});
  });

  test('does not inject size by default', () => {
    const result = buildHistoryParams({ beforeId: '100' });
    expect(result).not.toHaveProperty('size');
    expect(result).toEqual({ beforeId: '100' });
  });

  test('preserves size when explicitly provided', () => {
    const result = buildHistoryParams({ size: 50 });
    expect(result.size).toBe('50');
  });

  test('preserves beforeId', () => {
    const result = buildHistoryParams({ beforeId: 'msg_123' });
    expect(result.beforeId).toBe('msg_123');
  });

  test('preserves beforeTime', () => {
    const ts = '2026-05-16T10:00:00.000Z';
    const result = buildHistoryParams({ beforeTime: ts });
    expect(result.beforeTime).toBe(ts);
  });

  test('preserves afterId', () => {
    const result = buildHistoryParams({ afterId: 'msg_456' });
    expect(result.afterId).toBe('msg_456');
  });

  test('preserves afterTime', () => {
    const ts = '2026-05-16T12:00:00.000Z';
    const result = buildHistoryParams({ afterTime: ts });
    expect(result.afterTime).toBe(ts);
  });

  test('preserves direction older', () => {
    const result = buildHistoryParams({ direction: 'older' });
    expect(result.direction).toBe('older');
  });

  test('preserves direction newer', () => {
    const result = buildHistoryParams({ direction: 'newer' });
    expect(result.direction).toBe('newer');
  });

  test('combines multiple fields and strips undefined', () => {
    const result = buildHistoryParams({
      size: 20,
      beforeId: 'msg_100',
      afterTime: undefined,
      direction: 'older',
    });
    expect(result).toEqual({
      size: '20',
      beforeId: 'msg_100',
      direction: 'older',
    });
    expect(result).not.toHaveProperty('afterTime');
  });

  test('converts size number to string', () => {
    const result = buildHistoryParams({ size: 0 });
    expect(result.size).toBe('0');
    expect(typeof result.size).toBe('string');
  });
});
