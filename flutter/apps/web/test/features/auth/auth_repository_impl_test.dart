import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/data/auth_repository_impl.dart';

import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort httpClient;
  late FakeSecureStoragePort secureStorage;
  late AuthRepositoryImpl repository;

  setUp(() {
    httpClient = FakeHttpClientPort();
    secureStorage = FakeSecureStoragePort();
    repository = AuthRepositoryImpl(
      httpClient: httpClient,
      secureStorage: secureStorage,
    );
  });

  group('AuthRepositoryImpl', () {
    test('login persists access and refresh tokens from backend aliases',
        () async {
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, UserEndpoints.login);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'success': true,
            'access_token': 'access-token',
            'refresh_token': 'refresh-token',
            'user': {'id': 'u1', 'username': 'alice'},
          }),
        );
      };

      final response = await repository.login(
        const LoginRequest(username: 'alice', password: 'secret'),
      );

      expect(response.accessToken, 'access-token');
      expect(response.token, 'access-token');
      expect(await secureStorage.read('access_token'), 'access-token');
      expect(await secureStorage.read('refresh_token'), 'refresh-token');
    });

    test('isAuthenticated accepts a persisted refresh token after page reload',
        () async {
      await secureStorage.write('refresh_token', 'refresh-token');

      expect(await repository.isAuthenticated(), isTrue);
    });

    test('refreshToken uses refresh endpoint and updates rotated tokens',
        () async {
      await secureStorage.write('refresh_token', 'old-refresh-token');
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AuthEndpoints.refresh);
        expect(body, {'refreshToken': 'old-refresh-token'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'authenticated': true,
            'accessToken': 'new-access-token',
            'refreshToken': 'new-refresh-token',
          }),
        );
      };

      final response = await repository.refreshToken();

      expect(response.success, isTrue);
      expect(await secureStorage.read('access_token'), 'new-access-token');
      expect(await secureStorage.read('refresh_token'), 'new-refresh-token');
    });

    test('logout clears both access and refresh tokens', () async {
      await secureStorage.write('access_token', 'access-token');
      await secureStorage.write('refresh_token', 'refresh-token');
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, UserEndpoints.logout);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: null as T,
        );
      };

      await repository.logout();

      expect(await secureStorage.read('access_token'), isNull);
      expect(await secureStorage.read('refresh_token'), isNull);
    });
  });
}
