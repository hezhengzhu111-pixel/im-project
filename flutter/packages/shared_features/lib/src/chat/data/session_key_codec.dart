import 'package:im_core/core.dart';

/// Pure functions for session key computation and normalization.
///
/// This module extracts all session key logic from [ChatNotifierWithOutbox]
/// into testable, stateless functions. No Riverpod, no StateNotifier, no
/// side effects — just key computation.
class SessionKeyCodec {
  const SessionKeyCodec._();

  // ===========================================================================
  // Private session key
  // ===========================================================================

  /// Computes a canonical private chat session key from two user IDs.
  ///
  /// The lower ID (numerically if BigInt, lexicographically otherwise) comes
  /// first, ensuring that `privateSessionKey('B', 'A')` and
  /// `privateSessionKey('A', 'B')` produce the same key.
  ///
  /// Returns `targetId` when [currentUserId] is empty.
  static String privateSessionKey(String currentUserId, String targetId) {
    if (currentUserId.isEmpty || targetId.isEmpty) return targetId;
    return _compareIds(currentUserId, targetId) <= 0
        ? '${currentUserId}_$targetId'
        : '${targetId}_$currentUserId';
  }

  // ===========================================================================
  // Group session key
  // ===========================================================================

  /// Computes a canonical group chat session key.
  ///
  /// Strips any existing `group_` or `g_` prefix before adding `group_`.
  static String groupSessionKey(String groupId) {
    final normalized = _groupIdFromSessionKey(groupId);
    return normalized.isEmpty ? groupId : 'group_$normalized';
  }

  // ===========================================================================
  // E2EE session ID for private chats
  // ===========================================================================

  /// Computes a canonical E2EE session ID for a private chat.
  ///
  /// Format: `p_<lowerId>_<higherId>`.
  /// Returns `targetId` when [currentUserId] is empty.
  static String e2eeSessionIdForPrivate(String currentUserId, String targetId) {
    if (currentUserId.isEmpty || targetId.isEmpty) return targetId;
    return _compareIds(currentUserId, targetId) <= 0
        ? 'p_${currentUserId}_$targetId'
        : 'p_${targetId}_$currentUserId';
  }

  // ===========================================================================
  // Normalize incoming session key
  // ===========================================================================

  /// Normalizes a raw session key to its canonical form.
  ///
  /// Resolution order:
  /// 1. Exact match against loaded [sessions].
  /// 2. `group_` / `g_` prefix → group target lookup.
  /// 3. Match against group sessions by targetId / conversationId.
  /// 4. Fall back to private target lookup.
  static String normalizeIncomingSessionKey(
    String sessionKey,
    List<ChatSession> sessions, {
    String? currentUserId,
  }) {
    if (sessionKey.isEmpty) return sessionKey;

    // 1. Exact match
    final exact = sessions.where((s) => s.id == sessionKey).firstOrNull;
    if (exact != null) return exact.id;

    // 2. Group prefix
    if (sessionKey.startsWith('group_') || sessionKey.startsWith('g_')) {
      return _sessionKeyForGroupTarget(sessionKey, sessions);
    }

    // 3. Match against group sessions
    final group = sessions.where((s) {
      final isGroup = s.type == 'group' || s.conversationType == 'group';
      return isGroup &&
          (s.targetId == sessionKey || s.conversationId == sessionKey);
    }).firstOrNull;
    if (group != null) return group.id;

    // 4. Fall back to private
    return _sessionKeyForPrivateTarget(sessionKey, sessions,
        currentUserId: currentUserId);
  }

  // ===========================================================================
  // Private target from session key
  // ===========================================================================

  /// Extracts the peer user ID from a private session key.
  ///
  /// For a key like `user-1_user-2` with [currentUserId] = `user-1`,
  /// returns `user-2`.
  static String privateTargetFromSessionKey(
      String sessionKey, String? currentUserId) {
    if (!sessionKey.contains('_')) return sessionKey;
    return sessionKey
            .split('_')
            .where((part) =>
                part.isNotEmpty &&
                (currentUserId == null || part != currentUserId))
            .firstOrNull ??
        sessionKey;
  }

  // ===========================================================================
  // Negotiation lookup keys
  // ===========================================================================

  /// Returns a set of session keys that should be checked when looking up
  /// a pending E2EE negotiation for a given [sessionId].
  ///
  /// This covers mismatches between E2EE session IDs (`p_*`) and chat
  /// session keys (custom IDs, `group_*`, etc.).
  static Set<String> negotiationLookupKeys(
    String sessionId,
    List<ChatSession> sessions, {
    String? currentUserId,
  }) {
    final keys = <String>{sessionId};
    if (sessionId.isEmpty) return keys;

    final normalizedChatKey = normalizeE2eeSessionKey(sessionId, sessions,
        currentUserId: currentUserId);
    if (normalizedChatKey.isNotEmpty) keys.add(normalizedChatKey);

    final session = sessions
        .where((s) =>
            s.id == normalizedChatKey ||
            s.id == sessionId ||
            s.conversationId == sessionId)
        .firstOrNull;
    if (session != null) {
      keys.add(session.id);
      if (session.conversationId != null) {
        keys.add(session.conversationId!);
      }
      final isGroup =
          session.type == 'group' || session.conversationType == 'group';
      if (isGroup) {
        keys.add(groupSessionKey(session.targetId));
      } else {
        keys.add(privateSessionKey(currentUserId ?? '', session.targetId));
      }
    }
    return keys;
  }

  // ===========================================================================
  // Normalize E2EE session key
  // ===========================================================================

  /// Normalizes an E2EE session ID to a chat session key.
  static String normalizeE2eeSessionKey(
    String sessionId,
    List<ChatSession> sessions, {
    String? currentUserId,
  }) {
    final exact = sessions.where((s) => s.id == sessionId).firstOrNull;
    if (exact != null) return exact.id;

    if (sessionId.startsWith('p_')) {
      return _sessionKeyForPrivateTarget(
        privateTargetFromE2eeSessionId(sessionId, currentUserId),
        sessions,
        currentUserId: currentUserId,
      );
    }

    if (sessionId.startsWith('group_') || sessionId.startsWith('g_')) {
      return _sessionKeyForGroupTarget(sessionId, sessions);
    }

    final session = sessions
        .where((s) => s.conversationId == sessionId || s.targetId == sessionId)
        .firstOrNull;
    return session?.id ?? sessionId;
  }

  // ===========================================================================
  // E2EE session ID for chat or E2EE session
  // ===========================================================================

  /// Resolves an E2EE session ID from either a chat session key or an
  /// E2EE session ID directly.
  static String e2eeSessionIdForChatOrE2eeSession(
    String sessionId,
    List<ChatSession> sessions, {
    String? currentUserId,
  }) {
    if (sessionId.startsWith('p_')) return sessionId;

    final session = sessions
        .where((s) =>
            s.id == sessionId ||
            s.conversationId == sessionId ||
            s.targetId == sessionId)
        .firstOrNull;
    if (session != null) {
      final isGroup =
          session.type == 'group' || session.conversationType == 'group';
      return isGroup
          ? session.id
          : e2eeSessionIdForPrivate(currentUserId ?? '', session.targetId);
    }
    return e2eeSessionIdForPrivate(
      currentUserId ?? '',
      privateTargetFromSessionKey(sessionId, currentUserId),
    );
  }

  // ===========================================================================
  // Read conversation ID for session key
  // ===========================================================================

  /// Resolves the conversation ID to pass to the mark-read API.
  static String readConversationIdForSessionKey(
    String sessionKey,
    List<ChatSession> sessions, {
    String? currentUserId,
  }) {
    final session = sessions.where((s) => s.id == sessionKey).firstOrNull;
    if (session != null) {
      final isGroup =
          session.type == 'group' || session.conversationType == 'group';
      if (isGroup) {
        return 'group_${session.targetId}';
      }
      return session.conversationId ?? session.targetId;
    }
    if (sessionKey.startsWith('group_')) return sessionKey;
    if (sessionKey.startsWith('g_')) {
      return 'group_${_groupIdFromSessionKey(sessionKey)}';
    }
    return privateTargetFromSessionKey(sessionKey, currentUserId);
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  static String _sessionKeyForPrivateTarget(
    String targetId,
    List<ChatSession> sessions, {
    String? currentUserId,
  }) {
    final normalizedTarget =
        privateTargetFromSessionKey(targetId, currentUserId);
    final existing = sessions.where((s) {
      final isPrivate = s.type == 'private' || s.conversationType == 'private';
      return isPrivate &&
          (s.targetId == normalizedTarget ||
              s.id == targetId ||
              s.conversationId == targetId);
    }).firstOrNull;
    return existing?.id ??
        privateSessionKey(currentUserId ?? '', normalizedTarget);
  }

  static String _sessionKeyForGroupTarget(
      String groupId, List<ChatSession> sessions) {
    final normalizedGroupId = _groupIdFromSessionKey(groupId);
    final existing = sessions.where((s) {
      final isGroup = s.type == 'group' || s.conversationType == 'group';
      return isGroup &&
          (s.targetId == normalizedGroupId ||
              s.id == groupId ||
              s.conversationId == groupId);
    }).firstOrNull;
    return existing?.id ?? groupSessionKey(normalizedGroupId);
  }

  static String _groupIdFromSessionKey(String sessionKey) {
    if (sessionKey.startsWith('group_')) {
      return sessionKey.substring('group_'.length);
    }
    if (sessionKey.startsWith('g_')) {
      return sessionKey.substring('g_'.length);
    }
    return sessionKey;
  }

  static String privateTargetFromE2eeSessionId(
      String sessionId, String? currentUserId) {
    final raw = sessionId.startsWith('p_') ? sessionId.substring(2) : sessionId;
    return raw
            .split('_')
            .where((part) =>
                part.isNotEmpty &&
                (currentUserId == null || part != currentUserId))
            .firstOrNull ??
        sessionId;
  }

  static int _compareIds(String left, String right) {
    final leftId = BigInt.tryParse(left);
    final rightId = BigInt.tryParse(right);
    if (leftId != null &&
        rightId != null &&
        leftId > BigInt.zero &&
        rightId > BigInt.zero) {
      return leftId.compareTo(rightId);
    }
    return left.compareTo(right);
  }
}
