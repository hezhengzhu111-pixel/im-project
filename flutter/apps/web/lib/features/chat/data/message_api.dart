import 'package:im_core/core.dart';

class MessageApi {
  MessageApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<ChatSession>> getConversations() async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.conversations,
      fromJson: (json) => (json as List)
          .map((e) => ChatSession.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<ChatSession>();
  }

  Future<List<Message>> getPrivateHistory(String friendId, {int? page, int? size}) async {
    final response = await _httpClient.get<List<dynamic>>(
      MessageEndpoints.privateHistory(friendId),
      queryParameters: {
        if (page != null) 'page': page,
        if (size != null) 'size': size,
      },
      fromJson: (json) => (json as List)
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Message>();
  }

  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    final response = await _httpClient.post<Message>(
      MessageEndpoints.sendPrivate,
      body: request.toJson(),
      fromJson: Message.fromJson,
    );
    return response.data;
  }

  Future<void> markRead(String conversationId) async {
    await _httpClient.put<void>(
      MessageEndpoints.markRead(conversationId),
      fromJson: (_) {},
    );
  }
}
