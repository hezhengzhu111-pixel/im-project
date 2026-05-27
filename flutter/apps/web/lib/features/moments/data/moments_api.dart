import 'package:im_core/core.dart';

class MomentsApi {
  MomentsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<MomentPost>> getFeed({int? page, int? size}) async {
    final response = await _httpClient.get<List<dynamic>>(
      MomentsEndpoints.feed,
      queryParameters: {
        if (page != null) 'page': page,
        if (size != null) 'size': size,
      },
      fromJson: (json) => (json as List)
          .map((e) => MomentPost.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<MomentPost>();
  }

  Future<void> likePost(String postId) async {
    await _httpClient.post<void>(MomentsEndpoints.like(postId), fromJson: (_) {});
  }

  Future<void> unlikePost(String postId) async {
    await _httpClient.delete<void>(MomentsEndpoints.unlike(postId), fromJson: (_) {});
  }

  Future<MomentComment> addComment(String postId, String content) async {
    final response = await _httpClient.post<MomentComment>(
      MomentsEndpoints.createComment(postId),
      body: {'content': content},
      fromJson: MomentComment.fromJson,
    );
    return response.data;
  }
}
