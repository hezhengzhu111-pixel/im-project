import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/settings/data/ai_api.dart';

import '../../helpers/fakes.dart';

void main() {
  group('AiApi', () {
    test('normalizes key fields returned by the Rust API', () async {
      final http = FakeHttpClientPort();
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
                'id': 42,
                'provider': 'deepseek',
                'keyName': 'Primary',
                'maskedKey': 'sk-****abcd',
                'isActive': true,
                'validateStatus': 'valid',
                'lastValidatedAt': '2026-01-01T00:00:00Z',
              },
            ],
          }),
        );
      };

      final keys = await AiApi(http).getKeys();

      expect(keys, hasLength(1));
      expect(keys.single.id, '42');
      expect(keys.single.provider, 'deepseek');
      expect(keys.single.label, 'Primary');
      expect(keys.single.key, 'sk-****abcd');
      expect(keys.single.status, 'valid');
      expect(keys.single.createdAt, '2026-01-01T00:00:00Z');
    });

    test('createKey sends backend contract fields', () async {
      final http = FakeHttpClientPort();
      Map<String, dynamic>? capturedBody;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.keys);
        capturedBody = Map<String, dynamic>.from(body as Map);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': '99',
            'provider': 'openai',
            'keyName': 'Work',
            'maskedKey': 'sk-****9999',
            'validateStatus': '',
          }),
        );
      };

      final created = await AiApi(http).createKey(
        const AiApiKeyCreateRequest(
          provider: 'openai',
          key: 'sk-secret',
          label: 'Work',
        ),
      );

      expect(capturedBody, {
        'provider': 'openai',
        'apiKey': 'sk-secret',
        'keyName': 'Work',
      });
      expect(created.id, '99');
      expect(created.key, 'sk-****9999');
      expect(created.label, 'Work');
    });

    test('testKey accepts validateStatus response field', () async {
      final http = FakeHttpClientPort();
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AiEndpoints.keyTest('key-1'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'validateStatus': 'invalid'}),
        );
      };

      expect(await AiApi(http).testKey('key-1'), 'invalid');
    });
  });
}
