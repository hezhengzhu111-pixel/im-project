import 'package:freezed_annotation/freezed_annotation.dart';

part 'ai_settings.freezed.dart';
part 'ai_settings.g.dart';

@freezed
class AiApiKey with _$AiApiKey {
  const factory AiApiKey({
    required String id,
    required String provider,
    required String key,
    String? label,
    required String status,
    required String createdAt,
  }) = _AiApiKey;

  factory AiApiKey.fromJson(Map<String, dynamic> json) =>
      _$AiApiKeyFromJson(json);
}

@freezed
class AiApiKeyCreateRequest with _$AiApiKeyCreateRequest {
  const factory AiApiKeyCreateRequest({
    required String provider,
    required String key,
    String? label,
  }) = _AiApiKeyCreateRequest;

  factory AiApiKeyCreateRequest.fromJson(Map<String, dynamic> json) =>
      _$AiApiKeyCreateRequestFromJson(json);
}

@freezed
class AiSettings with _$AiSettings {
  const factory AiSettings({
    required bool autoReplyEnabled,
    required String autoReplyPersona,
  }) = _AiSettings;

  factory AiSettings.fromJson(Map<String, dynamic> json) =>
      _$AiSettingsFromJson(json);
}
