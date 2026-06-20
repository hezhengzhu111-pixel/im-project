import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_l10n/im_l10n.dart';
import '../moments_providers.dart';
import 'widgets/post_card.dart';

class MomentsFeedPage extends ConsumerStatefulWidget {
  const MomentsFeedPage({
    this.postId,
    required this.scrollController,
    super.key,
  });

  final String? postId;
  final ScrollController scrollController;

  @override
  ConsumerState<MomentsFeedPage> createState() => _MomentsFeedPageState();
}

class _MomentsFeedPageState extends ConsumerState<MomentsFeedPage> {
  String? _scrolledToId;

  @override
  void initState() {
    super.initState();
    widget.scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final notifier = ref.read(momentsFeedProvider.notifier);
      await notifier.loadFeed(refresh: true);
      if (widget.postId != null) {
        await notifier.locatePost(widget.postId!);
      }
    });
  }

  @override
  void didUpdateWidget(covariant MomentsFeedPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scrollController != widget.scrollController) {
      oldWidget.scrollController.removeListener(_onScroll);
      widget.scrollController.addListener(_onScroll);
    }
  }

  @override
  void dispose() {
    widget.scrollController.removeListener(_onScroll);
    super.dispose();
  }

  void _onScroll() {
    final position = widget.scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 200) {
      ref.read(momentsFeedProvider.notifier).loadFeed();
    }
  }

  Future<void> _retry() async {
    await ref.read(momentsFeedProvider.notifier).loadFeed(refresh: true);
  }

  static const _kEstimatedItemHeight = 180.0;

  void _scrollToHighlighted(String postId) {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final context = GlobalObjectKey(postId).currentContext;
      if (context != null && context.mounted) {
        await Scrollable.ensureVisible(
          context,
          alignment: 0.3,
          duration: const Duration(milliseconds: 300),
        );
        return;
      }

      // The target item has not been built yet (SliverList laziness).
      // Jump to its estimated offset first, then try ensureVisible again.
      final posts = ref.read(momentsFeedProvider).posts;
      final index = posts.indexWhere((p) => p.post.id == postId);
      if (index <= 0) return;
      if (!widget.scrollController.hasClients) return;

      final position = widget.scrollController.position;
      final targetOffset = (index * _kEstimatedItemHeight).clamp(
        position.minScrollExtent,
        position.maxScrollExtent,
      );
      await position.animateTo(
        targetOffset,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );

      WidgetsBinding.instance.addPostFrameCallback((_) {
        final context2 = GlobalObjectKey(postId).currentContext;
        if (context2 != null && context2.mounted) {
          Scrollable.ensureVisible(
            context2,
            alignment: 0.3,
            duration: const Duration(milliseconds: 300),
          );
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(momentsFeedProvider);
    final loc = AppLocalizations.of(context)!;
    final highlightedId = feedState.highlightedPostId;

    if (highlightedId != null && highlightedId != _scrolledToId) {
      _scrolledToId = highlightedId;
      _scrollToHighlighted(highlightedId);
    }

    if (feedState.isLoading && feedState.posts.isEmpty) {
      return const SliverFillRemaining(
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (feedState.error != null && feedState.posts.isEmpty) {
      return SliverFillRemaining(
        child: _ErrorBody(
          message: loc.loadingFailed(feedState.error!),
          onRetry: _retry,
        ),
      );
    }

    if (feedState.posts.isEmpty) {
      return SliverFillRemaining(
        child: _EmptyBody(message: loc.momentsNoPosts),
      );
    }

    final notifier = ref.read(momentsFeedProvider.notifier);

    return SliverMainAxisGroup(
      slivers: [
        if (feedState.missingPostId != null)
          SliverToBoxAdapter(
            child: _ErrorBanner(
              message: loc.momentsPostNotFound,
              onRetry: () => notifier.locatePost(feedState.missingPostId!),
            ),
          )
        else if (feedState.error != null)
          SliverToBoxAdapter(
            child: _ErrorBanner(
              message: loc.loadingFailed(feedState.error!),
              onRetry: _retry,
            ),
          ),
        SliverList(
          delegate: SliverChildBuilderDelegate(
            (context, index) {
              final post = feedState.posts[index];
              return PostCard(
                key: GlobalObjectKey(post.post.id),
                post: post,
                isHighlighted: post.post.id == highlightedId,
                onLike: () => notifier.toggleLike(post.post.id),
                onDelete: () => notifier.removePost(post.post.id),
              );
            },
            childCount: feedState.posts.length,
          ),
        ),
        if (feedState.isLoading && feedState.posts.isNotEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          )
        else if (!feedState.hasMore && feedState.posts.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                loc.momentsNoMorePosts,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _EmptyBody extends StatelessWidget {
  const _EmptyBody({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.camera_alt_outlined,
            size: 64,
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: TextStyle(
              fontSize: 16,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: onRetry,
              child: Text(loc.retry),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;
    return Material(
      color: theme.colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              Icons.error_outline,
              size: 18,
              color: theme.colorScheme.onErrorContainer,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: TextStyle(color: theme.colorScheme.onErrorContainer),
              ),
            ),
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: theme.colorScheme.onErrorContainer,
              ),
              child: Text(loc.retry),
            ),
          ],
        ),
      ),
    );
  }
}
