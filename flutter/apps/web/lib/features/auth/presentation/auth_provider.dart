import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.rememberMe = false,
    this.authReady = false,
    this.permissions = const [],
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final bool rememberMe;
  final bool authReady;
  final List<String> permissions;

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
    bool? rememberMe,
    bool? authReady,
    List<String>? permissions,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      rememberMe: rememberMe ?? this.rememberMe,
      authReady: authReady ?? this.authReady,
      permissions: permissions ?? this.permissions,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient, this._httpClient)
      : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;

  Future<void> login(String username, String password, {bool rememberMe = false}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(
        user: response.user,
        isAuthenticated: true,
        rememberMe: rememberMe,
      );
      // Connect WebSocket after successful login
      _connectWs();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> register(String username, String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
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
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> logout() async {
    _wsClient.disconnect();
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

  Future<void> _connectWs() async {
    try {
      final response = await _httpClient.post<Map<String, dynamic>>(
        AuthEndpoints.wsTicket,
        fromJson: (json) => json,
      );
      final ticket = response.data['ticket'] as String?;
      if (ticket != null && ticket.isNotEmpty) {
        final wsUrl = 'ws://localhost:8082${WsEndpoints.path}?ticket=$ticket';
        _wsClient.connect(wsUrl);
        return;
      }
    } catch (e) {
      print('WS ticket fetch failed, connecting without ticket: $e');
    }
    // Fallback: connect without ticket (development mode)
    _wsClient.connect('ws://localhost:8082${WsEndpoints.path}');
  }
}
