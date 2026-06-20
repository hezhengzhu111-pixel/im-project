import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../data/moments_repository.dart';

const _kFeedPageSize = 20;

class MomentsFeedState {
  const MomentsFeedState({
    this.posts = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.cursor,
    this.error,
    this.highlightedPostId,
    this.missingPostId,
    this.pendingLikePostIds = const {},
    this.deletingPostIds = const {},
  });

  final List<PostWithDetails> posts;
  final bool isLoading;
  final bool hasMore;
  final String? cursor;
  final String? error;
  final String? highlightedPostId;
  final String? missingPostId;
  final Set<String> pendingLikePostIds;
  final Set<String> deletingPostIds;

  static const _sentinel = Object();

  MomentsFeedState copyWith({
    List<PostWithDetails>? posts,
    bool? isLoading,
    bool? hasMore,
    String? cursor,
    Object? error = _sentinel,
    Object? highlightedPostId = _sentinel,
    Object? missingPostId = _sentinel,
    Set<String>? pendingLikePostIds,
    Set<String>? deletingPostIds,
  }) {
    return MomentsFeedState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      cursor: cursor ?? this.cursor,
      error: identical(error, _sentinel) ? this.error : error as String?,
      highlightedPostId: identical(highlightedPostId, _sentinel)
          ? this.highlightedPostId
          : highlightedPostId as String?,
      missingPostId: identical(missingPostId, _sentinel)
          ? this.missingPostId
          : missingPostId as String?,
      pendingLikePostIds: pendingLikePostIds ?? this.pendingLikePostIds,
      deletingPostIds: deletingPostIds ?? this.deletingPostIds,
    );
  }
}

class MomentsFeedNotifier extends StateNotifier<MomentsFeedState> {
  MomentsFeedNotifier(this._repository) : super(const MomentsFeedState());

  final MomentsRepository _repository;

  Future<void> loadFeed({bool refresh = false}) async {
    if (state.isLoading) return;
    if (!refresh && !state.hasMore) return;

    state = state.copyWith(
      isLoading: true,
      error: null,
      missingPostId: null,
    );
    try {
      final newPosts = await _repository.getFeed(
        cursor: refresh ? null : state.cursor,
        limit: _kFeedPageSize,
      );
      final existingIds = {for (final p in state.posts) p.post.id};
      final uniqueNew = newPosts
          .where((p) => !existingIds.contains(p.post.id))
          .toList(growable: false);
      final merged = refresh ? uniqueNew : [...state.posts, ...uniqueNew];
      final nextCursor = uniqueNew.isNotEmpty ? uniqueNew.last.post.id : state.cursor;

      state = state.copyWith(
        posts: merged,
        isLoading: false,
        hasMore: uniqueNew.length >= _kFeedPageSize,
        cursor: nextCursor,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> addPost(PostWithDetails post) async {
    state = state.copyWith(posts: [post, ...state.posts]);
  }

  Future<void> removePost(String postId) async {
    if (state.deletingPostIds.contains(postId)) return;

    state = state.copyWith(
      deletingPostIds: {...state.deletingPostIds, postId},
      error: null,
    );
    try {
      await _repository.deletePost(postId);
      state = state.copyWith(
        posts: state.posts.where((p) => p.post.id != postId).toList(),
        deletingPostIds: state.deletingPostIds.difference({postId}),
      );
    } catch (e) {
      state = state.copyWith(
        deletingPostIds: state.deletingPostIds.difference({postId}),
        error: e.toString(),
      );
    }
  }

  Future<void> toggleLike(String postId) async {
    if (state.pendingLikePostIds.contains(postId)) return;

    final index = state.posts.indexWhere((p) => p.post.id == postId);
    if (index == -1) return;

    final post = state.posts[index];
    final wasLiked = post.isLiked ?? false;

    final updatedPost = post.copyWith(
      isLiked: !wasLiked,
      likeCount: (post.likeCount ?? 0) + (wasLiked ? -1 : 1),
    );
    final updatedPosts = [...state.posts];
    updatedPosts[index] = updatedPost;

    state = state.copyWith(
      posts: updatedPosts,
      pendingLikePostIds: {...state.pendingLikePostIds, postId},
      error: null,
    );

    try {
      if (wasLiked) {
        await _repository.unlikePost(postId);
      } else {
        await _repository.likePost(postId);
      }
      state = state.copyWith(
        pendingLikePostIds: state.pendingLikePostIds.difference({postId}),
      );
    } catch (e) {
      final revertedPosts = [...state.posts];
      revertedPosts[index] = post;
      state = state.copyWith(
        posts: revertedPosts,
        pendingLikePostIds: state.pendingLikePostIds.difference({postId}),
        error: e.toString(),
      );
    }
  }

  Future<bool> locatePost(String postId) async {
    final existingIndex = state.posts.indexWhere((p) => p.post.id == postId);
    if (existingIndex != -1) {
      // Move the existing post to the top so it is always visible and
      // highlighted for deep-link scenarios.
      final existing = state.posts[existingIndex];
      final others = state.posts.where((p) => p.post.id != postId).toList();
      state = state.copyWith(
        posts: [existing, ...others],
        highlightedPostId: postId,
        missingPostId: null,
        error: null,
      );
      return true;
    }

    try {
      final post = await _repository.getPost(postId);
      state = state.copyWith(
        posts: [post, ...state.posts],
        highlightedPostId: postId,
        missingPostId: null,
        error: null,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        highlightedPostId: null,
        missingPostId: postId,
        error: e.toString(),
      );
      return false;
    }
  }

  void clearHighlight() {
    state = state.copyWith(highlightedPostId: null);
  }

  void updatePost(PostWithDetails updatedPost) {
    final index =
        state.posts.indexWhere((p) => p.post.id == updatedPost.post.id);
    if (index == -1) return;
    final updatedPosts = [...state.posts];
    updatedPosts[index] = updatedPost;
    state = state.copyWith(posts: updatedPosts);
  }
}
