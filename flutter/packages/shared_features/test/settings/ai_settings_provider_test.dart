import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

void main() {
  group('AiSettingsNotifier forwarding', () {
    late FakeHttpClientPort http;
    late AiApi api;
    late AiSettingsNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      api = AiApi(http);
      notifier = AiSettingsNotifier(api);
    });

    tearDown(() {
      notifier.dispose();
    });

    test('updateKey calls API and updates local keys list', () async {
      // Pre-populate keys.
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'k1',
                'provider': 'openai',
                'key': 'sk-****',
                'label': 'old',
                'status': 'valid',
                'createdAt': '2026-01-01',
              },
            ],
          }),
        );
      };
      await notifier.loadKeys();
      expect(notifier.state.keys, hasLength(1));

      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.keyById('k1'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'k1',
            'provider': 'openai',
            'key': 'sk-****',
            'label': 'updated',
            'status': 'valid',
            'createdAt': '2026-01-01',
          }),
        );
      };

      final result =
          await notifier.updateKey('k1', const AiApiKeyUpdateRequest(label: 'updated'));
      expect(result.label, 'updated');
      expect(notifier.state.keys.first.label, 'updated');
    });

    test('createSummary forwards to API', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.summary);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'summary': 'test'}),
        );
      };

      final result = await notifier
          .createSummary(const AiSummaryRequest(conversationId: 'c1'));
      expect(result['summary'], 'test');
    });

    test('buildStreamUrl returns endpoint path', () {
      final url = notifier.buildStreamUrl('task-1');
      expect(url, AiEndpoints.stream('task-1'));
    });

    test('uploadRagDoc forwards to API', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.ragDocs);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'id': 'doc1'}),
        );
      };

      final result = await notifier.uploadRagDoc(
        const AiRagDocUploadRequest(content: 'content', title: 'title'),
      );
      expect(result['id'], 'doc1');
    });

    test('listRagDocs forwards to API', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
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

      final result = await notifier.listRagDocs();
      expect(result, hasLength(1));
    });

    test('deleteRagDoc forwards to API', () async {
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.ragDocById('doc1'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await notifier.deleteRagDoc('doc1');
      expect(http.requests.last.$1, 'DELETE');
    });

    test('queryRag forwards to API', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.ragQuery);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'results': []}),
        );
      };

      final result = await notifier
          .queryRag(const AiRagQueryRequest(query: 'test'));
      expect(result['results'], isEmpty);
    });
  });
}
