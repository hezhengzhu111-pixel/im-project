import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/src/auth/auth.dart';
import '../data/message_api_provider.dart';
import '../data/message_pipeline.dart';
import 'chat_notifier.dart';
import 'chat_state.dart';

final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(currentUserIdProvider),
  );
});
