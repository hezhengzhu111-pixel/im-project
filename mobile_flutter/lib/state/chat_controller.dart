import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../models/chat_models.dart';
import '../services/http_client.dart';
import '../services/upload_service.dart';
import '../services/ws_service.dart';
import 'auth_controller.dart';

class ChatController extends ChangeNotifier {
  ChatController({
    required this.httpClient,
    required this.authController,
  }) : uploadService = UploadService(httpClient) {
    authController.addListener(_onAuthChanged);
    _onAuthChanged();
  }

  final HttpClient httpClient;
  final AuthController authController;
  final UploadService uploadService;

  final List<ChatSession> sessions = [];
  final List<FriendItem> friends = [];
  final List<GroupItem> groups = [];
  final Map<String, List<ChatMessage>> messages = {};

  bool loadingSessions = false;
  bool loadingMessages = false;
  bool loadingMoreMessages = false;
  bool sendingMedia = false;
  double uploadProgress = 0;
  String wsState = 'disconnected';
  WsService? _ws;
  final Map<String, bool> hasMoreHistory = {};
  final Map<String, int> unreadBySession = {};
  String? activeSessionId;

  Future<void> loadInitialData() async {
    await Future.wait([loadSessions(), loadFriends(), loadGroups()]);
  }

  Future<void> loadSessions() async {
    loadingSessions = true;
    notifyListeners();
    try {
      final response = await httpClient.dio.get('/message/conversations');
      final payload = response.data as Map<String, dynamic>;
      final list = (payload['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ChatSession.fromJson)
          .toList()
        ..sort((a, b) => (b.lastActiveTime ?? '').compareTo(a.lastActiveTime ?? ''));
      sessions
        ..clear()
        ..addAll(list);
      unreadBySession.clear();
      for (final session in sessions) {
        unreadBySession[session.id] = session.unreadCount;
      }
    } catch (_) {
      sessions.clear();
    } finally {
      loadingSessions = false;
      notifyListeners();
    }
  }

  Future<void> loadFriends() async {
    try {
      final response = await httpClient.dio.get('/friend/list');
      final payload = response.data as Map<String, dynamic>;
      final list = (payload['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(FriendItem.fromJson)
          .toList();
      friends
        ..clear()
        ..addAll(list);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> loadGroups() async {
    final userId = authController.user?.id;
    if (userId == null || userId.isEmpty) return;
    try {
      final response = await httpClient.dio.get('/group/user/$userId');
      final raw = response.data;
      List<dynamic> data;
      if (raw is List<dynamic>) {
        data = raw;
      } else if (raw is Map<String, dynamic>) {
        data = raw['data'] as List<dynamic>? ?? [];
      } else {
        data = [];
      }
      final list = data.whereType<Map<String, dynamic>>().map(GroupItem.fromJson).toList();
      groups
        ..clear()
        ..addAll(list);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> loadMessages(ChatSession session) async {
    loadingMessages = true;
    notifyListeners();
    try {
      final list = await _fetchHistory(session: session, size: 20);
      messages[session.id] = list;
      hasMoreHistory[session.id] = list.length >= 20;
      _setUnread(session.id, 0);
      await markSessionRead(session);
    } catch (_) {
      messages[session.id] = messages[session.id] ?? [];
    } finally {
      loadingMessages = false;
      notifyListeners();
    }
  }

  Future<void> loadMoreMessages(ChatSession session) async {
    if (loadingMoreMessages) return;
    final existing = messages[session.id] ?? [];
    if (existing.isEmpty) return;
    if (hasMoreHistory[session.id] == false) return;
    final minServerId = _findMinServerMessageId(existing);
    if (minServerId == null) return;
    loadingMoreMessages = true;
    notifyListeners();
    try {
      final older = await _fetchHistory(
        session: session,
        size: 20,
        lastMessageId: minServerId,
      );
      if (older.isEmpty) {
        hasMoreHistory[session.id] = false;
      } else {
        final merged = [...older, ...existing];
        final byId = <String, ChatMessage>{};
        for (final item in merged) {
          if (item.id.isEmpty) continue;
          byId[item.id] = item;
        }
        final list = byId.values.toList()
          ..sort((a, b) => a.sendTime.compareTo(b.sendTime));
        messages[session.id] = list;
        hasMoreHistory[session.id] = older.length >= 20;
      }
    } catch (_) {} finally {
      loadingMoreMessages = false;
      notifyListeners();
    }
  }

  Future<void> sendText(ChatSession session, String text) async {
    if (text.trim().isEmpty) return;
    await _sendMessage(
      session: session,
      messageType: 'TEXT',
      content: text.trim(),
    );
  }

  Future<void> sendImage(ChatSession session, String path) async {
    sendingMedia = true;
    uploadProgress = 0;
    notifyListeners();
    try {
      final upload = await uploadService.uploadImage(
        path,
        onProgress: (progress) {
          uploadProgress = progress;
          notifyListeners();
        },
      );
      await _sendMessage(
        session: session,
        messageType: 'IMAGE',
        content: upload.url,
        mediaUrl: upload.url,
        mediaName: upload.fileName,
        mediaSize: upload.size,
        localFilePath: path,
      );
    } on DioException catch (error) {
      if (error.type != DioExceptionType.cancel) {
        rethrow;
      }
    } finally {
      sendingMedia = false;
      uploadProgress = 0;
      notifyListeners();
    }
  }

  Future<void> sendFile(ChatSession session, String path) async {
    sendingMedia = true;
    uploadProgress = 0;
    notifyListeners();
    try {
      final upload = await uploadService.uploadFile(
        path,
        onProgress: (progress) {
          uploadProgress = progress;
          notifyListeners();
        },
      );
      await _sendMessage(
        session: session,
        messageType: 'FILE',
        content: upload.fileName,
        mediaUrl: upload.url,
        mediaName: upload.fileName,
        mediaSize: upload.size,
        localFilePath: path,
      );
    } on DioException catch (error) {
      if (error.type != DioExceptionType.cancel) {
        rethrow;
      }
    } finally {
      sendingMedia = false;
      uploadProgress = 0;
      notifyListeners();
    }
  }

  Future<void> retryMessage(ChatSession session, ChatMessage failed) async {
    final list = messages.putIfAbsent(session.id, () => []);
    list.removeWhere((m) => m.id == failed.id);
    notifyListeners();
    if (failed.messageType == 'IMAGE' && failed.localFilePath != null) {
      await sendImage(session, failed.localFilePath!);
      return;
    }
    if (failed.messageType == 'FILE' && failed.localFilePath != null) {
      await sendFile(session, failed.localFilePath!);
      return;
    }
    await _sendMessage(
      session: session,
      messageType: failed.messageType,
      content: failed.content,
      mediaUrl: failed.mediaUrl,
      mediaName: failed.mediaName,
      mediaSize: failed.mediaSize,
      localFilePath: failed.localFilePath,
    );
  }

  ChatSession ensureSessionForFriend(FriendItem friend) {
    final selfId = authController.user?.id ?? '';
    final sessionId = _buildPrivateSessionId(selfId, friend.userId);
    final existedIndex = sessions.indexWhere((s) => s.id == sessionId);
    if (existedIndex >= 0) {
      return sessions[existedIndex];
    }
    final session = ChatSession(
      id: sessionId,
      type: 'private',
      targetId: friend.userId,
      targetName: friend.nickname?.isNotEmpty == true ? friend.nickname! : friend.username,
      lastActiveTime: DateTime.now().toIso8601String(),
    );
    sessions.insert(0, session);
    notifyListeners();
    return session;
  }

  ChatSession ensureSessionForGroup(GroupItem group) {
    final sessionId = 'group_${group.id}';
    final existedIndex = sessions.indexWhere((s) => s.id == sessionId);
    if (existedIndex >= 0) {
      return sessions[existedIndex];
    }
    final session = ChatSession(
      id: sessionId,
      type: 'group',
      targetId: group.id,
      targetName: group.groupName,
      lastActiveTime: DateTime.now().toIso8601String(),
    );
    sessions.insert(0, session);
    notifyListeners();
    return session;
  }

  void reconnectWs() {
    _ws?.forceReconnect();
  }

  void cancelUpload() {
    uploadService.cancelActiveUpload();
    sendingMedia = false;
    uploadProgress = 0;
    notifyListeners();
  }

  Future<void> markSessionRead(ChatSession session) async {
    try {
      await httpClient.dio.post('/message/read/${session.id}');
    } catch (_) {}
    _setUnread(session.id, 0);
    notifyListeners();
  }

  void enterSession(ChatSession session) {
    activeSessionId = session.id;
    _setUnread(session.id, 0);
    notifyListeners();
  }

  void leaveSession(ChatSession session) {
    if (activeSessionId == session.id) {
      activeSessionId = null;
    }
  }

  int unreadCount(String sessionId) {
    return unreadBySession[sessionId] ?? 0;
  }

  int get totalUnread {
    var total = 0;
    unreadBySession.forEach((_, value) => total += value);
    return total;
  }

  Future<void> _sendMessage({
    required ChatSession session,
    required String messageType,
    required String content,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? localFilePath,
  }) async {
    final userId = authController.user?.id ?? '';
    final local = ChatMessage(
      id: 'local_${const Uuid().v4()}',
      senderId: userId,
      content: content,
      messageType: messageType,
      sendTime: DateTime.now().toIso8601String(),
      receiverId: session.type == 'private' ? session.targetId : null,
      groupId: session.type == 'group' ? session.targetId : null,
      status: 'SENDING',
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      localFilePath: localFilePath,
    );
    final list = messages.putIfAbsent(session.id, () => []);
    list.add(local);
    _upsertSession(session: session, preview: _toPreview(local), moveToTop: true);
    notifyListeners();
    try {
      final path = session.type == 'group' ? '/message/send/group' : '/message/send/private';
      final body = session.type == 'group'
          ? {
              'groupId': session.targetId,
              'messageType': messageType,
              'content': content,
              'mediaUrl': mediaUrl,
              'mediaName': mediaName,
              'mediaSize': mediaSize,
            }
          : {
              'receiverId': session.targetId,
              'messageType': messageType,
              'content': content,
              'mediaUrl': mediaUrl,
              'mediaName': mediaName,
              'mediaSize': mediaSize,
            };
      final response = await httpClient.dio.post(path, data: body);
      final payload = response.data as Map<String, dynamic>;
      final data = payload['data'] as Map<String, dynamic>?;
      if (data != null) {
        list.removeWhere((m) => m.id == local.id);
        list.add(ChatMessage.fromJson(data));
      }
    } catch (_) {
      list.removeWhere((m) => m.id == local.id);
      list.add(
        ChatMessage(
          id: local.id,
          senderId: local.senderId,
          content: local.content,
          messageType: local.messageType,
          sendTime: local.sendTime,
          receiverId: local.receiverId,
          groupId: local.groupId,
          status: 'FAILED',
          mediaUrl: local.mediaUrl,
          mediaName: local.mediaName,
          mediaSize: local.mediaSize,
          localFilePath: local.localFilePath,
        ),
      );
    }
    notifyListeners();
  }

  void _onAuthChanged() {
    final loggedIn = authController.isLoggedIn;
    if (!loggedIn) {
      _ws?.disconnect();
      _ws = null;
      sessions.clear();
      friends.clear();
      groups.clear();
      messages.clear();
      unreadBySession.clear();
      activeSessionId = null;
      notifyListeners();
      return;
    }
    if (_ws != null) return;
    final user = authController.user;
    final token = authController.token;
    if (user == null || token == null || token.isEmpty) return;
    _ws = WsService(
      userId: user.id,
      token: token,
      onMessage: _onWsMessage,
      onStateChanged: (state) {
        wsState = state;
        notifyListeners();
      },
    );
    _ws!.connect();
    loadInitialData();
  }

  void _onWsMessage(Map<String, dynamic> payload) {
    final type = payload['type']?.toString();
    if (type == 'READ_RECEIPT') {
      _applyReadReceipt(payload['data']);
      return;
    }
    if (type != 'MESSAGE') return;
    final data = payload['data'];
    if (data is! Map<String, dynamic>) return;
    final msg = ChatMessage.fromJson(data);
    final currentUserId = authController.user?.id ?? '';
    final isGroup = msg.groupId != null && msg.groupId!.isNotEmpty;
    final peerId = isGroup ? msg.groupId! : (msg.senderId == currentUserId ? msg.receiverId ?? '' : msg.senderId);
    final sessionId = isGroup ? 'group_$peerId' : _buildPrivateSessionId(currentUserId, peerId);
    if (!sessions.any((s) => s.id == sessionId)) {
      sessions.insert(
        0,
        ChatSession(
          id: sessionId,
          type: isGroup ? 'group' : 'private',
          targetId: peerId,
          targetName: peerId,
          lastActiveTime: msg.sendTime,
          lastMessage: _toPreview(msg),
        ),
      );
    } else {
      final session = sessions.firstWhere((s) => s.id == sessionId);
      _upsertSession(session: session, preview: _toPreview(msg), moveToTop: true);
    }
    final list = messages.putIfAbsent(sessionId, () => []);
    if (!list.any((m) => m.id == msg.id && m.id.isNotEmpty)) {
      list.add(msg);
    }
    if (msg.senderId != currentUserId && activeSessionId != sessionId) {
      _setUnread(sessionId, unreadCount(sessionId) + 1);
    } else if (activeSessionId == sessionId) {
      _setUnread(sessionId, 0);
      final currentSessionIndex = sessions.indexWhere((s) => s.id == sessionId);
      if (currentSessionIndex >= 0) {
        markSessionRead(sessions[currentSessionIndex]);
      }
    }
    notifyListeners();
  }

  String _buildPrivateSessionId(String selfId, String peerId) {
    final a = selfId;
    final b = peerId;
    return a.compareTo(b) <= 0 ? '${a}_$b' : '${b}_$a';
  }

  void _upsertSession({
    required ChatSession session,
    required String preview,
    required bool moveToTop,
  }) {
    final updated = ChatSession(
      id: session.id,
      type: session.type,
      targetId: session.targetId,
      targetName: session.targetName,
      lastMessage: preview,
      lastActiveTime: DateTime.now().toIso8601String(),
      unreadCount: session.unreadCount,
    );
    sessions.removeWhere((s) => s.id == session.id);
    if (moveToTop) {
      sessions.insert(0, updated);
      return;
    }
    sessions.add(updated);
  }

  String _toPreview(ChatMessage message) {
    if (message.messageType == 'IMAGE') return '[图片]';
    if (message.messageType == 'FILE') return '[文件] ${message.mediaName ?? message.content}';
    return message.content;
  }

  void _applyReadReceipt(dynamic rawReceipt) {
    if (rawReceipt is! Map<String, dynamic>) return;
    final readerId = rawReceipt['readerId']?.toString() ?? rawReceipt['reader_id']?.toString() ?? '';
    if (readerId.isEmpty) return;
    final currentUserId = authController.user?.id ?? '';
    if (currentUserId.isEmpty) return;
    final conversationId = rawReceipt['conversationId']?.toString() ?? '';
    if (conversationId.isEmpty) return;
    final isGroup = conversationId.startsWith('group_');
    final sessionId = isGroup ? conversationId : _buildPrivateSessionId(currentUserId, readerId);
    final list = messages[sessionId];
    if (list == null || list.isEmpty) return;
    final lastReadRaw = rawReceipt['lastReadMessageId']?.toString() ?? rawReceipt['last_read_message_id']?.toString();
    final lastReadMessageId = BigInt.tryParse(lastReadRaw ?? '');
    final readAt = rawReceipt['readAt']?.toString() ?? rawReceipt['read_at']?.toString();
    final readAtMs = DateTime.tryParse(readAt ?? '')?.millisecondsSinceEpoch;
    var changed = false;
    final updated = list.map((message) {
      if (message.senderId != currentUserId) return message;
      if (!isGroup && message.status != 'SENT' && message.status != 'DELIVERED') {
        return message;
      }
      final msgId = BigInt.tryParse(message.id);
      if (lastReadMessageId != null && msgId != null && msgId > lastReadMessageId) {
        return message;
      }
      final msgMs = DateTime.tryParse(message.sendTime)?.millisecondsSinceEpoch;
      if (readAtMs != null && msgMs != null && msgMs > readAtMs) {
        return message;
      }
      changed = true;
      if (isGroup) {
        final readers = (message.readBy ?? <String>[]).toSet();
        readers.add(readerId);
        return message.copyWith(
          readBy: readers.toList(),
          readByCount: readers.length,
          readStatus: 1,
        );
      }
      return message.copyWith(
        status: 'READ',
        readStatus: 1,
        readAt: readAt ?? message.readAt,
      );
    }).toList();
    if (!changed) return;
    messages[sessionId] = updated;
    notifyListeners();
  }

  void _setUnread(String sessionId, int count) {
    final normalized = count < 0 ? 0 : count;
    unreadBySession[sessionId] = normalized;
    final index = sessions.indexWhere((item) => item.id == sessionId);
    if (index < 0) return;
    final session = sessions[index];
    sessions[index] = ChatSession(
      id: session.id,
      type: session.type,
      targetId: session.targetId,
      targetName: session.targetName,
      lastMessage: session.lastMessage,
      lastActiveTime: session.lastActiveTime,
      unreadCount: normalized,
    );
  }

  String? _findMinServerMessageId(List<ChatMessage> list) {
    BigInt? minValue;
    for (final message in list) {
      if (message.id.startsWith('local_')) continue;
      final parsed = BigInt.tryParse(message.id);
      if (parsed == null) continue;
      if (minValue == null || parsed < minValue) {
        minValue = parsed;
      }
    }
    return minValue?.toString();
  }

  Future<List<ChatMessage>> _fetchHistory({
    required ChatSession session,
    required int size,
    String? lastMessageId,
  }) async {
    final isGroup = session.type == 'group';
    final path = isGroup ? '/message/group/${session.targetId}/cursor' : '/message/private/${session.targetId}/cursor';
    final query = <String, dynamic>{
      'limit': size,
    };
    if (lastMessageId != null && lastMessageId.isNotEmpty) {
      query['last_message_id'] = lastMessageId;
    }
    try {
      final response = await httpClient.dio.get(path, queryParameters: query);
      final payload = response.data as Map<String, dynamic>;
      final list = (payload['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList()
        ..sort((a, b) => a.sendTime.compareTo(b.sendTime));
      return list;
    } catch (_) {
      final fallbackPath = isGroup ? '/message/group/${session.targetId}' : '/message/private/${session.targetId}';
      final response = await httpClient.dio.get(
        fallbackPath,
        queryParameters: {
          'page': 0,
          'size': size,
        },
      );
      final payload = response.data as Map<String, dynamic>;
      final list = (payload['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList()
        ..sort((a, b) => a.sendTime.compareTo(b.sendTime));
      return list;
    }
  }

  @override
  void dispose() {
    authController.removeListener(_onAuthChanged);
    _ws?.disconnect();
    super.dispose();
  }
}
