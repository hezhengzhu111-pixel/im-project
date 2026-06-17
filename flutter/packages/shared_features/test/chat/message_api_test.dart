import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

import '../helpers/fakes.dart';

void main() {
  group('MessageApi', () {
    late FakeHttpClientPort http;
    late MessageApi api;

    setUp(() {
      http = FakeHttpClientPort();
      api = MessageApi(http);
    });

    Map<String, dynamic> _sampleMessage(String id) => {
          'id': id,
          'senderId': 'u1',
          'isGroupChat': false,
          'messageType': 'TEXT',
          'content': 'hello',
          'sendTime': '2026-01-01T00:00:00Z',
          'status': 'SENT',
        };

    test('recallMessage uses POST /api/message/recall/:id', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/message/recall/msg-123');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessage('msg-123')),
        );
      };

      final result = await api.recallMessage('msg-123');
      expect(result.id, 'msg-123');

      expect(http.requests, hasLength(1));
      expect(http.requests.last.$1, 'POST');
      expect(http.requests.last.$2, '/api/message/recall/msg-123');
    });

    test('deleteMessage uses POST /api/message/delete/:id', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/message/delete/msg-456');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessage('msg-456')),
        );
      };

      final result = await api.deleteMessage('msg-456');
      expect(result.id, 'msg-456');

      expect(http.requests, hasLength(1));
      expect(http.requests.last.$1, 'POST');
      expect(http.requests.last.$2, '/api/message/delete/msg-456');
    });

    test('recallMessage propagates API errors', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Not found');
      };

      expect(
        () => api.recallMessage('bad-id'),
        throwsA(isA<Exception>()),
      );
    });

    test('deleteMessage propagates API errors', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Server error');
      };

      expect(
        () => api.deleteMessage('bad-id'),
        throwsA(isA<Exception>()),
      );
    });

    test('sendPrivateMessage uses POST /api/message/send/private', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.sendPrivate);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessage('m1')),
        );
      };

      final result = await api.sendPrivateMessage(
        const SendPrivateMessageRequest(receiverId: 'u2', content: 'hello'),
      );
      expect(result.id, 'm1');
    });

    test('sendGroupMessage uses POST /api/message/send/group', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.sendGroup);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessage('m2')),
        );
      };

      final result = await api.sendGroupMessage(
        const SendGroupMessageRequest(groupId: 'g1', content: 'group msg'),
      );
      expect(result.id, 'm2');
    });

    test('markRead uses POST /api/message/read/:conversationId', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/message/read/conv-1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.markRead('conv-1');
      expect(http.requests.last.$2, '/api/message/read/conv-1');
    });

    test('getConfig uses GET /api/message/config', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.config);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'textEnforce': false,
            'textMaxLength': 5000,
          }),
        );
      };

      final result = await api.getConfig();
      expect(result.textMaxLength, 5000);
    });

    test('getConversations uses GET /api/message/conversations', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.conversations);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'conv1',
                'type': 'private',
                'targetId': 'u2',
                'targetName': 'User 2',
              },
            ],
          }),
        );
      };

      final result = await api.getConversations();
      expect(result, hasLength(1));
    });
  });
}
