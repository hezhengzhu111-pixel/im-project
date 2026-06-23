import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_l10n/im_l10n.dart';
import '../chat_providers.dart';

class LoadMoreHistoryButton extends ConsumerWidget {
  const LoadMoreHistoryButton({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatStateProvider);
    final isLoading = chatState.loadingHistoryBySession[sessionId] == true;
    final hasMore = chatState.hasMoreHistoryBySession[sessionId] == true;
    final loc = AppLocalizations.of(context)!;

    if (!hasMore && !isLoading) return const SizedBox.shrink();

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: ImTokens.space2),
        child: isLoading
            ? SizedBox(
                height: 24,
                width: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Theme.of(context).colorScheme.primary,
                ),
              )
            : TextButton(
                onPressed: () {
                  ref
                      .read(chatStateProvider.notifier)
                      .loadMoreHistory(sessionId);
                },
                child: Text(loc.chatLoadMoreHistory),
              ),
      ),
    );
  }
}
