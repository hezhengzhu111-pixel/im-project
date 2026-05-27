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
    if (response.data.token != null) {
      await _secureStorage.write('access_token', response.data.token!);
    }
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
    }
  }

  @override
  Future<bool> isAuthenticated() async {
    final token = await _secureStorage.read('access_token');
    return token != null;
  }

  @override
  Future<String?> getToken() => _secureStorage.read('access_token');
}
