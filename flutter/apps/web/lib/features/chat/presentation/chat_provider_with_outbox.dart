import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/network/network_status_provider.dart';
import '../data/message_api.dart';
import '../data/message_pipeline.dart';
import '../data/message_outbox.dart';
import '../../e2ee/data/e2ee_manager.dart';
import '../../e2ee/data/e2ee_meta_store.dart';
import 'chat_state.dart';
import '../../../core/logging/app_logger.dart';

/// Extended chat state with outbox information
class ChatStateWithOutbox extends ChatState {
  const ChatStateWithOutbox({
    super.sessions,
    super.messages,
    super.isLoading,
    super.activeSessionId,
    super.error,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.isRetrying = false,
    this.isOffline = false,
  });

  final int pendingCount;
  final int failedCount;
  final bool isRetrying;
  final bool isOffline;

  @override
  ChatStateWithOutbox copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? activeSessionId,
    String? error,
    int? pendingCount,
    int? failedCount,
    bool? isRetrying,
    bool? isOffline,
  }) {
    return ChatStateWithOutbox(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      error: error,
      pendingCount: pendingCount ?? this.pendingCount,
      failedCount: failedCount ?? this.failedCount,
      isRetrying: isRetrying ?? this.isRetrying,
      isOffline: isOffline ?? this.isOffline,
    );
  }
}

/// Chat notifier with outbox integration
class ChatNotifierWithOutbox extends StateNotifier<ChatStateWithOutbox> {
  ChatNotifierWithOutbox(
    this._messageApi,
    this._pipeline,
    this._wsClient,
    this._currentUserId,
    this._e2eeManager,
    this._e2eeMetaStore,
    this._outbox,
    this._networkStatus,
    this._analytics,
  ) : super(const ChatStateWithOutbox()) {
    _subscribeToWs();
    _subscribeToOutbox();
    _subscribeToNetwork();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  final String Function() _currentUserId;
  final E2eeManager _e2eeManager;
  final E2eeMetaStore _e2eeMetaStore;
  final MessageOutbox _outbox;
  final NetworkStatusNotifier _networkStatus;
  final AnalyticsPort _analytics;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _outboxSubscription;
  StreamSubscription? _networkSubscription;

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
        _syncOfflineMessages();
      }
    });
  }

  void _subscribeToOutbox() {
    _outboxSubscription = _outbox.events.listen((event) {
      switch (event.type) {
        case OutboxEventType.messageAdded:
          _updateOutboxCounts();
        case OutboxEventType.messageRetrying:
          state = state.copyWith(isRetrying: true);
          _updateOutboxCounts();
        case OutboxEventType.messageSent:
          // Replace the pending message with the sent one
          if (event.message != null) {
            _handleOutboxMessageSent(event.message!);
          }
          _updateOutboxCounts();
        case OutboxEventType.messageFailed:
          state = state.copyWith(isRetrying: false);
          _updateOutboxCounts();
        case OutboxEventType.retryAllStarted:
          state = state.copyWith(isRetrying: true);
        case OutboxEventType.retryAllCompleted:
          state = state.copyWith(isRetrying: false);
          _updateOutboxCounts();
      }
    });
  }

  void _subscribeToNetwork() {
    _networkSubscription = _networkStatus.stateChanges.listen((networkState) {
      state = state.copyWith(isOffline: networkState.isOffline);
    });
  }

  Future<void> _updateOutboxCounts() async {
    final pending = await _outbox.getPendingCount();
    final failed = await _outbox.getFailedCount();
    state = state.copyWith(pendingCount: pending, failedCount: failed);
  }

  void _handleOutboxMessageSent(OutboxMessage outboxMsg) {
    // Find and update the message in the current state
    final sessionKey = _normalizeIncomingSessionKey(outboxMsg.sessionKey);
    final messages = state.messages[sessionKey];
    if (messages == null) return;

    final index = messages.indexWhere(
      (m) =>
          m.id == outboxMsg.id ||
          m.clientMessageId == outboxMsg.clientMessageId,
    );
    if (index == -1) return;

    final updated = List<Message>.from(messages);
    final old = updated[index];
    updated[index] = Message(
      id: old.id,
      senderId: old.senderId,
      receiverId: old.receiverId,
      isGroupChat: old.isGroupChat,
      messageType: old.messageType,
      content: old.content,
      sendTime: old.sendTime,
      status: 'SENT',
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

  Future<void> _syncOfflineMessages() async {
    try {
      await loadSessions();
      // Also reload messages for the active session
      final activeId = state.activeSessionId;
      if (activeId != null) {
        final session =
            state.sessions.where((s) => s.id == activeId).firstOrNull;
        if (session != null) {
          final isGroup =
              session.conversationType == 'group' || session.type == 'group';
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

      final sessionKey = _sessionKeyForMessage(message);
      if (sessionKey.isEmpty) return;
      addMessage(sessionKey, message);

      // Auto mark read if viewing this session
      if (state.activeSessionId == sessionKey) {
        markRead(sessionKey);
      }
    } catch (e, st) {
      AppLogger.instance.error('Failed to handle incoming message', e, st);
    }
  }

  Future<void> _decryptAndAdd(
    Message message,
    Map<String, dynamic>? rawEnvelope,
  ) async {
    final sessionKey = _sessionKeyForMessage(message);
    if (sessionKey.isEmpty) return;

    try {
      final e2eeSessionId = message.e2eeEnvelope?.sessionId ??
          '${_currentUserId()}_private_${message.senderId}';

      final snakeEnvelope =
          rawEnvelope != null ? _camelToSnakeEnvelope(rawEnvelope) : null;

      if (snakeEnvelope == null) {
        addMessage(sessionKey, message.copyWith(decryptStatus: 'failed'));
        return;
      }

      final plaintext = await _e2eeManager.decryptEnvelope(
        sessionId: e2eeSessionId,
        envelope: snakeEnvelope,
      );

      addMessage(
          sessionKey,
          message.copyWith(
            content: plaintext,
            decryptStatus: 'success',
          ));
    } catch (e, st) {
      AppLogger.instance.error('E2EE decrypt failed', e, st, 'e2ee');
      addMessage(
          sessionKey,
          message.copyWith(
            content: '',
            decryptStatus: 'failed',
          ));
    }
  }

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
    } catch (e, st) {
      AppLogger.instance.error('Failed to handle message status change', e, st);
    }
  }

  void _handleReadReceipt(Map<String, dynamic> data) {
    try {
      final rawSessionId = data['sessionId']?.toString() ??
          data['conversationId']?.toString() ??
          '';
      final sessionId = _normalizeIncomingSessionKey(rawSessionId);
      if (sessionId.isEmpty) return;
      final messages = state.messages[sessionId];
      if (messages == null || messages.isEmpty) return;

      final updated = messages.map((m) {
        if (m.status != 'READ') {
          return Message(
            id: m.id,
            senderId: m.senderId,
            receiverId: m.receiverId,
            isGroupChat: m.isGroupChat,
            messageType: m.messageType,
            content: m.content,
            sendTime: m.sendTime,
            status: 'READ',
            clientMessageId: m.clientMessageId,
            groupId: m.groupId,
            senderName: m.senderName,
            senderAvatar: m.senderAvatar,
            mediaUrl: m.mediaUrl,
            mediaSize: m.mediaSize,
            mediaName: m.mediaName,
            thumbnailUrl: m.thumbnailUrl,
            duration: m.duration,
          );
        }
        return m;
      }).toList();

      state = state.copyWith(messages: {...state.messages, sessionId: updated});
    } catch (e, st) {
      AppLogger.instance.error('Failed to handle read receipt', e, st);
    }
  }

  void _handleSystemMessage(Map<String, dynamic> data) {
    try {
      final content = data['content']?.toString() ?? '';
      if (content.contains('FRIEND') ||
          content.contains('GROUP') ||
          content.contains('friend') ||
          content.contains('group')) {
        loadSessions();
      }
    } catch (e, st) {
      AppLogger.instance.error('Failed to handle system message', e, st);
    }
  }

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
          _pendingNegotiation = event;
          _e2eeMetaStore.setSessionStatus(sessionId, 'negotiating');
        case E2eeNegotiationAction.accepted:
          _e2eeMetaStore.setSessionStatus(sessionId, 'encrypted');
          _pendingNegotiation = null;
        case E2eeNegotiationAction.rejected:
        case E2eeNegotiationAction.disabled:
          _e2eeMetaStore.setSessionStatus(sessionId, 'plaintext');
          _pendingNegotiation = null;
      }
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to handle E2EE negotiation', e, st, 'e2ee');
    }
  }

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessions = await _messageApi.getConversations();
      // Preserve locally-created session that server hasn't returned yet.
      final activeId = state.activeSessionId;
      if (activeId != null && !sessions.any((s) => s.id == activeId)) {
        final localSession = state.sessions
            .where((s) => s.id == activeId)
            .firstOrNull;
        if (localSession != null) {
          sessions.add(localSession);
        }
      }
      state = state.copyWith(sessions: sessions, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setActiveSession(String? sessionId) {
    final normalized =
        sessionId == null ? null : _normalizeIncomingSessionKey(sessionId);
    state = state.copyWith(activeSessionId: normalized);
    if (normalized != null) {
      markRead(normalized);
    }
  }

  Future<void> loadMessages(String targetId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessionKey = _sessionKeyForPrivateTarget(targetId);
      final messages =
          await _messageApi.getPrivateHistory(targetId, page: page, size: size);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: messages},
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadGroupMessages(String groupId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessionKey = _sessionKeyForGroupTarget(groupId);
      final messages =
          await _messageApi.getGroupHistory(groupId, page: page, size: size);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: messages},
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<Message?> sendMessage(String receiverId, String content,
      {String messageType = 'text',
      String? clientMessageId,
      String? mediaUrl,
      String? mediaName,
      int? mediaSize,
      String? thumbnailUrl,
      int? duration}) async {
    final cid =
        clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final currentUid = _currentUserId();
    final sessionKey = _sessionKeyForPrivateTarget(receiverId);
    final e2eeSessionId = '${currentUid}_private_$receiverId';

    // Check E2EE session status before sending.
    String e2eeStatus = 'plaintext';
    try {
      e2eeStatus = await _e2eeMetaStore.getSessionStatus(e2eeSessionId);
    } catch (_) {}

    if (e2eeStatus == 'negotiating') {
      state = state.copyWith(error: 'e2ee_not_ready');
      return null;
    }
    if (e2eeStatus == 'failed') {
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
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
    addMessage(sessionKey, pendingMessage);

    try {
      Message serverMessage;
      if (e2eeStatus == 'encrypted') {
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
            mediaUrl: mediaUrl,
            mediaName: mediaName,
            mediaSize: mediaSize,
            thumbnailUrl: thumbnailUrl,
            duration: duration,
          ),
        );
      }
      _replaceMessage(sessionKey, cid, serverMessage);
      _analytics.trackEvent('message_send', {
        'type': messageType,
        'encrypted': e2eeStatus == 'encrypted',
      });
      return serverMessage;
    } catch (e, st) {
      AppLogger.instance.error('Send message failed, adding to outbox', e, st);
      _analytics.trackEvent('message_send_failed');

      // Add to outbox for retry
      await _outbox.enqueue(
        sessionKey: sessionKey,
        receiverId: receiverId,
        content: content,
        messageType: messageType,
        clientMessageId: cid,
        isGroupChat: false,
        isEncrypted: e2eeStatus == 'encrypted',
        e2eeDeviceId: e2eeStatus == 'encrypted'
            ? await _e2eeMetaStore.getOrCreateDeviceId()
            : null,
      );

      _updateMessageStatus(sessionKey, cid, 'PENDING');
      return null;
    }
  }

  Future<Message?> sendGroupMessage(String groupId, String content,
      {String messageType = 'text',
      String? clientMessageId,
      String? mediaUrl,
      String? mediaName,
      int? mediaSize,
      String? thumbnailUrl,
      int? duration}) async {
    final cid =
        clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final sessionKey = _sessionKeyForGroupTarget(groupId);
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
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
    addMessage(sessionKey, pendingMessage);

    try {
      final serverMessage = await _messageApi.sendGroupMessage(
        SendGroupMessageRequest(
          groupId: groupId,
          content: content,
          messageType: messageType,
          clientMessageId: cid,
          mediaUrl: mediaUrl,
          mediaName: mediaName,
          mediaSize: mediaSize,
          thumbnailUrl: thumbnailUrl,
          duration: duration,
        ),
      );
      _replaceMessage(sessionKey, cid, serverMessage);
      _analytics.trackEvent(
          'message_send', {'type': messageType, 'encrypted': false});
      return serverMessage;
    } catch (e, st) {
      AppLogger.instance
          .error('Send group message failed, adding to outbox', e, st);
      _analytics.trackEvent('message_send_failed');

      // Add to outbox for retry
      await _outbox.enqueue(
        sessionKey: sessionKey,
        receiverId: groupId,
        content: content,
        messageType: messageType,
        clientMessageId: cid,
        isGroupChat: true,
        groupId: groupId,
      );

      _updateMessageStatus(sessionKey, cid, 'PENDING');
      return null;
    }
  }

  Future<void> retryMessage(String sessionKey, String messageId) async {
    final normalizedKey = _normalizeIncomingSessionKey(sessionKey);
    final messages = state.messages[normalizedKey];
    if (messages == null) return;
    final index = messages
        .indexWhere((m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final msg = messages[index];

    _updateMessageStatus(normalizedKey, msg.id, 'SENDING');

    try {
      Message serverMessage;
      if (msg.isGroupChat) {
        serverMessage = await _messageApi.sendGroupMessage(
          SendGroupMessageRequest(
            groupId: msg.groupId ?? _groupIdFromSessionKey(normalizedKey),
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
          ),
        );
      } else {
        serverMessage = await _messageApi.sendPrivateMessage(
          SendPrivateMessageRequest(
            receiverId:
                msg.receiverId ?? _privateTargetFromSessionKey(normalizedKey),
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
          ),
        );
      }
      _replaceMessage(normalizedKey, msg.id, serverMessage);
    } catch (e) {
      _updateMessageStatus(normalizedKey, msg.id, 'FAILED');
    }
  }

  Future<void> retryAllFailed() async {
    await _outbox.retryAllFailed();
  }

  Future<ChatSession?> getOrCreateSession(
    String targetId, {
    String? targetName,
    String? targetAvatar,
  }) async {
    final existing =
        state.sessions.where((s) => s.targetId == targetId).firstOrNull;
    if (existing != null) return existing;
    await loadSessions();
    final loaded =
        state.sessions.where((s) => s.targetId == targetId).firstOrNull;
    if (loaded != null) return loaded;
    final created = ChatSession(
      id: _privateSessionKey(targetId),
      type: 'private',
      targetId: targetId,
      targetName: targetName ?? targetId,
      targetAvatar: targetAvatar,
      unreadCount: 0,
      conversationType: 'private',
    );
    state = state.copyWith(sessions: [...state.sessions, created]);
    return created;
  }

  void addMessage(String sessionKey, Message message) {
    final normalizedKey = _normalizeIncomingSessionKey(sessionKey);
    final currentMessages = state.messages[normalizedKey] ?? [];
    final index = currentMessages.indexWhere(
      (m) =>
          m.id == message.id ||
          (message.clientMessageId != null &&
              m.clientMessageId == message.clientMessageId),
    );
    final updated = List<Message>.from(currentMessages);
    if (index == -1) {
      updated.add(message);
    } else {
      updated[index] = message;
    }
    state = state.copyWith(
      messages: {...state.messages, normalizedKey: updated},
    );
  }

  void _replaceMessage(String sessionKey, String oldId, Message newMessage) {
    final normalizedKey = _normalizeIncomingSessionKey(sessionKey);
    final currentMessages = state.messages[normalizedKey];
    if (currentMessages == null) {
      addMessage(normalizedKey, newMessage);
      return;
    }
    final index = currentMessages.indexWhere((m) =>
        m.id == oldId ||
        m.clientMessageId == oldId ||
        (newMessage.clientMessageId != null &&
            m.clientMessageId == newMessage.clientMessageId));
    if (index == -1) {
      addMessage(normalizedKey, newMessage);
      return;
    }
    final updated = List<Message>.from(currentMessages);
    updated[index] = newMessage;
    state = state.copyWith(
      messages: {...state.messages, normalizedKey: updated},
    );
  }

  void _updateMessageStatus(
      String sessionKey, String messageId, String status) {
    final normalizedKey = _normalizeIncomingSessionKey(sessionKey);
    final currentMessages = state.messages[normalizedKey];
    if (currentMessages == null) return;
    final index = currentMessages
        .indexWhere((m) => m.id == messageId || m.clientMessageId == messageId);
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
      messages: {...state.messages, normalizedKey: updated},
    );
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _messageApi.markRead(_normalizeIncomingSessionKey(conversationId));
    } catch (_) {}
  }

  String _sessionKeyForMessage(Message message) {
    if (message.isGroupChat) {
      return _sessionKeyForGroupTarget(message.groupId ?? '');
    }
    final currentUserId = _currentUserId();
    final targetId = message.senderId == currentUserId
        ? (message.receiverId ?? '')
        : message.senderId;
    return _sessionKeyForPrivateTarget(targetId);
  }

  String _sessionKeyForPrivateTarget(String targetId) {
    final normalizedTarget = _privateTargetFromSessionKey(targetId);
    final existing = state.sessions.where((s) {
      final isPrivate = s.type == 'private' || s.conversationType == 'private';
      return isPrivate &&
          (s.targetId == normalizedTarget ||
              s.id == targetId ||
              s.conversationId == targetId);
    }).firstOrNull;
    return existing?.id ?? _privateSessionKey(normalizedTarget);
  }

  String _sessionKeyForGroupTarget(String groupId) {
    final normalizedGroupId = _groupIdFromSessionKey(groupId);
    final existing = state.sessions.where((s) {
      final isGroup = s.type == 'group' || s.conversationType == 'group';
      return isGroup &&
          (s.targetId == normalizedGroupId ||
              s.id == groupId ||
              s.conversationId == groupId);
    }).firstOrNull;
    return existing?.id ?? _groupSessionKey(normalizedGroupId);
  }

  /// 获取群组的 canonical session key
  String getGroupSessionKey(String groupId) {
    return _sessionKeyForGroupTarget(groupId);
  }

  String _normalizeIncomingSessionKey(String sessionKey) {
    if (sessionKey.isEmpty) return sessionKey;
    final exact = state.sessions.where((s) => s.id == sessionKey).firstOrNull;
    if (exact != null) return exact.id;
    if (sessionKey.startsWith('group_') || sessionKey.startsWith('g_')) {
      return _sessionKeyForGroupTarget(sessionKey);
    }
    final group = state.sessions.where((s) {
      final isGroup = s.type == 'group' || s.conversationType == 'group';
      return isGroup &&
          (s.targetId == sessionKey || s.conversationId == sessionKey);
    }).firstOrNull;
    if (group != null) return group.id;
    return _sessionKeyForPrivateTarget(sessionKey);
  }

  String _privateSessionKey(String targetId) {
    final currentUserId = _currentUserId();
    if (currentUserId.isEmpty || targetId.isEmpty) return targetId;
    return _compareIds(currentUserId, targetId) <= 0
        ? '${currentUserId}_$targetId'
        : '${targetId}_$currentUserId';
  }

  String _groupSessionKey(String groupId) {
    final normalized = _groupIdFromSessionKey(groupId);
    return normalized.isEmpty ? groupId : 'group_$normalized';
  }

  String _privateTargetFromSessionKey(String sessionKey) {
    if (!sessionKey.contains('_')) return sessionKey;
    final currentUserId = _currentUserId();
    return sessionKey
            .split('_')
            .where((part) => part.isNotEmpty && part != currentUserId)
            .firstOrNull ??
        sessionKey;
  }

  String _groupIdFromSessionKey(String sessionKey) {
    if (sessionKey.startsWith('group_')) {
      return sessionKey.substring('group_'.length);
    }
    if (sessionKey.startsWith('g_')) {
      return sessionKey.substring('g_'.length);
    }
    return sessionKey;
  }

  int _compareIds(String left, String right) {
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

  @override
  void dispose() {
    _wsSubscription?.cancel();
    _outboxSubscription?.cancel();
    _networkSubscription?.cancel();
    super.dispose();
  }
}
