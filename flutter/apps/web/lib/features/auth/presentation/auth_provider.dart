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
      errorCode: identical(errorCode, _sentinel) ? this.errorCode : errorCode as AuthErrorCode?,
      rememberMe: rememberMe ?? this.rememberMe,
      authReady: authReady ?? this.authReady,
      permissions: permissions ?? this.permissions,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient, this._httpClient, this._analytics)
      : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;
  final AnalyticsPort _analytics;

  Future<void> login(String username, String password, {bool rememberMe = false}) async {
    state = state.copyWith(isLoading: true, error: null, errorCode: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(
        user: response.user,
        isAuthenticated: true,
        rememberMe: rememberMe,
      );
      _analytics.trackEvent('login_success', {'method': 'password'});
      // Connect WebSocket after successful login
      _connectWs();
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
        final user = await _repository.getProfile();
        state = AuthState(
          user: user,
          isAuthenticated: true,
          authReady: true,
          permissions: user.permissions ?? [],
        );
        _analytics.setUserId(user.id);
        _connectWs();
      } else {
        state = const AuthState(authReady: true);
      }
    } catch (e) {
      state = const AuthState(authReady: true);
    }
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

  AuthErrorCode _mapExceptionToErrorCode(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('401') || msg.contains('403') || msg.contains('unauthorized')) {
      return AuthErrorCode.invalidCredentials;
    }
    if (msg.contains('429') || msg.contains('too many')) {
      return AuthErrorCode.tooManyRequests;
    }
    if (RegExp(r'5\d{2}').hasMatch(msg) || msg.contains('server')) {
      return AuthErrorCode.serverError;
    }
    if (msg.contains('network') || msg.contains('connection') || msg.contains('socket')) {
      return AuthErrorCode.networkError;
    }
    return AuthErrorCode.unknown;
  }

  Future<void> _connectWs() async {
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        AuthEndpoints.wsTicket,
        fromJson: (json) => json,
      );
      final ticket = response.data['ticket'] as String?;
      if (ticket != null && ticket.isNotEmpty) {
        final wsUrl = '${_wsClient.wsBaseUrl}?ticket=$ticket';
        _wsClient.connect(wsUrl);
        return;
      }
    } catch (e) {
      AppLogger.instance.error('WS ticket fetch failed, connecting without ticket', e);
    }
    // Fallback: connect without ticket (development mode)
    _wsClient.connect(_wsClient.wsBaseUrl);
  }
}
