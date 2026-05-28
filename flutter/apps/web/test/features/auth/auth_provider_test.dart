import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

/// Manual mock implementation of WsClientPort for testing.
class MockWsClientPort implements WsClientPort {
  @override
  Stream<WsEvent> get events => const Stream.empty();

  @override
  Stream<WsConnectionState> get connectionState => const Stream.empty();

  @override
  bool get isConnected => false;

  @override
  Future<void> connect(String url) async {}

  @override
  Future<void> disconnect() async {}

  @override
  Future<void> reconnect() async {}

  @override
  void send(Map<String, dynamic> message) {}
}

/// Manual mock implementation of HttpClientPort for testing.
class MockHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError();
  }
}

/// Manual mock implementation of AuthRepository for testing.
class MockAuthRepository implements AuthRepository {
  UserAuthResponse? loginResponse;
  UserAuthResponse? registerResponse;
  User? profileResponse;
  bool? isAuthResponse;
  String? tokenResponse;
  Exception? errorToThrow;
  Exception? refreshTokenErrorToThrow;

  int loginCallCount = 0;
  int registerCallCount = 0;
  int logoutCallCount = 0;
  int getProfileCallCount = 0;
  int isAuthenticatedCallCount = 0;

  LoginRequest? lastLoginRequest;
  RegisterRequest? lastRegisterRequest;

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    loginCallCount++;
    lastLoginRequest = request;
    if (errorToThrow != null) throw errorToThrow!;
    return loginResponse!;
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    registerCallCount++;
    lastRegisterRequest = request;
    if (errorToThrow != null) throw errorToThrow!;
    return registerResponse!;
  }

  @override
  Future<User> getProfile() async {
    getProfileCallCount++;
    if (errorToThrow != null) throw errorToThrow!;
    if (profileResponse == null) throw Exception('Profile not found');
    return profileResponse!;
  }

  @override
  Future<void> logout() async {
    logoutCallCount++;
    if (errorToThrow != null) throw errorToThrow!;
  }

  @override
  Future<bool> isAuthenticated() async {
    isAuthenticatedCallCount++;
    if (errorToThrow != null) throw errorToThrow!;
    return isAuthResponse!;
  }

  @override
  Future<String?> getToken() async {
    return tokenResponse;
  }

  @override
  Future<void> refreshToken() async {
    if (refreshTokenErrorToThrow != null) throw refreshTokenErrorToThrow!;
  }
}

void main() {
  late MockAuthRepository mockRepo;
  late MockWsClientPort mockWsClient;
  late MockHttpClientPort mockHttpClient;
  late AuthNotifier notifier;

  setUp(() {
    mockRepo = MockAuthRepository();
    mockWsClient = MockWsClientPort();
    mockHttpClient = MockHttpClientPort();
    notifier = AuthNotifier(mockRepo, mockWsClient, mockHttpClient);
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
        mockRepo.errorToThrow = Exception('Invalid credentials');

        await notifier.login('testuser', 'wrong');

        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, contains('Invalid credentials'));
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('clears previous error on new login attempt', () async {
        mockRepo.errorToThrow = Exception('Error 1');
        await notifier.login('user', 'pass');
        expect(notifier.state.error, isNotNull);

        mockRepo.errorToThrow = null;
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
        mockRepo.errorToThrow = Exception('Username taken');

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
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'testuser');
        mockRepo.profileResponse = user;

        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isTrue);
        expect(notifier.state.user, equals(user));
        expect(mockRepo.isAuthenticatedCallCount, 1);
        expect(mockRepo.getProfileCallCount, 1);
      });

      test('stays unauthenticated when not authenticated', () async {
        mockRepo.isAuthResponse = false;

        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
        expect(mockRepo.getProfileCallCount, 0);
      });

      test('resets state when getProfile throws', () async {
        // isAuthenticated succeeds, but getProfile fails
        mockRepo.isAuthResponse = true;
        mockRepo.profileResponse = null; // Will cause null error in getProfile

        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
      });
    });

    group('AuthState.copyWith', () {
      test('copyWith preserves existing values', () {
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
        expect(copied.error, isNull); // copyWith sets error to null by default
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
        mockRepo.errorToThrow = Exception('Server error');
        await notifier.login('user', 'pass');

        expect(notifier.state.isLoading, isFalse);
        expect(notifier.state.error, isNotNull);
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('login does not set isAuthenticated on error', () async {
        mockRepo.errorToThrow = Exception('Network error');
        await notifier.login('user', 'pass');

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
      });
    });

    group('register - additional edge cases', () {
      test('register with error does not leave isLoading true', () async {
        mockRepo.errorToThrow = Exception('Username taken');
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
        mockRepo.errorToThrow = Exception('Token check failed');

        // restoreSession catches errors from isAuthenticated
        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.user, isNull);
      });

      test('checkAuth after logout preserves logout state', () async {
        mockRepo.isAuthResponse = false;
        await notifier.checkAuth();

        expect(notifier.state.isAuthenticated, isFalse);
        expect(notifier.state.user, isNull);
      });
    });

    group('AuthNotifier - restoreSession', () {
      test('restoreSession sets authReady true when not authenticated', () async {
        mockRepo.isAuthResponse = false;
        await notifier.restoreSession();
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('restoreSession sets authReady true when authenticated', () async {
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.isAuthenticated, isTrue);
        expect(notifier.state.permissions, ['chat:read']);
      });

      test('checkAuth delegates to restoreSession', () async {
        mockRepo.isAuthResponse = false;
        await notifier.checkAuth();
        expect(notifier.state.authReady, isTrue);
      });
    });

    group('AuthNotifier - permissions', () {
      test('hasPermission returns true for granted permission', () async {
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read', 'chat:write']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.hasPermission('chat:read'), isTrue);
        expect(notifier.hasPermission('admin'), isFalse);
      });

      test('hasAnyPermission returns true if any match', () async {
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.hasAnyPermission(['admin', 'chat:read']), isTrue);
        expect(notifier.hasAnyPermission(['admin', 'superadmin']), isFalse);
      });
    });

    group('AuthNotifier - ensureFreshSession', () {
      test('returns true when already authenticated', () async {
        mockRepo.isAuthResponse = true;
        final result = await notifier.ensureFreshSession();
        expect(result, isTrue);
      });

      test('returns false when refresh fails', () async {
        mockRepo.isAuthResponse = false;
        mockRepo.refreshTokenErrorToThrow = Exception('refresh failed');
        final result = await notifier.ensureFreshSession();
        expect(result, isFalse);
      });
    });
  });
}
