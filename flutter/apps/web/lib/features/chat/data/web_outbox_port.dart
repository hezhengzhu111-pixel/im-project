import 'dart:async';

import 'package:idb_shim/idb.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart' as shared;

class WebOutboxPort implements shared.OutboxPort {
  WebOutboxPort({
    required IdbFactory idbFactory,
    required bool Function() isOnline,
    String dbName = 'im_outbox_shared',
  })  : _idbFactory = idbFactory,
        _isOnline = isOnline,
        _dbName = dbName;

  final IdbFactory _idbFactory;
  final bool Function() _isOnline;
  final String _dbName;
  final _eventsController = StreamController<shared.OutboxEvent>.broadcast();
  Future<Database>? _dbFuture;
  bool _isRetrying = false;

  static const _storeName = 'messages';
  static const _dbVersion = 1;

  @override
  Stream<shared.OutboxEvent> get events => _eventsController.stream;

  Future<void> initialize() async {
    await _db();
  }

  Future<Database> _db() {
    return _dbFuture ??= _idbFactory.open(
      _dbName,
      version: _dbVersion,
      onUpgradeNeeded: (event) {
        final db = event.database;
        if (!db.objectStoreNames.contains(_storeName)) {
          db.createObjectStore(_storeName, keyPath: 'id');
        }
      },
    );
  }

  @override
  Future<void> enqueue(shared.OutboxMessage message) async {
    final db = await _db();
    final existing = await _getByClientMessageId(message.clientMessageId);
    if (existing != null) return;
    final txn = db.transaction(_storeName, idbModeReadWrite);
    await txn.objectStore(_storeName).put(message.toMap());
    await txn.completed;
    _eventsController.add(shared.OutboxEvent(
      type: shared.OutboxEventType.messageAdded,
    ));
  }

  @override
  Future<int> getFailedCount() async {
    return _countWhere(
        (message) => message.status == shared.OutboxMessageStatus.failed);
  }

  @override
  Future<int> getPendingCount() async {
    return _countWhere((message) =>
        message.status == shared.OutboxMessageStatus.pending ||
        message.status == shared.OutboxMessageStatus.retrying);
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(shared.OutboxMessage message) sender,
  ) async {
    if (_isRetrying || !_isOnline()) return;
    _isRetrying = true;
    _eventsController.add(const shared.OutboxEvent(
      type: shared.OutboxEventType.retryAllStarted,
    ));
    try {
      final failed = await _messagesWhere(
        (message) => message.status == shared.OutboxMessageStatus.failed,
      );
      for (final message in failed) {
        if (!_isOnline()) break;
        await _retryOne(message, sender);
      }
    } finally {
      _isRetrying = false;
      _eventsController.add(const shared.OutboxEvent(
        type: shared.OutboxEventType.retryAllCompleted,
      ));
    }
  }

  @override
  Future<void> clearAll() async {
    final db = await _db();
    final txn = db.transaction(_storeName, idbModeReadWrite);
    await txn.objectStore(_storeName).clear();
    await txn.completed;
  }

  Future<void> dispose() async {
    await _eventsController.close();
    final db = await _dbFuture;
    db?.close();
  }

  Future<void> _retryOne(
    shared.OutboxMessage message,
    Future<Message?> Function(shared.OutboxMessage message) sender,
  ) async {
    final retrying = message.copyWith(
      status: shared.OutboxMessageStatus.retrying,
      retryCount: message.retryCount + 1,
      lastRetryAt: DateTime.now().toIso8601String(),
    );
    await _save(retrying);
    _eventsController.add(const shared.OutboxEvent(
      type: shared.OutboxEventType.messageRetrying,
    ));

    try {
      final sent = await sender(retrying);
      if (sent == null) {
        throw StateError('outbox sender returned null');
      }
      await _delete(retrying.id);
      _eventsController.add(shared.OutboxEvent(
        type: shared.OutboxEventType.messageSent,
        message: sent,
      ));
    } catch (e) {
      final failed = retrying.copyWith(
        status: shared.OutboxMessageStatus.failed,
        lastError: e.toString(),
      );
      await _save(failed);
      _eventsController.add(const shared.OutboxEvent(
        type: shared.OutboxEventType.messageFailed,
      ));
    }
  }

  Future<void> _save(shared.OutboxMessage message) async {
    final db = await _db();
    final txn = db.transaction(_storeName, idbModeReadWrite);
    await txn.objectStore(_storeName).put(message.toMap());
    await txn.completed;
  }

  Future<void> _delete(String id) async {
    final db = await _db();
    final txn = db.transaction(_storeName, idbModeReadWrite);
    await txn.objectStore(_storeName).delete(id);
    await txn.completed;
  }

  Future<shared.OutboxMessage?> _getByClientMessageId(
    String clientMessageId,
  ) async {
    final messages = await _messagesWhere(
      (message) =>
          message.clientMessageId == clientMessageId &&
          message.status != shared.OutboxMessageStatus.sent,
    );
    return messages.isEmpty ? null : messages.first;
  }

  Future<int> _countWhere(bool Function(shared.OutboxMessage) predicate) async {
    return (await _messagesWhere(predicate)).length;
  }

  Future<List<shared.OutboxMessage>> _messagesWhere(
    bool Function(shared.OutboxMessage message) predicate,
  ) async {
    final db = await _db();
    final txn = db.transaction(_storeName, idbModeReadOnly);
    final store = txn.objectStore(_storeName);
    final messages = <shared.OutboxMessage>[];
    await store.openCursor(autoAdvance: true).forEach((cursor) {
      final raw = cursor.value;
      if (raw is! Map) return;
      final message = shared.OutboxMessage.fromMap(
        Map<String, dynamic>.from(raw),
      );
      if (predicate(message)) messages.add(message);
    });
    await txn.completed;
    messages.sort((a, b) => (a.createdAt ?? '').compareTo(b.createdAt ?? ''));
    return messages;
  }
}
