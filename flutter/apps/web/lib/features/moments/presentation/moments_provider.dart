import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/moments_api.dart';

class MomentsState {
  const MomentsState({this.posts = const [], this.isLoading = false});

  final List<MomentPost> posts;
  final bool isLoading;

  MomentsState copyWith({List<MomentPost>? posts, bool? isLoading}) {
    return MomentsState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class MomentsNotifier extends StateNotifier<MomentsState> {
  MomentsNotifier(this._api) : super(const MomentsState());

  final MomentsApi _api;

  Future<void> loadFeed() async {
    state = state.copyWith(isLoading: true);
    final posts = await _api.getFeed();
    state = MomentsState(posts: posts);
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
