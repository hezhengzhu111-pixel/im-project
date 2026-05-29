import 'package:im_core/core.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required HttpClientPort httpClient,
    required SecureStoragePort secureStorage,
  })  : _httpClient = httpClient,
        _secureStorage = secureStorage;

  final HttpClientPort _httpClient;
  final SecureStoragePort _secureStorage;

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    final response = await _httpClient.post<UserAuthResponse>(
      UserEndpoints.login,
      body: request.toJson(),
      fromJson: UserAuthResponse.fromJson,
    );
    await _persistTokens(response.data);
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
  Future<User> getProfile() async {
    final response = await _httpClient.get<User>(
      UserEndpoints.profile,
      fromJson: User.fromJson,
    );
    return response.data;
  }

  @override
  Future<void> logout() async {
    try {
      await _httpClient.post<void>(
        UserEndpoints.logout,
        fromJson: (_) {},
      );
    } finally {
      await _secureStorage.delete('access_token');
      await _secureStorage.delete('refresh_token');
    }
  }

  @override
  Future<bool> isAuthenticated() async {
    final token = await _secureStorage.read('access_token');
    if (token != null && token.isNotEmpty) return true;
    final refreshToken = await _secureStorage.read('refresh_token');
    return refreshToken != null && refreshToken.isNotEmpty;
  }

  @override
  Future<String?> getToken() => _secureStorage.read('access_token');

  @override
  Future<String?> getRefreshToken() => _secureStorage.read('refresh_token');

  @override
  Future<UserAuthResponse> refreshToken() async {
    final refreshToken = await _secureStorage.read('refresh_token');
    if (refreshToken == null || refreshToken.isEmpty) {
      throw Exception('No refresh token');
    }

    final response = await _httpClient.post<UserAuthResponse>(
      AuthEndpoints.refresh,
      body: {'refreshToken': refreshToken},
      fromJson: UserAuthResponse.fromJson,
    );

    await _persistTokens(response.data);
    return response.data;
  }

  Future<void> _persistTokens(UserAuthResponse response) async {
    final accessToken = response.accessToken ?? response.token;
    final refreshToken = response.refreshToken;
    if (accessToken != null && accessToken.isNotEmpty) {
      await _secureStorage.write('access_token', accessToken);
    }
    if (refreshToken != null && refreshToken.isNotEmpty) {
      await _secureStorage.write('refresh_token', refreshToken);
    }
  }
}
