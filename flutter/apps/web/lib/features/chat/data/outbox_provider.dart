import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:idb_shim/idb_browser.dart';
import 'package:im_shared_features/chat.dart' show OutboxPort;
import '../../../core/network/network_status_provider.dart';
import 'message_api_provider.dart';
import 'message_outbox.dart';
import 'web_outbox_port.dart';

/// Provider for the message outbox
final messageOutboxProvider = Provider<MessageOutbox>((ref) {
  final messageApi = ref.watch(messageApiProvider);

  final outbox = MessageOutbox(
    messageApi: messageApi,
    idbFactory: getIdbFactory()!,
    isOnline: () => ref.read(networkStatusProvider).isOnline,
  );

  // Initialize the outbox
  outbox.initialize();

  // Listen for network restoration
  ref.listen(networkStatusProvider, (prev, next) {
    if (prev != null && !prev.isOnline && next.isOnline) {
      outbox.onNetworkAvailable();
    }
  });

  ref.onDispose(() => outbox.dispose());
  return outbox;
});

/// Provider for pending message count
final outboxPendingCountProvider = FutureProvider<int>((ref) async {
  final outbox = ref.watch(messageOutboxProvider);
  return outbox.getPendingCount();
});

/// Provider for failed message count
final outboxFailedCountProvider = FutureProvider<int>((ref) async {
  final outbox = ref.watch(messageOutboxProvider);
  return outbox.getFailedCount();
});

/// Provider for outbox events stream
final outboxEventsProvider = StreamProvider<OutboxEvent>((ref) {
  final outbox = ref.watch(messageOutboxProvider);
  return outbox.events;
});

final webOutboxPortProvider = Provider<OutboxPort>((ref) {
  final outbox = WebOutboxPort(
    idbFactory: getIdbFactory()!,
    isOnline: () => ref.read(networkStatusProvider).isOnline,
  );
  outbox.initialize();
  ref.onDispose(() {
    outbox.dispose();
  });
  return outbox;
});
