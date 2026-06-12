// flutter/apps/web/lib/features/chat/data/message_pipeline.dart
import 'dart:collection';

class MessagePipeline {
  final LinkedHashMap<String, DateTime> _recentIds = LinkedHashMap();
  static const int _maxSize = 1000;
  static const Duration _expiry = Duration(minutes: 5);

  /// Returns true if the message should be processed (not a duplicate)
  bool shouldProcess(String messageId) {
    _cleanup();
    if (_recentIds.containsKey(messageId)) return false;
    _recentIds[messageId] = DateTime.now();
    return true;
  }

  void _cleanup() {
    final now = DateTime.now();
    // Remove expired entries
    _recentIds
        .removeWhere((_, timestamp) => now.difference(timestamp) > _expiry);
    // Remove oldest if over capacity
    while (_recentIds.length > _maxSize) {
      _recentIds.remove(_recentIds.keys.first);
    }
  }

  void clear() {
    _recentIds.clear();
  }
}
