import 'package:im_core/core.dart';

class AiApi {
  AiApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<AiApiKey>> getKeys() async {
    final response = await _httpClient.get<List<AiApiKey>>(
      AiEndpoints.keys,
      fromJson: (json) => _extractItems(json).map(_parseKey).toList(),
    );
    return response.data;
  }

  Future<AiApiKey> createKey(AiApiKeyCreateRequest request) async {
    final response = await _httpClient.post<AiApiKey>(
      AiEndpoints.keys,
      body: {
        'provider': request.provider,
        'apiKey': request.key,
        'keyName': request.label ?? '',
      },
      fromJson: _parseKey,
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
    return _stringValue(
          response.data['status'],
          response.data['validateStatus'],
          response.data['validate_status'],
        ) ??
        'unknown';
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

  static List<Map<String, dynamic>> _extractItems(Map<String, dynamic> json) {
    final raw = json['items'] ?? json['data'] ?? json['keys'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => item.map((key, value) => MapEntry('$key', value)))
        .toList();
  }

  static AiApiKey _parseKey(Map<String, dynamic> json) {
    final isActive = _boolValue(json['isActive'] ?? json['is_active']);
    return AiApiKey(
      id: _stringValue(json['id']) ?? '',
      provider: _stringValue(json['provider']) ?? '',
      key: _stringValue(json['key'], json['maskedKey'], json['masked_key']) ??
          '****',
      label: _stringValue(json['label'], json['keyName'], json['key_name']),
      status: _stringValue(
            json['status'],
            json['validateStatus'],
            json['validate_status'],
          ) ??
          (isActive == false ? 'inactive' : 'unknown'),
      createdAt: _stringValue(
            json['createdAt'],
            json['created_time'],
            json['lastValidatedAt'],
            json['last_validated_at'],
          ) ??
          '',
    );
  }

  static String? _stringValue(Object? first,
      [Object? second, Object? third, Object? fourth]) {
    for (final value in [first, second, third, fourth]) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text != 'null') return text;
    }
    return null;
  }

  static bool? _boolValue(Object? value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    final text = value?.toString().toLowerCase();
    if (text == 'true' || text == '1') return true;
    if (text == 'false' || text == '0') return false;
    return null;
  }
}
