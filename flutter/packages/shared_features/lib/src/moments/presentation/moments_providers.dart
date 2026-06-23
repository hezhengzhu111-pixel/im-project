import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/chat.dart';
import '../data/moments_api.dart';
import '../data/moments_repository.dart';
import 'composer/composer_provider.dart';
import 'feed/moments_feed_provider.dart';
import 'notifications/notifications_provider.dart';

final momentsApiProvider = Provider<MomentsApi>((ref) {
  return MomentsApi(ref.watch(httpClientProvider));
});

final momentsRepositoryProvider = Provider<MomentsRepository>((ref) {
  return MomentsRepository(
    ref.watch(momentsApiProvider),
    ref.watch(fileApiProvider),
  );
});

final momentsFeedProvider =
    StateNotifierProvider<MomentsFeedNotifier, MomentsFeedState>((ref) {
  return MomentsFeedNotifier(ref.watch(momentsRepositoryProvider));
});

final composerProvider =
    StateNotifierProvider<ComposerNotifier, ComposerState>((ref) {
  return ComposerNotifier(ref.watch(momentsRepositoryProvider));
});

final notificationsProvider = StateNotifierProvider<
    MomentsNotificationsNotifier, MomentsNotificationsState>((ref) {
  return MomentsNotificationsNotifier(ref.watch(momentsRepositoryProvider));
});
