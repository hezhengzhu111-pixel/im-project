import 'package:im_core/core.dart';

class MomentsApi {
  MomentsApi(this._httpClient);
  final HttpClientPort _httpClient;

  // Feed
  Future<List<PostWithDetails>> getFeed(
      {String? cursor, int limit = 20}) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MomentsEndpoints.feed,
      queryParameters: {
        if (cursor != null) 'cursor': cursor,
        'limit': limit,
      },
      fromJson: (json) => json,
    );
    final items = response.data['items'] as List<dynamic>? ?? [];
    return items
        .map((e) => PostWithDetails.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PostWithDetails> getPost(String postId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MomentsEndpoints.postById(postId),
      fromJson: (json) => json,
    );
    return PostWithDetails.fromJson(response.data);
  }

  Future<String> createPost(CreatePostRequest data) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      MomentsEndpoints.create,
      body: {
        if (data.content != null) 'content': data.content,
        if (data.visibility != null) 'visibility': data.visibility,
        if (data.location != null) 'location': data.location,
      },
      fromJson: (json) => json,
    );
    return response.data['id'] as String;
  }

  Future<void> deletePost(String postId) async {
    await _httpClient.delete<void>(
      MomentsEndpoints.deletePost(postId),
      fromJson: (_) {},
    );
  }

  Future<void> addMedia(String postId, List<MediaItem> media) async {
    await _httpClient.post<void>(
      MomentsEndpoints.addMedia(postId),
      body: {
        'media': media
            .map((m) => {
                  'url': m.url,
                  'type': m.type,
                  if (m.sortOrder != null) 'sortOrder': m.sortOrder,
                })
            .toList(),
      },
      fromJson: (_) {},
    );
  }

  Future<void> likePost(String postId) async {
    await _httpClient.post<void>(
      MomentsEndpoints.like(postId),
      fromJson: (_) {},
    );
  }

  Future<void> unlikePost(String postId) async {
    await _httpClient.delete<void>(
      MomentsEndpoints.unlike(postId),
      fromJson: (_) {},
    );
  }

  Future<List<MomentLike>> getLikes(String postId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MomentsEndpoints.likes(postId),
      fromJson: (json) => json,
    );
    final items = response.data['items'] as List<dynamic>? ?? [];
    return items
        .map((e) => MomentLike.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MomentComment> createComment(
      String postId, CreateCommentRequest data) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      MomentsEndpoints.createComment(postId),
      body: {
        'content': data.content,
        if (data.parentId != null) 'parentId': data.parentId,
      },
      fromJson: (json) => json,
    );
    return MomentComment.fromJson(response.data);
  }

  Future<List<MomentComment>> getComments(String postId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MomentsEndpoints.comments(postId),
      fromJson: (json) => json,
    );
    final items = response.data['items'] as List<dynamic>? ?? [];
    return items
        .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> deleteComment(String commentId) async {
    await _httpClient.delete<void>(
      MomentsEndpoints.deleteComment(commentId),
      fromJson: (_) {},
    );
  }

  Future<List<MomentNotification>> getNotifications() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MomentsEndpoints.notifications,
      fromJson: (json) => json,
    );
    final items = response.data['items'] as List<dynamic>? ?? [];
    return items
        .map((e) => MomentNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> markNotificationsRead() async {
    await _httpClient.put<void>(
      MomentsEndpoints.markNotificationsRead,
      fromJson: (_) {},
    );
  }

  Future<List<PostWithDetails>> getUserPosts(String userId,
      {String? cursor, int limit = 20}) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      MomentsEndpoints.userPosts(userId),
      queryParameters: {
        if (cursor != null) 'cursor': cursor,
        'limit': limit,
      },
      fromJson: (json) => json,
    );
    final items = response.data['items'] as List<dynamic>? ?? [];
    return items
        .map((e) => PostWithDetails.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
