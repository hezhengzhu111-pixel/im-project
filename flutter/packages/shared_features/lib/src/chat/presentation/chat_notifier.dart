// ignore_for_file: unnecessary_non_null_assertion

import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/message_api.dart';
import '../data/message_config.dart';
import '../data/message_merge_utils.dart';
import '../data/message_pipeline.dart';
import 'chat_state.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'dart:convert';
import 'package:im_shared_features/e2ee.dart' show E2eeManager, E2eeMetaStore;
import '../data/outbox_port.dart';
import '../data/e2ee_history_recovery.dart';
import '../data/session_key_codec.dart';
import '../data/retryable_error_classifier.dart';
import '../data/sent_message_cache_port.dart';

/// Simplified chat notifier for desktop (no IndexedDB outbox).
class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(
    this._messageApi,
    this._pipeline,
    this._wsClient,
    this._currentUserId, {
    E2eeManager? e2eeManager,
    E2eeMetaStore? e2eeMetaStore,
    SentMessageCachePort? sentMessageCache,
    OutboxPort? outbox,
  })  : _e2eeManager = e2eeManager,
        _e2eeMetaStore = e2eeMetaStore,
        _sentMessageCache = sentMessageCache,
        _outbox = outbox,
        super(const ChatState()) {
    _subscribeToWs();
    _subscribeToOutbox();
    unawaited(_warmUpE2eeDeviceRegistration());
    _startE2eePendingPolling();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  final String? Function() _currentUserId;

  /// Optional E2EE dependencies.
  final E2eeManager? _e2eeManager;
  final E2eeMetaStore? _e2eeMetaStore;
  final SentMessageCachePort? _sentMessageCache;

  /// Optional outbox for offline retry.
  final OutboxPort? _outbox;

  MessageConfig? _messageConfig;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _wsStateSubscription;
  StreamSubscription? _outboxSubscription;
  Timer? _e2eePendingPollTimer;
  bool _e2eePendingPollInFlight = false;
  final Set<String> _inFlightSendFingerprints = <String>{};

  bool get _e2eeAvailable => _e2eeManager != null && _e2eeMetaStore != null;

  Map<String, E2eeNegotiationEvent> get pendingNegotiations =>
      Map.unmodifiable(state.pendingNegotiations);

  Future<void> _warmUpE2eeDeviceRegistration() async {
    if (!_e2eeAvailable) return;
    try {
      await _e2eeManager!.ensureDeviceRegistered();
    } catch (e, st) {
      AppLogger.instance.warn('E2EE device registration warm-up failed', e, st);
    }
  }

  void _startE2eePendingPolling() {
    if (!_e2eeAvailable) return;
    _e2eePendingPollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      unawaited(_pollPendingNegotiations());
    });
  }

  Future<void> _pollPendingNegotiations() async {
    if (_e2eePendingPollInFlight) return;
    _e2eePendingPollInFlight = true;
    try {
      await loadPendingNegotiations();
    } finally {
      _e2eePendingPollInFlight = false;
    }
  }

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
      _removePendingNegotiation(state.pendingNegotiations.keys.first);
      return;
    }
    _removePendingNegotiation(sessionId);
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
    _wsStateSubscription = _wsClient.connectionState.listen((wsState) {
      if (wsState == WsConnectionState.connected) {
        _syncOfflineMessages();
      }
    });
  }

  void _subscribeToOutbox() {
    if (_outbox == null) return;
    _outboxSubscription = _outbox!.events.listen((event) {
      switch (event.type) {
        case OutboxEventType.messageAdded:
          _updateOutboxCounts();
        case OutboxEventType.messageRetrying:
          state = state.copyWith(isRetrying: true);
          _updateOutboxCounts();
        case OutboxEventType.messageSent:
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

  Future<void> _updateOutboxCounts() async {
    if (_outbox == null) return;
    try {
      final pending = await _outbox!.getPendingCount();
      final failed = await _outbox!.getFailedCount();
      state = state.copyWith(pendingCount: pending, failedCount: failed);
    } on StateError {
      // Notifier disposed, ignore
    }
  }

  void _handleOutboxMessageSent(Message message) {
    final sessionKey =
        _normalizeIncomingSessionKey(_sessionKeyForMessage(message));
    final messages = state.messages[sessionKey];
    if (messages == null) return;

    final index = messages.indexWhere(
      (m) =>
          m.id == message.id ||
          (message.clientMessageId != null &&
              m.clientMessageId == message.clientMessageId),
    );
    if (index == -1) return;

    final updated = List<Message>.from(messages);
    final old = updated[index];
    updated[index] = old.copyWith(status: 'SENT');

    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  Future<void> retryAllFailed() async {
    if (_outbox == null) return;
    await _outbox!.retryAllFailed(_sendOutboxMessage);
  }

  String _sendFingerprint({
    required String sessionKey,
    required String messageType,
    required String content,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration,
  }) {
    return jsonEncode([
      _normalizeIncomingSessionKey(sessionKey),
      messageType.toUpperCase(),
      content,
      mediaUrl ?? '',
      mediaName ?? '',
      mediaSize,
      thumbnailUrl ?? '',
      duration,
    ]);
  }

  bool _beginInFlightSend(String fingerprint) {
    if (_inFlightSendFingerprints.contains(fingerprint)) {
      return false;
    }
    _inFlightSendFingerprints.add(fingerprint);
    return true;
  }

  void _endInFlightSend(String fingerprint) {
    _inFlightSendFingerprints.remove(fingerprint);
  }

  Future<Message?> _sendOutboxMessage(OutboxMessage outboxMsg) async {
    if (outboxMsg.isEncrypted) {
      final envelope = _tryGetEnvelopeForOutbox(outboxMsg);
      if (envelope == null) {
        throw Exception('encrypted_outbox_missing_envelope');
      }
      if (outboxMsg.e2eeDeviceId == null || outboxMsg.e2eeDeviceId!.isEmpty) {
        throw Exception('encrypted_outbox_missing_device_id');
      }
      return _messageApi.sendPrivateEncrypted(
        receiverId: outboxMsg.receiverId,
        clientMessageId: outboxMsg.clientMessageId,
        messageType: outboxMsg.messageType,
        e2eeEnvelope: E2eeHistoryRecovery.envelopeToApiJson(envelope),
        e2eeDeviceId: outboxMsg.e2eeDeviceId!,
        mediaUrl: outboxMsg.mediaUrl,
        mediaName: outboxMsg.mediaName,
        mediaSize: outboxMsg.mediaSize,
        thumbnailUrl: outboxMsg.thumbnailUrl,
        duration: outboxMsg.duration,
      );
    } else {
      return _messageApi.sendPrivateMessage(
        SendPrivateMessageRequest(
          receiverId: outboxMsg.receiverId,
          content: outboxMsg.content,
          messageType: outboxMsg.messageType,
          clientMessageId: outboxMsg.clientMessageId,
          mediaUrl: outboxMsg.mediaUrl,
          mediaName: outboxMsg.mediaName,
          mediaSize: outboxMsg.mediaSize,
          thumbnailUrl: outboxMsg.thumbnailUrl,
          duration: outboxMsg.duration,
        ),
      );
    }
  }

  /// Retry pending outbox messages if any exist.
  ///
  /// Exposed for testing the network recovery → outbox retry glue.
  Future<void> retryPendingOutboxIfNeeded() async {
    if (_outbox == null) return;
    final pendingCount = await _outbox!.getPendingCount();
    if (pendingCount > 0) {
      await _outbox!.retryAllFailed(_sendOutboxMessage);
    }
  }

  Future<void> _syncOfflineMessages() async {
    try {
      await loadSessions();
      await _syncKnownE2eeStatuses();
      // Auto-retry pending outbox messages on network recovery.
      await retryPendingOutboxIfNeeded();
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
    } catch (e, st) {
      AppLogger.instance.warn('Failed to sync offline messages', e, st);
    }
  }

  void _handleIncomingMessage(Map<String, dynamic> data) {
    try {
      final message = Message.fromJson(data);
      if (!_pipeline.shouldProcess(message.id)) return;

      // Decrypt E2EE messages from other users.
      final currentUserId = _currentUserId();
      if (_e2eeAvailable &&
          message.encrypted == true &&
          message.e2eeEnvelope != null &&
          message.senderId != currentUserId) {
        _decryptAndAdd(message, data['e2eeEnvelope'] as Map<String, dynamic>?);
        return;
      }

      final sessionKey = _sessionKeyForMessage(message);
      if (sessionKey.isEmpty) return;
      addMessage(sessionKey, message);

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
          _e2eeSessionIdForPrivateTarget(message.senderId);

      final snakeEnvelope =
          rawEnvelope != null ? _camelToSnakeEnvelope(rawEnvelope) : null;

      if (snakeEnvelope == null) {
        addMessage(sessionKey, message.copyWith(decryptStatus: 'failed'));
        return;
      }

      final plaintext = await _e2eeManager!.decryptEnvelope(
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
          return m.copyWith(status: 'READ');
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

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessions = await _messageApi.getConversations();
      final activeId = state.activeSessionId;
      if (activeId != null && !sessions.any((s) => s.id == activeId)) {
        final localSession =
            state.sessions.where((s) => s.id == activeId).firstOrNull;
        if (localSession != null) {
          sessions.add(localSession);
        }
      }
      state = state.copyWith(sessions: sessions, isLoading: false);
      await loadPendingNegotiations();
      await _syncKnownE2eeStatuses();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setActiveSession(String? sessionId) {
    final normalized =
        sessionId == null ? null : _normalizeIncomingSessionKey(sessionId);
    state = state.copyWith(
      activeSessionId: normalized,
      sessions: normalized == null
          ? state.sessions
          : _sessionsWithClearedUnread(normalized),
    );
    if (normalized != null) {
      markRead(normalized);
    }
  }

  Future<void> loadMessages(String targetId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessionKey = _sessionKeyForPrivateTarget(targetId);
      final history =
          await _messageApi.getPrivateHistory(targetId, page: page, size: size);
      final existingMessages = state.messages[sessionKey] ?? <Message>[];
      final sortedHistory =
          _mergeMessagesChronologically(existingMessages, history);
      final messages = _e2eeAvailable
          ? await _decryptLoadedMessages(sortedHistory)
          : sortedHistory;
      _ensureE2eeSessionKeyInMessages(messages);
      final oldestId = _findOldestLoadedServerMessageId(messages);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: messages},
        isLoading: false,
        hasMoreHistoryBySession: {
          ...state.hasMoreHistoryBySession,
          sessionKey: history.length >= (size ?? 20),
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
      final history =
          await _messageApi.getGroupHistory(groupId, page: page, size: size);
      final existingMessages = state.messages[sessionKey] ?? <Message>[];
      final sortedHistory =
          _mergeMessagesChronologically(existingMessages, history);
      final messages = _e2eeAvailable
          ? await _decryptLoadedMessages(sortedHistory)
          : sortedHistory;
      _ensureE2eeSessionKeyInMessages(messages);
      final oldestId = _findOldestLoadedServerMessageId(messages);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: messages},
        isLoading: false,
        hasMoreHistoryBySession: {
          ...state.hasMoreHistoryBySession,
          sessionKey: history.length >= (size ?? 20),
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
    if (state.loadingHistoryBySession[sessionId] == true) return;
    if (!state.messages.containsKey(sessionId)) return;

    final session = state.sessions.where((s) => s.id == sessionId).firstOrNull;
    if (session == null) return;

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
      final isGroup =
          session.type == 'group' || session.conversationType == 'group';
      final newMessages = isGroup
          ? await _messageApi.getGroupHistoryCursor(session.targetId,
              limit: size, lastMessageId: oldestMessageId)
          : await _messageApi.getPrivateHistoryCursor(session.targetId,
              limit: size, lastMessageId: oldestMessageId);

      final merged =
          _mergeMessagesChronologically(existingMessages, newMessages);
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
          if (currentId < oldestBigInt) oldestId = msg.id;
        } else if (msg.id.compareTo(oldestId) < 0) {
          oldestId = msg.id;
        }
      }
    }
    return oldestId;
  }

  List<Message> _mergeMessagesChronologically(
      List<Message> existing, List<Message> incoming) {
    return mergeMessagesChronologically(existing, incoming);
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
      int? duration,
      Map<String, dynamic>? extra}) async {
    if (messageType == 'TEXT') {
      final config = await _ensureMessageConfig();
      if (config.textEnforce && config.textMaxLength > 0) {
        final parts = splitTextByCodePoints(content, config.textMaxLength);
        if (parts.length > 1) {
          Message? lastResult;
          for (final part in parts) {
            lastResult = await _sendSinglePrivateMessage(
              receiverId,
              part,
              messageType: messageType,
              mediaUrl: mediaUrl,
              mediaName: mediaName,
              mediaSize: mediaSize,
              thumbnailUrl: thumbnailUrl,
              duration: duration,
              extra: extra,
            );
            if (lastResult == null) return null;
          }
          return lastResult;
        }
      }
    }
    return _sendSinglePrivateMessage(
      receiverId,
      content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
      extra: extra,
    );
  }

  Future<Message?> _sendSinglePrivateMessage(String receiverId, String content,
      {String messageType = 'TEXT',
      String? clientMessageId,
      String? mediaUrl,
      String? mediaName,
      int? mediaSize,
      String? thumbnailUrl,
      int? duration,
      Map<String, dynamic>? extra}) async {
    final cid =
        clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final currentUid = _currentUserId();
    if (currentUid == null || currentUid.isEmpty) {
      state = state.copyWith(error: 'user_not_authenticated');
      return null;
    }
    final sessionKey = _sessionKeyForPrivateTarget(receiverId);
    final e2eeSessionId = _e2eeSessionIdForPrivateTarget(receiverId);
    final sendFingerprint = _sendFingerprint(
      sessionKey: sessionKey,
      messageType: messageType,
      content: content,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
    if (!_beginInFlightSend(sendFingerprint)) return null;

    try {
      // Check E2EE session status before sending.
      String e2eeStatus = 'plaintext';
      if (_e2eeAvailable) {
        try {
          e2eeStatus = await _e2eeMetaStore!.getSessionStatus(e2eeSessionId);
        } catch (_) {}
      }

      if (_e2eeAvailable &&
          (e2eeStatus == 'negotiating' || e2eeStatus == 'encrypted')) {
        final syncedStatus =
            await _e2eeManager!.syncSessionStatus(e2eeSessionId);
        if (e2eeStatus == 'encrypted' && syncedStatus == 'plaintext') {
          state = state.copyWith(error: 'e2ee_session_disabled');
          _removePendingNegotiation(e2eeSessionId);
          return null;
        }
        e2eeStatus = syncedStatus;
      }

      if (_e2eeAvailable && e2eeStatus == 'negotiating') {
        state = state.copyWith(error: 'e2ee_not_ready');
        return null;
      }
      if (_e2eeAvailable && e2eeStatus == 'failed') {
        await _e2eeMetaStore!.setSessionStatus(e2eeSessionId, 'plaintext');
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
        encrypted: _e2eeAvailable && e2eeStatus == 'encrypted',
        decryptStatus: (_e2eeAvailable && e2eeStatus == 'encrypted')
            ? 'skipped_own'
            : null,
        mediaUrl: mediaUrl,
        mediaName: mediaName,
        mediaSize: mediaSize,
        thumbnailUrl: thumbnailUrl,
        duration: duration,
      );
      addMessage(sessionKey, pendingMessage);

      Map<String, dynamic>? encryptedEnvelope;
      String? encryptedDeviceId;

      try {
        Message serverMessage;
        if (_e2eeAvailable && e2eeStatus == 'encrypted') {
          final e2eeManager = _e2eeManager!;
          final senderDeviceId = await _e2eeMetaStore!.getOrCreateDeviceId();
          final recipientDeviceId =
              await _e2eeMetaStore!.getRemoteDeviceId(e2eeSessionId);
          if (recipientDeviceId == null || recipientDeviceId.isEmpty) {
            throw Exception('remote device ID not found for session');
          }

          encryptedDeviceId = senderDeviceId;
          encryptedEnvelope = await e2eeManager.encryptToEnvelope(
            sessionId: e2eeSessionId,
            senderDeviceId: senderDeviceId,
            recipientDeviceId: recipientDeviceId,
            plaintext: content,
          );
          _updateMessageE2eeMetadata(
            sessionKey: sessionKey,
            messageId: cid,
            envelope: encryptedEnvelope,
            deviceId: senderDeviceId,
          );

          serverMessage = await _messageApi.sendPrivateEncrypted(
            receiverId: receiverId,
            clientMessageId: cid,
            messageType: messageType,
            e2eeEnvelope: E2eeHistoryRecovery.envelopeToApiJson(
              encryptedEnvelope,
            ),
            e2eeDeviceId: senderDeviceId,
            mediaUrl: mediaUrl,
            mediaName: mediaName,
            mediaSize: mediaSize,
            thumbnailUrl: thumbnailUrl,
            duration: duration,
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
              extra: extra,
            ),
          );
        }
        _replaceMessage(sessionKey, cid, serverMessage);

        // Cache plaintext for own sent E2EE messages to enable history recovery.
        if (_e2eeAvailable &&
            e2eeStatus == 'encrypted' &&
            _sentMessageCache != null) {
          await _sentMessageCache!.put(
            clientMessageId: cid,
            plaintext: content,
            e2eeSessionId: e2eeSessionId,
            serverMessageId: serverMessage.id,
          );
        }

        return serverMessage;
      } catch (e, st) {
        AppLogger.instance.error('Send message failed', e, st);

        if (_e2eeAvailable &&
            e2eeStatus == 'encrypted' &&
            encryptedEnvelope == null) {
          state = state.copyWith(error: 'e2ee_encrypt_failed');
          _updateMessageStatus(sessionKey, cid, 'FAILED');
          return null;
        }

        // Only enqueue to outbox for retryable errors (network/temporary).
        final decision = RetryableErrorClassifier.classifySendError(e);
        if (decision.retryable && _outbox != null) {
          await _outbox!.enqueue(OutboxMessage(
            id: cid,
            sessionKey: sessionKey,
            receiverId: receiverId,
            content: content,
            messageType: messageType,
            clientMessageId: cid,
            mediaUrl: mediaUrl,
            mediaName: mediaName,
            mediaSize: mediaSize,
            thumbnailUrl: thumbnailUrl,
            duration: duration,
            extra: extra,
            isEncrypted: _e2eeAvailable && e2eeStatus == 'encrypted',
            e2eeEnvelope: encryptedEnvelope,
            e2eeDeviceId: encryptedDeviceId,
          ));
          _updateMessageStatus(sessionKey, cid, 'PENDING');
        } else {
          final errorMsg = decision.safeMessage ?? e.toString();
          state = state.copyWith(error: errorMsg);
          _updateMessageStatus(sessionKey, cid, 'FAILED');
        }
        return null;
      }
    } finally {
      _endInFlightSend(sendFingerprint);
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
      List<String>? mentionedUserIds,
      Map<String, dynamic>? extra}) async {
    if (messageType == 'TEXT') {
      final config = await _ensureMessageConfig();
      if (config.textEnforce && config.textMaxLength > 0) {
        final parts = splitTextByCodePoints(content, config.textMaxLength);
        if (parts.length > 1) {
          Message? lastResult;
          for (final part in parts) {
            lastResult = await _sendSingleGroupMessage(
              groupId,
              part,
              messageType: messageType,
              mediaUrl: mediaUrl,
              mediaName: mediaName,
              mediaSize: mediaSize,
              thumbnailUrl: thumbnailUrl,
              duration: duration,
              mentionedUserIds: mentionedUserIds,
              extra: extra,
            );
            if (lastResult == null) return null;
          }
          return lastResult;
        }
      }
    }
    return _sendSingleGroupMessage(
      groupId,
      content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
      mentionedUserIds: mentionedUserIds,
      extra: extra,
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
      List<String>? mentionedUserIds,
      Map<String, dynamic>? extra}) async {
    final cid =
        clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    final currentUserId = _currentUserId();
    if (currentUserId == null || currentUserId.isEmpty) {
      state = state.copyWith(error: 'user_not_authenticated');
      return null;
    }
    final sessionKey = _sessionKeyForGroupTarget(groupId);
    final sendFingerprint = _sendFingerprint(
      sessionKey: sessionKey,
      messageType: messageType,
      content: content,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
    if (!_beginInFlightSend(sendFingerprint)) return null;

    try {
      final pendingMessage = Message(
        id: cid,
        senderId: currentUserId,
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
            extra: extra,
          ),
        );
        _replaceMessage(sessionKey, cid, serverMessage);
        return serverMessage;
      } catch (e, st) {
        AppLogger.instance.error('Send group message failed', e, st);
        _updateMessageStatus(sessionKey, cid, 'FAILED');
        state = state.copyWith(error: e.toString());
        return null;
      }
    } finally {
      _endInFlightSend(sendFingerprint);
    }
  }

  Map<String, dynamic>? _tryGetEnvelopeForOutbox(OutboxMessage outboxMsg) {
    if (outboxMsg.e2eeEnvelope == null) return null;
    return Map<String, dynamic>.from(outboxMsg.e2eeEnvelope!);
  }

  void _updateMessageE2eeMetadata({
    required String sessionKey,
    required String messageId,
    required Map<String, dynamic> envelope,
    required String deviceId,
  }) {
    final normalizedKey = _normalizeIncomingSessionKey(sessionKey);
    final currentMessages = state.messages[normalizedKey];
    if (currentMessages == null) return;
    final index = currentMessages
        .indexWhere((m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final updated = List<Message>.from(currentMessages);
    final old = updated[index];
    updated[index] = old.copyWith(
      encrypted: true,
      e2eeDeviceId: _nonEmptyOr(deviceId, old.e2eeDeviceId),
      e2eeEnvelope: _tryE2eeEnvelope(envelope) ?? old.e2eeEnvelope,
      decryptStatus: old.decryptStatus ?? 'skipped_own',
    );
    state = state.copyWith(
      messages: {...state.messages, normalizedKey: updated},
    );
  }

  E2eeEnvelope? _tryE2eeEnvelope(Map<String, dynamic> envelope) {
    try {
      return E2eeEnvelope.fromJson(envelope);
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> _camelToSnakeEnvelope(Map<String, dynamic> camel) {
    return E2eeHistoryRecovery.camelToSnakeEnvelope(camel);
  }

  String _e2eeSessionIdForPrivateTarget(String targetId) {
    return SessionKeyCodec.e2eeSessionIdForPrivate(
        _currentUserId() ?? '', targetId);
  }

  String _normalizeE2eeSessionKey(String sessionId) {
    return SessionKeyCodec.normalizeE2eeSessionKey(
      sessionId,
      state.sessions,
      currentUserId: _currentUserId(),
    );
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
      updated[index] = _mergeMessageReplacement(updated[index], message);
    }
    final sorted = _mergeMessagesChronologically(<Message>[], updated);
    state = state.copyWith(
      messages: {...state.messages, normalizedKey: sorted},
      sessions: _sessionsWithMessage(
        normalizedKey,
        message,
        countUnread: index == -1,
      ),
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
    updated[index] = _mergeMessageReplacement(updated[index], newMessage);
    final sorted = _mergeMessagesChronologically(<Message>[], updated);
    state = state.copyWith(
      messages: {...state.messages, normalizedKey: sorted},
      sessions: _sessionsWithMessage(
        normalizedKey,
        newMessage,
        countUnread: false,
      ),
    );
  }

  List<ChatSession> _sessionsWithClearedUnread(String sessionKey) {
    final index =
        state.sessions.indexWhere((session) => session.id == sessionKey);
    if (index == -1 || state.sessions[index].unreadCount == 0) {
      return state.sessions;
    }
    final updated = List<ChatSession>.from(state.sessions);
    updated[index] = updated[index].copyWith(unreadCount: 0);
    return updated;
  }

  List<ChatSession> _sessionsWithMessage(
    String sessionKey,
    Message message, {
    required bool countUnread,
  }) {
    final targetId = message.isGroupChat
        ? _groupIdFromSessionKey(message.groupId ?? sessionKey)
        : _privateTargetForMessage(message, sessionKey);
    if (targetId.isEmpty) return state.sessions;

    final index =
        state.sessions.indexWhere((session) => session.id == sessionKey);
    final existing = index == -1 ? null : state.sessions[index];
    final active = state.activeSessionId == sessionKey;
    final currentUserId = _currentUserId();
    final fromCurrentUser = currentUserId != null &&
        currentUserId.isNotEmpty &&
        message.senderId == currentUserId;
    final shouldIncrementUnread = countUnread && !active && !fromCurrentUser;
    final unreadCount = active
        ? 0
        : (existing?.unreadCount ?? 0) + (shouldIncrementUnread ? 1 : 0);

    final updatedSession =
        (existing ?? _sessionFromMessage(sessionKey, message, targetId))
            .copyWith(
      lastMessage: message,
      lastMessageTime: message.sendTime,
      lastMessageSenderId: message.senderId,
      lastMessageSenderName: message.senderName,
      lastActiveTime: message.sendTime,
      updateTime: message.sendTime,
      unreadCount: unreadCount,
    );

    final updated = List<ChatSession>.from(state.sessions);
    if (index != -1) {
      updated.removeAt(index);
    }
    updated.insert(0, updatedSession);
    return updated;
  }

  ChatSession _sessionFromMessage(
    String sessionKey,
    Message message,
    String targetId,
  ) {
    if (message.isGroupChat) {
      final name = _nonEmptyOr(message.groupName, targetId) ?? targetId;
      return ChatSession(
        id: sessionKey,
        type: 'group',
        targetId: targetId,
        targetName: name,
        targetAvatar: message.groupAvatar,
        unreadCount: 0,
        conversationId: _groupSessionKey(targetId),
        name: name,
        avatar: message.groupAvatar,
        conversationType: 'group',
        conversationName: name,
        conversationAvatar: message.groupAvatar,
      );
    }

    final currentUserId = _currentUserId();
    final fromCurrentUser = currentUserId != null &&
        currentUserId.isNotEmpty &&
        message.senderId == currentUserId;
    final name = _nonEmptyOr(
          fromCurrentUser ? message.receiverName : message.senderName,
          targetId,
        ) ??
        targetId;
    final avatar =
        fromCurrentUser ? message.receiverAvatar : message.senderAvatar;
    return ChatSession(
      id: sessionKey,
      type: 'private',
      targetId: targetId,
      targetName: name,
      targetAvatar: avatar,
      unreadCount: 0,
      conversationType: 'private',
      name: name,
      avatar: avatar,
    );
  }

  String _privateTargetForMessage(Message message, String sessionKey) {
    final currentUserId = _currentUserId();
    if (currentUserId != null && currentUserId.isNotEmpty) {
      if (message.senderId == currentUserId) {
        return message.receiverId ?? _privateTargetFromSessionKey(sessionKey);
      }
      return message.senderId;
    }
    return message.receiverId ?? message.senderId;
  }

  Message _mergeMessageReplacement(Message existing, Message incoming) {
    return incoming.copyWith(
      content:
          incoming.content.isNotEmpty ? incoming.content : existing.content,
      clientMessageId: incoming.clientMessageId ?? existing.clientMessageId,
      encrypted: incoming.encrypted ?? existing.encrypted,
      e2eeDeviceId: _nonEmptyOr(incoming.e2eeDeviceId, existing.e2eeDeviceId),
      e2eeEnvelope: incoming.e2eeEnvelope ?? existing.e2eeEnvelope,
      decryptStatus:
          _nonEmptyOr(incoming.decryptStatus, existing.decryptStatus),
    );
  }

  String? _nonEmptyOr(String? value, String? fallback) {
    final trimmed = value?.trim();
    if (trimmed != null && trimmed.isNotEmpty) return value;
    return fallback;
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
    updated[index] = old.copyWith(status: status);
    state = state.copyWith(
      messages: {...state.messages, normalizedKey: updated},
    );
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _messageApi.markRead(conversationId);
    } catch (e, st) {
      AppLogger.instance.warn('Failed to mark read', e, st);
    }
  }

  /// Recall a sent message. Updates local state to reflect the recall.
  Future<Message?> recallMessage(String messageId) async {
    try {
      final recalled = await _messageApi.recallMessage(messageId);
      _updateMessageInAllSessions(messageId, recalled);
      return recalled;
    } catch (e, st) {
      AppLogger.instance.error('Failed to recall message', e, st);
      state = state.copyWith(error: e.toString());
      return null;
    }
  }

  /// Delete a message. Updates local state to reflect the deletion.
  Future<Message?> deleteMessage(String messageId) async {
    try {
      final deleted = await _messageApi.deleteMessage(messageId);
      _updateMessageInAllSessions(messageId, deleted);
      return deleted;
    } catch (e, st) {
      AppLogger.instance.error('Failed to delete message', e, st);
      state = state.copyWith(error: e.toString());
      return null;
    }
  }

  void _updateMessageInAllSessions(String messageId, Message replacement) {
    for (final entry in state.messages.entries) {
      final index = entry.value.indexWhere(
        (m) => m.id == messageId || m.clientMessageId == messageId,
      );
      if (index != -1) {
        final updated = List<Message>.from(entry.value);
        updated[index] = _mergeMessageReplacement(updated[index], replacement);
        state = state.copyWith(
          messages: {...state.messages, entry.key: updated},
        );
        break;
      }
    }
  }

  void setOfflineStatus(bool isOffline) {
    state = state.copyWith(isOffline: isOffline);
  }

  Future<void> retryMessage(String sessionKey, String messageId) async {
    final normalizedKey = _normalizeIncomingSessionKey(sessionKey);
    final messages = state.messages[normalizedKey];
    if (messages == null) return;
    final index = messages
        .indexWhere((m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final msg = messages[index];

    if (msg.encrypted == true) {
      _updateMessageStatus(normalizedKey, msg.id, 'FAILED');
      state = state.copyWith(error: 'e2ee_not_ready');
      return;
    }

    _updateMessageStatus(normalizedKey, msg.id, 'SENDING');
    try {
      final Message serverMessage;
      if (msg.isGroupChat) {
        serverMessage = await _messageApi.sendGroupMessage(
          SendGroupMessageRequest(
            groupId: msg.groupId ?? _groupIdFromSessionKey(normalizedKey),
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
            mediaUrl: msg.mediaUrl,
            mediaName: msg.mediaName,
            mediaSize: msg.mediaSize,
            thumbnailUrl: msg.thumbnailUrl,
            duration: msg.duration,
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
            mediaUrl: msg.mediaUrl,
            mediaName: msg.mediaName,
            mediaSize: msg.mediaSize,
            thumbnailUrl: msg.thumbnailUrl,
            duration: msg.duration,
          ),
        );
      }
      _replaceMessage(normalizedKey, msg.id, serverMessage);
    } catch (_) {
      _updateMessageStatus(normalizedKey, msg.id, 'FAILED');
    }
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

  String getGroupSessionKey(String groupId) {
    return _sessionKeyForGroupTarget(groupId);
  }

  Future<void> logout() async {
    await _sentMessageCache?.clearAll();
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
    if (currentUserId == null || currentUserId.isEmpty || targetId.isEmpty) {
      return targetId;
    }
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
            .where((part) =>
                part.isNotEmpty &&
                (currentUserId == null || part != currentUserId))
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

  Set<String> _negotiationLookupKeys(String sessionId) {
    return SessionKeyCodec.negotiationLookupKeys(
      sessionId,
      state.sessions,
      currentUserId: _currentUserId(),
    );
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

  // ---------------------------------------------------------------------------
  // E2EE history decryption
  // ---------------------------------------------------------------------------

  Future<List<Message>> _decryptLoadedMessages(List<Message> messages) async {
    if (!_e2eeAvailable) return messages;
    final decrypted = <Message>[];
    for (final message in messages) {
      decrypted.add(await _decryptLoadedMessage(message));
    }
    return decrypted;
  }

  Future<Message> _decryptLoadedMessage(Message message) async {
    if (!E2eeHistoryRecovery.needsRecovery(message)) {
      return message;
    }

    final currentUserId = _currentUserId();
    if (currentUserId == null || currentUserId.isEmpty) {
      return message;
    }

    // For own sent messages: try local cache first, then E2EE decrypt.
    if (E2eeHistoryRecovery.isOwnMessage(message, currentUserId)) {
      return _decryptOwnSentMessage(message);
    }

    // For messages from others: decrypt via E2EE.
    try {
      final envelope = message.e2eeEnvelope!;
      final plaintext = await _e2eeManager!.decryptEnvelope(
        sessionId: envelope.sessionId,
        envelope: _camelToSnakeEnvelope({
          'version': envelope.version,
          'algorithm': envelope.algorithm,
          'senderDeviceId': envelope.senderDeviceId,
          'recipientDeviceId': envelope.recipientDeviceId,
          'sessionId': envelope.sessionId,
          'wire': envelope.wire,
          if (envelope.handshake != null) 'handshake': envelope.handshake,
        }),
      );

      final result = E2eeHistoryRecovery.computeOtherMessageRecovery(
        decryptSuccess: true,
        decryptedContent: plaintext,
      );

      return message.copyWith(
        content: result.content,
        decryptStatus: result.decryptStatus,
      );
    } catch (e, st) {
      AppLogger.instance
          .error('Loaded E2EE message decrypt failed', e, st, 'e2ee');

      final result = E2eeHistoryRecovery.computeOtherMessageRecovery(
        decryptSuccess: false,
        decryptedContent: '',
      );

      return message.copyWith(
        content: result.content,
        decryptStatus: result.decryptStatus,
      );
    }
  }

  /// Decrypt or restore plaintext for a message sent by the current user.
  Future<Message> _decryptOwnSentMessage(Message message) async {
    final clientId = message.clientMessageId ?? message.id;
    final serverId = message.id;
    final envelope = message.e2eeEnvelope!;

    // Step 1: Try E2EE decrypt.
    bool decryptSuccess = false;
    String decryptedContent = '';
    try {
      decryptedContent = await _e2eeManager!.decryptEnvelope(
        sessionId: envelope.sessionId,
        envelope: _camelToSnakeEnvelope({
          'version': envelope.version,
          'algorithm': envelope.algorithm,
          'senderDeviceId': envelope.senderDeviceId,
          'recipientDeviceId': envelope.recipientDeviceId,
          'sessionId': envelope.sessionId,
          'wire': envelope.wire,
          if (envelope.handshake != null) 'handshake': envelope.handshake,
        }),
      );
      decryptSuccess = true;
    } catch (_) {
      // E2EE decrypt failed for own message; fall through to local cache.
    }

    // Step 2: Try local sent message cache.
    String? cachedPlaintext;
    bool cacheHit = false;

    if (!decryptSuccess && _sentMessageCache != null) {
      if (clientId.isNotEmpty) {
        cachedPlaintext =
            await _sentMessageCache!.getPlaintextByClientId(clientId);
      }

      if (cachedPlaintext == null &&
          serverId.isNotEmpty &&
          !serverId.startsWith('local_')) {
        cachedPlaintext =
            await _sentMessageCache!.getPlaintextByServerId(serverId);
      }

      cacheHit = cachedPlaintext != null && cachedPlaintext.isNotEmpty;
    }

    // Step 3: Compute the final result.
    final result = E2eeHistoryRecovery.computeOwnMessageRecovery(
      decryptSuccess: decryptSuccess,
      decryptedContent: decryptedContent,
      cacheHit: cacheHit,
      cachedPlaintext: cachedPlaintext ?? '',
    );

    // Step 4: Write to cache if decryption succeeded.
    if (result.shouldWriteCache && _sentMessageCache != null) {
      await _sentMessageCache!.put(
        clientMessageId: clientId,
        plaintext: result.content,
        e2eeSessionId: envelope.sessionId,
        serverMessageId: serverId,
      );
    }

    if (result.decryptStatus == 'unavailable_own_history') {
      AppLogger.instance.warn(
        'Cannot recover own sent E2EE message: no local cache',
      );
    }

    return message.copyWith(
      content: result.content,
      decryptStatus: result.decryptStatus,
    );
  }

  void _ensureE2eeSessionKeyInMessages(List<Message> messages) {
    if (!_e2eeAvailable) return;
    // This method is a no-op placeholder that subclasses may override
    // to inject E2EE session keys into the message list.
  }

  // ---------------------------------------------------------------------------
  // E2EE negotiation
  // ---------------------------------------------------------------------------

  Future<void> _handleE2eeNegotiation(Map<String, dynamic> data) async {
    if (!_e2eeAvailable) return;
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
          _addPendingNegotiation(event);
          await _e2eeMetaStore!.setSessionStatus(sessionId, 'negotiating');
        case E2eeNegotiationAction.accepted:
          await _e2eeMetaStore!.setSessionStatus(sessionId, 'encrypted');
          await _e2eeMetaStore!.clearPendingHandshake(sessionId);
          _removePendingNegotiation(sessionId);
          await _retryDecryptMessagesForE2eeSession(sessionId);
        case E2eeNegotiationAction.rejected:
        case E2eeNegotiationAction.disabled:
          await _e2eeMetaStore!.setSessionStatus(sessionId, 'plaintext');
          await _e2eeMetaStore!.clearPendingHandshake(sessionId);
          _removePendingNegotiation(sessionId);
      }
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to handle E2EE negotiation', e, st, 'e2ee');
    }
  }

  void _addPendingNegotiation(E2eeNegotiationEvent event) {
    final key = _normalizeE2eeSessionKey(event.sessionId);
    state = state.copyWith(
      pendingNegotiations: {
        ...state.pendingNegotiations,
        key.isEmpty ? event.sessionId : key: event,
      },
    );
  }

  void _removePendingNegotiation(String sessionId) {
    if (state.pendingNegotiations.isEmpty) return;
    final keys = SessionKeyCodec.negotiationLookupKeys(
      sessionId,
      state.sessions,
      currentUserId: _currentUserId(),
    );
    final updated = Map<String, E2eeNegotiationEvent>.from(
      state.pendingNegotiations,
    )..removeWhere((key, event) {
        return keys.contains(key) ||
            SessionKeyCodec.negotiationLookupKeys(
              event.sessionId,
              state.sessions,
              currentUserId: _currentUserId(),
            ).any(keys.contains);
      });
    state = state.copyWith(pendingNegotiations: updated);
  }

  Future<void> _retryDecryptMessagesForE2eeSession(String e2eeSessionId) async {
    final sessionKey = _normalizeE2eeSessionKey(e2eeSessionId);
    final currentMessages = state.messages[sessionKey];
    if (currentMessages == null || currentMessages.isEmpty) return;

    var changed = false;
    final updated = <Message>[];
    final currentUserId = _currentUserId();
    for (final message in currentMessages) {
      final shouldRetry = message.encrypted == true &&
          message.e2eeEnvelope != null &&
          message.senderId != currentUserId &&
          message.decryptStatus != 'success' &&
          (message.e2eeEnvelope!.sessionId == e2eeSessionId ||
              _normalizeE2eeSessionKey(message.e2eeEnvelope!.sessionId) ==
                  sessionKey);

      if (!shouldRetry) {
        updated.add(message);
        continue;
      }

      final decrypted = await _decryptLoadedMessage(message);
      changed = changed || decrypted != message;
      updated.add(decrypted);
    }

    if (changed) {
      state = state.copyWith(
        messages: {...state.messages, sessionKey: updated},
      );
    }
  }

  Future<bool> initiateEncryptionForSession(String sessionId) async {
    if (!_e2eeAvailable) return false;
    final session = state.sessions
        .where((s) =>
            s.id == sessionId ||
            s.conversationId == sessionId ||
            s.targetId == sessionId)
        .firstOrNull;
    if (session != null &&
        (session.type == 'group' || session.conversationType == 'group')) {
      state = state.copyWith(error: 'group_e2ee_unavailable');
      return false;
    }

    final peerId = session?.targetId ?? _privateTargetFromSessionKey(sessionId);
    final e2eeSessionId = _e2eeSessionIdForPrivateTarget(peerId);
    if (peerId.isEmpty || e2eeSessionId.isEmpty) return false;

    try {
      final initiated =
          await _e2eeManager!.initiateNegotiation(e2eeSessionId, peerId);
      await _e2eeMetaStore!.setSessionStatus(
        e2eeSessionId,
        initiated ? 'negotiating' : 'failed',
      );
      return initiated;
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to initiate E2EE negotiation', e, st, 'e2ee');
      await _e2eeMetaStore!.setSessionStatus(e2eeSessionId, 'failed');
      return false;
    }
  }

  Future<String?> syncEncryptionStatus(String e2eeSessionId) async {
    if (!_e2eeAvailable || e2eeSessionId.isEmpty) return null;

    try {
      final synced = await _e2eeManager!.syncSessionStatus(e2eeSessionId);
      if (synced == 'plaintext') {
        _removePendingNegotiation(e2eeSessionId);
      } else if (synced == 'encrypted') {
        _removePendingNegotiation(e2eeSessionId);
        await _retryDecryptMessagesForE2eeSession(e2eeSessionId);
      }
      return synced;
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to sync E2EE session status', e, st, 'e2ee');
      return null;
    }
  }

  Future<bool> acceptPendingNegotiation(String sessionId) async {
    if (!_e2eeAvailable) return false;
    final event = state.pendingNegotiations[sessionId];
    if (event == null) return false;
    final payloadJson = event.requestPayloadJson;
    if (payloadJson == null || payloadJson.isEmpty) return false;

    try {
      final decoded = jsonDecode(payloadJson);
      if (decoded is! Map<String, dynamic>) return false;
      decoded.putIfAbsent('senderUserId', () => event.requesterId);

      final accepted =
          await _e2eeManager!.respondToNegotiation(event.sessionId, decoded);
      if (!accepted) return false;

      await _e2eeMetaStore!.setSessionStatus(event.sessionId, 'encrypted');
      _removePendingNegotiation(event.sessionId);
      return true;
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to accept E2EE negotiation', e, st, 'e2ee');
      return false;
    }
  }

  Future<void> rejectPendingNegotiation(String sessionId) async {
    if (!_e2eeAvailable) return;
    final event = state.pendingNegotiations[sessionId];
    final targetSessionId = event?.sessionId ?? sessionId;
    try {
      await _e2eeManager!.rejectNegotiation(targetSessionId);
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to reject E2EE negotiation', e, st, 'e2ee');
    } finally {
      await _e2eeMetaStore!.setSessionStatus(targetSessionId, 'plaintext');
      _removePendingNegotiation(targetSessionId);
    }
  }

  Future<void> disableEncryptionForSession(String sessionId) async {
    if (!_e2eeAvailable) return;
    final e2eeSessionId = SessionKeyCodec.e2eeSessionIdForChatOrE2eeSession(
      sessionId,
      state.sessions,
      currentUserId: _currentUserId(),
    );
    try {
      await _e2eeManager!.exitEncryption(e2eeSessionId);
      if (_sentMessageCache != null) {
        await _sentMessageCache!.clearSession(e2eeSessionId);
      }
    } finally {
      await _e2eeMetaStore!.setSessionStatus(e2eeSessionId, 'plaintext');
      _removePendingNegotiation(e2eeSessionId);
    }
  }

  Future<void> loadPendingNegotiations() async {
    if (!_e2eeAvailable) return;
    try {
      final events = await _e2eeManager!.getPendingNegotiations();
      if (events.isEmpty) return;

      final updated = Map<String, E2eeNegotiationEvent>.from(
        state.pendingNegotiations,
      );
      for (final event in events) {
        if (event.action != E2eeNegotiationAction.request) continue;
        final key = _normalizeE2eeSessionKey(event.sessionId);
        updated[key.isEmpty ? event.sessionId : key] = event;
        await _e2eeMetaStore!.setSessionStatus(
          event.sessionId,
          'negotiating',
        );
      }

      state = state.copyWith(pendingNegotiations: updated);
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to load pending E2EE negotiations', e, st, 'e2ee');
    }
  }

  Future<void> _syncKnownE2eeStatuses() async {
    if (!_e2eeAvailable) return;
    for (final session in state.sessions) {
      final isGroup =
          session.type == 'group' || session.conversationType == 'group';
      if (isGroup) continue;

      final e2eeSessionId = _e2eeSessionIdForPrivateTarget(session.targetId);
      if (e2eeSessionId.isEmpty) continue;

      final localStatus = await _e2eeMetaStore!.getSessionStatus(e2eeSessionId);
      if (localStatus == 'plaintext') continue;

      await syncEncryptionStatus(e2eeSessionId);
    }
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    _wsStateSubscription?.cancel();
    _outboxSubscription?.cancel();
    _e2eePendingPollTimer?.cancel();
    super.dispose();
  }
}
