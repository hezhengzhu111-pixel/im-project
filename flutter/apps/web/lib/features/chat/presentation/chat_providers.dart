import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/network/network_providers.dart';
import '../../../core/network/network_status_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../e2ee/data/e2ee_providers.dart';
import '../data/message_api.dart';
import '../data/message_pipeline.dart';
import '../data/outbox_provider.dart';
import 'chat_provider_with_outbox.dart';

final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(ref.watch(httpClientProvider));
});

final chatStateProvider =
    StateNotifierProvider<ChatNotifierWithOutbox, ChatStateWithOutbox>((ref) {
  return ChatNotifierWithOutbox(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(currentUserIdProvider),
    ref.watch(e2eeManagerProvider),
    ref.watch(e2eeMetaStoreProvider),
    ref.watch(messageOutboxProvider),
    ref.watch(networkStatusProvider.notifier),
  );
});
