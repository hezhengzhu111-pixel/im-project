import 'package:im_core/core.dart';

class PushDeviceRegisterRequest {
  const PushDeviceRegisterRequest({
    required this.deviceToken,
    required this.platform,
    this.deviceName,
    this.appVersion,
  });

  final String deviceToken;
  final String platform;
  final String? deviceName;
  final String? appVersion;

  Map<String, dynamic> toJson() => {
        'deviceToken': deviceToken,
        'platform': platform,
        if (deviceName != null) 'deviceName': deviceName,
        if (appVersion != null) 'appVersion': appVersion,
      };
}

class PushDeviceUnregisterRequest {
  const PushDeviceUnregisterRequest({required this.deviceToken});

  final String deviceToken;

  Map<String, dynamic> toJson() => {
        'deviceToken': deviceToken,
      };
}

class PushDeviceTokenUpdateRequest {
  const PushDeviceTokenUpdateRequest({
    required this.oldToken,
    required this.newToken,
  });

  final String oldToken;
  final String newToken;

  Map<String, dynamic> toJson() => {
        'oldToken': oldToken,
        'newToken': newToken,
      };
}

class PushApi {
  PushApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<void> registerDevice(PushDeviceRegisterRequest request) async {
    await _httpClient.post<void>(
      PushEndpoints.registerDevice,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }

  Future<void> unregisterDevice(PushDeviceUnregisterRequest request) async {
    await _httpClient.post<void>(
      PushEndpoints.unregisterDevice,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }

  Future<void> updateDeviceToken(PushDeviceTokenUpdateRequest request) async {
    await _httpClient.put<void>(
      PushEndpoints.updateDeviceToken,
      body: request.toJson(),
      fromJson: (_) {},
    );
  }

  Future<Map<String, dynamic>> getSettings() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      PushEndpoints.settings,
      fromJson: (json) => json,
    );
    return response.data;
  }

  Future<void> updateSettings(Map<String, dynamic> settings) async {
    await _httpClient.put<void>(
      PushEndpoints.settings,
      body: settings,
      fromJson: (_) {},
    );
  }
}
