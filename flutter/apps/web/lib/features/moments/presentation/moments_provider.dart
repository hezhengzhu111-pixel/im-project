import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/moments_api.dart';

class MomentsState {
  const MomentsState({
    this.posts = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.cursor,
    this.error,
  });

  final List<MomentPost> posts;
  final bool isLoading;
  final bool hasMore;
  final String? cursor;
  final String? error;

  MomentsState copyWith({
    List<MomentPost>? posts,
    bool? isLoading,
    bool? hasMore,
    String? cursor,
    String? error,
  }) {
    return MomentsState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      cursor: cursor ?? this.cursor,
      error: error,
    );
  }
}

class MomentsNotifier extends StateNotifier<MomentsState> {
  MomentsNotifier(this._api) : super(const MomentsState());

  final MomentsApi _api;

  Future<void> loadFeed({bool refresh = false}) async {
    if (state.isLoading) return;
    if (!refresh && !state.hasMore) return;

    state = state.copyWith(isLoading: true, error: null);
    try {
      final newPosts = await _api.getFeed(
        page: refresh ? null : (state.posts.length ~/ 20 + 1),
        size: 20,
      );
      state = state.copyWith(
        posts: refresh ? newPosts : [...state.posts, ...newPosts],
        isLoading: false,
        hasMore: newPosts.length >= 20,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> createPost(String content) async {
    state = state.copyWith(isLoading: true);
    try {
      await _api.createPost(content);
      await loadFeed();
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> toggleLike(String postId, bool isLiked) async {
    if (isLiked) {
      await _api.unlikePost(postId);
    } else {
      await _api.likePost(postId);
    }
    await loadFeed();
  }
}
