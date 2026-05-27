import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/message_api.dart';

class ChatState {
  const ChatState({
    this.sessions = const [],
    this.messages = const {},
    this.isLoading = false,
    this.activeSessionId,
    this.error,
  });

  final List<ChatSession> sessions;
  final Map<String, List<Message>> messages;
  final bool isLoading;
  final String? activeSessionId;
  final String? error;

  ChatState copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? activeSessionId,
    String? error,
  }) {
    return ChatState(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      error: error,
    );
  }

  List<Message> get currentMessages =>
      activeSessionId != null ? (messages[activeSessionId] ?? const []) : const [];
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._messageApi) : super(const ChatState());

  final MessageApi _messageApi;

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessions = await _messageApi.getConversations();
      state = ChatState(sessions: sessions);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setActiveSession(String sessionId) {
    state = state.copyWith(activeSessionId: sessionId);
  }

  Future<void> loadMessages(String sessionId) async {
    try {
      final messages = await _messageApi.getPrivateHistory(sessionId);
      state = state.copyWith(
        messages: {...state.messages, sessionId: messages},
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<Message?> sendMessage(String receiverId, String content) async {
    try {
      final request = SendPrivateMessageRequest(
        receiverId: receiverId,
        content: content,
      );
      final message = await _messageApi.sendPrivateMessage(request);
      addMessage(receiverId, message);
      return message;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return null;
    }
  }

  void addMessage(String sessionId, Message message) {
    final current = state.messages[sessionId] ?? [];
    // Dedup by message id
    if (current.any((m) => m.id == message.id)) return;
    state = state.copyWith(
      messages: {...state.messages, sessionId: [...current, message]},
    );
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _messageApi.markRead(conversationId);
    } catch (_) {
      // silent
    }
  }
}
