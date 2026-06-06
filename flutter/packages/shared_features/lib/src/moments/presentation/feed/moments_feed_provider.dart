import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../data/moments_repository.dart';

class MomentsFeedState {
  const MomentsFeedState({
    this.posts = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.cursor,
    this.error,
  });

  final List<PostWithDetails> posts;
  final bool isLoading;
  final bool hasMore;
  final String? cursor;
  final String? error;

  MomentsFeedState copyWith({
    List<PostWithDetails>? posts,
    bool? isLoading,
    bool? hasMore,
    String? cursor,
    String? error,
  }) {
    return MomentsFeedState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      cursor: cursor ?? this.cursor,
      error: error,
    );
  }
}

class MomentsFeedNotifier extends StateNotifier<MomentsFeedState> {
  MomentsFeedNotifier(this._repository) : super(const MomentsFeedState());

  final MomentsRepository _repository;

  Future<void> loadFeed({bool refresh = false}) async {
    if (state.isLoading) return;
    if (!refresh && !state.hasMore) return;

    state = state.copyWith(isLoading: true, error: null);
    try {
      final newPosts = await _repository.getFeed(
        cursor: refresh ? null : state.cursor,
      );
      final lastId = newPosts.isNotEmpty ? newPosts.last.post.id : null;
      state = state.copyWith(
        posts: refresh ? newPosts : [...state.posts, ...newPosts],
        isLoading: false,
        hasMore: newPosts.length >= 20,
        cursor: lastId,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> addPost(PostWithDetails post) async {
    state = state.copyWith(posts: [post, ...state.posts]);
  }

  Future<void> removePost(String postId) async {
    await _repository.deletePost(postId);
    state = state.copyWith(
      posts: state.posts.where((p) => p.post.id != postId).toList(),
    );
  }

  Future<void> toggleLike(String postId) async {
    final index = state.posts.indexWhere((p) => p.post.id == postId);
    if (index == -1) return;

    final post = state.posts[index];
    final wasLiked = post.isLiked ?? false;

    // Optimistic update
    final updatedPost = PostWithDetails(
      post: post.post,
      media: post.media,
      isLiked: !wasLiked,
      likeCount: (post.likeCount ?? 0) + (wasLiked ? -1 : 1),
      commentCount: post.commentCount,
      userNickname: post.userNickname,
      userAvatar: post.userAvatar,
    );
    final updatedPosts = [...state.posts];
    updatedPosts[index] = updatedPost;
    state = state.copyWith(posts: updatedPosts);

    try {
      if (wasLiked) {
        await _repository.unlikePost(postId);
      } else {
        await _repository.likePost(postId);
      }
    } catch (e) {
      // Revert on error
      final revertedPosts = [...state.posts];
      revertedPosts[index] = post;
      state = state.copyWith(posts: revertedPosts, error: e.toString());
    }
  }

  void updatePost(PostWithDetails updatedPost) {
    final index = state.posts.indexWhere((p) => p.post.id == updatedPost.post.id);
    if (index == -1) return;
    final updatedPosts = [...state.posts];
    updatedPosts[index] = updatedPost;
    state = state.copyWith(posts: updatedPosts);
  }
}
