import 'dart:async';
import 'dart:convert';
import 'package:idb_shim/idb_shim.dart';
import '../../../core/logging/app_logger.dart';
import '../data/message_api.dart';

/// Status of a message in the outbox
enum OutboxMessageStatus {
  pending,
  retrying,
  failed,
  sent,
}

/// A message entry in the outbox
class OutboxMessage {
  const OutboxMessage({
    required this.id,
    required this.sessionKey,
    required this.receiverId,
    required this.content,
    required this.messageType,
    required this.clientMessageId,
    this.isGroupChat = false,
    this.groupId,
    this.status = OutboxMessageStatus.pending,
    this.retryCount = 0,
    this.lastRetryAt,
    this.createdAt,
    this.error,
    this.isEncrypted = false,
    this.e2eeEnvelope,
    this.e2eeDeviceId,
  });

  final String id;
  final String sessionKey;
  final String receiverId;
  final String content;
  final String messageType;
  final String clientMessageId;
  final bool isGroupChat;
  final String? groupId;
  final OutboxMessageStatus status;
  final int retryCount;
  final DateTime? lastRetryAt;
  final DateTime? createdAt;
  final String? error;
  final bool isEncrypted;
  final Map<String, dynamic>? e2eeEnvelope;
  final String? e2eeDeviceId;

  OutboxMessage copyWith({
    OutboxMessageStatus? status,
    int? retryCount,
    DateTime? lastRetryAt,
    String? error,
  }) {
    return OutboxMessage(
      id: id,
      sessionKey: sessionKey,
      receiverId: receiverId,
      content: content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      isGroupChat: isGroupChat,
      groupId: groupId,
      status: status ?? this.status,
      retryCount: retryCount ?? this.retryCount,
      lastRetryAt: lastRetryAt ?? this.lastRetryAt,
      createdAt: createdAt,
      error: error,
      isEncrypted: isEncrypted,
      e2eeEnvelope: e2eeEnvelope,
      e2eeDeviceId: e2eeDeviceId,
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
      'isGroupChat': isGroupChat,
      'groupId': groupId,
      'status': status.name,
      'retryCount': retryCount,
      'lastRetryAt': lastRetryAt?.toIso8601String(),
      'createdAt': createdAt?.toIso8601String(),
      'error': error,
      'isEncrypted': isEncrypted,
      'e2eeEnvelope': e2eeEnvelope != null ? jsonEncode(e2eeEnvelope) : null,
      'e2eeDeviceId': e2eeDeviceId,
    };
  }

  factory OutboxMessage.fromMap(Map<String, dynamic> map) {
    return OutboxMessage(
      id: map['id'] as String,
      sessionKey: map['sessionKey'] as String,
      receiverId: map['receiverId'] as String,
      content: map['content'] as String,
      messageType: map['messageType'] as String? ?? 'text',
      clientMessageId: map['clientMessageId'] as String,
      isGroupChat: map['isGroupChat'] as bool? ?? false,
      groupId: map['groupId'] as String?,
      status: OutboxMessageStatus.values.firstWhere(
        (e) => e.name == map['status'],
        orElse: () => OutboxMessageStatus.pending,
      ),
      retryCount: map['retryCount'] as int? ?? 0,
      lastRetryAt: map['lastRetryAt'] != null
          ? DateTime.parse(map['lastRetryAt'] as String)
          : null,
      createdAt: map['createdAt'] != null
          ? DateTime.parse(map['createdAt'] as String)
          : null,
      error: map['error'] as String?,
      isEncrypted: map['isEncrypted'] as bool? ?? false,
      e2eeEnvelope: map['e2eeEnvelope'] != null
          ? jsonDecode(map['e2eeEnvelope'] as String) as Map<String, dynamic>
          : null,
      e2eeDeviceId: map['e2eeDeviceId'] as String?,
    );
  }
}

/// Outbox event types
enum OutboxEventType {
  messageAdded,
  messageRetrying,
  messageSent,
  messageFailed,
  retryAllStarted,
  retryAllCompleted,
}

/// Outbox event
class OutboxEvent {
  const OutboxEvent({
    required this.type,
    this.message,
    this.error,
  });

  final OutboxEventType type;
  final OutboxMessage? message;
  final String? error;
}

/// Message outbox for offline message queueing and retry
class MessageOutbox {
  MessageOutbox({
    required MessageApi messageApi,
    required IdbFactory idbFactory,
    required bool Function() isOnline,
    String dbName = 'im_outbox',
  })  : _messageApi = messageApi,
        _idbFactory = idbFactory,
        _isOnline = isOnline,
        _dbName = dbName;

  final MessageApi _messageApi;
  final IdbFactory _idbFactory;
  final bool Function() _isOnline;
  final String _dbName;
  static const _storeName = 'messages';
  static const _dbVersion = 1;
  static const _maxRetries = 5;
  static const _retryDelay = Duration(seconds: 5);

  Database? _db;
  final _eventsController = StreamController<OutboxEvent>.broadcast();
  Timer? _retryTimer;
  bool _isRetrying = false;
  bool _isDisposed = false;

  /// Stream of outbox events
  Stream<OutboxEvent> get events => _eventsController.stream;

  /// Initialize the outbox database
  Future<void> initialize() async {
    _db = await _idbFactory.open(
      _dbName,
      version: _dbVersion,
      onUpgradeNeeded: (e) {
        final db = e.database;
        if (!db.objectStoreNames.contains(_storeName)) {
          db.createObjectStore(_storeName, keyPath: 'id');
        }
      },
    );

    // Process any pending messages on startup
    await _processPendingMessages();
  }

  /// Notify outbox that network has been restored (call from provider)
  void onNetworkAvailable() {
    if (!_isRetrying) {
      _processPendingMessages();
    }
  }

  /// Add a message to the outbox
  Future<OutboxMessage> enqueue({
    required String sessionKey,
    required String receiverId,
    required String content,
    String messageType = 'TEXT',
    required String clientMessageId,
    bool isGroupChat = false,
    String? groupId,
    bool isEncrypted = false,
    Map<String, dynamic>? e2eeEnvelope,
    String? e2eeDeviceId,
  }) async {
    // 检查是否已存在相同 clientMessageId 的消息（防重）
    final existing = await _getByClientMessageId(clientMessageId);
    if (existing != null) {
      return existing;
    }

    final message = OutboxMessage(
      id: 'outbox_${DateTime.now().millisecondsSinceEpoch}_$clientMessageId',
      sessionKey: sessionKey,
      receiverId: receiverId,
      content: content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      isGroupChat: isGroupChat,
      groupId: groupId,
      status: OutboxMessageStatus.pending,
      createdAt: DateTime.now(),
      isEncrypted: isEncrypted,
      e2eeEnvelope: e2eeEnvelope,
      e2eeDeviceId: e2eeDeviceId,
    );

    await _saveToDb(message);
    _eventsController.add(OutboxEvent(
      type: OutboxEventType.messageAdded,
      message: message,
    ));

    // Try to send immediately if online
    if (_isOnline()) {
      _processPendingMessages();
    }

    return message;
  }

  Future<void> _saveToDb(OutboxMessage message) async {
    final txn = _db!.transaction(_storeName, idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.put(message.toMap());
    await txn.completed;
  }

  Future<void> _updateInDb(OutboxMessage message) async {
    final txn = _db!.transaction(_storeName, idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.put(message.toMap());
    await txn.completed;
  }

  Future<void> _deleteFromDb(String id) async {
    final txn = _db!.transaction(_storeName, idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.delete(id);
    await txn.completed;
  }

  Future<OutboxMessage?> _getByClientMessageId(String clientMessageId) async {
    final txn = _db!.transaction(_storeName, idbModeReadOnly);
    final store = txn.objectStore(_storeName);
    OutboxMessage? result;

    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final map = cursor.value as Map<String, dynamic>;
      final message = OutboxMessage.fromMap(map);
      if (message.clientMessageId == clientMessageId &&
          message.status != OutboxMessageStatus.sent) {
        result = message;
      }
    });

    return result;
  }

  Future<List<OutboxMessage>> _getPendingMessages() async {
    final txn = _db!.transaction(_storeName, idbModeReadOnly);
    final store = txn.objectStore(_storeName);
    final results = <OutboxMessage>[];

    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final map = cursor.value as Map<String, dynamic>;
      final message = OutboxMessage.fromMap(map);
      if (message.status == OutboxMessageStatus.pending ||
          message.status == OutboxMessageStatus.retrying) {
        results.add(message);
      }
    });

    results.sort((a, b) => (a.createdAt ?? DateTime.now())
        .compareTo(b.createdAt ?? DateTime.now()));

    return results;
  }

  Future<void> _processPendingMessages() async {
    if (_isDisposed) return;
    if (_isRetrying) return;
    _isRetrying = true;

    try {
      final pendingMessages = await _getPendingMessages();
      if (pendingMessages.isEmpty) {
        _isRetrying = false;
        return;
      }

      for (final message in pendingMessages) {
        if (!_isOnline()) break;
        await _retryMessage(message);
      }
    } finally {
      _isRetrying = false;
    }
  }

  Future<void> _retryMessage(OutboxMessage message) async {
    if (_isDisposed) return;
    if (message.retryCount >= _maxRetries) {
      final failedMessage = message.copyWith(
        status: OutboxMessageStatus.failed,
        error: 'Max retries exceeded',
      );
      await _updateInDb(failedMessage);
      _eventsController.add(OutboxEvent(
        type: OutboxEventType.messageFailed,
        message: failedMessage,
        error: 'Max retries exceeded',
      ));
      return;
    }

    final retryingMessage = message.copyWith(
      status: OutboxMessageStatus.retrying,
      retryCount: message.retryCount + 1,
      lastRetryAt: DateTime.now(),
    );
    await _updateInDb(retryingMessage);
    _eventsController.add(OutboxEvent(
      type: OutboxEventType.messageRetrying,
      message: retryingMessage,
    ));

    try {
      if (message.isEncrypted && message.e2eeEnvelope != null) {
        await _messageApi.sendPrivateEncrypted(
          receiverId: message.receiverId,
          clientMessageId: message.clientMessageId,
          messageType: message.messageType,
          e2eeEnvelope: message.e2eeEnvelope!,
          e2eeDeviceId: message.e2eeDeviceId ?? '',
        );
      } else if (message.isGroupChat) {
        await _messageApi.sendGroupMessage(
          SendGroupMessageRequest(
            groupId: message.groupId ?? message.receiverId,
            content: message.content,
            messageType: message.messageType,
            clientMessageId: message.clientMessageId,
          ),
        );
      } else {
        await _messageApi.sendPrivateMessage(
          SendPrivateMessageRequest(
            receiverId: message.receiverId,
            content: message.content,
            messageType: message.messageType,
            clientMessageId: message.clientMessageId,
          ),
        );
      }

      await _deleteFromDb(message.id);
      _eventsController.add(OutboxEvent(
        type: OutboxEventType.messageSent,
        message: message,
      ));
    } catch (e, st) {
      AppLogger.instance.error('Outbox retry failed', e, st);

      if (message.retryCount + 1 >= _maxRetries) {
        final failedMessage = message.copyWith(
          status: OutboxMessageStatus.failed,
          retryCount: message.retryCount + 1,
          error: e.toString(),
        );
        await _updateInDb(failedMessage);
        _eventsController.add(OutboxEvent(
          type: OutboxEventType.messageFailed,
          message: failedMessage,
          error: e.toString(),
        ));
      } else {
        final pendingMessage = message.copyWith(
          status: OutboxMessageStatus.pending,
          retryCount: message.retryCount + 1,
          error: e.toString(),
        );
        await _updateInDb(pendingMessage);

        final delay = _retryDelay * (1 << message.retryCount);
        _retryTimer = Timer(delay, () {
          if (!_isDisposed && _isOnline()) {
            _processPendingMessages();
          }
        });
      }
    }
  }

  /// Retry all failed messages
  Future<void> retryAllFailed() async {
    final txn = _db!.transaction(_storeName, idbModeReadWrite);
    final store = txn.objectStore(_storeName);

    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final original = cursor.value as Map<String, dynamic>;
      if (original['status'] == OutboxMessageStatus.failed.name) {
        final map = Map<String, dynamic>.from(original);
        map['status'] = OutboxMessageStatus.pending.name;
        map['retryCount'] = 0;
        cursor.update(map);
      }
    });

    await txn.completed;
    _eventsController.add(const OutboxEvent(
      type: OutboxEventType.retryAllStarted,
    ));

    await _processPendingMessages();

    _eventsController.add(const OutboxEvent(
      type: OutboxEventType.retryAllCompleted,
    ));
  }

  Future<int> getPendingCount() async {
    final messages = await _getPendingMessages();
    return messages.length;
  }

  Future<int> getFailedCount() async {
    final txn = _db!.transaction(_storeName, idbModeReadOnly);
    final store = txn.objectStore(_storeName);
    var count = 0;

    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final map = cursor.value as Map<String, dynamic>;
      if (map['status'] == OutboxMessageStatus.failed.name) {
        count++;
      }
    });

    return count;
  }

  Future<void> clearAll() async {
    final txn = _db!.transaction(_storeName, idbModeReadWrite);
    final store = txn.objectStore(_storeName);
    await store.clear();
    await txn.completed;
  }

  void dispose() {
    _isDisposed = true;
    _eventsController.close();
    _retryTimer?.cancel();
  }
}
