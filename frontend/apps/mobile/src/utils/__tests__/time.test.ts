import { formatMessageTime } from '../time';

describe('formatMessageTime', () => {
  const now = new Date('2026-05-17T14:30:45.000Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns HH:mm for same-day timestamp', () => {
    expect(formatMessageTime('2026-05-17T10:00:00.000Z')).toBe('10:00');
    expect(formatMessageTime('2026-05-17T23:59:00.000Z')).toBe('23:59');
  });

  it('returns MM/DD HH:mm for different-day timestamp', () => {
    expect(formatMessageTime('2026-05-16T10:00:00.000Z')).toBe('05/16 10:00');
    expect(formatMessageTime('2026-01-01T00:00:00.000Z')).toBe('01/01 00:00');
  });

  it('returns empty string for invalid timestamp', () => {
    expect(formatMessageTime('invalid')).toBe('');
    expect(formatMessageTime('')).toBe('');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatMessageTime('2026-05-17T01:05:00.000Z')).toBe('01:05');
  });

  it('handles different timezone offsets', () => {
    // UTC+8 06:30 = UTC 22:30 previous day → cross-day display
    expect(formatMessageTime('2026-05-17T06:30:00.000+08:00')).toBe('05/16 22:30');
  });
});
