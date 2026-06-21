import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/settings.dart';

import '../helpers/fakes.dart';

void main() {
  group('AiApi', () {
    late FakeHttpClientPort http;
    late AiApi api;

    setUp(() {
      http = FakeHttpClientPort();
      api = AiApi(http);
    });

    test('getKeys uses GET /api/ai/keys', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.keys);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': '1',
                'provider': 'openai',
                'key': 'sk-****',
                'status': 'valid',
                'createdAt': '2026-01-01',
              },
            ],
          }),
        );
      };

      final result = await api.getKeys();
      expect(result, hasLength(1));
    });

    test('createKey uses POST /api/ai/keys', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.keys);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': '2',
            'provider': 'deepseek',
            'key': 'sk-****',
            'status': 'valid',
            'createdAt': '2026-01-01',
          }),
        );
      };

      final result = await api.createKey(
        const AiApiKeyCreateRequest(provider: 'deepseek', key: 'sk-real'),
      );
      expect(result.id, '2');
    });

    test('updateKey uses PUT /api/ai/keys/:id', () async {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/ai/keys/k1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'k1',
            'provider': 'openai',
            'key': 'sk-****',
            'status': 'valid',
            'createdAt': '2026-01-01',
          }),
        );
      };

      final result = await api.updateKey(
        'k1',
        const AiApiKeyUpdateRequest(label: 'Updated'),
      );
      expect(result.id, 'k1');
      expect(http.requests.last.$1, 'PUT');
    });

    test('deleteKey uses DELETE /api/ai/keys/:id', () async {
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/ai/keys/k1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.deleteKey('k1');
      expect(http.requests.last.$1, 'DELETE');
    });

    test('testKey uses POST /api/ai/keys/:id/test', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/ai/keys/k1/test');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'status': 'valid'}),
        );
      };

      final result = await api.testKey('k1');
      expect(result, 'valid');
    });

    test('getAiSettings uses GET /api/ai/settings', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.settings);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'autoReplyEnabled': false,
            'autoReplyPersona': 'default',
          }),
        );
      };

      final result = await api.getAiSettings();
      expect(result.autoReplyEnabled, false);
    });

    test('updateAiSettings uses PUT /api/ai/settings', () async {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.settings);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.updateAiSettings(
        const AiSettings(autoReplyEnabled: true, autoReplyPersona: 'helper'),
      );
      expect(http.requests.last.$1, 'PUT');
    });

    test('createSummary uses POST /api/ai/summary', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.summary);
        expect(body, {
          'conversationId': 'conv1',
          'messageIds': ['m1', 'm2'],
        });
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'summary': 'Discussed project plans'}),
        );
      };

      final result = await api.createSummary(
        const AiSummaryRequest(
          conversationId: 'conv1',
          messageIds: ['m1', 'm2'],
        ),
      );
      expect(result['summary'], 'Discussed project plans');
    });

    test('buildStreamUrl returns correct path', () {
      expect(api.buildStreamUrl('task-1'), '/api/ai/stream/task-1');
      expect(api.buildStreamUrl('task-abc'), '/api/ai/stream/task-abc');
    });

    test('uploadRagDoc uses POST /api/ai/rag/docs', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.ragDocs);
        expect(body, {
          'content': 'doc content',
          'title': 'My Doc',
        });
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'id': 'doc1'}),
        );
      };

      final result = await api.uploadRagDoc(
        const AiRagDocUploadRequest(content: 'doc content', title: 'My Doc'),
      );
      expect(result['id'], 'doc1');
    });

    test('listRagDocs uses GET /api/ai/rag/docs', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.ragDocs);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {'id': 'doc1', 'title': 'Doc 1'},
            ],
          }),
        );
      };

      final result = await api.listRagDocs();
      expect(result, hasLength(1));
      expect(result.first['id'], 'doc1');
    });

    test('deleteRagDoc uses DELETE /api/ai/rag/docs/:id', () async {
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/ai/rag/docs/doc1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.deleteRagDoc('doc1');
      expect(http.requests.last.$1, 'DELETE');
      expect(http.requests.last.$2, '/api/ai/rag/docs/doc1');
    });

    test('queryRag uses POST /api/ai/rag/query', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.ragQuery);
        expect(body, {'query': 'what is IM?', 'topK': 5});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'results': [
              {'docId': 'doc1', 'score': 0.95},
            ],
          }),
        );
      };

      final result = await api.queryRag(
        const AiRagQueryRequest(query: 'what is IM?', topK: 5),
      );
      expect(result['results'], hasLength(1));
    });

    test('API errors propagate for all methods', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Server error');
      };

      expect(
        () => api.createSummary(const AiSummaryRequest(conversationId: 'c1')),
        throwsA(isA<Exception>()),
      );
    });
  });
}
