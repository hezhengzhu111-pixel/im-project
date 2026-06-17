import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../presentation/moments_providers.dart';

class MomentsNotificationsPage extends ConsumerStatefulWidget {
  const MomentsNotificationsPage({super.key});

  @override
  ConsumerState<MomentsNotificationsPage> createState() =>
      _MomentsNotificationsPageState();
}

class _MomentsNotificationsPageState
    extends ConsumerState<MomentsNotificationsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationsProvider.notifier).loadNotifications();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text(_Strings.title),
        centerTitle: true,
        actions: [
          if (state.unreadCount > 0)
            TextButton(
              onPressed: () {
                ref.read(notificationsProvider.notifier).markAllRead();
              },
              child: const Text(_Strings.markAllRead),
            ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline,
                          size: 64, color: theme.colorScheme.error),
                      const SizedBox(height: 16),
                      Text(
                        state.error!,
                        style: TextStyle(color: theme.colorScheme.error),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => ref
                            .read(notificationsProvider.notifier)
                            .loadNotifications(),
                        child: const Text(_Strings.retry),
                      ),
                    ],
                  ),
                )
              : state.notifications.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.notifications_none,
                              size: 64,
                              color: theme.colorScheme.onSurfaceVariant
                                  .withValues(alpha: 0.5)),
                          const SizedBox(height: 16),
                          Text(
                            _Strings.empty,
                            style: TextStyle(
                                fontSize: 16,
                                color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref
                          .read(notificationsProvider.notifier)
                          .loadNotifications(),
                      child: ListView.separated(
                        itemCount: state.notifications.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final notification = state.notifications[index];
                          return _NotificationTile(
                            notification: notification,
                            onTap: () {
                              // Navigation to post detail can be added later
                            },
                          );
                        },
                      ),
                    ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.onTap,
  });

  final MomentNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isUnread = notification.isRead != true;
    final userName = notification.userNickname ??
        notification.userName ??
        _Strings.userFallback;

    return ListTile(
      onTap: onTap,
      leading: Stack(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundImage: notification.userAvatar != null
                ? NetworkImage(notification.userAvatar!)
                : null,
            child: notification.userAvatar == null
                ? Text(
                    userName.isNotEmpty
                        ? userName.substring(0, 1).toUpperCase()
                        : '?',
                    style: const TextStyle(fontSize: 14),
                  )
                : null,
          ),
          if (isUnread)
            Positioned(
              top: 0,
              left: 0,
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: theme.colorScheme.surface,
                    width: 2,
                  ),
                ),
              ),
            ),
        ],
      ),
      title: Text(
        _buildText(userName),
        style: TextStyle(
          fontSize: 14,
          fontWeight: isUnread ? FontWeight.w600 : FontWeight.normal,
        ),
      ),
      subtitle: Text(
        _formatTime(notification.createTime),
        style: TextStyle(
          fontSize: 12,
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }

  String _buildText(String userName) {
    switch (notification.type) {
      case 'like':
        return '$userName liked your post';
      case 'comment':
        return '$userName commented on your post';
      case 'reply':
        return '$userName replied to your comment';
      default:
        return '$userName interacted with your post';
    }
  }

  String _formatTime(String time) {
    try {
      final dt = DateTime.parse(time);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inDays < 1) return '${diff.inHours}h ago';
      if (diff.inDays < 30) return '${diff.inDays}d ago';
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return time;
    }
  }
}

class _Strings {
  _Strings._();
  static const title = 'Notifications';
  static const markAllRead = 'Mark all read';
  static const empty = 'No notifications yet';
  static const retry = 'Retry';
  static const userFallback = 'Someone';
}
