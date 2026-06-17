import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/push.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import '../helpers/fakes.dart';

void main() {
  group('pushApiProvider', () {
    test('can be read from ProviderScope with overridden httpClient', () {
      final fakeHttp = FakeHttpClientPort();
      final container = ProviderContainer(
        overrides: [
          httpClientProvider.overrideWithValue(fakeHttp),
        ],
      );
      addTearDown(container.dispose);

      final api = container.read(pushApiProvider);
      expect(api, isA<PushApi>());
    });

    test('PushApi from provider delegates to HttpClientPort', () async {
      final fakeHttp = FakeHttpClientPort();
      fakeHttp.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, PushEndpoints.settings);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'enabled': true}),
        );
      };

      final container = ProviderContainer(
        overrides: [
          httpClientProvider.overrideWithValue(fakeHttp),
        ],
      );
      addTearDown(container.dispose);

      final api = container.read(pushApiProvider);
      final settings = await api.getSettings();
      expect(settings['enabled'], true);
    });
  });
}
