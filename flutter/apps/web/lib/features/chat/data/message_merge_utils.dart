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
  // Build a map from canonical keys to Message objects.
  // Canonical key is the server id if available, otherwise clientMessageId.
  final merged = <String, Message>{};
  // Track which keys point to the same logical message for deduplication.
  final keyToCanonical = <String, String>{};

  // Add existing messages first.
  for (final msg in existing) {
    _addMessageToMap(merged, keyToCanonical, msg);
  }

  // Merge incoming messages.
  for (final msg in incoming) {
    final canonicalKey = _findCanonicalKey(merged, keyToCanonical, msg);
    if (canonicalKey != null && merged.containsKey(canonicalKey)) {
      // Merge with existing message.
      final existingMsg = merged[canonicalKey]!;
      final mergedMsg = _mergeTwoMessages(existingMsg, msg);
      // Remove old keys and add merged message with fresh keys.
      _removeAllKeysForMessage(merged, keyToCanonical, existingMsg);
      _addMessageToMap(merged, keyToCanonical, mergedMsg);
    } else {
      // New message, add it.
      _addMessageToMap(merged, keyToCanonical, msg);
    }
  }

  // Convert to list, deduplicate by object identity, and sort by sendTime.
  final seen = <Message>{};
  final result = <Message>[];
  for (final msg in merged.values) {
    if (seen.add(msg)) {
      result.add(msg);
    }
  }
  result.sort((a, b) {
    final timeA = DateTime.tryParse(a.sendTime) ?? DateTime(2000);
    final timeB = DateTime.tryParse(b.sendTime) ?? DateTime(2000);
    return timeA.compareTo(timeB);
  });

  return result;
}

/// Finds the canonical key for a message, or null if it's a new message.
String? _findCanonicalKey(
  Map<String, Message> merged,
  Map<String, String> keyToCanonical,
  Message msg,
) {
  // Check by server id first.
  if (msg.id.isNotEmpty && !msg.id.startsWith('local_')) {
    if (keyToCanonical.containsKey(msg.id)) {
      return keyToCanonical[msg.id];
    }
    if (merged.containsKey(msg.id)) {
      return msg.id;
    }
  }

  // Check by clientMessageId.
  if (msg.clientMessageId != null && msg.clientMessageId!.isNotEmpty) {
    if (keyToCanonical.containsKey(msg.clientMessageId!)) {
      return keyToCanonical[msg.clientMessageId!];
    }
    if (merged.containsKey(msg.clientMessageId!)) {
      return msg.clientMessageId;
    }
  }

  return null;
}

/// Adds a message to the map with all its keys.
void _addMessageToMap(
  Map<String, Message> merged,
  Map<String, String> keyToCanonical,
  Message msg,
) {
  // Use server id as canonical key if available, otherwise clientMessageId.
  final canonicalKey = (msg.id.isNotEmpty && !msg.id.startsWith('local_'))
      ? msg.id
      : (msg.clientMessageId ?? msg.id);

  // Add under server id.
  if (msg.id.isNotEmpty) {
    merged[msg.id] = msg;
    keyToCanonical[msg.id] = canonicalKey;
  }

  // Add under clientMessageId.
  if (msg.clientMessageId != null && msg.clientMessageId!.isNotEmpty) {
    merged[msg.clientMessageId!] = msg;
    keyToCanonical[msg.clientMessageId!] = canonicalKey;
  }
}

/// Removes all keys that pointed to a message.
void _removeAllKeysForMessage(
  Map<String, Message> merged,
  Map<String, String> keyToCanonical,
  Message msg,
) {
  final keysToRemove = <String>[];

  // Find all keys that point to this message.
  for (final entry in keyToCanonical.entries) {
    if (entry.value == msg.id || entry.value == msg.clientMessageId) {
      keysToRemove.add(entry.key);
    }
  }

  // Remove them.
  for (final key in keysToRemove) {
    merged.remove(key);
    keyToCanonical.remove(key);
  }
}

/// Merges two messages, preferring non-empty values from the incoming message.
Message _mergeTwoMessages(Message existing, Message incoming) {
  return Message(
    // Prefer server id (non-local) over local id.
    id: (incoming.id.isNotEmpty && !incoming.id.startsWith('local_'))
        ? incoming.id
        : existing.id,
    senderId: incoming.senderId.isNotEmpty
        ? incoming.senderId
        : existing.senderId,
    isGroupChat: incoming.isGroupChat,
    messageType: incoming.messageType.isNotEmpty
        ? incoming.messageType
        : existing.messageType,
    content: incoming.content.isNotEmpty ? incoming.content : existing.content,
    sendTime: incoming.sendTime.isNotEmpty ? incoming.sendTime : existing.sendTime,
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
