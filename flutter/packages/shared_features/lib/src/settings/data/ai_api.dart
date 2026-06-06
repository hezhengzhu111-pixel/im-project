import 'package:im_core/core.dart';

class AiApi {
  AiApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<AiApiKey>> getKeys() async {
    final response = await _httpClient.get<List<AiApiKey>>(
      AiEndpoints.keys,
      fromJson: (json) => (json['items'] as List)
          .map((e) => AiApiKey.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<AiApiKey> createKey(AiApiKeyCreateRequest request) async {
    final response = await _httpClient.post<AiApiKey>(
      AiEndpoints.keys,
      body: request.toJson(),
      fromJson: AiApiKey.fromJson,
    );
    return response.data;
  }

  Future<void> deleteKey(String id) async {
    await _httpClient.delete<void>(
      AiEndpoints.keyById(id),
      fromJson: (_) {},
    );
  }

  Future<String> testKey(String id) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      AiEndpoints.keyTest(id),
      fromJson: (json) => json,
    );
    return response.data['status'] as String? ?? 'unknown';
  }

  Future<AiSettings> getAiSettings() async {
    final response = await _httpClient.get<AiSettings>(
      AiEndpoints.settings,
      fromJson: AiSettings.fromJson,
    );
    return response.data;
  }

  Future<void> updateAiSettings(AiSettings settings) async {
    await _httpClient.put<void>(
      AiEndpoints.settings,
      body: settings.toJson(),
      fromJson: (_) {},
    );
  }
}
