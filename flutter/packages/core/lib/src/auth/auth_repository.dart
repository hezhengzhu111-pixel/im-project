import 'package:im_core/core.dart';

abstract class AuthRepository {
  Future<UserAuthResponse> login(LoginRequest request);
  Future<UserAuthResponse> register(RegisterRequest request);
  Future<AuthSession> restoreSession();
  Future<void> logout();
}
