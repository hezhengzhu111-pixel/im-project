import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/domain/auth_status.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_shared_features/src/chat/data/sent_message_cache_port.dart';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/// Fake AuthRepository for testing.
class FakeAuthRepository implements AuthRepository {
  bool logoutShouldThrow = false;
  int logoutCallCount = 0;

  @override
  Future<void> logout() async {
    logoutCallCount++;
    if (logoutShouldThrow) {
      throw Exception('Server logout failed');
    }
  }

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    return const UserAuthResponse(
      success: true,
      user: User(id: 'test-user', username: 'test'),
      permissions: [],
    );
  }

  @override
  Future<AuthResult> restoreSession() async {
    return const AuthFailure(error: 'not authenticated');
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    return const UserAuthResponse(
      success: true,
      user: User(id: 'test-user', username: 'test'),
      permissions: [],
    );
  }
}

/// Fake WsClientPort for testing.
class FakeWsClientPort implements WsClientPort {
  int disconnectCallCount = 0;

  @override
  Future<void> disconnect() async {
    disconnectCallCount++;
  }

  @override
  Future<void> connect(String url) async {}

  @override
  Future<void> reconnect() async {}

  @override
  void send(Map<String, dynamic> message) {}

  @override
  String get wsBaseUrl => 'ws://localhost:8080';

  @override
  bool get isConnected => true;

  @override
  Stream<WsEvent> get events => const Stream.empty();

  @override
  Stream<WsConnectionState> get connectionState =>
      Stream.value(WsConnectionState.connected);
}

/// Fake HttpClientPort for testing.
class FakeHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    return ApiResponse(
        code: 200, message: 'ok', data: <String, dynamic>{} as T);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    return ApiResponse(
        code: 200, message: 'ok', data: <String, dynamic>{} as T);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    return ApiResponse(
        code: 200, message: 'ok', data: <String, dynamic>{} as T);
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    return ApiResponse(
        code: 200, message: 'ok', data: <String, dynamic>{} as T);
  }
}

/// Fake AnalyticsPort for testing.
class FakeAnalyticsPort implements AnalyticsPort {
  int setUserIdCallCount = 0;
  String? lastUserId;

  @override
  void setUserId(String? userId) {
    setUserIdCallCount++;
    lastUserId = userId;
  }

  @override
  void trackEvent(String event, [Map<String, dynamic>? properties]) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}

/// Fake SentMessageCachePort for testing.
class FakeSentMessageCachePort implements SentMessageCachePort {
  int clearAllCallCount = 0;
  bool clearAllShouldThrow = false;

  @override
  Future<void> clearAll() async {
    clearAllCallCount++;
    if (clearAllShouldThrow) {
      throw Exception('Cache clear failed');
    }
  }

  @override
  Future<void> clearSession(String e2eeSessionId) async {}

  @override
  Future<String?> getPlaintextByClientId(String clientMessageId) async => null;

  @override
  Future<String?> getPlaintextByServerId(String serverMessageId) async => null;

  @override
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? serverMessageId,
  }) async {}

  @override
  Future<void> updateServerId(String clientMessageId, String serverMessageId) async {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late AuthNotifier notifier;
  late FakeAuthRepository fakeRepo;
  late FakeWsClientPort fakeWs;
  late FakeHttpClientPort fakeHttp;
  late FakeAnalyticsPort fakeAnalytics;
  late FakeSentMessageCachePort fakeCache;

  setUp(() {
    fakeRepo = FakeAuthRepository();
    fakeWs = FakeWsClientPort();
    fakeHttp = FakeHttpClientPort();
    fakeAnalytics = FakeAnalyticsPort();
    fakeCache = FakeSentMessageCachePort();
    notifier =
        AuthNotifier(fakeRepo, fakeWs, fakeHttp, fakeAnalytics, fakeCache);
  });

  tearDown(() {
    notifier.dispose();
  });

  group('AuthNotifier.logout clears E2EE sent message cache', () {
    test('calls cache.clearAll() on successful logout', () async {
      await notifier.logout();

      expect(fakeCache.clearAllCallCount, 1);
      expect(notifier.state.status, AuthStatus.unauthenticated);
    });

    test('calls cache.clearAll() even when server logout fails', () async {
      fakeRepo.logoutShouldThrow = true;

      await notifier.logout();

      expect(fakeRepo.logoutCallCount, 1);
      expect(fakeCache.clearAllCallCount, 1);
      expect(notifier.state.status, AuthStatus.unauthenticated);
    });

    test('cache.clearAll() failure does not crash logout', () async {
      fakeCache.clearAllShouldThrow = true;

      await notifier.logout();

      expect(notifier.state.status, AuthStatus.unauthenticated);
      expect(fakeWs.disconnectCallCount, 1);
      expect(fakeAnalytics.lastUserId, isNull);
    });

    test('works when no cache is provided (null)', () async {
      final notifierNoCache = AuthNotifier(
        fakeRepo,
        fakeWs,
        fakeHttp,
        fakeAnalytics,
        null, // No cache provided
      );

      await notifierNoCache.logout();

      expect(notifierNoCache.state.status, AuthStatus.unauthenticated);
      expect(fakeWs.disconnectCallCount, 1);
      notifierNoCache.dispose();
    });

    test('logout sets analytics userId to null', () async {
      await notifier.logout();

      expect(fakeAnalytics.setUserIdCallCount, 1);
      expect(fakeAnalytics.lastUserId, isNull);
    });

    test('logout disconnects WebSocket', () async {
      await notifier.logout();

      expect(fakeWs.disconnectCallCount, 1);
    });
  });
}
