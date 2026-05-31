import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../../core/di/platform_providers.dart';
import 'message_api.dart';

final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(
    ref.watch(httpClientProvider),
    currentUserId: () => ref.read(currentUserIdProvider),
  );
});
