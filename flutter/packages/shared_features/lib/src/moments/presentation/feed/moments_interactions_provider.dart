import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../data/moments_repository.dart';
import '../moments_providers.dart';

class MomentsInteractionsState {
  const MomentsInteractionsState({
    this.likes = const [],
    this.comments = const [],
    this.loadingLikes = false,
    this.loadingComments = false,
    this.error,
  });

  final List<MomentLike> likes;
  final List<MomentComment> comments;
  final bool loadingLikes;
  final bool loadingComments;
  final String? error;

  MomentsInteractionsState copyWith({
    List<MomentLike>? likes,
    List<MomentComment>? comments,
    bool? loadingLikes,
    bool? loadingComments,
    String? error,
  }) {
    return MomentsInteractionsState(
      likes: likes ?? this.likes,
      comments: comments ?? this.comments,
      loadingLikes: loadingLikes ?? this.loadingLikes,
      loadingComments: loadingComments ?? this.loadingComments,
      error: error,
    );
  }
}

class MomentsInteractionsNotifier
    extends StateNotifier<MomentsInteractionsState> {
  MomentsInteractionsNotifier(this._repository, this._postId)
      : super(const MomentsInteractionsState());

  final MomentsRepository _repository;
  final String _postId;

  Future<void> loadLikes() async {
    state = state.copyWith(loadingLikes: true, error: null);
    try {
      final likes = await _repository.getLikes(_postId);
      state = state.copyWith(likes: likes, loadingLikes: false);
    } catch (e) {
      state = state.copyWith(loadingLikes: false, error: e.toString());
    }
  }

  Future<void> loadComments() async {
    state = state.copyWith(loadingComments: true, error: null);
    try {
      final comments = await _repository.getComments(_postId);
      state = state.copyWith(comments: comments, loadingComments: false);
    } catch (e) {
      state = state.copyWith(loadingComments: false, error: e.toString());
    }
  }

  Future<MomentComment?> addComment(
      {required String content, String? parentId}) async {
    try {
      final comment = await _repository.addComment(_postId,
          content: content, parentId: parentId);
      await loadComments();
      return comment;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return null;
    }
  }

  Future<void> deleteComment(String commentId) async {
    try {
      await _repository.deleteComment(commentId);
      state = state.copyWith(
        comments: state.comments.where((c) => c.id != commentId).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

final momentsInteractionsProvider = StateNotifierProvider.family<
    MomentsInteractionsNotifier,
    MomentsInteractionsState,
    String>((ref, postId) {
  return MomentsInteractionsNotifier(
    ref.watch(momentsRepositoryProvider),
    postId,
  );
});
