import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'moments_providers.dart';
import 'widgets/post_card.dart';

class MomentsMainPage extends ConsumerStatefulWidget {
  const MomentsMainPage({super.key});

  @override
  ConsumerState<MomentsMainPage> createState() => _MomentsMainPageState();
}

class _MomentsMainPageState extends ConsumerState<MomentsMainPage> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(momentsFeedProvider.notifier).loadFeed();
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

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '朋友圈',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.add_box_outlined),
                onPressed: () {
                  // TODO: 打开发布页面
                },
              ),
            ],
          ),
        ),
        const Divider(height: 1),

        // Feed list
        Expanded(
          child: feedState.isLoading && feedState.posts.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : feedState.posts.isEmpty
                  ? const Center(child: Text('暂无动态'))
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount:
                          feedState.posts.length + (feedState.hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == feedState.posts.length) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(16),
                              child: CircularProgressIndicator(),
                            ),
                          );
                        }
                        final post = feedState.posts[index];
                        return PostCard(post: post);
                      },
                    ),
        ),
      ],
    );
  }
}
