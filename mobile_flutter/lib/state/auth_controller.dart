import 'package:flutter/foundation.dart';

import '../models/user.dart';
import '../services/http_client.dart';
import '../services/storage_service.dart';

class AuthController extends ChangeNotifier {
  AuthController({
    required this.storage,
    required this.httpClient,
  });

  final StorageService storage;
  final HttpClient httpClient;

  bool bootstrapping = true;
  bool submitting = false;
  UserProfile? user;
  String? token;
  String? refreshToken;

  bool get isLoggedIn => token != null && token!.isNotEmpty && user != null;

  Future<void> bootstrap() async {
    token = storage.token;
    refreshToken = storage.refreshToken;
    final userId = storage.userId;
    final username = storage.username;
    if (token != null && userId != null && username != null) {
      user = UserProfile(id: userId, username: username);
    }
    bootstrapping = false;
    notifyListeners();
  }

  Future<bool> login({
    required String username,
    required String password,
  }) async {
    submitting = true;
    notifyListeners();
    try {
      final response = await httpClient.dio.post('/user/login', data: {
        'username': username,
        'password': password,
      });
      final data = response.data as Map<String, dynamic>;
      final success = data['success'] == true;
      final tokenValue = data['token']?.toString();
      final refreshValue = data['refreshToken']?.toString();
      final userData = data['user'] as Map<String, dynamic>?;
      if (!success || tokenValue == null || refreshValue == null || userData == null) {
        return false;
      }
      user = UserProfile.fromJson(userData);
      token = tokenValue;
      refreshToken = refreshValue;
      await storage.saveAuth(
        token: tokenValue,
        refreshToken: refreshValue,
        userId: user!.id,
        username: user!.username,
      );
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    try {
      await httpClient.dio.post('/user/logout');
    } catch (_) {}
    token = null;
    refreshToken = null;
    user = null;
    await storage.clearAuth();
    notifyListeners();
  }
}
