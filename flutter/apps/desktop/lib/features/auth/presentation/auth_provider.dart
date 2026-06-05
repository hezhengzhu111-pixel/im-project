import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/logging/app_logger.dart';
import '../domain/auth_status.dart';

/// 认证模块的不可变状态。
///
/// 包含当前用户信息、认证状态、错误信息以及权限列表。
/// 通过 [copyWith] 方法创建修改后的新实例，确保状态不可变。
class AuthState {
  static const _sentinel = Object();

  const AuthState({
    this.user,
    this.status = AuthStatus.initial,
    this.error,
    this.errorCode,
    this.rememberMe = false,
    List<String> permissions = const [],
  }) : permissions = permissions;

  /// 当前已登录的用户，未登录时为 null。
  final User? user;

  /// 当前认证状态（初始、加载中、已认证、未认证等）。
  final AuthStatus status;

  /// 最近一次操作的错误描述信息。
  final String? error;

  /// 最近一次操作的结构化错误码，用于 UI 层按类型展示错误提示。
  final AuthErrorCode? errorCode;

  /// 是否记住登录状态。
  final bool rememberMe;

  /// 当前用户拥有的权限标识列表。
  final List<String> permissions;

  /// 便捷 getter：是否已认证
  bool get isAuthenticated => status == AuthStatus.authenticated;

  /// 便捷 getter：是否正在加载
  bool get isLoading => status == AuthStatus.loading;

  /// 便捷 getter：认证流程是否已就绪（已检查过认证状态）
  bool get authReady => status != AuthStatus.initial && status != AuthStatus.loading;

  /// 创建当前状态的副本，仅修改传入的字段，其余字段保持不变。
  AuthState copyWith({
    Object? user = _sentinel,
    AuthStatus? status,
    Object? error = _sentinel,
    Object? errorCode = _sentinel,
    bool? rememberMe,
    List<String>? permissions,
  }) {
    return AuthState(
      user: identical(user, _sentinel) ? this.user : user as User?,
      status: status ?? this.status,
      error: identical(error, _sentinel) ? this.error : error as String?,
      errorCode: identical(errorCode, _sentinel)
          ? this.errorCode
          : errorCode as AuthErrorCode?,
      rememberMe: rememberMe ?? this.rememberMe,
      permissions: List.unmodifiable(permissions ?? this.permissions),
    );
  }
}

/// 管理认证流程的 Riverpod StateNotifier。
///
/// 负责登录、注册、登出、会话恢复等操作，
/// 并在状态变更时自动管理 WebSocket 连接和分析事件上报。
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(
      this._repository, this._wsClient, this._httpClient, this._analytics)
      : super(const AuthState());

  /// Matches HTTP 5xx status codes (e.g. 500, 502, 503).
  static final _serverErrorCodePattern = RegExp(r'\b5\d{2}\b');

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;
  final AnalyticsPort _analytics;

  /// 使用用户名和密码登录。
  ///
  /// 登录成功后会自动建立 WebSocket 连接，WS 失败不影响认证状态。
  /// [rememberMe] 为 true 时，登录状态将被持久化。
  Future<void> login(String username, String password,
      {bool rememberMe = false}) async {
    if (state.isLoading) return;
    state = state.copyWith(status: AuthStatus.loading, error: null, errorCode: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(
        user: response.user,
        status: AuthStatus.authenticated,
        rememberMe: rememberMe,
        permissions: response.permissions ?? [],
      );
      _analytics.trackEvent('login_success', {'method': 'password'});
      // Connect WebSocket after successful login.
      // WS failures must NOT roll back the authenticated state.
      unawaited(_connectWs(response.user?.id).catchError((Object e, StackTrace? st) {
        AppLogger.instance.error('WS connect failed after login', e, st, 'ws');
      }));
    } catch (e) {
      _analytics.trackEvent('login_failed', {'error_type': 'auth'});
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.toString(),
        errorCode: _mapExceptionToErrorCode(e),
      );
    }
  }

  /// 注册新用户账号。
  ///
  /// 注册成功后状态切换为 [AuthStatus.unauthenticated]，引导用户登录。
  Future<void> register(String username, String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading, error: null, errorCode: null);
    try {
      await _repository.register(
        RegisterRequest(
          username: username,
          password: password,
          email: email,
          nickname: username,
        ),
      );
      state = state.copyWith(status: AuthStatus.unauthenticated);
      _analytics.trackEvent('register_success');
    } catch (e) {
      _analytics.trackEvent('register_failed', {'error_type': 'auth'});
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: e.toString(),
        errorCode: _mapExceptionToErrorCode(e),
      );
    }
  }

  /// 登出当前用户。
  ///
  /// 断开 WebSocket 连接，清除分析用户标识，销毁服务端会话，
  /// 并将状态重置为 [AuthStatus.unauthenticated]。
  Future<void> logout() async {
    _wsClient.disconnect();
    _analytics.setUserId(null);
    try {
      await _repository.logout();
    } catch (e, st) {
      AppLogger.instance.error('Server logout failed', e, st, 'auth');
    } finally {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// 从服务端恢复已保存的会话。
  ///
  /// 如果会话有效则切换到已认证状态并连接 WebSocket，
  /// 否则切换到未认证状态。
  Future<void> restoreSession() async {
    state = state.copyWith(status: AuthStatus.loading);
    await _restoreAndSync();
  }

  /// 设置认证状态并异步连接 WebSocket。
  /// WS 连接失败不影响已认证的状态。
  void _setAuthenticated(User user, {List<String>? permissions}) {
    state = AuthState(
      user: user,
      status: AuthStatus.authenticated,
      permissions: permissions ?? user.permissions ?? [],
    );
    _analytics.setUserId(user.id);
    // WS 连接是尽力而为的，失败不应导致用户被登出。
    unawaited(_connectWs(user.id).catchError((Object e, StackTrace? st) {
      AppLogger.instance
          .error('WS connect failed during session restore', e, st, 'ws');
    }));
  }

  Future<void> checkAuth() => restoreSession();

  /// 确保当前会话仍然有效。
  ///
  /// 返回 true 表示会话有效且已刷新，false 表示会话已过期。
  Future<bool> ensureFreshSession() => _restoreAndSync();

  /// 从服务端恢复会话并同步认证状态，供 [restoreSession] 和
  /// [ensureFreshSession] 复用。
  Future<bool> _restoreAndSync() async {
    try {
      final result = await _repository.restoreSession();
      switch (result) {
        case AuthSuccess(:final user, :final permissions):
          _setAuthenticated(user, permissions: permissions);
          return true;
        case AuthFailure():
          state = const AuthState(status: AuthStatus.unauthenticated);
          return false;
      }
    } catch (e, st) {
      AppLogger.instance.error('Session restore failed', e, st, 'auth');
      state = const AuthState(status: AuthStatus.unauthenticated);
      return false;
    }
  }

  /// Update the current user in auth state (e.g. after avatar upload).
  void updateUser(User user) {
    state = state.copyWith(user: user);
  }

  /// 检查当前用户是否拥有指定权限。
  bool hasPermission(String permission) {
    return state.permissions.contains(permission);
  }

  /// 检查当前用户是否拥有给定权限列表中的任一权限。
  bool hasAnyPermission(List<String> permissions) {
    return permissions.any(state.permissions.contains);
  }

  // Message-based matching (not type-based) because dart:io is unavailable in Flutter web.
  AuthErrorCode _mapExceptionToErrorCode(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('401') ||
        msg.contains('403') ||
        msg.contains('unauthorized')) {
      return AuthErrorCode.invalidCredentials;
    }
    if (msg.contains('429') || msg.contains('too many')) {
      return AuthErrorCode.tooManyRequests;
    }
    if (_serverErrorCodePattern.hasMatch(msg) || msg.contains('server')) {
      return AuthErrorCode.serverError;
    }
    if (msg.contains('network') ||
        msg.contains('connection') ||
        msg.contains('socket')) {
      return AuthErrorCode.networkError;
    }
    return AuthErrorCode.unknown;
  }

  Future<void> _connectWs(String? userId) async {
    final normalizedUserId = userId?.trim() ?? '';
    if (normalizedUserId.isEmpty) {
      AppLogger.instance.warn('WS connect skipped: missing user id');
      return;
    }

    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        AuthEndpoints.wsTicket,
        fromJson: (json) => json,
      );
      final ticket = response.data['ticket'] as String?;
      if (ticket != null && ticket.isNotEmpty) {
        final wsUrl = _buildWsUrl(normalizedUserId, ticket);
        _wsClient.connect(wsUrl);
        return;
      }
    } catch (e, st) {
      AppLogger.instance.error(
          'WS ticket fetch failed, connecting without ticket', e, st, 'ws');
    }
    // Fallback: connect without ticket (development mode)
    _wsClient.connect(_buildWsUrl(normalizedUserId));
  }

  String _buildWsUrl(String userId, [String? ticket]) {
    final base = _wsClient.wsBaseUrl.replaceFirst(RegExp(r'/+$'), '');
    final buffer = StringBuffer('$base/${Uri.encodeComponent(userId)}');
    if (ticket != null && ticket.isNotEmpty) {
      buffer.write(
          '?${WsEndpoints.ticketParam}=${Uri.encodeQueryComponent(ticket)}');
    }
    return buffer.toString();
  }
}
