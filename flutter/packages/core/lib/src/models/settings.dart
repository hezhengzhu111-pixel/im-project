import 'package:freezed_annotation/freezed_annotation.dart';

part 'settings.freezed.dart';
part 'settings.g.dart';

@freezed
class UserSettings with _$UserSettings {
  const factory UserSettings({
    required GeneralSettings general,
    required PrivacySettings privacy,
    required MessagePreferenceSettings message,
    required NotificationSettings notifications,
  }) = _UserSettings;

  factory UserSettings.fromJson(Map<String, dynamic> json) =>
      _$UserSettingsFromJson(json);
}

@freezed
class GeneralSettings with _$GeneralSettings {
  const factory GeneralSettings({
    required String language,
    required String theme,
    required String fontSize,
    required bool autoLogin,
    required bool minimizeOnStart,
  }) = _GeneralSettings;

  factory GeneralSettings.fromJson(Map<String, dynamic> json) =>
      _$GeneralSettingsFromJson(json);
}

@freezed
class PrivacySettings with _$PrivacySettings {
  const factory PrivacySettings({
    required bool allowStrangerAdd,
    required bool showOnlineStatus,
    required bool allowViewMoments,
    required bool messageReadReceipt,
  }) = _PrivacySettings;

  factory PrivacySettings.fromJson(Map<String, dynamic> json) =>
      _$PrivacySettingsFromJson(json);
}

@freezed
class MessagePreferenceSettings with _$MessagePreferenceSettings {
  const factory MessagePreferenceSettings({
    required bool enableNotification,
    required bool enableSound,
    required bool enableVibration,
    required bool muteGroupMessages,
    required bool autoDownloadImages,
  }) = _MessagePreferenceSettings;

  factory MessagePreferenceSettings.fromJson(Map<String, dynamic> json) =>
      _$MessagePreferenceSettingsFromJson(json);
}

@freezed
class NotificationSettings with _$NotificationSettings {
  const factory NotificationSettings({
    required bool sound,
    required bool desktop,
    required bool preview,
  }) = _NotificationSettings;

  factory NotificationSettings.fromJson(Map<String, dynamic> json) =>
      _$NotificationSettingsFromJson(json);
}
