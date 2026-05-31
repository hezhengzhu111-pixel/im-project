import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/logging/app_logger.dart';
import '../domain/auth_error_code.dart';
import '../domain/auth_status.dart';

class AuthState {
  static const _sentinel = Object();

  const AuthState({
    this.user,
    this.status = AuthStatus.initial,
    this.error,
    this.errorCode,
    this.rememberMe = false,
    this.permissions = const [],
  });

  final User? user;
  final AuthStatus status;
  final String? error;
  final AuthErrorCode? errorCode;
  final bool rememberMe;
  final List<String> permissions;

  /// 便捷 getter：是否已认证
  bool get isAuthenticated => status == AuthStatus.authenticated;

  /// 便捷 getter：是否正在加载
  bool get isLoading => status == AuthStatus.loading;

  /// 便捷 getter：认证流程是否已就绪（已检查过认证状态）
  bool get authReady => status != AuthStatus.initial && status != AuthStatus.loading;

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
      permissions: permissions ?? this.permissions,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(
      this._repository, this._wsClient, this._httpClient, this._analytics)
      : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;
  final AnalyticsPort _analytics;

  Future<void> login(String username, String password,
      {bool rememberMe = false}) async {
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
      unawaited(_connectWs(response.user?.id).catchError((e, st) {
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
        status: AuthStatus.error,
        error: e.toString(),
        errorCode: _mapExceptionToErrorCode(e),
      );
    }
  }

  Future<void> logout() async {
    _wsClient.disconnect();
    _analytics.setUserId(null);
    await _repository.logout();
    state = const AuthState();
  }

  Future<void> restoreSession() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final session = await _repository.restoreSession();
      final user = session.currentUser;
      if (session.isAuthenticated && user != null) {
        _setAuthenticated(user, permissions: session.permissions);
      } else {
        state = const AuthState(status: AuthStatus.unauthenticated);
      }
    } catch (e, st) {
      AppLogger.instance.error('Session restore failed', e, st, 'auth');
      state = state.isAuthenticated
          ? state.copyWith(status: AuthStatus.authenticated)
          : const AuthState(status: AuthStatus.unauthenticated);
    }
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
    unawaited(_connectWs(user.id).catchError((e, st) {
      AppLogger.instance
          .error('WS connect failed during session restore', e, st, 'ws');
    }));
  }

  Future<void> checkAuth() => restoreSession();

  Future<bool> ensureFreshSession() async {
    try {
      final session = await _repository.restoreSession();
      final user = session.currentUser;
      if (session.isAuthenticated && user != null) {
        _setAuthenticated(user, permissions: session.permissions);
        return true;
      }
      state = const AuthState(status: AuthStatus.unauthenticated);
      return false;
    } catch (e, st) {
      AppLogger.instance.error('Fresh session check failed', e, st, 'auth');
      return state.isAuthenticated;
    }
  }

  /// Update the current user in auth state (e.g. after avatar upload).
  void updateUser(User user) {
    state = state.copyWith(user: user);
  }

  bool hasPermission(String permission) {
    return state.permissions.contains(permission);
  }

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
    if (RegExp(r'\b5\d{2}\b').hasMatch(msg) || msg.contains('server')) {
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
