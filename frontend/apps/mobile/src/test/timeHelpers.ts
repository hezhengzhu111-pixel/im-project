/**
 * Test helpers for controlling Date.now() in unit tests.
 *
 * Usage:
 *   beforeEach(() => freezeTime(1700000000000));
 *   afterEach(() => restoreTime());
 *
 *   it('should use frozen time', () => {
 *     expect(Date.now()).toBe(1700000000000);
 *     advanceTime(5000);
 *     expect(Date.now()).toBe(1700000005000);
 *   });
 */

let originalDateNow: typeof Date.now | null = null;
let frozenNow: number | null = null;

/**
 * Freeze Date.now() to return a fixed timestamp.
 * If called without arguments, uses the current real time.
 */
export function freezeTime(timestamp?: number): void {
  if (originalDateNow === null) {
    originalDateNow = Date.now;
  }
  frozenNow = timestamp ?? Date.now();
  Date.now = () => frozenNow!;
}

/**
 * Advance the frozen time by the given number of milliseconds.
 * Throws if time is not currently frozen.
 */
export function advanceTime(ms: number): void {
  if (frozenNow === null) {
    throw new Error('advanceTime called but time is not frozen. Call freezeTime() first.');
  }
  frozenNow += ms;
}

/**
 * Set the frozen time to a specific timestamp.
 * Throws if time is not currently frozen.
 */
export function setFrozenTime(timestamp: number): void {
  if (frozenNow === null) {
    throw new Error('setFrozenTime called but time is not frozen. Call freezeTime() first.');
  }
  frozenNow = timestamp;
}

/**
 * Restore Date.now() to the original native implementation.
 * Safe to call multiple times (no-op if already restored).
 */
export function restoreTime(): void {
  if (originalDateNow !== null) {
    Date.now = originalDateNow;
    originalDateNow = null;
    frozenNow = null;
  }
}

/**
 * Get the current frozen timestamp without calling Date.now().
 * Returns null if time is not frozen.
 */
export function getFrozenTime(): number | null {
  return frozenNow;
}
