import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:idb_shim/idb_browser.dart';
import '../../../core/network/network_status_provider.dart';
import '../presentation/chat_providers.dart';
import 'message_outbox.dart';
import 'message_api.dart';

/// Provider for the message outbox
final messageOutboxProvider = Provider<MessageOutbox>((ref) {
  final messageApi = ref.watch(messageApiProvider);
  final networkStatus = ref.watch(networkStatusProvider.notifier);

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
