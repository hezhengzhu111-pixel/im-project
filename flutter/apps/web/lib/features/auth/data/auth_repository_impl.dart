import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required HttpClientPort httpClient,
  }) : _httpClient = httpClient;

  final HttpClientPort _httpClient;

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    final response = await _httpClient.post<UserAuthResponse>(
      UserEndpoints.login,
      body: request.toJson(),
      fromJson: UserAuthResponse.fromJson,
    );
    return response.data;
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    final response = await _httpClient.post<UserAuthResponse>(
      UserEndpoints.register,
      body: request.toJson(),
      fromJson: UserAuthResponse.fromJson,
    );
    return response.data;
  }

  @override
  Future<void> logout() async {
    await _httpClient.post<void>(
      UserEndpoints.logout,
      fromJson: (_) {},
    );
  }

  @override
  Future<AuthSession> restoreSession() async {
    final parsed = await _parseAccessToken(allowExpired: true);
    if (_isValidParsedToken(parsed)) {
      return _sessionFromParsedToken(parsed);
    }

    try {
      await _refreshSession();
    } catch (error) {
      if (_isAuthInvalid(error)) {
        return _unauthenticatedSession();
      }
      rethrow;
    }

    final refreshed = await _parseAccessToken();
    if (_isValidParsedToken(refreshed)) {
      return _sessionFromParsedToken(refreshed);
    }
    return _unauthenticatedSession();
  }

  Future<void> _refreshSession() async {
    await _httpClient.post<Map<String, dynamic>>(
      AuthEndpoints.refresh,
      body: const <String, dynamic>{},
      fromJson: (json) => json,
    );
  }

  Future<Map<String, dynamic>> _parseAccessToken({
    bool allowExpired = false,
  }) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      AuthEndpoints.parse,
      body: {'allowExpired': allowExpired},
      fromJson: (json) => json,
    );
    return response.data;
  }

  AuthSession _sessionFromParsedToken(Map<String, dynamic> parsed) {
    final userId = _stringValue(parsed['userId'] ?? parsed['user_id']);
    if (userId == null) return _unauthenticatedSession();

    final username = _stringValue(parsed['username']) ?? userId;
    final permissions = _stringList(parsed['permissions']);
    final user = User(
      id: userId,
      username: username,
      nickname: username,
      permissions: permissions,
    );

    return AuthSession(
      currentUser: user,
      isAuthenticated: true,
      authReady: true,
      permissions: permissions,
    );
  }

  bool _isValidParsedToken(Map<String, dynamic> parsed) {
    return parsed['valid'] == true && parsed['expired'] != true;
  }

  bool _isAuthInvalid(Object error) {
    if (error is DioException) {
      final status = error.response?.statusCode;
      if (status == 400 || status == 401 || status == 403) return true;
    }
    final message = error.toString().toLowerCase();
    return message.contains('401') ||
        message.contains('403') ||
        message.contains('token_invalid') ||
        message.contains('token_expired') ||
        message.contains('no refresh token');
  }

  AuthSession _unauthenticatedSession() {
    return const AuthSession(
      currentUser: null,
      isAuthenticated: false,
      authReady: true,
    );
  }

  String? _stringValue(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty || text == 'null' ? null : text;
  }

  List<String> _stringList(Object? value) {
    if (value is! List) return const [];
    return value
        .map((item) => _stringValue(item))
        .whereType<String>()
        .toList(growable: false);
  }
}
