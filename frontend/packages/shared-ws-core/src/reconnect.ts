/**
 * Options for the reconnect scheduling decision.
 *
 * All fields are pure inputs; no global state is read. Per W8 / W10,
 * manual disconnect and duplicate connection are reconnect stop conditions.
 */
export interface ShouldScheduleReconnectOptions {
  /** Whether the disconnect was triggered by user/app action. */
  manualDisconnect: boolean;
  /** The WebSocket close event code, if available. */
  closeCode?: number;
  /** The WebSocket close event reason string, if available. */
  closeReason?: string;
  /** The sentinel reason string that marks a duplicate-connection close. */
  duplicateConnectionReason: string;
  /** Current reconnect attempt count before scheduling the next attempt. */
  reconnectAttempts: number;
  /** Maximum allowed reconnect attempts. */
  maxReconnectAttempts: number;
}

/**
 * Decide whether a reconnect should be scheduled after a WebSocket close.
 *
 * Returns `false` when any of:
 * 1. `manualDisconnect` is true.
 * 2. `closeReason` equals `duplicateConnectionReason`.
 * 3. `reconnectAttempts` has reached `maxReconnectAttempts`.
 *
 * Close code `1000` is not a shared stop condition by itself: before phase
 * four, both Web and Mobile still scheduled reconnect for non-manual,
 * non-duplicate normal closes. Keeping that behavior satisfies W23.
 */
export const shouldScheduleReconnect = (
  options: ShouldScheduleReconnectOptions,
): boolean => {
  if (options.manualDisconnect) {
    return false;
  }

  if (options.closeReason === options.duplicateConnectionReason) {
    return false;
  }

  if (options.reconnectAttempts >= options.maxReconnectAttempts) {
    return false;
  }

  return true;
};

/**
 * Calculate the reconnect delay for a given attempt number.
 *
 * `delay = baseInterval * max(attempt, 1)`
 *
 * Edge-case guards (W10):
 * - `attempt` < 1 is treated as 1.
 * - `baseInterval` < 0 is treated as 0.
 *
 * The default `baseInterval` (1000) preserves the original export signature.
 */
export const createReconnectDelay = (
  attempt: number,
  baseInterval: number = 1_000,
): number => {
  const safeBase = baseInterval < 0 ? 0 : baseInterval;
  const safeAttempt = attempt < 1 ? 1 : attempt;
  return safeBase * safeAttempt;
};
