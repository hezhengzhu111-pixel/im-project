// ---------------------------------------------------------------------------
// W16 — friend request / friend accepted / contact refresh action classification
// W17 — system message command parsing
// W23 — 阶段四禁止事项 (pure functions only, no side effects)
// W24 — 冲突处理规则 (unified Web/Mobile contact refresh semantics)
// ---------------------------------------------------------------------------

import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Describes which contact-related data should be refreshed after a
 * WebSocket event.  All boolean fields default to `false` when absent.
 *
 * Optional notification fields carry display hints for the caller;
 * the actual notification display is a platform-side concern.
 */
export interface ContactRefreshAction {
  loadFriendRequests: boolean;
  loadFriends: boolean;
  loadSessions: boolean;
  notificationTitle?: string;
  notificationMessage?: string;
  notificationType?: "info" | "success";
}

/** Internal: create an empty (all-false) action. */
const emptyAction = (): ContactRefreshAction => ({
  loadFriendRequests: false,
  loadFriends: false,
  loadSessions: false,
});

/**
 * Classify a top-level WebSocket envelope `type` into a
 * {@link ContactRefreshAction}, or return `null` when the type is not
 * contact-related.
 *
 * Handles `FRIEND_REQUEST` and `FRIEND_ACCEPTED`.
 */
export const classifyContactRefreshFromWsType = (
  type: string,
): ContactRefreshAction | null => {
  if (type === WS_MESSAGE_TYPE.FRIEND_REQUEST) {
    return {
      ...emptyAction(),
      loadFriendRequests: true,
      notificationTitle: "Friend request",
      notificationMessage: "You have a new friend request",
      notificationType: "info",
    };
  }

  if (type === WS_MESSAGE_TYPE.FRIEND_ACCEPTED) {
    return {
      ...emptyAction(),
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "Friend accepted",
      notificationMessage: "Your friend request was accepted",
      notificationType: "success",
    };
  }

  return null;
};

/**
 * Classify the `content` field of a SYSTEM-type WebSocket message into
 * a {@link ContactRefreshAction}, or return `null` when the content is
 * not contact-related.
 *
 * Recognises:
 * - `::CMD:REFRESH_FRIEND_REQUESTS` — refresh friend requests only
 * - `::CMD:REFRESH_FRIEND_LIST`    — refresh friends + sessions
 * - Chinese keywords "好友申请" or "同意" — full refresh
 * - English keyword "friend request" (case-insensitive) — full refresh
 */
export const classifyContactRefreshFromSystemContent = (
  content: string,
): ContactRefreshAction | null => {
  if (!content) return null;

  // --- explicit ::CMD: protocol ---
  if (content.includes("::CMD:")) {
    const [, command = ""] = content.split("::CMD:");
    const messageText = content.split("::CMD:")[0].trim();

    if (command === "REFRESH_FRIEND_REQUESTS") {
      return {
        ...emptyAction(),
        loadFriendRequests: true,
        notificationTitle: "Friend notification",
        notificationMessage: messageText || "Received a new friend request",
        notificationType: "info",
      };
    }

    if (command === "REFRESH_FRIEND_LIST") {
      return {
        ...emptyAction(),
        loadFriends: true,
        loadSessions: true,
        notificationTitle: "Friend notification",
        notificationMessage: messageText || "Friend list updated",
        notificationType: "success",
      };
    }

    return null;
  }

  // --- natural-language keyword matching ---
  const lower = content.toLowerCase();
  if (
    content.includes("好友申请") ||
    content.includes("同意") ||
    lower.includes("friend request")
  ) {
    return {
      ...emptyAction(),
      loadFriendRequests: true,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "System notification",
      notificationMessage: content,
      notificationType: "info",
    };
  }

  return null;
};

/**
 * Merge two {@link ContactRefreshAction} objects using OR semantics for
 * boolean flags.  Non-empty notification fields from `left` take
 * precedence; `right` fills in any blanks.
 */
export const mergeContactRefreshActions = (
  left: ContactRefreshAction,
  right: ContactRefreshAction,
): ContactRefreshAction => ({
  loadFriendRequests: left.loadFriendRequests || right.loadFriendRequests,
  loadFriends: left.loadFriends || right.loadFriends,
  loadSessions: left.loadSessions || right.loadSessions,
  notificationTitle: left.notificationTitle || right.notificationTitle,
  notificationMessage: left.notificationMessage || right.notificationMessage,
  notificationType: left.notificationType || right.notificationType,
});
