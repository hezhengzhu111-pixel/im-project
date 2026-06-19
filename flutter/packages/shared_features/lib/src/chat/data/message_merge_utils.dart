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
  final result = <Message>[];
  for (final msg in [...existing, ...incoming]) {
    final index = result.indexWhere((candidate) {
      return _sameLogicalMessage(candidate, msg) ||
          _looksLikeLocalAck(candidate, msg) ||
          _looksLikeLocalAck(msg, candidate);
    });
    if (index == -1) {
      result.add(msg);
    } else {
      result[index] = _mergeTwoMessages(result[index], msg);
    }
  }

  result.sort((a, b) {
    final timeA = DateTime.tryParse(a.sendTime) ?? DateTime(2000);
    final timeB = DateTime.tryParse(b.sendTime) ?? DateTime(2000);
    return timeA.compareTo(timeB);
  });

  return result;
}

bool _sameLogicalMessage(Message left, Message right) {
  final leftKeys = _messageIdentityKeys(left);
  if (leftKeys.isEmpty) return false;
  return _messageIdentityKeys(right).any(leftKeys.contains);
}

Set<String> _messageIdentityKeys(Message msg) {
  final keys = <String>{};
  if (msg.id.isNotEmpty) {
    keys.add(msg.id);
  }
  final messageId = msg.messageId?.trim();
  if (messageId != null && messageId.isNotEmpty) {
    keys.add(messageId);
  }
  final clientMessageId = msg.clientMessageId?.trim();
  if (clientMessageId != null && clientMessageId.isNotEmpty) {
    keys.add(clientMessageId);
  }
  return keys;
}

bool _looksLikeLocalAck(Message local, Message ack) {
  if (!_isLocalOrPending(local) || _isLocalOrPending(ack)) return false;
  if (local.senderId != ack.senderId) return false;
  if (local.isGroupChat != ack.isGroupChat) return false;
  if (local.messageType != ack.messageType) return false;
  if ((local.groupId ?? '') != (ack.groupId ?? '')) return false;
  if ((local.receiverId ?? '') != (ack.receiverId ?? '')) return false;
  if (local.content != ack.content) return false;
  if ((local.mediaUrl ?? '') != (ack.mediaUrl ?? '')) return false;
  if ((local.mediaName ?? '') != (ack.mediaName ?? '')) return false;
  if ((local.thumbnailUrl ?? '') != (ack.thumbnailUrl ?? '')) return false;
  if (local.mediaSize != ack.mediaSize) return false;
  if (local.duration != ack.duration) return false;

  final localTime = DateTime.tryParse(local.sendTime);
  final ackTime = DateTime.tryParse(ack.sendTime);
  if (localTime == null || ackTime == null) return false;
  return ackTime.difference(localTime).abs() <= const Duration(minutes: 2);
}

bool _isLocalOrPending(Message msg) {
  final status = msg.status.toUpperCase();
  return msg.id.startsWith('local_') ||
      status == 'SENDING' ||
      status == 'PENDING';
}

/// Merges two messages, preferring non-empty values from the incoming message.
Message _mergeTwoMessages(Message existing, Message incoming) {
  return Message(
    // Prefer server id (non-local) over local id.
    id: (incoming.id.isNotEmpty && !incoming.id.startsWith('local_'))
        ? incoming.id
        : existing.id,
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
