import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/network/network_status_provider.dart';
import '../data/message_api.dart';
import '../data/message_config.dart';
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
    super.loadingHistoryBySession,
    super.hasMoreHistoryBySession,
    super.oldestLoadedServerMessageIdBySession,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.isRetrying = false,
    this.isOffline = false,
    this.pendingNegotiations = const {},
  });

  final int pendingCount;
  final int failedCount;
  final bool isRetrying;
  final bool isOffline;
  final Map<String, E2eeNegotiationEvent> pendingNegotiations;

  E2eeNegotiationEvent? pendingNegotiationForSession(String sessionId) {
    return pendingNegotiations[sessionId];
  }

  E2eeNegotiationEvent? get activePendingNegotiation {
    final activeId = activeSessionId;
    if (activeId == null) return null;
    return pendingNegotiationForSession(activeId);
  }

  @override
  ChatStateWithOutbox copyWith({
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
    return ChatStateWithOutbox(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      error: error,
      loadingHistoryBySession: loadingHistoryBySession ?? this.loadingHistoryBySession,
      hasMoreHistoryBySession: hasMoreHistoryBySession ?? this.hasMoreHistoryBySession,
      oldestLoadedServerMessageIdBySession: oldestLoadedServerMessageIdBySession ?? this.oldestLoadedServerMessageIdBySession,
      pendingCount: pendingCount ?? this.pendingCount,
      failedCount: failedCount ?? this.failedCount,
      isRetrying: isRetrying ?? this.isRetrying,
      isOffline: isOffline ?? this.isOffline,
      pendingNegotiations: pendingNegotiations ?? this.pendingNegotiations,
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
  MessageConfig? _messageConfig;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _outboxSubscription;
  StreamSubscription? _networkSubscription;

  Map<String, E2eeNegotiationEvent> get pendingNegotiations =>
      Map.unmodifiable(state.pendingNegotiations);

  E2eeNegotiationEvent? get pendingNegotiation =>
      activePendingNegotiation ??
      (state.pendingNegotiations.isEmpty
          ? null
          : state.pendingNegotiations.values.first);

  E2eeNegotiationEvent? get activePendingNegotiation {
    final activeId = state.activeSessionId;
    if (activeId == null) return null;
    return pendingNegotiationForSession(activeId);
  }

  E2eeNegotiationEvent? pendingNegotiationForSession(String sessionId) {
    for (final key in _negotiationLookupKeys(sessionId)) {
      final event = state.pendingNegotiations[key];
      if (event != null) return event;
    }
    return null;
  }

  void clearPendingNegotiation([String? sessionId]) {
    if (state.pendingNegotiations.isEmpty) return;
    if (sessionId == null) {
      final activeId = state.activeSessionId;
      if (activeId != null && pendingNegotiationForSession(activeId) != null) {
        _removePendingNegotiation(activeId);
        return;
      }
      final firstKey = state.pendingNegotiations.keys.first;
      _removePendingNegotiation(firstKey);
      return;
    }
    _removePendingNegotiation(sessionId);
  }

  Future<bool> acceptPendingNegotiation(String sessionId) async {
    final event = pendingNegotiationForSession(sessionId);
    if (event == null) return false;
    final payloadJson = event.requestPayloadJson;
    if (payloadJson == null || payloadJson.isEmpty) return false;

    try {
      final decoded = jsonDecode(payloadJson);
      if (decoded is! Map<String, dynamic>) return false;
      decoded.putIfAbsent('senderUserId', () => event.requesterId);

      final accepted =
          await _e2eeManager.respondToNegotiation(event.sessionId, decoded);
      if (!accepted) return false;

      await _e2eeMetaStore.setSessionStatus(event.sessionId, 'encrypted');
      _removePendingNegotiation(event.sessionId);
      return true;
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to accept E2EE negotiation', e, st, 'e2ee');
      return false;
    }
  }

  Future<void> rejectPendingNegotiation(String sessionId) async {
    final event = pendingNegotiationForSession(sessionId);
    final targetSessionId = event?.sessionId ?? sessionId;
    try {
      await _e2eeManager.rejectNegotiation(targetSessionId);
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to reject E2EE negotiation', e, st, 'e2ee');
    } finally {
      await _e2eeMetaStore.setSessionStatus(targetSessionId, 'plaintext');
      _removePendingNegotiation(targetSessionId);
    }
  }

  Future<void> disableEncryptionForSession(String sessionId) async {
    try {
      await _e2eeManager.exitEncryption(sessionId);
    } finally {
      await _e2eeMetaStore.setSessionStatus(sessionId, 'plaintext');
      _removePendingNegotiation(sessionId);
    }
  }

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

  Future<void> _handleE2eeNegotiation(Map<String, dynamic> data) async {
    try {
      final action = E2eeNegotiationAction.fromString(
        (data['action']?.toString() ?? '').toLowerCase(),
      );
      final sessionId = data['sessionId']?.toString() ?? '';
      final requesterId = data['requesterId']?.toString() ?? '';
      final requesterName = data['requesterName']?.toString();
      final targetUserId = data['targetUserId']?.toString();
      final requestPayloadJson = data['requestPayloadJson']?.toString();

      if (sessionId.isEmpty) return;

      final event = E2eeNegotiationEvent(
        sessionId: sessionId,
        action: action,
        requesterId: requesterId,
        requesterName: requesterName,
        targetUserId: targetUserId,
        requestPayloadJson: requestPayloadJson,
      );

      switch (action) {
        case E2eeNegotiationAction.request:
          _setPendingNegotiation(event);
          await _e2eeMetaStore.setSessionStatus(sessionId, 'negotiating');
        case E2eeNegotiationAction.accepted:
          await _e2eeMetaStore.setSessionStatus(sessionId, 'encrypted');
          await _e2eeMetaStore.clearPendingHandshake(sessionId);
          _removePendingNegotiation(sessionId);
        case E2eeNegotiationAction.rejected:
        case E2eeNegotiationAction.disabled:
          await _e2eeMetaStore.setSessionStatus(sessionId, 'plaintext');
          await _e2eeMetaStore.clearPendingHandshake(sessionId);
          _removePendingNegotiation(sessionId);
      }
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to handle E2EE negotiation', e, st, 'e2ee');
    }
  }

  void _setPendingNegotiation(E2eeNegotiationEvent event) {
    final key = _normalizeE2eeSessionKey(event.sessionId);
    state = state.copyWith(
      pendingNegotiations: {
        ...state.pendingNegotiations,
        key.isEmpty ? event.sessionId : key: event,
      },
    );
  }

  void _removePendingNegotiation(String sessionId) {
    final keys = _negotiationLookupKeys(sessionId);
    final updated = Map<String, E2eeNegotiationEvent>.from(
      state.pendingNegotiations,
    )..removeWhere((key, event) {
        return keys.contains(key) ||
            _negotiationLookupKeys(event.sessionId).any(keys.contains);
      });
    state = state.copyWith(pendingNegotiations: updated);
  }

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessions = await _messageApi.getConversations();
      // Preserve locally-created session that server hasn't returned yet.
      final activeId = state.activeSessionId;
      if (activeId != null && !sessions.any((s) => s.id == activeId)) {
        final localSession =
            state.sessions.where((s) => s.id == activeId).firstOrNull;
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
      final oldestId = _findOldestLoadedServerMessageId(messages);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: messages},
        isLoading: false,
        hasMoreHistoryBySession: {
          ...state.hasMoreHistoryBySession,
          sessionKey: messages.length >= (size ?? 20),
        },
        oldestLoadedServerMessageIdBySession: {
          ...state.oldestLoadedServerMessageIdBySession,
          if (oldestId != null) sessionKey: oldestId,
        },
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
      final oldestId = _findOldestLoadedServerMessageId(messages);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: messages},
        isLoading: false,
        hasMoreHistoryBySession: {
          ...state.hasMoreHistoryBySession,
          sessionKey: messages.length >= (size ?? 20),
        },
        oldestLoadedServerMessageIdBySession: {
          ...state.oldestLoadedServerMessageIdBySession,
          if (oldestId != null) sessionKey: oldestId,
        },
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadMoreHistory(String sessionId, {int size = 20}) async {
    if (state.loadingHistoryBySession[sessionId] == true) {
      return;
    }

    if (!state.messages.containsKey(sessionId)) {
      return;
    }

    final session = state.sessions.where((s) => s.id == sessionId).firstOrNull;
    if (session == null) {
      return;
    }

    final existingMessages = state.messages[sessionId] ?? [];
    final oldestMessageId =
        state.oldestLoadedServerMessageIdBySession[sessionId] ??
            _findOldestLoadedServerMessageId(existingMessages);

    if (oldestMessageId == null) {
      state = state.copyWith(
        hasMoreHistoryBySession: {
          ...state.hasMoreHistoryBySession,
          sessionId: false,
        },
      );
      return;
    }

    state = state.copyWith(
      loadingHistoryBySession: {
        ...state.loadingHistoryBySession,
        sessionId: true,
      },
    );

    try {
      final isGroup = session.type == 'group' || session.conversationType == 'group';
      List<Message> newMessages;

      try {
        if (isGroup) {
          newMessages = await _messageApi.getGroupHistoryCursor(
            session.targetId,
            limit: size,
            lastMessageId: oldestMessageId,
          );
        } else {
          newMessages = await _messageApi.getPrivateHistoryCursor(
            session.targetId,
            limit: size,
            lastMessageId: oldestMessageId,
          );
        }
      } catch (e) {
        final fallbackPage = _fallbackHistoryPageBySession(sessionId);
        if (isGroup) {
          newMessages = await _messageApi.getGroupHistory(
            session.targetId,
            page: fallbackPage,
            size: size,
          );
        } else {
          newMessages = await _messageApi.getPrivateHistory(
            session.targetId,
            page: fallbackPage,
            size: size,
          );
        }
        _incrementFallbackHistoryPage(sessionId);
      }

      final merged = _mergeMessagesChronologically(existingMessages, newMessages);
      final hasMore = newMessages.length >= size;

      final oldestId = _findOldestLoadedServerMessageId(merged);

      state = state.copyWith(
        messages: {...state.messages, sessionId: merged},
        loadingHistoryBySession: {
          ...state.loadingHistoryBySession,
          sessionId: false,
        },
        hasMoreHistoryBySession: {
          ...state.hasMoreHistoryBySession,
          sessionId: hasMore,
        },
        oldestLoadedServerMessageIdBySession: {
          ...state.oldestLoadedServerMessageIdBySession,
          if (oldestId != null) sessionId: oldestId,
        },
      );
    } catch (e) {
      state = state.copyWith(
        loadingHistoryBySession: {
          ...state.loadingHistoryBySession,
          sessionId: false,
        },
      );
    }
  }

  String? _findOldestLoadedServerMessageId(List<Message> messages) {
    String? oldestId;
    for (final msg in messages) {
      if (msg.id.startsWith('local_')) continue;
      if (oldestId == null) {
        oldestId = msg.id;
      } else {
        final currentId = BigInt.tryParse(msg.id);
        final oldestBigInt = BigInt.tryParse(oldestId);
        if (currentId != null && oldestBigInt != null) {
          if (currentId < oldestBigInt) {
            oldestId = msg.id;
          }
        } else if (msg.id.compareTo(oldestId) < 0) {
          oldestId = msg.id;
        }
      }
    }
    return oldestId;
  }

  List<Message> _mergeMessagesChronologically(
      List<Message> existing, List<Message> incoming) {
    final merged = <String, Message>{};

    for (final msg in existing) {
      merged[msg.id] = msg;
      if (msg.clientMessageId != null) {
        merged[msg.clientMessageId!] = msg;
      }
    }

    for (final msg in incoming) {
      final existingMsg = merged[msg.id] ?? (msg.clientMessageId != null ? merged[msg.clientMessageId!] : null);
      if (existingMsg != null) {
        final mergedMsg = Message(
          id: existingMsg.id,
          senderId: existingMsg.senderId,
          receiverId: existingMsg.receiverId,
          isGroupChat: existingMsg.isGroupChat,
          messageType: existingMsg.messageType,
          content: msg.content.isNotEmpty ? msg.content : existingMsg.content,
          sendTime: existingMsg.sendTime,
          status: msg.status.isNotEmpty ? msg.status : existingMsg.status,
          clientMessageId: existingMsg.clientMessageId,
          groupId: existingMsg.groupId,
          senderName: existingMsg.senderName,
          senderAvatar: existingMsg.senderAvatar,
          mediaUrl: msg.mediaUrl ?? existingMsg.mediaUrl,
          mediaSize: msg.mediaSize ?? existingMsg.mediaSize,
          mediaName: msg.mediaName ?? existingMsg.mediaName,
          thumbnailUrl: msg.thumbnailUrl ?? existingMsg.thumbnailUrl,
          duration: msg.duration ?? existingMsg.duration,
          encrypted: msg.encrypted ?? existingMsg.encrypted,
          decryptStatus: msg.decryptStatus ?? existingMsg.decryptStatus,
          e2eeEnvelope: msg.e2eeEnvelope ?? existingMsg.e2eeEnvelope,
        );
        merged[msg.id] = mergedMsg;
        if (msg.clientMessageId != null) {
          merged[msg.clientMessageId!] = mergedMsg;
        }
      } else {
        merged[msg.id] = msg;
        if (msg.clientMessageId != null) {
          merged[msg.clientMessageId!] = msg;
        }
      }
    }

    final result = merged.values.toList();
    result.sort((a, b) {
      final timeA = DateTime.tryParse(a.sendTime) ?? DateTime(2000);
      final timeB = DateTime.tryParse(b.sendTime) ?? DateTime(2000);
      return timeA.compareTo(timeB);
    });

    return result;
  }

  final Map<String, int> _fallbackHistoryPages = {};

  int _fallbackHistoryPageBySession(String sessionId) {
    return _fallbackHistoryPages[sessionId] ?? 1;
  }

  void _incrementFallbackHistoryPage(String sessionId) {
    _fallbackHistoryPages[sessionId] = (_fallbackHistoryPages[sessionId] ?? 1) + 1;
  }

  Future<MessageConfig> _ensureMessageConfig() async {
    if (_messageConfig != null) return _messageConfig!;
    try {
      _messageConfig = await _messageApi.getConfig();
    } catch (_) {
      _messageConfig = defaultMessageConfig;
    }
    return _messageConfig!;
  }

  Future<Message?> sendMessage(String receiverId, String content,
      {String messageType = 'TEXT',
      String? clientMessageId,
      String? mediaUrl,
      String? mediaName,
      int? mediaSize,
      String? thumbnailUrl,
      int? duration}) async {
    // Text splitting: only applies to TEXT messages with enforce enabled.
    if (messageType == 'TEXT') {
      final config = await _ensureMessageConfig();
      if (config.textEnforce && config.textMaxLength > 0) {
        final parts = splitTextByCodePoints(content, config.textMaxLength);
        if (parts.length > 1) {
          Message? lastResult;
          for (final part in parts) {
            lastResult = await _sendSinglePrivateMessage(
              receiverId, part,
              messageType: messageType,
              mediaUrl: mediaUrl,
              mediaName: mediaName,
              mediaSize: mediaSize,
              thumbnailUrl: thumbnailUrl,
              duration: duration,
            );
            if (lastResult == null) return null;
          }
          return lastResult;
        }
      }
    }
    return _sendSinglePrivateMessage(
      receiverId, content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
  }

  Future<Message?> _sendSinglePrivateMessage(
      String receiverId, String content,
      {String messageType = 'TEXT',
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
      {String messageType = 'TEXT',
      String? clientMessageId,
      String? mediaUrl,
      String? mediaName,
      int? mediaSize,
      String? thumbnailUrl,
      int? duration,
      List<String>? mentionedUserIds}) async {
    // Text splitting: only applies to TEXT messages with enforce enabled.
    if (messageType == 'TEXT') {
      final config = await _ensureMessageConfig();
      if (config.textEnforce && config.textMaxLength > 0) {
        final parts = splitTextByCodePoints(content, config.textMaxLength);
        if (parts.length > 1) {
          Message? lastResult;
          for (final part in parts) {
            lastResult = await _sendSingleGroupMessage(
              groupId, part,
              messageType: messageType,
              mediaUrl: mediaUrl,
              mediaName: mediaName,
              mediaSize: mediaSize,
              thumbnailUrl: thumbnailUrl,
              duration: duration,
              mentionedUserIds: mentionedUserIds,
            );
            if (lastResult == null) return null;
          }
          return lastResult;
        }
      }
    }
    return _sendSingleGroupMessage(
      groupId, content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
      mentionedUserIds: mentionedUserIds,
    );
  }

  Future<Message?> _sendSingleGroupMessage(String groupId, String content,
      {String messageType = 'TEXT',
      String? clientMessageId,
      String? mediaUrl,
      String? mediaName,
      int? mediaSize,
      String? thumbnailUrl,
      int? duration,
      List<String>? mentionedUserIds}) async {
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
          mentionedUserIds: mentionedUserIds,
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
      await _messageApi.markRead(_readConversationIdForSessionKey(
        _normalizeIncomingSessionKey(conversationId),
      ));
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

  String _readConversationIdForSessionKey(String sessionKey) {
    final session = state.sessions.where((s) => s.id == sessionKey).firstOrNull;
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
    return _privateTargetFromSessionKey(sessionKey);
  }

  Set<String> _negotiationLookupKeys(String sessionId) {
    final keys = <String>{sessionId};
    if (sessionId.isEmpty) return keys;

    final normalizedChatKey = _normalizeE2eeSessionKey(sessionId);
    if (normalizedChatKey.isNotEmpty) keys.add(normalizedChatKey);

    final session = state.sessions
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
        keys.add(_groupSessionKey(session.targetId));
      } else {
        keys.add(_privateSessionKey(session.targetId));
        keys.add('${_currentUserId()}_private_${session.targetId}');
        keys.add('${session.targetId}_private_${_currentUserId()}');
      }
    }
    return keys;
  }

  String _normalizeE2eeSessionKey(String sessionId) {
    final exact = state.sessions.where((s) => s.id == sessionId).firstOrNull;
    if (exact != null) return exact.id;
    if (sessionId.contains('_private_')) {
      return _privateSessionKey(_privateTargetFromE2eeSessionId(sessionId));
    }
    if (sessionId.startsWith('group_') || sessionId.startsWith('g_')) {
      return _sessionKeyForGroupTarget(sessionId);
    }
    final session = state.sessions
        .where((s) => s.conversationId == sessionId || s.targetId == sessionId)
        .firstOrNull;
    return session?.id ?? sessionId;
  }

  String _privateTargetFromE2eeSessionId(String sessionId) {
    final currentUserId = _currentUserId();
    return sessionId
            .split('_private_')
            .where((part) => part.isNotEmpty && part != currentUserId)
            .firstOrNull ??
        sessionId;
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
