import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart'
    show OutboxPort, OutboxEvent, OutboxMessage, OutboxMessageStatus, OutboxEventType, RetryableErrorClassifier;

/// Mobile implementation of [OutboxPort] using SharedPreferences for storage.
///
/// Stores pending messages as a JSON list in SharedPreferences. This is
/// suitable for the mobile use case where the outbox typically contains
/// fewer than 100 items.
class MobileMessageOutbox implements OutboxPort {
  MobileMessageOutbox(this._prefs) {
    _loadFromStorage();
  }

  final SharedPreferences _prefs;
  final _eventController = StreamController<OutboxEvent>.broadcast();
  final _messages = <OutboxMessage>[];

  static const _storageKey = 'im_outbox_messages';

  @override
  Stream<OutboxEvent> get events => _eventController.stream;

  @override
  Future<int> getPendingCount() async {
    return _messages.where((m) => m.isPending).length;
  }

  @override
  Future<int> getFailedCount() async {
    return _messages.where((m) => m.isFailed).length;
  }

  @override
  Future<void> enqueue(OutboxMessage message) async {
    // Dedup: skip if already sent, keep existing if pending/failed/retrying.
    final existing = _messages.where(
      (m) => m.clientMessageId == message.clientMessageId,
    ).firstOrNull;
    if (existing != null) {
      if (existing.isSent) return; // Already delivered.
      // Already queued; don't duplicate.
      return;
    }
    _messages.add(message);
    _eventController.add(const OutboxEvent(type: OutboxEventType.messageAdded));
    await _saveToStorage();
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  ) async {
    if (_messages.isEmpty) return;

    _eventController
        .add(const OutboxEvent(type: OutboxEventType.retryAllStarted));

    final toRetry = _messages
        .where((m) => m.isPending || m.isFailed)
        .toList();

    for (final msg in toRetry) {
      // Pre-flight: encrypted outbox requires envelope and deviceId.
      if (msg.isEncrypted) {
        if (msg.e2eeEnvelope == null) {
          _updateMessage(msg.copyWith(
            status: OutboxMessageStatus.failed,
            lastError: 'encrypted_outbox_missing_envelope',
          ));
          _eventController.add(const OutboxEvent(
            type: OutboxEventType.messageFailed,
          ));
          continue;
        }
        if (msg.e2eeDeviceId == null || msg.e2eeDeviceId!.isEmpty) {
          _updateMessage(msg.copyWith(
            status: OutboxMessageStatus.failed,
            lastError: 'encrypted_outbox_missing_device_id',
          ));
          _eventController.add(const OutboxEvent(
            type: OutboxEventType.messageFailed,
          ));
          continue;
        }
      }

      if (msg.retryCount >= msg.maxRetries) {
        final updated = msg.copyWith(
          status: OutboxMessageStatus.failed,
          lastError: 'max_retries_exceeded',
        );
        _updateMessage(updated);
        _eventController.add(const OutboxEvent(
          type: OutboxEventType.messageFailed,
        ));
        continue;
      }

      _updateMessage(msg.copyWith(
        status: OutboxMessageStatus.retrying,
        lastRetryAt: DateTime.now().toIso8601String(),
      ));
      _eventController
          .add(const OutboxEvent(type: OutboxEventType.messageRetrying));

      try {
        final result = await sender(msg);
        if (result != null) {
          _updateMessage(msg.copyWith(status: OutboxMessageStatus.sent));
          _eventController.add(OutboxEvent(
            type: OutboxEventType.messageSent,
            message: result,
          ));
          // Remove sent message from storage.
          _messages.removeWhere((m) => m.id == msg.id);
        } else {
          // sender returned null — treat as failure.
          _updateMessage(msg.copyWith(
            status: OutboxMessageStatus.failed,
            retryCount: msg.retryCount + 1,
            lastError: 'send_returned_null',
            lastRetryAt: DateTime.now().toIso8601String(),
          ));
          _eventController.add(const OutboxEvent(
            type: OutboxEventType.messageFailed,
          ));
        }
      } catch (e) {
        _updateMessage(msg.copyWith(
          status: OutboxMessageStatus.failed,
          retryCount: msg.retryCount + 1,
          lastError: RetryableErrorClassifier.safeErrorCode(e),
          lastRetryAt: DateTime.now().toIso8601String(),
        ));
        _eventController.add(const OutboxEvent(
          type: OutboxEventType.messageFailed,
        ));
      }
    }

    await _saveToStorage();
    _eventController
        .add(const OutboxEvent(type: OutboxEventType.retryAllCompleted));
  }

  @override
  Future<void> clearAll() async {
    _messages.clear();
    await _prefs.remove(_storageKey);
  }

  // ---- Internal helpers ----

  void _updateMessage(OutboxMessage updated) {
    final index = _messages.indexWhere((m) => m.id == updated.id);
    if (index != -1) {
      _messages[index] = updated;
    }
  }

  Future<void> _saveToStorage() async {
    final list =
        _messages.map((m) => jsonEncode(m.toMap())).toList();
    await _prefs.setString(_storageKey, jsonEncode(list));
  }

  void _loadFromStorage() {
    final raw = _prefs.getString(_storageKey);
    if (raw == null) return;
    try {
      final list = jsonDecode(raw) as List;
      for (final item in list) {
        if (item is String) {
          _messages.add(OutboxMessage.fromMap(jsonDecode(item) as Map<String, dynamic>));
        } else if (item is Map<String, dynamic>) {
          _messages.add(OutboxMessage.fromMap(item));
        }
      }
    } catch (_) {
      // Corrupted data; start fresh.
    }
  }
}
