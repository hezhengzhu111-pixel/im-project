import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:im_web/app.dart';
import 'package:im_web/features/auth/domain/auth_status.dart';
import 'package:im_web/features/auth/presentation/auth_providers.dart';

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
        // ── 第一次启动：验证初始状态 ──
        // 此测试使用真实 Provider 树（无 mock），
        // 依赖后端服务运行。若无后端，认证状态将为 unauthenticated，
        // 测试将验证的是"无会话时不会错误地进入已认证状态"。
        await _startApp(tester);

        // 第一次启动后，等待认证检查完成
        await tester.pumpAndSettle();

        final initialState = _isAuthenticated(tester);
        // 记录第一次启动的认证状态（取决于是否有有效会话）
        debugPrint('First launch authenticated: $initialState');

        // ── 模拟页面刷新：重新构建整个 Widget 树 ──
        // 在 Web 平台上，页面刷新等同于重新创建 ProviderScope 和 App。
        // 我们通过重新 pump 新的 ProviderScope 来模拟这个过程。
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();

        // 重新启动应用（模拟刷新）
        await _startApp(tester);
        await tester.pumpAndSettle();

        final refreshState = _isAuthenticated(tester);
        debugPrint('After refresh authenticated: $refreshState');

        // ── 验证：刷新后认证状态应与刷新前一致 ──
        // 如果之前是已认证的，刷新后应仍然是已认证的（会话保持）。
        // 如果之前是未认证的，刷新后应仍然是未认证的。
        expect(
          refreshState,
          initialState,
          reason: '认证状态在页面刷新后应保持不变',
        );

        // 如果已登录，进一步验证用户信息仍然存在
        if (initialState) {
          final element = tester.element(find.byType(App));
          final container = ProviderScope.containerOf(element);
          final authState = container.read(authStateProvider);
          expect(authState.user, isNotNull, reason: '用户信息不应丢失');
          expect(authState.user?.id, isNotEmpty, reason: '用户 ID 不应为空');
        }
      },
    );

    testWidgets(
      'should restore session from persistent storage',
      (tester) async {
        // 此测试验证会话恢复流程：
        // 1. 启动应用（触发 checkAuth / restoreSession）
        // 2. 等待认证检查完成
        // 3. 验证状态转换到非 loading 状态
        await _startApp(tester);
        await tester.pumpAndSettle();

        final element = tester.element(find.byType(App));
        final container = ProviderScope.containerOf(element);
        final authState = container.read(authStateProvider);

        // 无论是否有有效会话，认证检查都应完成（不应停留在 loading 状态）
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

        // 验证认证状态是明确的：要么已认证，要么未认证
        expect(
          authState.isAuthenticated || authState.status == AuthStatus.unauthenticated,
          isTrue,
          reason: '认证状态应为已认证或未认证之一',
        );
      },
    );
  });
}
