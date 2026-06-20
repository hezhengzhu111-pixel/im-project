import 'dart:math';

/// Generates stable, unique client-side message identifiers for the outbox.
///
/// The returned id is safe to persist and use as [Message.clientMessageId].
/// It combines a high-resolution timestamp, a random suffix, and a per-process
/// counter so that rapid successive calls cannot collide.
class OutboxMessageId {
  static final Random _random = Random.secure();
  static int _counter = 0;

  static String generate() {
    final timestamp = DateTime.now().microsecondsSinceEpoch;
    final randomSuffix = _random.nextInt(10000).toString().padLeft(4, '0');
    final count = (_counter++).toRadixString(36).padLeft(4, '0');
    return 'local_${timestamp}_${randomSuffix}_$count';
  }
}
