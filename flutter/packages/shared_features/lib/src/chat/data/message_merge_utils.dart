import 'package:im_core/core.dart';

/// Deduplicates and merges two message lists chronologically.
///
/// Deduplication rules:
/// - Messages with the same server [Message.id] are considered the same message.
/// - Messages with the same [Message.clientMessageId] are considered the same message.
/// - When merging, the server-ack version (with real server id) takes precedence.
/// - All fields from the incoming message are preserved when non-empty.
List<Message> mergeMessagesChronologically(
  List<Message> existing,
  List<Message> incoming,
) {
  final buckets = <_MessageBucket>[];

  for (final msg in existing) {
    _mergeIntoBuckets(buckets, msg);
  }

  for (final msg in incoming) {
    _mergeIntoBuckets(buckets, msg);
  }

  final result = buckets.map((bucket) => bucket.message).toList();
  result.sort((a, b) {
    final timeA = DateTime.tryParse(a.sendTime) ?? DateTime(2000);
    final timeB = DateTime.tryParse(b.sendTime) ?? DateTime(2000);
    return timeA.compareTo(timeB);
  });

  return result;
}

void _mergeIntoBuckets(List<_MessageBucket> buckets, Message message) {
  final messageKeys = _messageKeys(message);
  final matchedIndexes = <int>[];
  for (var i = 0; i < buckets.length; i++) {
    if (buckets[i].hasAny(messageKeys)) {
      matchedIndexes.add(i);
    }
  }

  if (matchedIndexes.isEmpty) {
    buckets.add(_MessageBucket(message));
    return;
  }

  final firstIndex = matchedIndexes.first;
  var merged = buckets[firstIndex].message;
  for (final index in matchedIndexes.skip(1)) {
    merged = _mergeTwoMessages(merged, buckets[index].message);
  }
  merged = _mergeTwoMessages(merged, message);

  for (final index in matchedIndexes.skip(1).toList().reversed) {
    buckets.removeAt(index);
  }
  buckets[firstIndex] = _MessageBucket(merged);
}

class _MessageBucket {
  _MessageBucket(this.message) : keys = _messageKeys(message);

  final Message message;
  final Set<String> keys;

  bool hasAny(Set<String> otherKeys) {
    for (final key in otherKeys) {
      if (keys.contains(key)) {
        return true;
      }
    }
    return false;
  }
}

Set<String> _messageKeys(Message message) {
  return {
    if (message.id.trim().isNotEmpty) message.id,
    if (message.messageId?.trim().isNotEmpty ?? false) message.messageId!,
    if (message.clientMessageId?.trim().isNotEmpty ?? false)
      message.clientMessageId!,
  };
}

/// Merges two messages, preferring non-empty values from the incoming message.
Message _mergeTwoMessages(Message existing, Message incoming) {
  return Message(
    // Prefer server id (non-local) over local id.
    id: _preferredMessageId(existing, incoming),
    senderId:
        incoming.senderId.isNotEmpty ? incoming.senderId : existing.senderId,
    isGroupChat: incoming.isGroupChat,
    messageType: incoming.messageType.isNotEmpty
        ? incoming.messageType
        : existing.messageType,
    content: incoming.content.isNotEmpty ? incoming.content : existing.content,
    sendTime:
        incoming.sendTime.isNotEmpty ? incoming.sendTime : existing.sendTime,
    status: incoming.status.isNotEmpty ? incoming.status : existing.status,
    messageId: incoming.messageId ?? existing.messageId,
    clientMessageId: incoming.clientMessageId ?? existing.clientMessageId,
    senderName: incoming.senderName ?? existing.senderName,
    senderAvatar: incoming.senderAvatar ?? existing.senderAvatar,
    receiverId: incoming.receiverId ?? existing.receiverId,
    receiverName: incoming.receiverName ?? existing.receiverName,
    receiverAvatar: incoming.receiverAvatar ?? existing.receiverAvatar,
    groupId: incoming.groupId ?? existing.groupId,
    conversationSeq: incoming.conversationSeq ?? existing.conversationSeq,
    groupName: incoming.groupName ?? existing.groupName,
    groupAvatar: incoming.groupAvatar ?? existing.groupAvatar,
    mediaUrl: incoming.mediaUrl ?? existing.mediaUrl,
    mediaSize: incoming.mediaSize ?? existing.mediaSize,
    mediaName: incoming.mediaName ?? existing.mediaName,
    thumbnailUrl: incoming.thumbnailUrl ?? existing.thumbnailUrl,
    duration: incoming.duration ?? existing.duration,
    extra: incoming.extra ?? existing.extra,
    mentionedUserIds: incoming.mentionedUserIds ?? existing.mentionedUserIds,
    readBy: incoming.readBy ?? existing.readBy,
    readByCount: incoming.readByCount ?? existing.readByCount,
    readStatus: incoming.readStatus ?? existing.readStatus,
    readAt: incoming.readAt ?? existing.readAt,
    isAiGenerated: incoming.isAiGenerated ?? existing.isAiGenerated,
    aiProvider: incoming.aiProvider ?? existing.aiProvider,
    aiModel: incoming.aiModel ?? existing.aiModel,
    encrypted: incoming.encrypted ?? existing.encrypted,
    e2eeDeviceId: incoming.e2eeDeviceId ?? existing.e2eeDeviceId,
    e2eeEnvelope: incoming.e2eeEnvelope ?? existing.e2eeEnvelope,
    decryptStatus: incoming.decryptStatus ?? existing.decryptStatus,
  );
}

String _preferredMessageId(Message existing, Message incoming) {
  final incomingServerId =
      _serverIdCandidate(incoming.messageId, incoming.clientMessageId) ??
          _serverIdCandidate(incoming.id, incoming.clientMessageId);
  if (incomingServerId != null) return incomingServerId;

  final existingServerId =
      _serverIdCandidate(existing.messageId, existing.clientMessageId) ??
          _serverIdCandidate(existing.id, existing.clientMessageId);
  if (existingServerId != null) return existingServerId;

  return incoming.id.isNotEmpty ? incoming.id : existing.id;
}

String? _serverIdCandidate(String? id, String? clientMessageId) {
  if (id == null || id.isEmpty) return null;
  return _isLocalMessageId(id, clientMessageId) ? null : id;
}

bool _isLocalMessageId(String id, String? clientMessageId) {
  if (id.isEmpty) return true;
  if (id.startsWith('local_') || id.startsWith('local-')) return true;
  return clientMessageId != null &&
      clientMessageId.isNotEmpty &&
      id == clientMessageId;
}
