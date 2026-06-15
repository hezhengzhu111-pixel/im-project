import 'package:im_core/core.dart';

class ChatState {
  const ChatState({
    this.sessions = const [],
    this.messages = const {},
    this.isLoading = false,
    this.activeSessionId,
    this.error,
    this.loadingHistoryBySession = const {},
    this.hasMoreHistoryBySession = const {},
    this.oldestLoadedServerMessageIdBySession = const {},
    this.pendingCount = 0,
    this.failedCount = 0,
    this.isRetrying = false,
    this.isOffline = false,
    this.pendingNegotiations = const {},
  });

  final List<ChatSession> sessions;
  final Map<String, List<Message>> messages;
  final bool isLoading;
  final String? activeSessionId;
  final String? error;
  final Map<String, bool> loadingHistoryBySession;
  final Map<String, bool> hasMoreHistoryBySession;
  final Map<String, String> oldestLoadedServerMessageIdBySession;

  /// Outbox / retry related fields (optional, defaults to 0/false).
  final int pendingCount;
  final int failedCount;
  final bool isRetrying;
  final bool isOffline;

  /// E2EE negotiation events keyed by session ID (optional, defaults to {}).
  final Map<String, E2eeNegotiationEvent> pendingNegotiations;

  List<Message> get currentMessages => activeSessionId != null
      ? (messages[activeSessionId] ?? const [])
      : const [];

  /// Returns the pending negotiation for the active session, if any.
  E2eeNegotiationEvent? get activePendingNegotiation {
    final activeId = activeSessionId;
    if (activeId == null) return null;
    return pendingNegotiations[activeId];
  }

  ChatState copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? activeSessionId,
    String? error,
    Map<String, bool>? loadingHistoryBySession,
    Map<String, bool>? hasMoreHistoryBySession,
    Map<String, String>? oldestLoadedServerMessageIdBySession,
    int? pendingCount,
    int? failedCount,
    bool? isRetrying,
    bool? isOffline,
    Map<String, E2eeNegotiationEvent>? pendingNegotiations,
  }) {
    return ChatState(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      error: error,
      loadingHistoryBySession:
          loadingHistoryBySession ?? this.loadingHistoryBySession,
      hasMoreHistoryBySession:
          hasMoreHistoryBySession ?? this.hasMoreHistoryBySession,
      oldestLoadedServerMessageIdBySession:
          oldestLoadedServerMessageIdBySession ??
              this.oldestLoadedServerMessageIdBySession,
      pendingCount: pendingCount ?? this.pendingCount,
      failedCount: failedCount ?? this.failedCount,
      isRetrying: isRetrying ?? this.isRetrying,
      isOffline: isOffline ?? this.isOffline,
      pendingNegotiations: pendingNegotiations ?? this.pendingNegotiations,
    );
  }
}
