import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

/// Manual mock implementation of AuthRepository for testing.
class MockAuthRepository implements AuthRepository {
  UserAuthResponse? loginResponse;
  UserAuthResponse? registerResponse;
  User? profileResponse;
  bool? isAuthResponse;
  String? tokenResponse;
  Exception? errorToThrow;

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
}

void main() {
  late MockAuthRepository mockRepo;
  late AuthNotifier notifier;

  setUp(() {
    mockRepo = MockAuthRepository();
    notifier = AuthNotifier(mockRepo);
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

        await notifier.register('newuser', 'password123', 'New User');

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

        await notifier.register('bob', 'pass123', 'Bob');

        expect(mockRepo.registerCallCount, 1);
        expect(mockRepo.lastRegisterRequest!.username, 'bob');
        expect(mockRepo.lastRegisterRequest!.password, 'pass123');
        expect(mockRepo.lastRegisterRequest!.nickname, 'Bob');
      });

      test('sets error on failure', () async {
        mockRepo.errorToThrow = Exception('Username taken');

        await notifier.register('user', 'pass', 'Nick');

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
  });
}
