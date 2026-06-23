import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import '../moments_providers.dart';
import '../utils/time_formatter.dart';
import 'package:im_shared_features/src/core/string_extensions.dart';

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
    final loc = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(loc.momentsNotifications),
        centerTitle: true,
        actions: [
          if (state.unreadCount > 0)
            TextButton(
              onPressed: () {
                ref.read(notificationsProvider.notifier).markAllRead();
              },
              child: Text(loc.momentsMarkAllRead),
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
                        child: Text(loc.retry),
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
                            loc.momentsNoNotifications,
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
                          return _buildNotificationItem(context, notification);
                        },
                      ),
                    ),
    );
  }

  Widget _buildNotificationItem(
      BuildContext context, MomentNotification notification) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;
    final isUnread = notification.isRead != true;

    return ListTile(
      onTap: () {
        if (notification.postId != null) {
          context.go('/moments?postId=${notification.postId}');
        }
      },
      leading: Stack(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundImage: notification.userAvatar != null
                ? NetworkImage(notification.userAvatar!)
                : null,
            child: notification.userAvatar == null
                ? Text(
                    (notification.userNickname ??
                            notification.userName ??
                            loc.momentsUserFallback)
                        .safeFirstCharUpper(fallback: '?'),
                    style: const TextStyle(fontSize: 14))
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
                  border:
                      Border.all(color: theme.colorScheme.surface, width: 2),
                ),
              ),
            ),
        ],
      ),
      title: Text(
        _buildNotificationText(context, notification),
        style: TextStyle(
          fontSize: 14,
          fontWeight: isUnread ? FontWeight.w600 : FontWeight.normal,
        ),
      ),
      subtitle: Text(
        _formatTime(notification.createTime),
        style:
            TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
      ),
    );
  }

  String _buildNotificationText(
      BuildContext context, MomentNotification notification) {
    final loc = AppLocalizations.of(context)!;
    final userName = notification.userNickname ??
        notification.userName ??
        loc.momentsUserFallback;
    switch (notification.type) {
      case 'like':
        return loc.momentsNotificationLiked(userName);
      case 'comment':
        return loc.momentsNotificationCommented(userName);
      case 'reply':
        return loc.momentsNotificationReplied(userName);
      default:
        return loc.momentsNotificationInteracted(userName);
    }
  }

  String _formatTime(String time) {
    try {
      final parsed = DateTime.tryParse(time);
      if (parsed != null) {
        return formatRelativeTime(context, parsed);
      }
    } catch (_) {
      // Fall through to raw fallback.
    }
    return time;
  }
}
