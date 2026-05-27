import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../data/moments_repository.dart';

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
        notifications: state.notifications.map((n) => MomentNotification(
          id: n.id,
          type: n.type,
          createTime: n.createTime,
          isRead: true,
          userId: n.userId,
          userName: n.userName,
          userAvatar: n.userAvatar,
          postId: n.postId,
          commentId: n.commentId,
        )).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}
