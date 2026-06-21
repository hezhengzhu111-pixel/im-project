import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/push.dart';

import '../helpers/fakes.dart';

void main() {
  group('PushApi', () {
    late FakeHttpClientPort http;
    late PushApi api;

    setUp(() {
      http = FakeHttpClientPort();
      api = PushApi(http);
    });

    test('registerDevice uses POST /api/push/devices/register', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, PushEndpoints.registerDevice);
        expect(body, {
          'deviceToken': 'token-123',
          'platform': 'web',
          'deviceName': 'Chrome',
        });
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.registerDevice(const PushDeviceRegisterRequest(
        deviceToken: 'token-123',
        platform: 'web',
        deviceName: 'Chrome',
      ));
      expect(http.requests.last.$1, 'POST');
      expect(http.requests.last.$2, PushEndpoints.registerDevice);
    });

    test('unregisterDevice uses POST /api/push/devices/unregister', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, PushEndpoints.unregisterDevice);
        expect(body, {'deviceToken': 'token-123'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.unregisterDevice(
          const PushDeviceUnregisterRequest(deviceToken: 'token-123'));
      expect(http.requests.last.$1, 'POST');
      expect(http.requests.last.$2, PushEndpoints.unregisterDevice);
    });

    test('updateDeviceToken uses PUT /api/push/devices/token', () async {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, PushEndpoints.updateDeviceToken);
        expect(body, {'oldToken': 'old', 'newToken': 'new'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.updateDeviceToken(const PushDeviceTokenUpdateRequest(
        oldToken: 'old',
        newToken: 'new',
      ));
      expect(http.requests.last.$1, 'PUT');
      expect(http.requests.last.$2, PushEndpoints.updateDeviceToken);
    });

    test('getSettings uses GET /api/push/settings', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, PushEndpoints.settings);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'enabled': true, 'sound': true}),
        );
      };

      final result = await api.getSettings();
      expect(result['enabled'], true);
      expect(result['sound'], true);
    });

    test('updateSettings uses PUT /api/push/settings', () async {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, PushEndpoints.settings);
        expect(body, {'enabled': false});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.updateSettings({'enabled': false});
      expect(http.requests.last.$1, 'PUT');
      expect(http.requests.last.$2, PushEndpoints.settings);
    });

    test('API errors propagate', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Unauthorized');
      };

      expect(
        () => api.registerDevice(
            const PushDeviceRegisterRequest(deviceToken: 't', platform: 'web')),
        throwsA(isA<Exception>()),
      );
    });
  });
}
