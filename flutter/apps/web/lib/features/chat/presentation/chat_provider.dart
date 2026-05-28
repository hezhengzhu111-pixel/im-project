import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core/src/network/ws_connection_state.dart';
import '../data/message_api.dart';
import '../data/message_pipeline.dart';
import '../../e2ee/data/e2ee_manager.dart';
import '../../e2ee/data/e2ee_meta_store.dart';

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
  ChatNotifier(
    this._messageApi,
    this._pipeline,
    this._wsClient,
    this._currentUserId,
    this._e2eeManager,
    this._e2eeMetaStore,
    this._analytics,
  ) : super(const ChatState()) {
    _subscribeToWs();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  final String Function() _currentUserId;
  final E2eeManager _e2eeManager;
  final E2eeMetaStore _e2eeMetaStore;
  final AnalyticsPort _analytics;
  StreamSubscription? _wsSubscription;

  E2eeNegotiationEvent? _pendingNegotiation;
  E2eeNegotiationEvent? get pendingNegotiation => _pendingNegotiation;
  void clearPendingNegotiation() => _pendingNegotiation = null;

  void _subscribeToWs() {
    _wsSubscription = _wsClient.events.listen((event) {
      if (event.type == WsMessageType.message) {
        _handleIncomingMessage(event.data);
      } else if (event.type == WsMessageType.messageStatusChanged) {
        _handleMessageStatusChanged(event.data);
      } else if (event.type == WsMessageType.readReceipt) {
        _handleReadReceipt(event.data);
      } else if (event.type == WsMessageType.system) {
        _handleSystemMessage(event.data);
      } else if (event.type == WsMessageType.e2eeNegotiation) {
        _handleE2eeNegotiation(event.data);
      }
    });
    // Sync offline messages on reconnect
    _wsClient.connectionState.listen((wsState) {
      if (wsState == WsConnectionState.connected) {
        _analytics.trackEvent('ws_connected');
        _syncOfflineMessages();
      } else if (wsState == WsConnectionState.disconnected) {
        _analytics.trackEvent('ws_disconnected');
      }
    });
  }

  Future<void> _syncOfflineMessages() async {
    try {
      await loadSessions();
      // Also reload messages for the active session
      final activeId = state.activeSessionId;
      if (activeId != null) {
        final session = state.sessions.where((s) => s.id == activeId).firstOrNull;
        if (session != null) {
          final isGroup = session.conversationType == 'group' || session.type == 'group';
          if (isGroup) {
            await loadGroupMessages(session.targetId);
          } else {
            await loadMessages(session.targetId);
          }
        }
      }
    } catch (_) {}
  }

  void _handleIncomingMessage(Map<String, dynamic> data) {
    try {
      final message = Message.fromJson(data);
      if (!_pipeline.shouldProcess(message.id)) return;

      // Decrypt E2EE messages from other users.
      if (message.encrypted == true &&
          message.e2eeEnvelope != null &&
          message.senderId != _currentUserId()) {
        _decryptAndAdd(message, data['e2eeEnvelope'] as Map<String, dynamic>?);
        return;
      }

      final sessionKey = message.isGroupChat
          ? (message.groupId ?? '')
          : message.senderId;
      addMessage(sessionKey, message);

      // Auto mark read if viewing this session
      if (state.activeSessionId == sessionKey) {
        markRead(sessionKey);
      }
    } catch (e) {
      print('Failed to handle incoming message: $e');
    }
  }

  /// Decrypt an incoming E2EE message and add it to the message list.
  /// Runs asynchronously to avoid blocking the WS event loop.
  Future<void> _decryptAndAdd(
    Message message,
    Map<String, dynamic>? rawEnvelope,
  ) async {
    final sessionKey = message.isGroupChat
        ? (message.groupId ?? '')
        : message.senderId;

    try {
      // Build the E2EE session ID.
      final e2eeSessionId = message.e2eeEnvelope?.sessionId ??
          '${_currentUserId()}_private_${message.senderId}';

      // Convert camelCase envelope to snake_case for the Rust adapter.
      final snakeEnvelope = rawEnvelope != null
          ? _camelToSnakeEnvelope(rawEnvelope)
          : null;

      if (snakeEnvelope == null) {
        // No raw envelope available; add message as-is with failed status.
        addMessage(sessionKey, message.copyWith(decryptStatus: 'failed'));
        return;
      }

      final plaintext = await _e2eeManager.decryptEnvelope(
        sessionId: e2eeSessionId,
        envelope: snakeEnvelope,
      );

      addMessage(sessionKey, message.copyWith(
        content: plaintext,
        decryptStatus: 'success',
      ));
    } catch (e) {
      print('E2EE decrypt failed: $e');
      addMessage(sessionKey, message.copyWith(
        content: '',
        decryptStatus: 'failed',
      ));
    }
  }

  /// Convert camelCase envelope keys from JSON to snake_case for the Rust adapter.
  Map<String, dynamic> _camelToSnakeEnvelope(Map<String, dynamic> camel) {
    return {
      'version': camel['version'],
      'algorithm': camel['algorithm'],
      'sender_device_id': camel['senderDeviceId'],
      'recipient_device_id': camel['recipientDeviceId'],
      'session_id': camel['sessionId'],
      'wire': camel['wire'],
      if (camel['handshake'] != null) 'handshake': camel['handshake'],
    };
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

  void _handleReadReceipt(Map<String, dynamic> data) {
    try {
      final sessionId = data['sessionId']?.toString() ?? data['conversationId']?.toString() ?? '';
      if (sessionId.isEmpty) return;
      final messages = state.messages[sessionId];
      if (messages == null || messages.isEmpty) return;

      // Mark all messages in this session as READ
      final updated = messages.map((m) {
        if (m.status != 'READ') {
          return Message(
            id: m.id, senderId: m.senderId, receiverId: m.receiverId,
            isGroupChat: m.isGroupChat, messageType: m.messageType,
            content: m.content, sendTime: m.sendTime, status: 'READ',
            clientMessageId: m.clientMessageId, groupId: m.groupId,
            senderName: m.senderName, senderAvatar: m.senderAvatar,
            mediaUrl: m.mediaUrl, mediaSize: m.mediaSize,
            mediaName: m.mediaName, thumbnailUrl: m.thumbnailUrl,
            duration: m.duration,
          );
        }
        return m;
      }).toList();

      state = state.copyWith(messages: {...state.messages, sessionId: updated});
    } catch (e) {
      print('Failed to handle read receipt: $e');
    }
  }

  void _handleSystemMessage(Map<String, dynamic> data) {
    try {
      final content = data['content']?.toString() ?? '';
      // System messages that affect contacts/sessions trigger a refresh
      if (content.contains('FRIEND') || content.contains('GROUP') || content.contains('friend') || content.contains('group')) {
        loadSessions();
      }
    } catch (e) {
      print('Failed to handle system message: $e');
    }
  }

  /// Handle E2EE negotiation events from WebSocket.
  void _handleE2eeNegotiation(Map<String, dynamic> data) {
    try {
      final action = E2eeNegotiationAction.fromString(
        data['action']?.toString() ?? '',
      );
      final sessionId = data['sessionId']?.toString() ?? '';
      final requesterId = data['requesterId']?.toString() ?? '';
      final requesterName = data['requesterName']?.toString();
      final requestPayloadJson = data['requestPayloadJson']?.toString();

      if (sessionId.isEmpty) return;

      final event = E2eeNegotiationEvent(
        sessionId: sessionId,
        action: action,
        requesterId: requesterId,
        requesterName: requesterName,
        requestPayloadJson: requestPayloadJson,
      );

      switch (action) {
        case E2eeNegotiationAction.request:
          // Store pending negotiation for UI to pick up and prompt the user.
          _pendingNegotiation = event;
          _e2eeMetaStore.setSessionStatus(sessionId, 'negotiating');
        case E2eeNegotiationAction.accepted:
          // Peer accepted — session is now encrypted.
          _e2eeMetaStore.setSessionStatus(sessionId, 'encrypted');
          _pendingNegotiation = null;
        case E2eeNegotiationAction.rejected:
        case E2eeNegotiationAction.disabled:
          // Peer rejected or disabled — revert to plaintext.
          _e2eeMetaStore.setSessionStatus(sessionId, 'plaintext');
          _pendingNegotiation = null;
      }
    } catch (e) {
      print('Failed to handle E2EE negotiation: $e');
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

  void setActiveSession(String? sessionId) {
    state = state.copyWith(activeSessionId: sessionId);
    if (sessionId != null) {
      markRead(sessionId);
    }
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
    final currentUid = _currentUserId();
    final e2eeSessionId = '${currentUid}_private_$receiverId';

    // Check E2EE session status before sending.
    String e2eeStatus = 'plaintext';
    try {
      e2eeStatus = await _e2eeMetaStore.getSessionStatus(e2eeSessionId);
    } catch (_) {
      // If meta store is unavailable, fall back to plaintext.
    }

    if (e2eeStatus == 'negotiating') {
      state = state.copyWith(error: '端到端加密协商尚未完成，请等待对方确认。');
      return null;
    }
    if (e2eeStatus == 'failed') {
      // Reset failed status to plaintext so the message can be sent.
      await _e2eeMetaStore.setSessionStatus(e2eeSessionId, 'plaintext');
      e2eeStatus = 'plaintext';
    }

    // Prepare the pending message with plaintext for local display.
    final pendingMessage = Message(
      id: cid,
      senderId: currentUid,
      receiverId: receiverId,
      isGroupChat: false,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'SENDING',
      clientMessageId: cid,
      encrypted: e2eeStatus == 'encrypted',
      decryptStatus: e2eeStatus == 'encrypted' ? 'skipped_own' : null,
    );
    addMessage(receiverId, pendingMessage);

    try {
      Message serverMessage;
      if (e2eeStatus == 'encrypted') {
        // Encrypt the message.
        final senderDeviceId = await _e2eeMetaStore.getOrCreateDeviceId();
        final recipientDeviceId =
            await _e2eeMetaStore.getRemoteDeviceId(e2eeSessionId);
        if (recipientDeviceId == null || recipientDeviceId.isEmpty) {
          throw Exception('remote device ID not found for session');
        }

        final envelope = await _e2eeManager.encryptToEnvelope(
          sessionId: e2eeSessionId,
          senderDeviceId: senderDeviceId,
          recipientDeviceId: recipientDeviceId,
          plaintext: content,
        );

        serverMessage = await _messageApi.sendPrivateEncrypted(
          receiverId: receiverId,
          clientMessageId: cid,
          messageType: messageType,
          e2eeEnvelope: envelope,
          e2eeDeviceId: senderDeviceId,
        );
      } else {
        serverMessage = await _messageApi.sendPrivateMessage(
          SendPrivateMessageRequest(
            receiverId: receiverId,
            content: content,
            messageType: messageType,
            clientMessageId: cid,
          ),
        );
      }
      _replaceMessage(receiverId, cid, serverMessage);
      _analytics.trackEvent('message_send', {
        'type': messageType,
        'encrypted': e2eeStatus == 'encrypted',
      });
      return serverMessage;
    } catch (e) {
      print('Send message failed: $e');
      _analytics.trackEvent('message_send_failed');
      _updateMessageStatus(receiverId, cid, 'FAILED');
      return null;
    }
  }

  Future<Message?> sendGroupMessage(String groupId, String content,
      {String messageType = 'text', String? clientMessageId}) async {
    final cid = clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final pendingMessage = Message(
      id: cid,
      senderId: _currentUserId(),
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
      _analytics.trackEvent('message_send', {'type': messageType, 'encrypted': false});
      return serverMessage;
    } catch (e) {
      _analytics.trackEvent('message_send_failed');
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
