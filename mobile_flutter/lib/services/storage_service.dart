import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  StorageService._(this._prefs);

  static const tokenKey = 'im.token';
  static const refreshTokenKey = 'im.refreshToken';
  static const userIdKey = 'im.userId';
  static const usernameKey = 'im.username';

  final SharedPreferences _prefs;

  static Future<StorageService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return StorageService._(prefs);
  }

  String? get token => _prefs.getString(tokenKey);
  String? get refreshToken => _prefs.getString(refreshTokenKey);
  String? get userId => _prefs.getString(userIdKey);
  String? get username => _prefs.getString(usernameKey);

  Future<void> saveAuth({
    required String token,
    required String refreshToken,
    required String userId,
    required String username,
  }) async {
    await _prefs.setString(tokenKey, token);
    await _prefs.setString(refreshTokenKey, refreshToken);
    await _prefs.setString(userIdKey, userId);
    await _prefs.setString(usernameKey, username);
  }

  Future<void> updateTokens({
    required String token,
    required String refreshToken,
  }) async {
    await _prefs.setString(tokenKey, token);
    await _prefs.setString(refreshTokenKey, refreshToken);
  }

  Future<void> clearAuth() async {
    await _prefs.remove(tokenKey);
    await _prefs.remove(refreshTokenKey);
    await _prefs.remove(userIdKey);
    await _prefs.remove(usernameKey);
  }
}
