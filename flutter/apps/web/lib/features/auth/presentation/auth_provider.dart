import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/logging/app_logger.dart';
import '../domain/auth_error_code.dart';

class AuthState {
  static const _sentinel = Object();

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.errorCode,
    this.rememberMe = false,
    this.authReady = false,
    this.permissions = const [],
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final AuthErrorCode? errorCode;
  final bool rememberMe;
  final bool authReady;
  final List<String> permissions;

  AuthState copyWith({
    Object? user = _sentinel,
    bool? isAuthenticated,
    bool? isLoading,
    Object? error = _sentinel,
    Object? errorCode = _sentinel,
    bool? rememberMe,
    bool? authReady,
    List<String>? permissions,
  }) {
    return AuthState(
      user: identical(user, _sentinel) ? this.user : user as User?,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: identical(error, _sentinel) ? this.error : error as String?,
      errorCode: identical(errorCode, _sentinel)
          ? this.errorCode
          : errorCode as AuthErrorCode?,
      rememberMe: rememberMe ?? this.rememberMe,
      authReady: authReady ?? this.authReady,
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
    state = state.copyWith(isLoading: true, error: null, errorCode: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(
        user: response.user,
        isAuthenticated: true,
        rememberMe: rememberMe,
        authReady: true,
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
        isLoading: false,
        error: e.toString(),
        errorCode: _mapExceptionToErrorCode(e),
      );
    }
  }

  Future<void> register(String username, String email, String password) async {
    state = state.copyWith(isLoading: true, error: null, errorCode: null);
    try {
      await _repository.register(
        RegisterRequest(
          username: username,
          password: password,
          email: email,
          nickname: username,
        ),
      );
      state = state.copyWith(isLoading: false);
      _analytics.trackEvent('register_success');
    } catch (e) {
      _analytics.trackEvent('register_failed', {'error_type': 'auth'});
      state = state.copyWith(
        isLoading: false,
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
    state = state.copyWith(authReady: false);
    try {
      final isAuth = await _repository.isAuthenticated();
      if (isAuth) {
        try {
          final user = await _repository.getProfile();
          _setAuthenticated(user);
        } catch (e) {
          // Token 可能过期，尝试刷新
          try {
            await _repository.refreshToken();
            final user = await _repository.getProfile();
            _setAuthenticated(user);
          } catch (refreshError) {
            // 刷新也失败，让用户重新登录
            AppLogger.instance
                .error('Session restore failed', refreshError, null, 'auth');
            state = const AuthState(authReady: true);
          }
        }
      } else {
        // 没有 access_token，尝试用 refresh_token 恢复
        try {
          await _repository.refreshToken();
          final user = await _repository.getProfile();
          _setAuthenticated(user);
        } catch (_) {
          state = const AuthState(authReady: true);
        }
      }
    } catch (e) {
      state = const AuthState(authReady: true);
    }
  }

  /// 设置认证状态并异步连接 WebSocket。
  /// WS 连接失败不影响已认证的状态。
  void _setAuthenticated(User user) {
    state = AuthState(
      user: user,
      isAuthenticated: true,
      authReady: true,
      permissions: user.permissions ?? [],
    );
    _analytics.setUserId(user.id);
    // WS 连接是尽力而为的，失败不应导致用户被登出。
    unawaited(_connectWs(user.id).catchError((e, st) {
      AppLogger.instance.error('WS connect failed during session restore', e, st, 'ws');
    }));
  }

  Future<void> checkAuth() => restoreSession();

  Future<bool> ensureFreshSession() async {
    final isAuth = await _repository.isAuthenticated();
    if (!isAuth) {
      try {
        await _repository.refreshToken();
        return true;
      } catch (e) {
        state = const AuthState();
        return false;
      }
    }
    return true;
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
