import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_shared_features/src/auth/auth.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'message_api.dart';

final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(
    ref.watch(httpClientProvider),
    currentUserId: () => ref.read(currentUserIdProvider),
  );
});
