import 'dart:typed_data';
import 'package:im_core/core.dart';

class SettingsApi {
  SettingsApi(this._httpClient);
  final HttpClientPort _httpClient;

  // Settings
  Future<UserSettings> getSettings() async {
    final response = await _httpClient.get<UserSettings>(
      UserEndpoints.settings,
      fromJson: UserSettings.fromJson,
    );
    return response.data;
  }

  Future<void> updateSettings(String type, Map<String, dynamic> data) async {
    await _httpClient.put<void>(
      UserEndpoints.settingsType(type),
      body: data,
      fromJson: (_) {},
    );
  }

  // Avatar
  Future<String> uploadAvatar(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      UserEndpoints.avatar,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json,
    );
    return response.data['url'] as String? ??
        response.data['avatar_url'] as String? ??
        response.data['data'] as String? ??
        '';
  }

  // Profile
  Future<User> updateProfile(UpdateProfileRequest request) async {
    final response = await _httpClient.put<User>(
      UserEndpoints.profile,
      body: request.toJson(),
      fromJson: User.fromJson,
    );
    return response.data;
  }

  // Password
  Future<void> changePassword(ChangePasswordRequest request) async {
    await _httpClient.put<void>(
      UserEndpoints.password,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }

  // Phone
  Future<void> sendPhoneCode(String phone) async {
    await _httpClient.post<void>(
      UserEndpoints.phoneCode,
      body: {'phone': phone},
      fromJson: (_) {},
    );
  }

  Future<void> bindPhone(BindPhoneRequest request) async {
    await _httpClient.post<void>(
      UserEndpoints.phoneBind,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }

  // Email
  Future<void> sendEmailCode(String email) async {
    await _httpClient.post<void>(
      UserEndpoints.emailCode,
      body: {'email': email},
      fromJson: (_) {},
    );
  }

  Future<void> bindEmail(BindEmailRequest request) async {
    await _httpClient.post<void>(
      UserEndpoints.emailBind,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }

  // Account
  Future<bool> deleteAccount(String password) async {
    final response = await _httpClient.delete<bool>(
      UserEndpoints.account,
      queryParameters: {'password': password},
      fromJson: (json) => json as bool,
    );
    return response.data;
  }
}
