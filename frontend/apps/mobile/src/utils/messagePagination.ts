import { messageIdentityValues } from '@im/shared-im-core';
import { mergeServerMobileMessageWithPending } from '@/adapters/messageAdapter';
import type { MobileMessage, MessagePaginationState } from '@/types/models';

/** Create a fresh pagination state with safe defaults. */
export const createInitialPaginationState = (): MessagePaginationState => ({
  loadingInitial: false,
  loadingOlder: false,
  refreshingLatest: false,
  hasMoreBefore: true,
  hasMoreAfter: false,
  initialized: false,
});

/** Cursor extracted from a sorted message list. */
export interface MessageCursor {
  oldestMessageId?: string;
  oldestMessageTime?: string;
  newestMessageId?: string;
  newestMessageTime?: string;
}

/** Extract oldest/newest cursor from a message list. */
export const getMessageCursor = (messages: MobileMessage[]): MessageCursor => {
  if (messages.length === 0) {
    return {};
  }
  const oldest = messages[0];
  const newest = messages[messages.length - 1];
  return {
    oldestMessageId: oldest.id || oldest.serverId || oldest.messageId,
    oldestMessageTime: oldest.sendTime,
    newestMessageId: newest.id || newest.serverId || newest.messageId,
    newestMessageTime: newest.sendTime,
  };
};

export type MergeMode = 'replace' | 'prependOlder' | 'appendNewer' | 'upsertRealtime';

/**
 * Merge incoming messages into an existing list with identity-based dedup,
 * pending-message preservation, and stable ascending sort.
 *
 * Dedup rules:
 *   1. Identity match via {id, messageId, clientMessageId} — any overlap means same message.
 *   2. When a server message matches a local pending (SENDING/FAILED), the two are
 *      merged via mergeServerMobileMessageWithPending so the server id replaces the
 *      local id while preserving clientMessageId and optimistic fields.
 *   3. Unmatched incoming messages are appended; the full list is then sorted by
 *      sendTime ASC with id as a stable tiebreaker.
 *   4. Pending local messages that have no identity match in the incoming batch
 *      are always preserved.
 */
export const mergePagedMessages = (
  existing: MobileMessage[],
  incoming: MobileMessage[],
  mode: MergeMode,
): MobileMessage[] => {
  if (mode === 'replace') {
    return sortMessages(dedupeList(incoming));
  }

  if (incoming.length === 0) {
    return existing;
  }

  if (mode === 'upsertRealtime') {
    return upsertSingle(existing, incoming[0]);
  }

  // prependOlder / appendNewer: batch merge with identity dedup
  const existingByIdentity = buildIdentityMap(existing);
  const matchedExistingIndices = new Set<number>();
  const mergedIncoming: MobileMessage[] = [];

  for (const inc of incoming) {
    const identities = messageIdentityValues(inc as never);
    let matchedIndex: number | undefined;
    for (const idVal of identities) {
      const idx = existingByIdentity.get(idVal);
      if (idx !== undefined) {
        matchedIndex = idx;
        break;
      }
    }

    if (matchedIndex !== undefined) {
      matchedExistingIndices.add(matchedIndex);
      const original = existing[matchedIndex];
      mergedIncoming.push(mergePair(original, inc));
    } else {
      mergedIncoming.push(inc);
    }
  }

  // Keep existing messages that were NOT matched
  const retained = existing.filter((_, i) => !matchedExistingIndices.has(i));

  return sortMessages([...retained, ...mergedIncoming]);
};

// ── Internal helpers ────────────────────────────────────────────────────────

/** Stable ascending sort: sendTime ASC, id as tiebreaker. */
const sortMessages = (messages: MobileMessage[]): MobileMessage[] =>
  [...messages].sort((a, b) => {
    const ta = new Date(a.sendTime).getTime() || 0;
    const tb = new Date(b.sendTime).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

/** Remove duplicate messages within a single list, keeping the last occurrence. */
const dedupeList = (messages: MobileMessage[]): MobileMessage[] => {
  const identityIndex = new Map<string, number>();
  const result: MobileMessage[] = [];

  for (const msg of messages) {
    const identities = messageIdentityValues(msg as never);
    const matchedIdx = identities
      .map((v) => identityIndex.get(v))
      .find((v) => v !== undefined);

    if (matchedIdx !== undefined) {
      // Replace the earlier occurrence with the newer one
      const toReplace = result[matchedIdx];
      const merged = mergePair(toReplace, msg);
      result[matchedIdx] = merged;
      // Re-index all identities for the merged message
      for (const v of messageIdentityValues(merged as never)) {
        identityIndex.set(v, matchedIdx);
      }
    } else {
      const idx = result.length;
      result.push(msg);
      for (const v of identities) {
        identityIndex.set(v, idx);
      }
    }
  }

  return result;
};

/** Build identity-value → index map for an existing list. */
const buildIdentityMap = (messages: MobileMessage[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) {
    for (const v of messageIdentityValues(messages[i] as never)) {
      map.set(v, i);
    }
  }
  return map;
};

/**
 * Upsert a single realtime message into the existing list.
 * If the message already exists (by identity), merge it; otherwise append.
 */
const upsertSingle = (existing: MobileMessage[], incoming: MobileMessage): MobileMessage[] => {
  const identities = messageIdentityValues(incoming as never);
  const existingByIdentity = buildIdentityMap(existing);

  let matchedIndex: number | undefined;
  for (const idVal of identities) {
    const idx = existingByIdentity.get(idVal);
    if (idx !== undefined) {
      matchedIndex = idx;
      break;
    }
  }

  if (matchedIndex !== undefined) {
    const original = existing[matchedIndex];
    const merged = mergePair(original, incoming);
    const next = [...existing];
    next[matchedIndex] = merged;
    return next;
  }

  return sortMessages([...existing, incoming]);
};

/**
 * Merge two messages that share the same identity.
 * If the original is a pending local (SENDING/FAILED) and the incoming is a
 * server response (SENT/DELIVERED/READ), use the dedicated pending merge.
 * Otherwise, prefer the incoming (newer) message with spread.
 */
const mergePair = (original: MobileMessage, incoming: MobileMessage): MobileMessage => {
  const originalIsPending = original.status === 'SENDING' || original.status === 'FAILED';
  const incomingIsServer = incoming.status === 'SENT' || incoming.status === 'DELIVERED' || incoming.status === 'READ';

  if (originalIsPending && incomingIsServer) {
    return mergeServerMobileMessageWithPending(original, incoming);
  }

  // For non-pending merges, prefer incoming but preserve fields from original
  return {
    ...original,
    ...incoming,
    // Preserve clientMessageId from whichever has it
    clientMessageId: incoming.clientMessageId || original.clientMessageId,
    // Keep the server-assigned id if incoming has one, otherwise keep original
    id: incoming.id || original.id,
    serverId: incoming.serverId || incoming.messageId || original.serverId,
    messageId: incoming.messageId || original.messageId,
  };
};
