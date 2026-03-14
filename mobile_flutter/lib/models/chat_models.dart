class ChatSession {
  ChatSession({
    required this.id,
    required this.type,
    required this.targetId,
    required this.targetName,
    this.lastMessage,
    this.lastActiveTime,
    this.unreadCount = 0,
  });

  final String id;
  final String type;
  final String targetId;
  final String targetName;
  final String? lastMessage;
  final String? lastActiveTime;
  final int unreadCount;

  factory ChatSession.fromJson(Map<String, dynamic> json) {
    final type = json['type']?.toString() ?? 'private';
    final targetId = '${json['targetId'] ?? ''}';
    final targetName = json['targetName']?.toString() ?? targetId;
    return ChatSession(
      id: json['id']?.toString() ?? (type == 'group' ? 'group_$targetId' : targetId),
      type: type,
      targetId: targetId,
      targetName: targetName,
      lastMessage: json['lastMessage']?.toString(),
      lastActiveTime: json['lastActiveTime']?.toString(),
      unreadCount: int.tryParse('${json['unreadCount'] ?? 0}') ?? 0,
    );
  }
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.senderId,
    required this.content,
    required this.messageType,
    required this.sendTime,
    this.receiverId,
    this.groupId,
    this.status,
    this.mediaUrl,
    this.mediaName,
    this.mediaSize,
    this.localFilePath,
    this.readBy,
    this.readByCount,
    this.readStatus,
    this.readAt,
  });

  final String id;
  final String senderId;
  final String content;
  final String messageType;
  final String sendTime;
  final String? receiverId;
  final String? groupId;
  final String? status;
  final String? mediaUrl;
  final String? mediaName;
  final int? mediaSize;
  final String? localFilePath;
  final List<String>? readBy;
  final int? readByCount;
  final int? readStatus;
  final String? readAt;

  bool get isGroup => groupId != null && groupId!.isNotEmpty;
  bool get isImage => messageType == 'IMAGE';
  bool get isFile => messageType == 'FILE';

  ChatMessage copyWith({
    String? id,
    String? senderId,
    String? content,
    String? messageType,
    String? sendTime,
    String? receiverId,
    String? groupId,
    String? status,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? localFilePath,
    List<String>? readBy,
    int? readByCount,
    int? readStatus,
    String? readAt,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      senderId: senderId ?? this.senderId,
      content: content ?? this.content,
      messageType: messageType ?? this.messageType,
      sendTime: sendTime ?? this.sendTime,
      receiverId: receiverId ?? this.receiverId,
      groupId: groupId ?? this.groupId,
      status: status ?? this.status,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      mediaName: mediaName ?? this.mediaName,
      mediaSize: mediaSize ?? this.mediaSize,
      localFilePath: localFilePath ?? this.localFilePath,
      readBy: readBy ?? this.readBy,
      readByCount: readByCount ?? this.readByCount,
      readStatus: readStatus ?? this.readStatus,
      readAt: readAt ?? this.readAt,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: '${json['id'] ?? json['messageId'] ?? ''}',
      senderId: '${json['senderId'] ?? ''}',
      content: json['content']?.toString() ?? '',
      messageType: json['messageType']?.toString() ?? json['type']?.toString() ?? 'TEXT',
      sendTime: json['sendTime']?.toString() ?? DateTime.now().toIso8601String(),
      receiverId: json['receiverId']?.toString(),
      groupId: json['groupId']?.toString(),
      status: json['status']?.toString(),
      mediaUrl: json['mediaUrl']?.toString(),
      mediaName: json['mediaName']?.toString(),
      mediaSize: int.tryParse('${json['mediaSize'] ?? ''}'),
      localFilePath: json['localFilePath']?.toString(),
      readBy: (json['readBy'] as List<dynamic>?)?.map((item) => item.toString()).toList(),
      readByCount: int.tryParse('${json['readByCount'] ?? ''}'),
      readStatus: int.tryParse('${json['readStatus'] ?? json['read_status'] ?? ''}'),
      readAt: json['readAt']?.toString() ?? json['read_at']?.toString(),
    );
  }
}

class FriendItem {
  FriendItem({
    required this.userId,
    required this.username,
    this.nickname,
  });

  final String userId;
  final String username;
  final String? nickname;

  factory FriendItem.fromJson(Map<String, dynamic> json) {
    return FriendItem(
      userId: '${json['friendId'] ?? json['userId'] ?? json['id'] ?? ''}',
      username: json['username']?.toString() ?? '',
      nickname: json['nickname']?.toString(),
    );
  }
}

class GroupItem {
  GroupItem({
    required this.id,
    required this.groupName,
    this.description,
  });

  final String id;
  final String groupName;
  final String? description;

  factory GroupItem.fromJson(Map<String, dynamic> json) {
    return GroupItem(
      id: '${json['id'] ?? ''}',
      groupName: json['groupName']?.toString() ?? json['name']?.toString() ?? '',
      description: json['description']?.toString() ?? json['announcement']?.toString(),
    );
  }
}
