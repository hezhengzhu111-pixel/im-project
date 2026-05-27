import 'package:im_core/core.dart';

class SettingsApi {
  SettingsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<UserSettings> getSettings() async {
    final response = await _httpClient.get<UserSettings>(
      UserEndpoints.settings,
      fromJson: UserSettings.fromJson,
    );
    return response.data;
  }

  Future<void> updateSettings(UserSettings settings) async {
    await _httpClient.put<void>(
      UserEndpoints.settings,
      body: settings.toJson(),
      fromJson: (_) {},
    );
  }
}
