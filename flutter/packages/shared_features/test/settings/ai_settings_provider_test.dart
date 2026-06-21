import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

void main() {
  group('AiSettingsNotifier', () {
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

    test('loadKeys fetches keys and updates state', () async {
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
      expect(notifier.state.keys.first.label, 'old');
      expect(notifier.state.loading, isFalse);
    });

    test('createKey adds key to state on success', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'k2',
            'provider': 'openai',
            'key': 'sk-new',
            'label': 'new',
            'status': 'valid',
            'createdAt': '2026-01-01',
          }),
        );
      };

      final result = await notifier.createKey(
        const AiApiKeyCreateRequest(
            provider: 'openai', key: 'sk-new', label: 'new'),
      );
      expect(result, isTrue);
      expect(notifier.state.keys, hasLength(1));
      expect(notifier.state.keys.first.label, 'new');
    });

    test('deleteKey removes key from state on success', () async {
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

      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      final result = await notifier.deleteKey('k1');
      expect(result, isTrue);
      expect(notifier.state.keys, isEmpty);
    });

    test('testKey updates key status in state', () async {
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
                'status': 'unknown',
                'createdAt': '2026-01-01',
              },
            ],
          }),
        );
      };
      await notifier.loadKeys();
      expect(notifier.state.keys.first.status, 'unknown');

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'status': 'valid'}),
        );
      };

      final result = await notifier.testKey('k1');
      expect(result, isTrue);
      expect(notifier.state.keys.first.status, 'valid');
    });

    test('loadAiSettings updates state', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'autoReplyEnabled': true,
            'autoReplyPersona': 'helpful assistant',
          }),
        );
      };

      await notifier.loadAiSettings();
      expect(notifier.state.aiSettings, isNotNull);
      expect(notifier.state.aiSettings!.autoReplyEnabled, isTrue);
      expect(
        notifier.state.aiSettings!.autoReplyPersona,
        'helpful assistant',
      );
    });

    test('updateAiSettings calls API and updates state', () async {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      final settings =
          const AiSettings(autoReplyEnabled: false, autoReplyPersona: 'coder');
      final result = await notifier.updateAiSettings(settings);
      expect(result, isTrue);
      expect(notifier.state.aiSettings, equals(settings));
    });
  });
}
