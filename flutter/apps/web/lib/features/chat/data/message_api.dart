import 'package:im_core/core.dart';

class SendPrivateMessageRequest {
  const SendPrivateMessageRequest({
    required this.receiverId,
    required this.content,
    this.messageType = 'TEXT',
    this.clientMessageId,
    this.mediaUrl,
    this.mediaName,
    this.mediaSize,
    this.thumbnailUrl,
    this.duration,
    this.extra,
  });

  final String receiverId;
  final String content;
  final String messageType;
  final String? clientMessageId;
  final String? mediaUrl;
  final String? mediaName;
  final int? mediaSize;
  final String? thumbnailUrl;
  final int? duration;
  final Map<String, dynamic>? extra;

  Map<String, dynamic> toJson() => {
        'receiverId': receiverId,
        'content': content,
        'messageType': messageType,
        if (clientMessageId != null) 'clientMessageId': clientMessageId,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (mediaName != null) 'mediaName': mediaName,
        if (mediaSize != null) 'mediaSize': mediaSize,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
        if (duration != null) 'duration': duration,
        if (extra != null) 'extra': extra,
      };
}

class SendGroupMessageRequest {
  const SendGroupMessageRequest({
    required this.groupId,
    required this.content,
    this.messageType = 'TEXT',
    this.clientMessageId,
    this.mediaUrl,
    this.mediaName,
    this.mediaSize,
    this.thumbnailUrl,
    this.duration,
    this.mentionedUserIds,
    this.extra,
  });

  final String groupId;
  final String content;
  final String messageType;
  final String? clientMessageId;
  final String? mediaUrl;
  final String? mediaName;
  final int? mediaSize;
  final String? thumbnailUrl;
  final int? duration;
  final List<String>? mentionedUserIds;
  final Map<String, dynamic>? extra;

  Map<String, dynamic> toJson() => {
        'groupId': groupId,
        'content': content,
        'messageType': messageType,
        if (clientMessageId != null) 'clientMessageId': clientMessageId,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (mediaName != null) 'mediaName': mediaName,
        if (mediaSize != null) 'mediaSize': mediaSize,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
        if (duration != null) 'duration': duration,
        if (mentionedUserIds != null) 'mentionedUserIds': mentionedUserIds,
        if (extra != null) 'extra': extra,
      };
}

class MessageApi {
  MessageApi(this._httpClient, {String? Function()? currentUserId})
      : _currentUserId = currentUserId ?? (() => null);
  final HttpClientPort _httpClient;
  final String? Function() _currentUserId;

  Future<List<ChatSession>> getConversations() async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.conversations,
      fromJson: (json) => _asList(json)
          .map((e) => _normalizeConversation(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<ChatSession>();
  }

  Future<List<Message>> getPrivateHistory(
    String friendId, {
    int? page,
    int? size,
    String? deviceId,
  }) async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.privateHistory(friendId),
      queryParameters: {
        if (page != null) 'page': page,
        if (size != null) 'size': size,
        if (deviceId != null) 'deviceId': deviceId,
      },
      fromJson: (json) => _asList(json)
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Message>();
  }

  Future<List<Message>> getPrivateHistoryCursor(
    String friendId, {
    int? limit,
    String? lastMessageId,
    String? deviceId,
  }) async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.privateHistoryCursor(friendId),
      queryParameters: {
        if (limit != null) 'limit': limit,
        if (lastMessageId != null) 'last_message_id': lastMessageId,
        if (deviceId != null) 'deviceId': deviceId,
      },
      fromJson: (json) => _asList(json)
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Message>();
  }

  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    final response = await _httpClient.post<Message>(
      MessageEndpoints.sendPrivate,
      body: request.toJson(),
      fromJson: Message.fromJson,
    );
    return response.data;
  }

  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
    List<Map<String, dynamic>>? e2eeEnvelopes,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration,
  }) async {
    final response = await _httpClient.post<Message>(
      MessageEndpoints.sendPrivate,
      body: {
        'receiverId': receiverId,
        'clientMessageId': clientMessageId,
        'messageType': messageType,
        'encrypted': true,
        'e2eeEnvelope': e2eeEnvelope,
        if (e2eeEnvelopes != null) 'e2eeEnvelopes': e2eeEnvelopes,
        'e2eeDeviceId': e2eeDeviceId,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (mediaName != null) 'mediaName': mediaName,
        if (mediaSize != null) 'mediaSize': mediaSize,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
        if (duration != null) 'duration': duration,
      },
      fromJson: Message.fromJson,
    );
    return response.data;
  }

  Future<MessageConfig> getConfig() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MessageEndpoints.config,
      fromJson: (json) => json,
    );
    return MessageConfig.fromJson(response.data);
  }

  Future<void> markRead(String conversationId) async {
    await _httpClient.post<void>(
      MessageEndpoints.markRead(conversationId),
      fromJson: (_) {},
    );
  }

  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    final response = await _httpClient.post<Message>(
      MessageEndpoints.sendGroup,
      body: request.toJson(),
      fromJson: Message.fromJson,
    );
    return response.data;
  }

  Future<List<Message>> getGroupHistory(String groupId,
      {int? page, int? size}) async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.groupHistory(groupId),
      queryParameters: {
        if (page != null) 'page': page,
        if (size != null) 'size': size,
      },
      fromJson: (json) => _asList(json)
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Message>();
  }

  Future<List<Message>> getGroupHistoryCursor(String groupId,
      {int? limit, String? lastMessageId}) async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.groupHistoryCursor(groupId),
      queryParameters: {
        if (limit != null) 'limit': limit,
        if (lastMessageId != null) 'last_message_id': lastMessageId,
      },
      fromJson: (json) => _asList(json)
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Message>();
  }

  List<dynamic> _asList(Map<String, dynamic> json) {
    final items = json['items'];
    if (items is List) return items;
    return const [];
  }

  ChatSession _normalizeConversation(Map<String, dynamic> json) {
    final rawType = _firstString(
      json['type'],
      json['conversationType'],
      json['conversation_type'],
    );
    final isGroup = rawType == '2' || rawType.toLowerCase() == 'group';
    final type = isGroup ? 'group' : 'private';
    final targetId = _stripSessionPrefix(
      type,
      _firstString(
        json['targetId'],
        json['target_id'],
        json['groupId'],
        json['group_id'],
        json['partnerId'],
        json['partner_id'],
        json['friendId'],
        json['friend_id'],
        json['userId'],
        json['user_id'],
      ),
    );
    final conversationId = _firstString(
      json['conversationId'],
      json['conversation_id'],
      json['id'],
    );
    final normalizedTargetId = targetId.isNotEmpty
        ? targetId
        : _stripSessionPrefix(type, conversationId);
    final sessionId = type == 'group'
        ? _groupSessionKey(normalizedTargetId)
        : _privateSessionKey(normalizedTargetId);
    final targetName = _firstString(
      json['targetName'],
      json['target_name'],
      json['conversationName'],
      json['conversation_name'],
      json['groupName'],
      json['group_name'],
      json['name'],
      normalizedTargetId,
    );
    final targetAvatar = _firstString(
      json['targetAvatar'],
      json['target_avatar'],
      json['conversationAvatar'],
      json['conversation_avatar'],
      json['avatar'],
    );
    final unreadCount = json['unreadCount'] ?? json['unread_count'];

    return ChatSession(
      id: sessionId,
      type: type,
      targetId: normalizedTargetId,
      targetName: targetName,
      unreadCount: unreadCount is num
          ? unreadCount.toInt()
          : int.tryParse('$unreadCount') ?? 0,
      conversationId: conversationId.isEmpty ? null : conversationId,
      targetAvatar: targetAvatar.isEmpty ? null : targetAvatar,
      name: targetName,
      avatar: targetAvatar.isEmpty ? null : targetAvatar,
      conversationType: type,
      conversationName: _nullableString(
          json['conversationName'] ?? json['conversation_name']),
      conversationAvatar: _nullableString(
          json['conversationAvatar'] ?? json['conversation_avatar']),
      lastMessageTime:
          _nullableString(json['lastMessageTime'] ?? json['last_message_time']),
      lastMessageSenderId: _nullableString(
          json['lastMessageSenderId'] ?? json['last_message_sender_id']),
      lastMessageSenderName: _nullableString(
          json['lastMessageSenderName'] ?? json['last_message_sender_name']),
      lastActiveTime: _nullableString(
        json['lastActiveTime'] ??
            json['last_active_time'] ??
            json['lastMessageTime'] ??
            json['last_message_time'],
      ),
      updateTime: _nullableString(json['updateTime'] ?? json['update_time']),
      encrypted: _asBool(json['encrypted']),
      isPinned: _asBool(json['isPinned'] ?? json['is_pinned']),
      pinned: _asBool(json['pinned'] ?? json['isPinned'] ?? json['is_pinned']),
      isMuted: _asBool(json['isMuted'] ?? json['is_muted']),
      muted: _asBool(json['muted'] ?? json['isMuted'] ?? json['is_muted']),
    );
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
    final normalized = _stripSessionPrefix('group', groupId);
    return normalized.isEmpty ? groupId : 'group_$normalized';
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

  String _stripSessionPrefix(String type, String value) {
    if (type == 'group') {
      if (value.startsWith('group_')) return value.substring('group_'.length);
      if (value.startsWith('g_')) return value.substring('g_'.length);
    }
    if (type == 'private' && value.startsWith('private_')) {
      return value.substring('private_'.length);
    }
    return value;
  }

  String _firstString(Object? first,
      [Object? second,
      Object? third,
      Object? fourth,
      Object? fifth,
      Object? sixth,
      Object? seventh,
      Object? eighth,
      Object? ninth,
      Object? tenth]) {
    for (final value in [
      first,
      second,
      third,
      fourth,
      fifth,
      sixth,
      seventh,
      eighth,
      ninth,
      tenth
    ]) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text != 'null') return text;
    }
    return '';
  }

  String? _nullableString(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty || text == 'null' ? null : text;
  }

  bool? _asBool(Object? value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) {
      final normalized = value.toLowerCase();
      if (normalized == 'true') return true;
      if (normalized == 'false') return false;
    }
    return null;
  }
}
