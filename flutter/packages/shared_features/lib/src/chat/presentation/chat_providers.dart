import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/src/auth/auth.dart';
import 'package:im_shared_features/src/e2ee/e2ee.dart';
import '../data/message_api_provider.dart';
import '../data/message_pipeline.dart';
import '../data/sent_message_cache_provider.dart';
import 'chat_notifier.dart';
import 'chat_state.dart';

final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(currentUserIdProvider),
    e2eeManager: ref.watch(e2eeManagerProvider),
    e2eeMetaStore: ref.watch(e2eeMetaStoreProvider),
    sentMessageCache: ref.watch(sentMessageCacheProvider),
  );
});
