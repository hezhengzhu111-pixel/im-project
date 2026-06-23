import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_shared_features/chat.dart' as shared;
import '../../../core/network/network_providers.dart';
import '../../../core/network/network_status_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../e2ee/data/e2ee_providers.dart';
import '../data/outbox_provider.dart';
import '../data/web_sent_message_cache_adapter.dart';

final chatStateProvider =
    StateNotifierProvider<shared.ChatNotifier, shared.ChatState>((ref) {
  final sentCache = WebSentMessageCacheAdapter(
    ref.watch(e2eeSentMessageCacheProvider),
  );
  final notifier = shared.ChatNotifier(
    shared.MessageApi(
      ref.watch(httpClientProvider),
      currentUserId: () => ref.read(currentUserIdProvider),
    ),
    shared.MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(currentUserIdProvider),
    e2eeManager: ref.watch(e2eeManagerProvider),
    e2eeMetaStore: ref.watch(e2eeMetaStoreProvider),
    sentMessageCache: sentCache,
    outbox: ref.watch(webOutboxPortProvider),
    onE2eeStatusChanged: (sessionId) {
      ref.invalidate(e2eeSessionStatusProvider(sessionId));
    },
  );

  ref.listen(networkStatusProvider, (prev, next) {
    notifier.setOfflineStatus(next.isOffline);
  });
  ref.listen(networkStatusProvider, (prev, next) {
    if (prev != null && !prev.isOnline && next.isOnline) {
      notifier.retryPendingOutboxIfNeeded();
    }
  });
  return notifier;
});
