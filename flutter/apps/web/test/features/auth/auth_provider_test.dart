import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/domain/auth_error_code.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

import '../../helpers/fakes.dart';

void main() {
  late FakeAuthRepository mockRepo;
  late FakeWsClientPort mockWsClient;
  late FakeHttpClientPort mockHttpClient;
  late AuthNotifier notifier;

  setUp(() {
    mockRepo = FakeAuthRepository();
    mockWsClient = FakeWsClientPort();
    mockHttpClient = FakeHttpClientPort();
    notifier = AuthNotifier(mockRepo, mockWsClient, mockHttpClient, NoopAnalyticsPort());
  });

  group('AuthNotifier', () {
    group('initial state', () {
      test('has correct initial state', () {
        expect(notifier.state.user, isNull);
        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, isNull);
      });
    });

    group('login', () {
      test('sets isLoading true then false on success', () async {
        const user = User(id: '1', username: 'testuser', nickname: 'Test');
        mockRepo.loginResponse = const UserAuthResponse(
          success: true,
          user: user,
          token: 'token-123',
        );

        final states = <AuthState>[];
        notifier.addListener(states.add, fireImmediately: true);

        await notifier.login('testuser', 'password123');

        // States: initial (from fireImmediately), loading, success
        expect(states.length, greaterThanOrEqualTo(2));
        final loadingState = states.firstWhere((s) => s.isLoading);
        final successState = states.last;
        expect(loadingState.isLoading, isTrue);
        expect(successState.isLoading, isFalse);
        expect(successState.isAuthenticated, isTrue);
        expect(successState.user, equals(user));
      });

      test('passes correct LoginRequest to repository', () async {
        mockRepo.loginResponse = const UserAuthResponse(success: true);

        await notifier.login('alice', 'secret');

        expect(mockRepo.loginCallCount, 1);
        expect(mockRepo.lastLoginRequest!.username, 'alice');
        expect(mockRepo.lastLoginRequest!.password, 'secret');
      });

      test('sets error on failure', () async {
        mockRepo.loginError = Exception('Invalid credentials');

        await notifier.login('testuser', 'wrong');

        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, contains('Invalid credentials'));
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('clears previous error on new login attempt', () async {
        mockRepo.loginError = Exception('Error 1');
        await notifier.login('user', 'pass');
        expect(notifier.state.error, isNotNull);

        mockRepo.loginError = null;
        mockRepo.loginResponse = const UserAuthResponse(success: true);

        await notifier.login('user', 'pass');
        expect(notifier.state.error, isNull);
      });
    });

    group('register', () {
      test('sets isLoading then completes successfully', () async {
        mockRepo.registerResponse = const UserAuthResponse(success: true);

        final states = <AuthState>[];
        notifier.addListener(states.add, fireImmediately: true);

        await notifier.register('newuser', 'newuser@example.com', 'password123');

        // States: initial (from fireImmediately), loading, success
        expect(states.length, greaterThanOrEqualTo(2));
        final loadingState = states.firstWhere((s) => s.isLoading);
        final successState = states.last;
        expect(loadingState.isLoading, isTrue);
        expect(successState.isLoading, isFalse);
        expect(successState.error, isNull);
      });

      test('passes correct RegisterRequest to repository', () async {
        mockRepo.registerResponse = const UserAuthResponse(success: true);

        await notifier.register('bob', 'bob@example.com', 'pass123');

        expect(mockRepo.registerCallCount, 1);
        expect(mockRepo.lastRegisterRequest!.username, 'bob');
        expect(mockRepo.lastRegisterRequest!.password, 'pass123');
        expect(mockRepo.lastRegisterRequest!.email, 'bob@example.com');
        expect(mockRepo.lastRegisterRequest!.nickname, 'bob');
      });

      test('sets error on failure', () async {
        mockRepo.registerError = Exception('Username taken');

        await notifier.register('user', 'user@example.com', 'pass');

        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, contains('Username taken'));
      });
    });

    group('logout', () {
      test('resets state to initial after logout', () async {
        // First login
        mockRepo.loginResponse = const UserAuthResponse(
          success: true,
          user: User(id: '1', username: 'test'),
        );
        await notifier.login('test', 'pass');
        expect(notifier.state.isAuthenticated, isTrue);

        // Then logout
        await notifier.logout();

        expect(notifier.state.user, isNull);
        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, isNull);
        expect(mockRepo.logoutCallCount, 1);
      });
    });

    group('checkAuth', () {
      test('sets authenticated state when user is authenticated', () async {
        mockRepo.isAuthenticatedValue = true;
        const user = User(id: '1', username: 'testuser');
        mockRepo.profileResponse = user;

        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isTrue);
        expect(notifier.state.user, equals(user));
        expect(mockRepo.isAuthenticatedCallCount, 1);
        expect(mockRepo.getProfileCallCount, 1);
      });

      test('stays unauthenticated when not authenticated', () async {
        mockRepo.isAuthenticatedValue = false;

        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
        expect(mockRepo.getProfileCallCount, 0);
      });

      test('resets state when getProfile throws', () async {
        // isAuthenticated succeeds, but getProfile fails
        mockRepo.isAuthenticatedValue = true;
        mockRepo.profileResponse = null; // Will cause null error in getProfile

        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
      });
    });

    group('AuthState.copyWith', () {
      test('copyWith preserves error when not explicitly passed', () {
        const state = AuthState(
          user: User(id: '1', username: 'test'),
          isAuthenticated: true,
          isLoading: false,
          error: 'some error',
        );
        final copied = state.copyWith(isLoading: true);

        expect(copied.user, state.user);
        expect(copied.isAuthenticated, state.isAuthenticated);
        expect(copied.isLoading, isTrue);
        expect(copied.error, 'some error'); // preserved via sentinel
      });

      test('copyWith clears error when explicitly passed null', () {
        const state = AuthState(error: 'old error');
        final copied = state.copyWith(error: null);
        expect(copied.error, isNull);
      });

      test('copyWith preserves errorCode when not explicitly passed', () {
        const state = AuthState(errorCode: AuthErrorCode.networkError);
        final copied = state.copyWith(isLoading: true);
        expect(copied.errorCode, AuthErrorCode.networkError);
      });

      test('copyWith clears errorCode when explicitly passed null', () {
        const state = AuthState(errorCode: AuthErrorCode.networkError);
        final copied = state.copyWith(errorCode: null);
        expect(copied.errorCode, isNull);
      });

      test('copyWith updates all fields', () {
        const state = AuthState();
        const newUser = User(id: '2', username: 'other');
        final updated = state.copyWith(
          user: newUser,
          isAuthenticated: true,
          isLoading: true,
          error: 'new error',
        );

        expect(updated.user, equals(newUser));
        expect(updated.isAuthenticated, isTrue);
        expect(updated.isLoading, isTrue);
        expect(updated.error, 'new error');
      });
    });

    group('login - additional edge cases', () {
      test('login with correct error clears isLoading', () async {
        mockRepo.loginError = Exception('Server error');
        await notifier.login('user', 'pass');

        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, isNotNull);
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('login does not set isAuthenticated on error', () async {
        mockRepo.loginError = Exception('Network error');
        await notifier.login('user', 'pass');

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
      });
    });

    group('register - additional edge cases', () {
      test('register with error does not leave isLoading true', () async {
        mockRepo.registerError = Exception('Username taken');
        await notifier.register('user', 'user@example.com', 'pass');

        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, contains('Username taken'));
      });

      test('register success does not change user or isAuthenticated', () async {
        mockRepo.registerResponse = const UserAuthResponse(success: true);
        await notifier.register('newuser', 'newuser@example.com', 'pass');

        expect(notifier.state.user, isNull);
        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.error, isNull);
      });
    });

    group('checkAuth - additional edge cases', () {
      test('checkAuth when isAuthenticated throws resets to authReady', () async {
        mockRepo.isAuthenticatedError = Exception('Token check failed');

        // restoreSession catches errors from isAuthenticated
        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.user, isNull);
      });

      test('checkAuth after logout preserves logout state', () async {
        mockRepo.isAuthenticatedValue = false;
        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
      });
    });

    group('AuthNotifier - restoreSession', () {
      test('restoreSession sets authReady true when not authenticated', () async {
        mockRepo.isAuthenticatedValue = false;
        await notifier.restoreSession();
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('restoreSession sets authReady true when authenticated', () async {
        mockRepo.isAuthenticatedValue = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.isAuthenticated, isTrue);
        expect(notifier.state.permissions, ['chat:read']);
      });

      test('checkAuth delegates to restoreSession', () async {
        mockRepo.isAuthenticatedValue = false;
        await notifier.checkAuth();
        expect(notifier.state.authReady, isTrue);
      });
    });

    group('AuthNotifier - permissions', () {
      test('hasPermission returns true for granted permission', () async {
        mockRepo.isAuthenticatedValue = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read', 'chat:write']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.hasPermission('chat:read'), isTrue);
        expect(notifier.hasPermission('admin'), isFalse);
      });

      test('hasAnyPermission returns true if any match', () async {
        mockRepo.isAuthenticatedValue = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.hasAnyPermission(['admin', 'chat:read']), isTrue);
        expect(notifier.hasAnyPermission(['admin', 'superadmin']), isFalse);
      });
    });

    group('AuthNotifier - ensureFreshSession', () {
      test('returns true when already authenticated', () async {
        mockRepo.isAuthenticatedValue = true;
        final result = await notifier.ensureFreshSession();
        expect(result, isTrue);
      });

      test('returns false when refresh fails', () async {
        mockRepo.isAuthenticatedValue = false;
        mockRepo.refreshTokenError = Exception('refresh failed');
        final result = await notifier.ensureFreshSession();
        expect(result, isFalse);
      });
    });

    group('error code mapping', () {
      test('login network error maps to networkError', () async {
        mockRepo.loginError = Exception('Socket connection refused');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.networkError);
      });

      test('login timeout maps to networkError', () async {
        mockRepo.loginError = TimeoutException('Connection timed out');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.networkError);
      });

      test('login 401 error maps to invalidCredentials', () async {
        mockRepo.loginError = Exception('HTTP 401 Unauthorized');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.invalidCredentials);
      });

      test('login 429 error maps to tooManyRequests', () async {
        mockRepo.loginError = Exception('HTTP 429 Too Many Requests');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.tooManyRequests);
      });

      test('login 500 error maps to serverError', () async {
        mockRepo.loginError = Exception('HTTP 500 Internal Server Error');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.serverError);
      });

      test('login unknown error maps to unknown', () async {
        mockRepo.loginError = Exception('Something weird');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.unknown);
      });

      test('register error maps errorCode correctly', () async {
        mockRepo.registerError = Exception('Socket connection refused');
        await notifier.register('user', 'e@e.com', 'pass');
        expect(notifier.state.errorCode, AuthErrorCode.networkError);
      });

      test('login success clears errorCode', () async {
        mockRepo.loginError = Exception('fail');
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, isNotNull);

        mockRepo.loginError = null;
        mockRepo.loginResponse = const UserAuthResponse(success: true);
        await notifier.login('user', 'pass');
        expect(notifier.state.errorCode, isNull);
      });
    });
  });
}
