import 'package:im_core/core.dart';

class GroupApi {
  GroupApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<Group> createGroup({
    required String name,
    String? avatar,
    String? description,
    required List<String> memberIds,
  }) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      GroupEndpoints.create,
      body: {
        'name': name,
        if (avatar != null) 'avatar': avatar,
        if (description != null) 'description': description,
        'memberIds': memberIds,
      },
      fromJson: (json) => json,
    );
    return Group.fromJson(response.data);
  }

  Future<List<Group>> getUserGroups(String userId) async {
    final response = await _httpClient.get<List<dynamic>>(
      GroupEndpoints.userGroups(userId),
      fromJson: (json) => _items(json)
          .map((e) => Group.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Group>();
  }

  Future<List<GroupMember>> getMembers(String groupId) async {
    final response = await _httpClient.post<List<dynamic>>(
      GroupEndpoints.membersList,
      body: {'groupId': groupId},
      fromJson: (json) => _items(json, key: 'members')
          .map((e) => GroupMember.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<GroupMember>();
  }

  Future<void> joinGroup(String groupId) async {
    await _httpClient.post<void>(
      GroupEndpoints.join(groupId),
      body: {},
      fromJson: (_) {},
    );
  }

  Future<void> leaveGroup(String groupId) async {
    await _httpClient.post<void>(
      GroupEndpoints.leave(groupId),
      body: {},
      fromJson: (_) {},
    );
  }

  Future<List<Group>> searchGroups(String keyword) async {
    final response = await _httpClient.get<List<dynamic>>(
      GroupEndpoints.search,
      queryParameters: {'q': keyword},
      fromJson: (json) => _items(json)
          .map((e) => Group.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Group>();
  }

  List<dynamic> _items(Map<String, dynamic> json, {String key = 'items'}) {
    final rawItems = json[key];
    if (rawItems is List) return rawItems;
    final wrappedItems = json['items'];
    if (wrappedItems is List) return wrappedItems;
    final rawData = json['data'];
    if (rawData is List) return rawData;
    return const [];
  }
}
