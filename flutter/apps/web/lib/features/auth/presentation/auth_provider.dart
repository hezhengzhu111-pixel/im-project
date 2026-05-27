import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient) : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;

  Future<void> login(String username, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(user: response.user, isAuthenticated: true);
      // Connect WebSocket after successful login
      _connectWs();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> register(
      String username, String password, String nickname) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.register(
        RegisterRequest(
            username: username, password: password, nickname: nickname),
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

  Future<void> checkAuth() async {
    final isAuth = await _repository.isAuthenticated();
    if (isAuth) {
      try {
        final user = await _repository.getProfile();
        state = AuthState(user: user, isAuthenticated: true);
        // Reconnect WebSocket on session restore
        _connectWs();
      } catch (e) {
        state = const AuthState();
      }
    }
  }

  void _connectWs() {
    // Build WS URL with ticket — for now, connect without ticket (simplified)
    // TODO: fetch ticket from AuthEndpoints.wsTicket and append as query param
    _wsClient.connect('ws://localhost:8082/websocket');
  }
}
