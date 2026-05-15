// ---------------------------------------------------------------------------
// W14 — online status / presence pure functions
// W23 — 阶段四禁止事项 (pure functions only, no side effects)
// W24 — 冲突处理规则 (unified Web Set / Mobile Record semantics)
// ---------------------------------------------------------------------------

/**
 * Normalize a presence userId to a trimmed string.
 *
 * Returns an empty string for falsy or whitespace-only input so callers
 * can guard with a simple truthiness check.
 */
export const normalizePresenceUserId = (userId: unknown): string =>
  String(userId ?? "").trim();

/**
 * Determine whether a raw status value represents "online".
 *
 * Accepts the canonical `"ONLINE"`, lowercase `"online"`, and boolean
 * `true`.  Everything else (including `"OFFLINE"`, `"offline"`,
 * `false`, `null`, `undefined`, empty string) returns `false`.
 */
export const isOnlineStatusValue = (status: unknown): boolean => {
  if (status === true) return true;
  if (typeof status === "string") {
    const upper = status.toUpperCase();
    return upper === "ONLINE" || upper === "TRUE";
  }
  return false;
};

/**
 * Apply a presence update to a `Record<string, boolean>` map.
 *
 * Returns a **new** record — the input is never mutated.
 * If `userId` normalizes to an empty string the input is returned
 * unchanged (same reference).
 */
export const applyPresenceToRecord = (
  record: Record<string, boolean>,
  userId: unknown,
  status: unknown,
): Record<string, boolean> => {
  const normalizedId = normalizePresenceUserId(userId);
  if (!normalizedId) return record;

  const online = isOnlineStatusValue(status);
  if (record[normalizedId] === online) return record;

  return { ...record, [normalizedId]: online };
};

/**
 * Apply a presence update to a `Set<string>` of online user IDs.
 *
 * Returns a **new** set — the input is never mutated.
 * If `userId` normalizes to an empty string the input is returned
 * unchanged (same reference).
 */
export const applyPresenceToSet = (
  set: Set<string>,
  userId: unknown,
  status: unknown,
): Set<string> => {
  const normalizedId = normalizePresenceUserId(userId);
  if (!normalizedId) return set;

  const online = isOnlineStatusValue(status);
  const currentlyOnline = set.has(normalizedId);

  if (online === currentlyOnline) return set;

  const next = new Set(set);
  if (online) {
    next.add(normalizedId);
  } else {
    next.delete(normalizedId);
  }
  return next;
};
