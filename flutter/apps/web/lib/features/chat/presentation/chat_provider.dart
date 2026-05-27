import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core/src/network/ws_connection_state.dart';
import '../data/message_api.dart';
import '../data/message_pipeline.dart';

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

  List<Message> get currentMessages =>
      activeSessionId != null ? (messages[activeSessionId] ?? const []) : const [];

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
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._messageApi, this._pipeline, this._wsClient)
      : super(const ChatState()) {
    _subscribeToWs();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  StreamSubscription? _wsSubscription;

  void _subscribeToWs() {
    _wsSubscription = _wsClient.events.listen((event) {
      if (event.type == WsMessageType.message) {
        _handleIncomingMessage(event.data);
      } else if (event.type == WsMessageType.messageStatusChanged) {
        _handleMessageStatusChanged(event.data);
      }
    });
    // Sync offline messages on reconnect
    _wsClient.connectionState.listen((wsState) {
      if (wsState == WsConnectionState.connected) {
        _syncOfflineMessages();
      }
    });
  }

  Future<void> _syncOfflineMessages() async {
    try {
      await loadSessions();
    } catch (_) {}
  }

  void _handleIncomingMessage(Map<String, dynamic> data) {
    try {
      final message = Message.fromJson(data);
      if (!_pipeline.shouldProcess(message.id)) return;
      final sessionKey = message.isGroupChat
          ? (message.groupId ?? '')
          : message.senderId;
      addMessage(sessionKey, message);
    } catch (e) {
      print('Failed to handle incoming message: $e');
    }
  }

  void _handleMessageStatusChanged(Map<String, dynamic> data) {
    try {
      final message = Message.fromJson(data);
      for (final entry in state.messages.entries) {
        final index = entry.value.indexWhere((m) => m.id == message.id);
        if (index != -1) {
          final updated = List<Message>.from(entry.value);
          updated[index] = message;
          state = state.copyWith(
            messages: {...state.messages, entry.key: updated},
          );
          break;
        }
      }
    } catch (e) {
      print('Failed to handle message status change: $e');
    }
  }

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessions = await _messageApi.getConversations();
      state = state.copyWith(sessions: sessions, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setActiveSession(String sessionId) {
    state = state.copyWith(activeSessionId: sessionId);
  }

  Future<void> loadMessages(String targetId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final messages = await _messageApi.getPrivateHistory(targetId,
          page: page, size: size);
      state = state.copyWith(
        messages: {...state.messages, targetId: messages},
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadGroupMessages(String groupId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final messages = await _messageApi.getGroupHistory(groupId,
          page: page, size: size);
      state = state.copyWith(
        messages: {...state.messages, groupId: messages},
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<Message?> sendMessage(String receiverId, String content,
      {String messageType = 'text', String? clientMessageId}) async {
    final cid = clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final pendingMessage = Message(
      id: cid,
      senderId: '',
      receiverId: receiverId,
      isGroupChat: false,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'SENDING',
      clientMessageId: cid,
    );
    addMessage(receiverId, pendingMessage);

    try {
      final serverMessage = await _messageApi.sendPrivateMessage(
        SendPrivateMessageRequest(
          receiverId: receiverId,
          content: content,
          messageType: messageType,
          clientMessageId: cid,
        ),
      );
      _replaceMessage(receiverId, cid, serverMessage);
      return serverMessage;
    } catch (e) {
      _updateMessageStatus(receiverId, cid, 'FAILED');
      return null;
    }
  }

  Future<Message?> sendGroupMessage(String groupId, String content,
      {String messageType = 'text', String? clientMessageId}) async {
    final cid = clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final pendingMessage = Message(
      id: cid,
      senderId: '',
      isGroupChat: true,
      groupId: groupId,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'SENDING',
      clientMessageId: cid,
    );
    addMessage(groupId, pendingMessage);

    try {
      final serverMessage = await _messageApi.sendGroupMessage(
        SendGroupMessageRequest(
          groupId: groupId,
          content: content,
          messageType: messageType,
          clientMessageId: cid,
        ),
      );
      _replaceMessage(groupId, cid, serverMessage);
      return serverMessage;
    } catch (e) {
      _updateMessageStatus(groupId, cid, 'FAILED');
      return null;
    }
  }

  Future<void> retryMessage(String sessionKey, String messageId) async {
    final messages = state.messages[sessionKey];
    if (messages == null) return;
    final index = messages.indexWhere((m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final msg = messages[index];

    _updateMessageStatus(sessionKey, msg.id, 'SENDING');

    try {
      Message serverMessage;
      if (msg.isGroupChat) {
        serverMessage = await _messageApi.sendGroupMessage(
          SendGroupMessageRequest(
            groupId: msg.groupId ?? sessionKey,
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
          ),
        );
      } else {
        serverMessage = await _messageApi.sendPrivateMessage(
          SendPrivateMessageRequest(
            receiverId: msg.receiverId ?? sessionKey,
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
          ),
        );
      }
      _replaceMessage(sessionKey, msg.id, serverMessage);
    } catch (e) {
      _updateMessageStatus(sessionKey, msg.id, 'FAILED');
    }
  }

  Future<void> retryAllFailed() async {
    for (final entry in state.messages.entries) {
      final failedMessages = entry.value.where((m) => m.status == 'FAILED').toList();
      for (final msg in failedMessages) {
        await retryMessage(entry.key, msg.id);
      }
    }
  }

  Future<ChatSession?> getOrCreateSession(String targetId) async {
    final existing = state.sessions.where((s) => s.targetId == targetId).firstOrNull;
    if (existing != null) return existing;
    await loadSessions();
    return state.sessions.where((s) => s.targetId == targetId).firstOrNull;
  }

  void addMessage(String sessionKey, Message message) {
    final currentMessages = state.messages[sessionKey] ?? [];
    if (currentMessages.any((m) => m.id == message.id)) return;
    final updated = [...currentMessages, message];
    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  void _replaceMessage(String sessionKey, String oldId, Message newMessage) {
    final currentMessages = state.messages[sessionKey];
    if (currentMessages == null) return;
    final index = currentMessages.indexWhere(
        (m) => m.id == oldId || m.clientMessageId == oldId);
    if (index == -1) return;
    final updated = List<Message>.from(currentMessages);
    updated[index] = newMessage;
    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  void _updateMessageStatus(String sessionKey, String messageId, String status) {
    final currentMessages = state.messages[sessionKey];
    if (currentMessages == null) return;
    final index = currentMessages.indexWhere(
        (m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final updated = List<Message>.from(currentMessages);
    final old = updated[index];
    updated[index] = Message(
      id: old.id,
      senderId: old.senderId,
      receiverId: old.receiverId,
      isGroupChat: old.isGroupChat,
      messageType: old.messageType,
      content: old.content,
      sendTime: old.sendTime,
      status: status,
      clientMessageId: old.clientMessageId,
      groupId: old.groupId,
      senderName: old.senderName,
      senderAvatar: old.senderAvatar,
      mediaUrl: old.mediaUrl,
      mediaSize: old.mediaSize,
      mediaName: old.mediaName,
      thumbnailUrl: old.thumbnailUrl,
      duration: old.duration,
    );
    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _messageApi.markRead(conversationId);
    } catch (_) {}
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
