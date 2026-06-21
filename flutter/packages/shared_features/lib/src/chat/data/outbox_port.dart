import 'dart:async';
import 'package:im_core/core.dart';

/// Status of an outbox message.
enum OutboxMessageStatus { pending, retrying, sent, failed }

/// Type of outbox events.
enum OutboxEventType {
  messageAdded,
  messageRetrying,
  messageSent,
  messageFailed,
  retryAllStarted,
  retryAllCompleted
}

/// Event emitted by the outbox when message state changes.
class OutboxEvent {
  const OutboxEvent({
    required this.type,
    this.message,
  });

  final OutboxEventType type;
  final Message? message;
}

/// A message stored in the outbox for later retry.
class OutboxMessage {
  final String id;
  final String sessionKey;
  final String receiverId;
  final String content;
  final String messageType;
  final String clientMessageId;
  final OutboxMessageStatus status;
  final int retryCount;
  final int maxRetries;
  final String? mediaUrl;
  final String? mediaName;
  final int? mediaSize;
  final String? thumbnailUrl;
  final int? duration;
  final Map<String, dynamic>? extra;

  /// Group chat fields.
  final bool isGroupChat;
  final String? groupId;

  /// E2EE fields.
  final bool isEncrypted;
  final Map<String, dynamic>? e2eeEnvelope;
  final List<Map<String, dynamic>>? e2eeEnvelopes;
  final String? e2eeDeviceId;

  /// Error information.
  final String? lastError;
  final String? createdAt;
  final String? lastRetryAt;

  const OutboxMessage({
    required this.id,
    required this.sessionKey,
    required this.receiverId,
    required this.content,
    required this.messageType,
    required this.clientMessageId,
    this.status = OutboxMessageStatus.pending,
    this.retryCount = 0,
    this.maxRetries = 5,
    this.mediaUrl,
    this.mediaName,
    this.mediaSize,
    this.thumbnailUrl,
    this.duration,
    this.extra,
    this.isGroupChat = false,
    this.groupId,
    this.isEncrypted = false,
    this.e2eeEnvelope,
    this.e2eeEnvelopes,
    this.e2eeDeviceId,
    this.lastError,
    this.createdAt,
    this.lastRetryAt,
  });

  OutboxMessage copyWith({
    OutboxMessageStatus? status,
    int? retryCount,
    String? lastError,
    String? lastRetryAt,
  }) {
    return OutboxMessage(
      id: id,
      sessionKey: sessionKey,
      receiverId: receiverId,
      content: content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      status: status ?? this.status,
      retryCount: retryCount ?? this.retryCount,
      maxRetries: maxRetries,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
      extra: extra,
      isGroupChat: isGroupChat,
      groupId: groupId,
      isEncrypted: isEncrypted,
      e2eeEnvelope: e2eeEnvelope,
      e2eeEnvelopes: e2eeEnvelopes,
      e2eeDeviceId: e2eeDeviceId,
      lastError: lastError ?? this.lastError,
      createdAt: createdAt,
      lastRetryAt: lastRetryAt ?? this.lastRetryAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'sessionKey': sessionKey,
      'receiverId': receiverId,
      'content': content,
      'messageType': messageType,
      'clientMessageId': clientMessageId,
      'status': status.name,
      'retryCount': retryCount,
      'maxRetries': maxRetries,
      'mediaUrl': mediaUrl,
      'mediaName': mediaName,
      'mediaSize': mediaSize,
      'thumbnailUrl': thumbnailUrl,
      'duration': duration,
      'extra': extra,
      'isGroupChat': isGroupChat,
      'groupId': groupId,
      'isEncrypted': isEncrypted,
      'e2eeEnvelope': e2eeEnvelope,
      'e2eeEnvelopes': e2eeEnvelopes,
      'e2eeDeviceId': e2eeDeviceId,
      'lastError': lastError,
      'createdAt': createdAt,
      'lastRetryAt': lastRetryAt,
    };
  }

  factory OutboxMessage.fromMap(Map<String, dynamic> map) {
    return OutboxMessage(
      id: map['id'] as String? ?? '',
      sessionKey: map['sessionKey'] as String? ?? '',
      receiverId: map['receiverId'] as String? ?? '',
      content: map['content'] as String? ?? '',
      messageType: map['messageType'] as String? ?? 'TEXT',
      clientMessageId: map['clientMessageId'] as String? ?? '',
      status: _parseStatus(map['status'] as String?),
      retryCount: map['retryCount'] as int? ?? 0,
      maxRetries: map['maxRetries'] as int? ?? 5,
      mediaUrl: map['mediaUrl'] as String?,
      mediaName: map['mediaName'] as String?,
      mediaSize: map['mediaSize'] as int?,
      thumbnailUrl: map['thumbnailUrl'] as String?,
      duration: map['duration'] as int?,
      extra: map['extra'] as Map<String, dynamic>?,
      isGroupChat: map['isGroupChat'] as bool? ?? false,
      groupId: map['groupId'] as String?,
      isEncrypted: map['isEncrypted'] as bool? ?? false,
      e2eeEnvelope: map['e2eeEnvelope'] as Map<String, dynamic>?,
      e2eeEnvelopes: (map['e2eeEnvelopes'] as List?)
          ?.map((item) => Map<String, dynamic>.from(item as Map))
          .toList(),
      e2eeDeviceId: map['e2eeDeviceId'] as String?,
      lastError: map['lastError'] as String?,
      createdAt: map['createdAt'] as String?,
      lastRetryAt: map['lastRetryAt'] as String?,
    );
  }

  static OutboxMessageStatus _parseStatus(String? s) {
    switch (s) {
      case 'pending':
        return OutboxMessageStatus.pending;
      case 'retrying':
        return OutboxMessageStatus.retrying;
      case 'sent':
        return OutboxMessageStatus.sent;
      case 'failed':
        return OutboxMessageStatus.failed;
      default:
        return OutboxMessageStatus.pending;
    }
  }

  bool get isPending => status == OutboxMessageStatus.pending;
  bool get isFailed => status == OutboxMessageStatus.failed;
  bool get isSent => status == OutboxMessageStatus.sent;
}

/// Abstract port for outbox operations.
///
/// Platform-specific implementations (IndexedDB for Web, SharedPreferences for
/// Mobile) provide the actual persistence. The ChatNotifier depends on this
/// interface, not on a concrete implementation.
abstract class OutboxPort {
  /// Stream of outbox events for UI updates.
  Stream<OutboxEvent> get events;

  /// Number of pending (not yet sent) messages.
  Future<int> getPendingCount();

  /// Number of failed messages.
  Future<int> getFailedCount();

  /// Enqueue a message for later delivery.
  Future<void> enqueue(OutboxMessage message);

  /// Retry all retryable outbox messages using [sender].
  ///
  /// Retryable messages include [OutboxMessageStatus.pending] and
  /// [OutboxMessageStatus.failed]. Implementations must NOT retry
  /// [OutboxMessageStatus.sent] messages and should guard against concurrent
  /// retry invocations.
  ///
  /// [sender] is a callback that sends a single [OutboxMessage] and returns
  /// the server-acknowledged [Message] on success, or throws on failure.
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  );

  /// Clear all outbox entries.
  Future<void> clearAll();
}
