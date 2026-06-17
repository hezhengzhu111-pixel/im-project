import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/e2ee.dart';

import '../helpers/fakes.dart';

void main() {
  group('E2eeApi', () {
    late FakeHttpClientPort http;
    late E2eeApi api;

    setUp(() {
      http = FakeHttpClientPort();
      api = E2eeApi(http);
    });

    group('key management', () {
      test('uploadBundle uses POST /api/keys/bundle', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.bundle);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.uploadBundle({'identityKey': 'ik1', 'signedPreKey': 'spk1'});
        expect(http.requests.last.$1, 'POST');
        expect(http.requests.last.$2, E2eeEndpoints.bundle);
      });

      test('getBundle uses GET /api/keys/bundle with query params', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.bundle);
          expect(queryParameters!['userId'], 'u1');
          expect(queryParameters['deviceId'], 'd1');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'identityKey': 'ik-peer'}),
          );
        };

        final result = await api.getBundle(
          'u1',
          deviceId: 'd1',
          conversationId: 'conv1',
          requesterDeviceId: 'd2',
        );
        expect(result['identityKey'], 'ik-peer');
      });

      test('getDevices uses GET /api/keys/devices', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.devices);
          expect(queryParameters, {'userId': 'u1'});
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'id': 'd1', 'platform': 'web'},
              ],
            }),
          );
        };

        final result = await api.getDevices('u1');
        expect(result, hasLength(1));
        expect(result.first['id'], 'd1');
      });

      test('heartbeat uses POST /api/keys/heartbeat', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.heartbeat);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.heartbeat();
        expect(http.requests.last.$2, E2eeEndpoints.heartbeat);
      });

      test('getOpkStatus uses GET /api/keys/opk/status', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.opkStatus);
          expect(queryParameters, {'deviceId': 'd1'});
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'remaining': 10}),
          );
        };

        final result = await api.getOpkStatus('d1');
        expect(result['remaining'], 10);
      });

      test('getSalt uses GET /api/keys/salt', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.salt);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'salt': 'base64salt'}),
          );
        };

        final result = await api.getSalt();
        expect(result['salt'], 'base64salt');
      });

      test('uploadKeyBackup uses POST /api/keys/backup', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.backup);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.uploadKeyBackup({'encryptedBackup': 'data'});
        expect(http.requests.last.$1, 'POST');
        expect(http.requests.last.$2, E2eeEndpoints.backup);
      });

      test('getKeyBackup uses GET /api/keys/backup', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.backup);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'encryptedBackup': 'data'}),
          );
        };

        final result = await api.getKeyBackup();
        expect(result['encryptedBackup'], 'data');
      });

      test('deleteDevice uses DELETE /api/keys/device/:id', () async {
        http.onDelete = <T>(
          String path, {
          dynamic body,
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/keys/device/dev-1');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.deleteDevice('dev-1');
        expect(http.requests.last.$1, 'DELETE');
        expect(http.requests.last.$2, '/api/keys/device/dev-1');
      });
    });

    group('session management', () {
      test('createSession uses POST /api/e2ee/sessions', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.createSession);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'sessionId': 's1'}),
          );
        };

        final result = await api.createSession({'peerId': 'u2'});
        expect(result['sessionId'], 's1');
      });

      test('getConversationSession uses GET conversation session path',
          () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/conversations/conv1/session');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'sessionId': 's1', 'status': 'active'}),
          );
        };

        final result = await api.getConversationSession('conv1');
        expect(result['sessionId'], 's1');
      });

      test('rotateConversationSession uses POST rotate path', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/conversations/conv1/rotate');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'newSessionId': 's2'}),
          );
        };

        final result =
            await api.rotateConversationSession('conv1', {'reason': 'expired'});
        expect(result['newSessionId'], 's2');
      });
    });

    group('encryption request flow', () {
      test('requestEncryption uses POST /api/e2ee/request', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.request);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.requestEncryption(
          sessionId: 's1',
          identityKey: 'ik',
          signedPreKey: 'spk',
          requestPayloadJson: '{}',
        );
        expect(http.requests.last.$2, E2eeEndpoints.request);
      });

      test('acceptEncryption uses POST /api/e2ee/accept', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.accept);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.acceptEncryption(sessionId: 's1', signedPreKey: 'spk');
        expect(http.requests.last.$2, E2eeEndpoints.accept);
      });

      test('rejectEncryption uses POST /api/e2ee/reject', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.reject);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.rejectEncryption('s1');
        expect(http.requests.last.$2, E2eeEndpoints.reject);
      });

      test('disableEncryption uses POST /api/e2ee/disable', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, E2eeEndpoints.disable);
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.disableEncryption('s1');
        expect(http.requests.last.$2, E2eeEndpoints.disable);
      });

      test('getSessionStatus uses GET /api/e2ee/status/:sessionId', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/status/s1');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'status': 'active'}),
          );
        };

        final result = await api.getSessionStatus('s1');
        expect(result['status'], 'active');
      });
    });

    group('group encryption', () {
      test('enableGroupE2ee uses POST group enable path', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/enable');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.enableGroupE2ee('g1', {'algorithm': 'aes-256-gcm'});
        expect(http.requests.last.$2, '/api/e2ee/groups/g1/enable');
      });

      test('disableGroupE2ee uses POST group disable path', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/disable');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.disableGroupE2ee('g1');
        expect(http.requests.last.$2, '/api/e2ee/groups/g1/disable');
      });

      test('pushGroupSenderKey uses POST group sender-key path', () async {
        http.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/sender-key');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.pushGroupSenderKey('g1', {'senderKey': 'sk1'});
        expect(http.requests.last.$2, '/api/e2ee/groups/g1/sender-key');
      });

      test('getGroupSenderKeys uses GET group sender-keys path', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/sender-keys');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'userId': 'u1', 'senderKey': 'sk1'},
              ],
            }),
          );
        };

        final result = await api.getGroupSenderKeys('g1');
        expect(result, hasLength(1));
        expect(result.first['userId'], 'u1');
      });

      test('removeGroupSenderKey uses DELETE group sender-keys/:user path',
          () async {
        http.onDelete = <T>(
          String path, {
          dynamic body,
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/sender-keys/u1');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({}),
          );
        };

        await api.removeGroupSenderKey('g1', 'u1');
        expect(http.requests.last.$1, 'DELETE');
        expect(http.requests.last.$2, '/api/e2ee/groups/g1/sender-keys/u1');
      });

      test('getGroupE2eeStatus uses GET group status path', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/status');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'enabled': true}),
          );
        };

        final result = await api.getGroupE2eeStatus('g1');
        expect(result['enabled'], true);
      });

      test('getGroupDevices uses GET group devices path', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/groups/g1/devices');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'deviceId': 'd1', 'userId': 'u1'},
              ],
            }),
          );
        };

        final result = await api.getGroupDevices('g1');
        expect(result, hasLength(1));
      });

      test('getDevicesByUser uses GET /api/e2ee/devices/:userId', () async {
        http.onGet = <T>(
          String path, {
          Map<String, dynamic>? queryParameters,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, '/api/e2ee/devices/u1');
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {'deviceId': 'd1'},
              ],
            }),
          );
        };

        final result = await api.getDevicesByUser('u1');
        expect(result, hasLength(1));
      });
    });

    test('API errors propagate, not silently swallowed', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Forbidden');
      };

      expect(
        () => api.uploadBundle({'key': 'val'}),
        throwsA(isA<Exception>()),
      );
    });
  });
}
