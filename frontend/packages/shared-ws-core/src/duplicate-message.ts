/**
 * W18: WebSocket-layer duplicate message suppression pure strategy.
 *
 * Cache map is owned by the caller (Web/Mobile store). All functions are
 * pure — they never mutate the input Map and return a new Map when
 * structural changes are needed.
 *
 * This strategy only handles short-term suppression at the WebSocket push
 * layer. Message-list merging is handled downstream (shared-im-core).
 */

/** Default TTL for the dedup cache (60 seconds). */
export const DEFAULT_DEDUP_TTL_MS = 60_000;

/** Default maximum size for the dedup cache. */
export const DEFAULT_DEDUP_MAX_SIZE = 2_000;

/**
 * Extract the best available dedup key from a raw WS message payload.
 *
 * Priority (W13 — message event routing identity resolution):
 *  1. `id`          — server-assigned Snowflake ID
 *  2. `messageId`   — alias used by some backend paths
 *  3. `clientMessageId` — client-origin dedup token
 *
 * Returns an empty string when no usable key exists.
 */
export const getMessageDedupKey = (
  message: Record<string, unknown>,
): string => {
  const id = message.id;
  if (typeof id === "string" && id.length > 0) return id;
  if (typeof id === "number") return String(id);

  const messageId = message.messageId;
  if (typeof messageId === "string" && messageId.length > 0) return messageId;
  if (typeof messageId === "number") return String(messageId);

  const clientMessageId = message.clientMessageId;
  if (typeof clientMessageId === "string" && clientMessageId.length > 0)
    return clientMessageId;

  return "";
};

/**
 * Decide whether an incoming message should be dropped based on the
 * recent-message cache.
 *
 * An empty or blank key is **never** dropped — the caller must handle
 * messages without identity separately.
 *
 * @param recentMap  Caller-owned cache (key → first-seen timestamp).
 * @param key        Dedup key obtained from `getMessageDedupKey`.
 * @param nowMs      Current time in milliseconds.
 * @param ttlMs      Time-to-live window; duplicates within this window are dropped.
 * @returns `true` if the message is a recent duplicate and should be suppressed.
 */
export const shouldDropRecentMessage = (
  recentMap: ReadonlyMap<string, number>,
  key: string,
  nowMs: number,
  ttlMs: number,
): boolean => {
  if (!key) return false;
  const previous = recentMap.get(key);
  if (previous === undefined) return false;
  return nowMs - previous < ttlMs;
};

/**
 * Record a message in the recent-message cache and return the (possibly
 * trimmed) new map.  The input map is **never** mutated.
 *
 * When the map exceeds `maxSize`, expired entries (older than `ttlMs`)
 * are removed first.  If it still exceeds `maxSize`, the oldest entries
 * are evicted regardless of TTL.
 *
 * @param recentMap  Caller-owned cache.
 * @param key        Dedup key.
 * @param nowMs      Current time in milliseconds.
 * @param maxSize    Maximum number of entries to retain.
 * @param ttlMs      TTL used for expiry-based cleanup.
 * @returns A new Map with the key inserted and old entries pruned.
 */
export const rememberRecentMessage = (
  recentMap: ReadonlyMap<string, number>,
  key: string,
  nowMs: number,
  maxSize: number,
  ttlMs: number,
): Map<string, number> => {
  const safeMaxSize = Math.max(0, maxSize);
  if (!key) return new Map(recentMap);

  const next = new Map(recentMap);
  next.set(key, nowMs);

  if (next.size <= safeMaxSize) return next;

  // Phase 1: remove expired entries.
  const cutoff = nowMs - ttlMs;
  for (const [k, ts] of next) {
    if (ts < cutoff) next.delete(k);
  }
  if (next.size <= safeMaxSize) return next;

  // Phase 2: still over capacity — evict oldest entries.
  const entries = [...next.entries()].sort((a, b) => a[1] - b[1]);
  while (next.size > safeMaxSize) {
    const oldest = entries.shift();
    if (!oldest) break;
    next.delete(oldest[0]);
  }
  return next;
};

/**
 * Remove all entries whose timestamp is older than `nowMs - ttlMs`.
 * The input map is **never** mutated.
 *
 * @param recentMap  Caller-owned cache.
 * @param nowMs      Current time in milliseconds.
 * @param ttlMs      Entries older than `nowMs - ttlMs` are removed.
 * @returns A new Map with expired entries removed.
 */
export const cleanupRecentMessages = (
  recentMap: ReadonlyMap<string, number>,
  nowMs: number,
  ttlMs: number,
): Map<string, number> => {
  const cutoff = nowMs - ttlMs;
  let changed = false;
  const next = new Map<string, number>();
  for (const [k, ts] of recentMap) {
    if (ts >= cutoff) {
      next.set(k, ts);
    } else {
      changed = true;
    }
  }
  return changed ? next : new Map(recentMap);
};
