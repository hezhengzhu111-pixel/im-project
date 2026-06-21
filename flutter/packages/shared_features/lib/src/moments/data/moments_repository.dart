import 'dart:typed_data';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';
import 'moments_api.dart';

class MomentsRepository {
  MomentsRepository(this._api, this._fileApi);
  final MomentsApi _api;
  final FileApi _fileApi;

  Future<List<PostWithDetails>> getFeed({String? cursor, int limit = 20}) {
    return _api.getFeed(cursor: cursor, limit: limit);
  }

  Future<PostWithDetails> getPost(String postId) {
    return _api.getPost(postId);
  }

  Future<PostWithDetails> createPost({
    String? content,
    int? visibility,
    String? location,
    List<Uint8List>? fileBytes,
    List<String>? fileNames,
    List<bool>? isVideoList,
  }) async {
    final postId = await _api.createPost(CreatePostRequest(
      content: content,
      visibility: visibility,
      location: location,
    ));

    if (fileBytes != null && fileBytes.isNotEmpty) {
      final mediaItems = <MediaItem>[];
      for (var i = 0; i < fileBytes.length; i++) {
        final isVideo =
            isVideoList != null && i < isVideoList.length && isVideoList[i];
        final uploadResult = isVideo
            ? await _fileApi.uploadVideo(
                fileBytes[i], fileNames?[i] ?? 'video_$i')
            : await _fileApi.uploadImage(
                fileBytes[i], fileNames?[i] ?? 'image_$i');
        mediaItems.add(MediaItem(
          url: uploadResult.url,
          type: isVideo ? 1 : 0,
          sortOrder: i,
        ));
      }
      await _api.addMedia(postId, mediaItems);
    }

    return _api.getPost(postId);
  }

  Future<void> deletePost(String postId) {
    return _api.deletePost(postId);
  }

  Future<void> likePost(String postId) => _api.likePost(postId);
  Future<void> unlikePost(String postId) => _api.unlikePost(postId);
  Future<List<MomentLike>> getLikes(String postId) => _api.getLikes(postId);

  Future<List<MomentComment>> getComments(String postId) =>
      _api.getComments(postId);

  Future<MomentComment> addComment(String postId,
      {required String content, String? parentId}) {
    return _api.createComment(
        postId,
        CreateCommentRequest(
          content: content,
          parentId: parentId,
        ));
  }

  Future<void> deleteComment(String commentId) => _api.deleteComment(commentId);

  Future<List<MomentNotification>> getNotifications() =>
      _api.getNotifications();
  Future<void> markNotificationsRead() => _api.markNotificationsRead();
}
