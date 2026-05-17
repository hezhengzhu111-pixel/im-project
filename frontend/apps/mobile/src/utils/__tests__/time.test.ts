import { formatMessageTime } from '../time';

/** Build an ISO 8601 string in the local timezone using local fields. */
const localISO = (y: number, mo: number, d: number, h: number, mi: number): string =>
  new Date(y, mo, d, h, mi).toISOString();

/** Padded local-time HH:mm. */
const fmt = (h: number, mi: number): string =>
  `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;

/** Padded local-time MM/DD HH:mm. */
const fmtCross = (mo: number, d: number, h: number, mi: number): string =>
  `${String(mo + 1).padStart(2, '0')}/${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;

describe('formatMessageTime', () => {
  // Set "now" to 2026-05-17 14:30:45 local time (timezone-independent).
  const now = new Date(2026, 4, 17, 14, 30, 45);

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns HH:mm for same-day timestamp (local time)', () => {
    // 10:00 and 23:59 on the same day as "now"
    expect(formatMessageTime(localISO(2026, 4, 17, 10, 0))).toBe(fmt(10, 0));
    expect(formatMessageTime(localISO(2026, 4, 17, 23, 59))).toBe(fmt(23, 59));
  });

  it('returns MM/DD HH:mm for different-day timestamp (local time)', () => {
    expect(formatMessageTime(localISO(2026, 4, 16, 10, 0))).toBe(fmtCross(4, 16, 10, 0));
    expect(formatMessageTime(localISO(2026, 0, 1, 0, 0))).toBe(fmtCross(0, 1, 0, 0));
  });

  it('returns empty string for invalid timestamp', () => {
    expect(formatMessageTime('invalid')).toBe('');
    expect(formatMessageTime('')).toBe('');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatMessageTime(localISO(2026, 4, 17, 1, 5))).toBe(fmt(1, 5));
  });
});
