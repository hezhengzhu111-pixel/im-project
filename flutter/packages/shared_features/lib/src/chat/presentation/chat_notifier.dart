import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/message_api.dart';
import '../data/message_config.dart';
import '../data/message_pipeline.dart';
import 'chat_state.dart';
import 'package:im_core_flutter/im_core_flutter.dart';

/// Simplified chat notifier for desktop (no IndexedDB outbox).
class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(
    this._messageApi,
    this._pipeline,
    this._wsClient,
    this._currentUserId,
  ) : super(const ChatState()) {
    _subscribeToWs();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  final String? Function() _currentUserId;
  MessageConfig? _messageConfig;
  StreamSubscription? _wsSubscription;
  StreamSubscription? _wsStateSubscription;

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
      }
    });
    _wsStateSubscription = _wsClient.connectionState.listen((wsState) {
      if (wsState == WsConnectionState.connected) {
        _syncOfflineMessages();
      }
    });
  }

  Future<void> _syncOfflineMessages() async {
    try {
      await loadSessions();
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
      final history =
          await _messageApi.getPrivateHistory(targetId, page: page, size: size);
      final oldestId = _findOldestLoadedServerMessageId(history);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: history},
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
      final oldestId = _findOldestLoadedServerMessageId(history);
      state = state.copyWith(
        messages: {...state.messages, sessionKey: history},
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
    final merged = <String, Message>{};
    for (final msg in existing) {
      merged[msg.id] = msg;
      if (msg.clientMessageId != null) merged[msg.clientMessageId!] = msg;
    }
    for (final msg in incoming) {
      final existingMsg = merged[msg.id] ??
          (msg.clientMessageId != null ? merged[msg.clientMessageId!] : null);
      if (existingMsg != null) {
        final mergedMsg = existingMsg.copyWith(
          content: msg.content.isNotEmpty ? msg.content : existingMsg.content,
          status: msg.status.isNotEmpty ? msg.status : existingMsg.status,
          mediaUrl: msg.mediaUrl ?? existingMsg.mediaUrl,
          mediaSize: msg.mediaSize ?? existingMsg.mediaSize,
          mediaName: msg.mediaName ?? existingMsg.mediaName,
          thumbnailUrl: msg.thumbnailUrl ?? existingMsg.thumbnailUrl,
          duration: msg.duration ?? existingMsg.duration,
          extra: msg.extra ?? existingMsg.extra,
          mentionedUserIds:
              msg.mentionedUserIds ?? existingMsg.mentionedUserIds,
          encrypted: msg.encrypted ?? existingMsg.encrypted,
          e2eeDeviceId: msg.e2eeDeviceId ?? existingMsg.e2eeDeviceId,
          e2eeEnvelope: msg.e2eeEnvelope ?? existingMsg.e2eeEnvelope,
          decryptStatus: msg.decryptStatus ?? existingMsg.decryptStatus,
        );
        merged[msg.id] = mergedMsg;
        if (msg.clientMessageId != null)
          merged[msg.clientMessageId!] = mergedMsg;
      } else {
        merged[msg.id] = msg;
        if (msg.clientMessageId != null) merged[msg.clientMessageId!] = msg;
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
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
    addMessage(sessionKey, pendingMessage);

    try {
      final serverMessage = await _messageApi.sendPrivateMessage(
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
      _replaceMessage(sessionKey, cid, serverMessage);
      return serverMessage;
    } catch (e, st) {
      AppLogger.instance.error('Send message failed', e, st);
      _updateMessageStatus(sessionKey, cid, 'FAILED');
      state = state.copyWith(error: e.toString());
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
    _wsStateSubscription?.cancel();
    super.dispose();
  }
}
