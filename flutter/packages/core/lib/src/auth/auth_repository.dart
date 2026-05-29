import 'package:im_core/core.dart';

abstract class AuthRepository {
  Future<UserAuthResponse> login(LoginRequest request);
  Future<UserAuthResponse> register(RegisterRequest request);
  Future<User> getProfile();
  Future<void> logout();
  Future<bool> isAuthenticated();
  Future<String?> getToken();
  Future<String?> getRefreshToken();
  Future<UserAuthResponse> refreshToken();
}
