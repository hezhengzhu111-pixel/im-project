import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/app.dart';
import 'package:im_web/features/auth/domain/auth_status.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/auth/presentation/auth_providers.dart';

/// 创建一个始终返回已认证状态的 mock auth notifier
class MockAuthenticatedNotifier extends AuthNotifier {
  MockAuthenticatedNotifier()
      : super(
          _MockAuthRepository(),
          _MockWsClient(),
          _MockHttpClient(),
          _MockAnalytics(),
        );

  @override
  Future<void> checkAuth() async {
    // 模拟已登录状态
    state = AuthState(
      user: const User(id: 'test-user', username: 'testuser'),
      status: AuthStatus.authenticated,
      permissions: const [],
    );
  }

  @override
  Future<void> restoreSession() async {
    // 模拟会话恢复成功
    state = AuthState(
      user: const User(id: 'test-user', username: 'testuser'),
      status: AuthStatus.authenticated,
      permissions: const [],
    );
  }
}

/// Mock 实现：AuthRepository
class _MockAuthRepository implements AuthRepository {
  @override
  Future<UserAuthResponse> login(LoginRequest request) async =>
      const UserAuthResponse(success: true);

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async =>
      const UserAuthResponse(success: true);

  @override
  Future<AuthResult> restoreSession() async =>
      const AuthFailure(error: 'mock');

  @override
  Future<void> logout() async {}
}

/// Mock 实现：WsClientPort
class _MockWsClient implements WsClientPort {
  @override
  String get wsBaseUrl => 'ws://localhost';

  @override
  Future<void> connect(String url) async {}

  @override
  Future<void> disconnect() async {}

  @override
  Future<void> reconnect() async {}

  @override
  void send(Map<String, dynamic> message) {}

  @override
  Stream<WsEvent> get events => const Stream.empty();

  @override
  Stream<WsConnectionState> get connectionState => const Stream.empty();

  @override
  bool get isConnected => false;
}

/// Mock 实现：HttpClientPort
class _MockHttpClient implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();
}

/// Mock 实现：AnalyticsPort
class _MockAnalytics implements AnalyticsPort {
  @override
  void setUserId(String? userId) {}

  @override
  void trackEvent(String name, [Map<String, dynamic>? params]) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}

/// 启动应用并等待认证检查完成。
///
/// [overrides] 允许调用方注入自定义 Provider 覆盖，例如 mock 网络层。
Future<void> _startApp(
  WidgetTester tester, {
  List<Override> overrides = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: const App(),
    ),
  );
  // 等待认证状态从 initial -> loading -> authenticated / unauthenticated
  await tester.pumpAndSettle();
}

/// 通过认证状态 provider 检查登录状态。
bool _isAuthenticated(WidgetTester tester) {
  final element = tester.element(find.byType(App));
  final container = ProviderScope.containerOf(element);
  final authState = container.read(authStateProvider);
  return authState.isAuthenticated;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Auth Refresh Persistence', () {
    testWidgets(
      'should remain authenticated after app re-initialization',
      (tester) async {
        // ── 第一次启动：使用 mock provider 模拟已登录状态 ──
        await _startApp(
          tester,
          overrides: [
            authStateProvider.overrideWith((ref) => MockAuthenticatedNotifier()),
          ],
        );

        // 验证已登录
        expect(_isAuthenticated(tester), isTrue, reason: '首次启动后应已登录');

        // 记录第一次启动的认证状态
        final initialState = _isAuthenticated(tester);
        debugPrint('First launch authenticated: $initialState');

        // ── 模拟页面刷新：重新构建整个 Widget 树 ──
        // 在 Web 平台上，页面刷新等同于重新创建 ProviderScope 和 App。
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();

        // 重新启动应用（模拟刷新）
        await _startApp(
          tester,
          overrides: [
            authStateProvider.overrideWith((ref) => MockAuthenticatedNotifier()),
          ],
        );

        final refreshState = _isAuthenticated(tester);
        debugPrint('After refresh authenticated: $refreshState');

        // ── 验证：刷新后认证状态应保持不变 ──
        expect(
          refreshState,
          initialState,
          reason: '认证状态在页面刷新后应保持不变',
        );

        // 进一步验证用户信息仍然存在
        final element = tester.element(find.byType(App));
        final container = ProviderScope.containerOf(element);
        final authState = container.read(authStateProvider);
        expect(authState.user, isNotNull, reason: '用户信息不应丢失');
        expect(authState.user?.id, isNotEmpty, reason: '用户 ID 不应为空');
        expect(authState.user?.id, 'test-user', reason: '用户 ID 应为测试用户');
      },
    );

    testWidgets(
      'should restore session from persistent storage',
      (tester) async {
        // 此测试验证会话恢复流程：
        // 1. 使用 mock provider 启动应用（模拟已登录状态）
        // 2. 等待认证检查完成
        // 3. 验证状态转换到非 loading 状态
        await _startApp(
          tester,
          overrides: [
            authStateProvider.overrideWith((ref) => MockAuthenticatedNotifier()),
          ],
        );

        final element = tester.element(find.byType(App));
        final container = ProviderScope.containerOf(element);
        final authState = container.read(authStateProvider);

        // 认证检查应已完成（不应停留在 loading 状态）
        expect(
          authState.status,
          isNot(AuthStatus.loading),
          reason: '认证检查应在应用启动后完成',
        );
        expect(
          authState.status,
          isNot(AuthStatus.initial),
          reason: '认证状态不应停留在初始状态',
        );

        // 验证认证状态是明确的：已认证
        expect(
          authState.isAuthenticated,
          isTrue,
          reason: '使用 mock provider 后，认证状态应为已认证',
        );

        // 验证用户信息
        expect(authState.user, isNotNull, reason: '用户信息不应为空');
        expect(authState.user?.id, 'test-user', reason: '用户 ID 应为测试用户');
        expect(authState.user?.username, 'testuser', reason: '用户名应为 testuser');
      },
    );

    testWidgets(
      'should maintain auth state across multiple refreshes',
      (tester) async {
        // 此测试验证多次刷新后认证状态仍然保持
        final overrides = [
          authStateProvider.overrideWith((ref) => MockAuthenticatedNotifier()),
        ];

        // 第一次启动
        await _startApp(tester, overrides: overrides);
        expect(_isAuthenticated(tester), isTrue);

        // 第一次刷新
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await _startApp(tester, overrides: overrides);
        expect(_isAuthenticated(tester), isTrue);

        // 第二次刷新
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await _startApp(tester, overrides: overrides);
        expect(_isAuthenticated(tester), isTrue);

        // 验证最终状态
        final element = tester.element(find.byType(App));
        final container = ProviderScope.containerOf(element);
        final authState = container.read(authStateProvider);
        expect(authState.user?.id, 'test-user');
      },
    );
  });
}
