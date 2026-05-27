import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/message_api.dart';

class ChatState {
  const ChatState({
    this.sessions = const [],
    this.messages = const {},
    this.isLoading = false,
    this.error,
  });

  final List<ChatSession> sessions;
  final Map<String, List<Message>> messages;
  final bool isLoading;
  final String? error;

  ChatState copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? error,
  }) {
    return ChatState(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._messageApi) : super(const ChatState());

  final MessageApi _messageApi;

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true);
    try {
      final sessions = await _messageApi.getConversations();
      state = ChatState(sessions: sessions);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
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

  void addMessage(String sessionId, Message message) {
    final current = state.messages[sessionId] ?? [];
    state = state.copyWith(
      messages: {...state.messages, sessionId: [...current, message]},
    );
  }
}
