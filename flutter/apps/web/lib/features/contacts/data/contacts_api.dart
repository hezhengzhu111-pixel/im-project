import 'package:im_core/core.dart';

class ContactsApi {
  ContactsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<Friendship>> getFriends() async {
    final response = await _httpClient.get<List<dynamic>>(
      FriendEndpoints.list,
      fromJson: (json) => (json as List)
          .map((e) => Friendship.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Friendship>();
  }

  Future<List<FriendRequest>> getFriendRequests() async {
    final response = await _httpClient.get<List<dynamic>>(
      FriendEndpoints.requests,
      fromJson: (json) => (json as List)
          .map((e) => FriendRequest.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<FriendRequest>();
  }

  Future<void> acceptFriendRequest(String requestId) async {
    await _httpClient.post<void>(
      FriendEndpoints.accept,
      body: {'requestId': requestId},
      fromJson: (_) {},
    );
  }

  Future<void> rejectFriendRequest(String requestId) async {
    await _httpClient.post<void>(
      FriendEndpoints.reject,
      body: {'requestId': requestId},
      fromJson: (_) {},
    );
  }
}
