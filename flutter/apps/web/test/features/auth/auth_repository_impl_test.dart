import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/data/auth_repository_impl.dart';

import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort httpClient;
  late AuthRepositoryImpl repository;

  setUp(() {
    httpClient = FakeHttpClientPort();
    repository = AuthRepositoryImpl(httpClient: httpClient);
  });

  group('AuthRepositoryImpl', () {
    test('login uses user login endpoint and returns response', () async {
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, UserEndpoints.login);
        expect(body, {'username': 'alice', 'password': 'secret', 'rememberMe': false});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'success': true,
            'user': {'id': 'u1', 'username': 'alice'},
          }),
        );
      };

      final response = await repository.login(
        const LoginRequest(username: 'alice', password: 'secret'),
      );

      expect(response.success, isTrue);
      expect(response.user?.id, 'u1');
    });

    test('restoreSession builds auth state from auth parse cookie session',
        () async {
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, AuthEndpoints.parse);
        expect(body, {'allowExpired': true});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'valid': true,
            'expired': false,
            'userId': '1',
            'username': 'alice',
            'permissions': ['chat:read'],
          }),
        );
      };

      final result = await repository.restoreSession();

      expect(result, isA<AuthSuccess>());
      final success = result as AuthSuccess;
      expect(success.user.id, '1');
      expect(success.user.username, 'alice');
      expect(success.permissions, ['chat:read']);
    });

    test('restoreSession refreshes with cookie when parse is invalid',
        () async {
      var parseCalls = 0;
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == AuthEndpoints.refresh) {
          expect(body, const <String, dynamic>{});
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'success': true, 'authenticated': true}),
          );
        }

        expect(path, AuthEndpoints.parse);
        parseCalls++;
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(parseCalls == 1
              ? {'valid': false, 'expired': true}
              : {
                  'valid': true,
                  'expired': false,
                  'userId': '1',
                  'username': 'alice',
                }),
        );
      };

      final result = await repository.restoreSession();

      expect(parseCalls, 2);
      expect(result, isA<AuthSuccess>());
      final success = result as AuthSuccess;
      expect(success.user.username, 'alice');
      expect(httpClient.requests.map((request) => request.$2), [
        AuthEndpoints.parse,
        AuthEndpoints.refresh,
        AuthEndpoints.parse,
      ]);
    });

    test(
        'restoreSession returns unauthenticated when cookie refresh is invalid',
        () async {
      httpClient.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == AuthEndpoints.refresh) {
          throw DioException(
            requestOptions: RequestOptions(path: AuthEndpoints.refresh),
            response: Response(
              requestOptions: RequestOptions(path: AuthEndpoints.refresh),
              statusCode: 401,
            ),
            type: DioExceptionType.badResponse,
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'valid': false, 'expired': false}),
        );
      };

      final result = await repository.restoreSession();

      expect(result, isA<AuthFailure>());
    });

    group('register', () {
      test('returns UserAuthResponse on success', () async {
        httpClient.onPost = <T>(
          String path, {
          dynamic body,
          required T Function(Map<String, dynamic>) fromJson,
        }) async {
          expect(path, UserEndpoints.register);
          expect(body, {
            'username': 'test',
            'password': 'password',
            'email': 'test@example.com',
            'nickname': 'test',
            'phone': null,
          });
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'success': true,
              'user': {'id': '1', 'username': 'test'},
              'token': 'token',
            }),
          );
        };

        final result = await repository.register(
          const RegisterRequest(
            username: 'test',
            password: 'password',
            email: 'test@example.com',
            nickname: 'test',
          ),
        );

        expect(result.user?.id, '1');
      });
    });

    test('logout calls logout endpoint', () async {
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
    });
  });
}
