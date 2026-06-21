import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/core.dart';
import '../chat_providers.dart';
import '../chat_state.dart';

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
    ChatState chatState,
  ) {
    final colorScheme = Theme.of(context).colorScheme;
    final loc = AppLocalizations.of(context)!;

    // Determine banner color and message
    Color backgroundColor;
    String message;
    IconData icon;
    VoidCallback? action;
    String? actionLabel;

    if (networkState.isOffline) {
      backgroundColor = colorScheme.error;
      message = loc.networkDisconnected;
      icon = Icons.cloud_off;
    } else if (chatState.failedCount > 0) {
      backgroundColor = colorScheme.error;
      message = loc.chatMessagesFailed(chatState.failedCount);
      icon = Icons.error_outline;
      action = () => ref.read(chatStateProvider.notifier).retryAllFailed();
      actionLabel = loc.chatRetry;
    } else if (chatState.isRetrying) {
      backgroundColor = colorScheme.tertiary;
      message = loc.chatRetrying;
      icon = Icons.sync;
    } else if (chatState.pendingCount > 0) {
      backgroundColor = colorScheme.secondary;
      message = loc.chatMessagesPending(chatState.pendingCount);
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

    final loc = AppLocalizations.of(context)!;

    return Tooltip(
      message: networkState.isOffline
          ? loc.a11yNetworkDisconnected
          : chatState.failedCount > 0
              ? loc.chatMessagesFailed(chatState.failedCount)
              : loc.chatMessagesPending(chatState.pendingCount),
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
