import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../../core/di/providers.dart';
import '../../data/moments_repository.dart';

final notificationsProvider = StateNotifierProvider<MomentsNotificationsNotifier, MomentsNotificationsState>((ref) {
  final repository = ref.watch(momentsRepositoryProvider);
  return MomentsNotificationsNotifier(repository);
});

class MomentsNotificationsState {
  const MomentsNotificationsState({
    this.notifications = const [],
    this.isLoading = false,
    this.error,
  });

  final List<MomentNotification> notifications;
  final bool isLoading;
  final String? error;

  int get unreadCount => notifications.where((n) => n.isRead != true).length;

  MomentsNotificationsState copyWith({
    List<MomentNotification>? notifications,
    bool? isLoading,
    String? error,
  }) {
    return MomentsNotificationsState(
      notifications: notifications ?? this.notifications,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class MomentsNotificationsNotifier extends StateNotifier<MomentsNotificationsState> {
  MomentsNotificationsNotifier(this._repository) : super(const MomentsNotificationsState());

  final MomentsRepository _repository;

  Future<void> loadNotifications() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final notifications = await _repository.getNotifications();
      state = state.copyWith(notifications: notifications, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> markAllRead() async {
    try {
      await _repository.markNotificationsRead();
      state = state.copyWith(
        notifications: state.notifications.map((n) => n.copyWith(isRead: true)).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}
