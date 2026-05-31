/// 认证模块的 Riverpod Provider 定义。
///
/// 包含认证仓库、认证状态管理器以及便捷查询 Provider。
/// 所有 Provider 均通过 Riverpod 的依赖注入机制管理生命周期。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/di/platform_providers.dart';
import '../data/auth_repository_impl.dart';
import 'auth_provider.dart';

/// 认证仓库 Provider，提供 [AuthRepository] 实例。
///
/// 内部创建 [AuthRepositoryImpl] 并注入 HTTP 客户端依赖。
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    httpClient: ref.watch(httpClientProvider),
  );
});

/// 认证状态 Provider，管理整个认证流程的状态。
///
/// 使用 [StateNotifierProvider] 提供 [AuthNotifier] 作为状态管理器，
/// 状态类型为 [AuthState]，内部使用 [AuthStatus] 枚举追踪认证阶段。
///
/// 依赖注入：
/// - [AuthRepository]：认证数据操作（登录/注册/登出/会话恢复）
/// - [WsClientPort]：WebSocket 连接管理
/// - [HttpClientPort]：HTTP 请求（用于获取 WS ticket 等）
/// - [AnalyticsPort]：分析事件上报
final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(wsClientProvider),
    ref.watch(httpClientProvider),
    ref.watch(analyticsProvider),
  );
});

/// 当前已登录用户的 ID Provider。
///
/// 从 [authStateProvider] 中提取用户 ID，未登录时返回 null。
final currentUserIdProvider = Provider<String?>((ref) {
  return ref.watch(authStateProvider).user?.id;
});

/// 是否已认证的便捷 Provider。
///
/// 基于 [AuthState.isAuthenticated] getter，
/// 当 [AuthStatus] 为 [AuthStatus.authenticated] 时返回 `true`。
final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).isAuthenticated;
});
