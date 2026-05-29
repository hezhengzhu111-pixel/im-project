import 'package:im_core/core.dart';

class ContactsApi {
  ContactsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<Friendship>> getFriends() async {
    final response = await _httpClient.get<List<dynamic>>(
      FriendEndpoints.list,
      fromJson: (json) => _items(json)
          .map((e) => Friendship.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Friendship>();
  }

  Future<List<FriendRequest>> getFriendRequests() async {
    final response = await _httpClient.get<List<dynamic>>(
      FriendEndpoints.requests,
      fromJson: (json) => _items(json)
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

  Future<List<User>> searchUsers(String keyword,
      {String type = 'username'}) async {
    final response = await _httpClient.get<List<dynamic>>(
      UserEndpoints.search,
      queryParameters: {'keyword': keyword, 'type': type},
      fromJson: (json) => _items(json)
          .map((e) => User.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<User>();
  }

  Future<void> sendFriendRequest(String targetUserId, {String? reason}) async {
    await _httpClient.post<void>(
      FriendEndpoints.request,
      body: {
        'targetUserId': targetUserId,
        if (reason != null) 'reason': reason,
      },
      fromJson: (_) {},
    );
  }

  Future<void> deleteFriend(String friendId) async {
    await _httpClient.delete<void>(
      FriendEndpoints.remove,
      queryParameters: {'friendUserId': friendId},
      fromJson: (_) {},
    );
  }

  Future<void> updateFriendRemark(String friendId, String remark) async {
    final query = Uri(queryParameters: {
      'friendUserId': friendId,
      'remark': remark,
    }).query;
    await _httpClient.put<void>(
      '${FriendEndpoints.remark}?$query',
      fromJson: (_) {},
    );
  }

  Future<Map<String, bool>> getOnlineStatus(List<String> userIds) async {
    if (userIds.isEmpty) return const {};
    final response = await _httpClient.post<Map<String, bool>>(
      UserEndpoints.onlineStatus,
      body: userIds,
      fromJson: (json) => json.map(
        (key, value) => MapEntry(key, value == true),
      ),
    );
    return response.data;
  }

  List<dynamic> _items(Map<String, dynamic> json) {
    final rawItems = json['items'];
    if (rawItems is List) return rawItems;
    final rawData = json['data'];
    if (rawData is List) return rawData;
    return const [];
  }
}
