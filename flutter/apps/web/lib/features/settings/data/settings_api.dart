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
  Future<void> deleteAccount(String password) async {
    await _httpClient.delete<void>(
      UserEndpoints.account,
      queryParameters: {'password': password},
      fromJson: (_) {},
    );
  }
}
