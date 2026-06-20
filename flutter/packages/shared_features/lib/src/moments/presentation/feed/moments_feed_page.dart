import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_l10n/im_l10n.dart';
import '../moments_providers.dart';
import 'widgets/post_card.dart';

class MomentsFeedPage extends ConsumerStatefulWidget {
  const MomentsFeedPage({this.postId, super.key});

  final String? postId;

  @override
  ConsumerState<MomentsFeedPage> createState() => _MomentsFeedPageState();
}

class _MomentsFeedPageState extends ConsumerState<MomentsFeedPage> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(momentsFeedProvider.notifier).loadFeed(refresh: true);
    });
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(momentsFeedProvider.notifier).loadFeed();
    }
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(momentsFeedProvider);

    return RefreshIndicator(
      onRefresh: () =>
          ref.read(momentsFeedProvider.notifier).loadFeed(refresh: true),
      child: CustomScrollView(
        controller: _scrollController,
        slivers: [
          if (feedState.isLoading && feedState.posts.isEmpty)
            const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator()),
            )
          else if (feedState.posts.isEmpty)
            SliverFillRemaining(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.camera_alt_outlined,
                        size: 64,
                        color: Theme.of(context)
                            .colorScheme
                            .onSurfaceVariant
                            .withValues(alpha: 0.5)),
                    const SizedBox(height: 16),
                    Text(
                      AppLocalizations.of(context)!.momentsNoPosts,
                      style: TextStyle(
                        fontSize: 16,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  if (index == feedState.posts.length) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final post = feedState.posts[index];
                  return PostCard(
                    key: ValueKey(post.post.id),
                    post: post,
                    onLike: () {
                      ref
                          .read(momentsFeedProvider.notifier)
                          .toggleLike(post.post.id);
                    },
                    onDelete: () {
                      ref
                          .read(momentsFeedProvider.notifier)
                          .removePost(post.post.id);
                    },
                  );
                },
                childCount:
                    feedState.posts.length + (feedState.isLoading ? 1 : 0),
              ),
            ),
        ],
      ),
    );
  }
}
