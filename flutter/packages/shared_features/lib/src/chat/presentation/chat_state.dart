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
  });

  final List<ChatSession> sessions;
  final Map<String, List<Message>> messages;
  final bool isLoading;
  final String? activeSessionId;
  final String? error;
  final Map<String, bool> loadingHistoryBySession;
  final Map<String, bool> hasMoreHistoryBySession;
  final Map<String, String> oldestLoadedServerMessageIdBySession;

  List<Message> get currentMessages => activeSessionId != null
      ? (messages[activeSessionId] ?? const [])
      : const [];

  ChatState copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? activeSessionId,
    String? error,
    Map<String, bool>? loadingHistoryBySession,
    Map<String, bool>? hasMoreHistoryBySession,
    Map<String, String>? oldestLoadedServerMessageIdBySession,
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
    );
  }
}
