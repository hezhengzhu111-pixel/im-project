import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_shared_features/chat.dart' show SentMessageCachePort, OutboxPort;
import '../data/mobile_sent_message_cache.dart';
import '../data/mobile_message_outbox.dart';

/// Creates a [MobileSentMessageCache] backed by SharedPreferences.
final mobileSentMessageCacheProvider = Provider<SentMessageCachePort>((ref) {
  throw UnimplementedError(
    'Must be overridden in ProviderScope with a SharedPreferences instance.',
  );
});

/// Creates a [MobileMessageOutbox] backed by SharedPreferences.
final mobileMessageOutboxProvider = Provider<OutboxPort>((ref) {
  throw UnimplementedError(
    'Must be overridden in ProviderScope with a SharedPreferences instance.',
  );
});
