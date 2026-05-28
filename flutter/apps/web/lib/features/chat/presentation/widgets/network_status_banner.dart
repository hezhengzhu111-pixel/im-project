import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/l10n/app_localizations.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/network/network_status_provider.dart';
import '../../data/outbox_provider.dart';
import '../chat_providers.dart';
import '../chat_provider_with_outbox.dart';

/// Banner that shows network status and outbox information
class NetworkStatusBanner extends ConsumerWidget {
  const NetworkStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final networkState = ref.watch(networkStatusProvider);
    final chatState = ref.watch(chatStateProvider);

    // Don't show banner if online and no pending messages
    if (networkState.isOnline &&
        chatState.pendingCount == 0 &&
        chatState.failedCount == 0) {
      return const SizedBox.shrink();
    }

    return _buildBanner(context, ref, networkState, chatState);
  }

  Widget _buildBanner(
    BuildContext context,
    WidgetRef ref,
    NetworkState networkState,
    ChatStateWithOutbox chatState,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    // Determine banner color and message
    Color backgroundColor;
    String message;
    IconData icon;
    VoidCallback? action;
    String? actionLabel;

    if (networkState.isOffline) {
      backgroundColor = colorScheme.error;
      message = '网络已断开，消息将在恢复后自动发送';
      icon = Icons.cloud_off;
    } else if (chatState.failedCount > 0) {
      backgroundColor = colorScheme.error;
      message = '${chatState.failedCount} 条消息发送失败';
      icon = Icons.error_outline;
      action = () => ref.read(chatStateProvider.notifier).retryAllFailed();
      actionLabel = '重试';
    } else if (chatState.isRetrying) {
      backgroundColor = colorScheme.tertiary;
      message = '正在重试发送消息...';
      icon = Icons.sync;
    } else if (chatState.pendingCount > 0) {
      backgroundColor = colorScheme.secondary;
      message = '${chatState.pendingCount} 条消息等待发送';
      icon = Icons.schedule;
    } else {
      return const SizedBox.shrink();
    }

    return Material(
      color: backgroundColor,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(
              icon,
              color: colorScheme.onError,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: colorScheme.onError,
                  fontSize: 13,
                ),
              ),
            ),
            if (action != null && actionLabel != null)
              TextButton(
                onPressed: action,
                style: TextButton.styleFrom(
                  foregroundColor: colorScheme.onError,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                ),
                child: Text(actionLabel),
              ),
            if (chatState.isRetrying)
              SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colorScheme.onError,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Compact indicator for message input area
class OutboxIndicator extends ConsumerWidget {
  const OutboxIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final networkState = ref.watch(networkStatusProvider);
    final chatState = ref.watch(chatStateProvider);

    if (networkState.isOnline &&
        chatState.pendingCount == 0 &&
        chatState.failedCount == 0) {
      return const SizedBox.shrink();
    }

    final l10n = AppLocalizations.of(context);

    return Tooltip(
      message: networkState.isOffline
          ? (l10n?.a11yNetworkDisconnected ?? '网络已断开')
          : chatState.failedCount > 0
              ? '${chatState.failedCount} 条消息发送失败'
              : '${chatState.pendingCount} 条消息等待发送',
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: networkState.isOffline || chatState.failedCount > 0
              ? Theme.of(context).colorScheme.error
              : Theme.of(context).colorScheme.secondary,
          shape: BoxShape.circle,
        ),
        child: Icon(
          networkState.isOffline ? Icons.cloud_off : Icons.schedule,
          size: 16,
          color: Theme.of(context).colorScheme.onError,
        ),
      ),
    );
  }
}
