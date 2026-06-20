import 'app_localizations.dart';

extension AppLocalizationsExt on AppLocalizations {
  /// Looks up a localized string by its key.
  /// Used by web meta/SEO registry where keys are stored as strings.
  String translate(String key) {
    return switch (key) {
      'seoAppTitle' => seoAppTitle,
      'seoAppDescription' => seoAppDescription,
      'seoLoginTitle' => seoLoginTitle,
      'seoLoginDescription' => seoLoginDescription,
      'seoRegisterTitle' => seoRegisterTitle,
      'seoRegisterDescription' => seoRegisterDescription,
      'seoChatTitle' => seoChatTitle,
      'seoChatDescription' => seoChatDescription,
      'seoContactsTitle' => seoContactsTitle,
      'seoContactsDescription' => seoContactsDescription,
      'seoAddFriendTitle' => seoAddFriendTitle,
      'seoAddFriendDescription' => seoAddFriendDescription,
      'seoGroupsTitle' => seoGroupsTitle,
      'seoGroupsDescription' => seoGroupsDescription,
      'seoCreateGroupTitle' => seoCreateGroupTitle,
      'seoCreateGroupDescription' => seoCreateGroupDescription,
      'seoMomentsTitle' => seoMomentsTitle,
      'seoMomentsDescription' => seoMomentsDescription,
      'seoMomentsNotificationsTitle' => seoMomentsNotificationsTitle,
      'seoMomentsNotificationsDescription' => seoMomentsNotificationsDescription,
      'seoSettingsTitle' => seoSettingsTitle,
      'seoSettingsDescription' => seoSettingsDescription,
      'seoProfileTitle' => seoProfileTitle,
      'seoProfileDescription' => seoProfileDescription,
      'seoAiSettingsTitle' => seoAiSettingsTitle,
      'seoAiSettingsDescription' => seoAiSettingsDescription,
      'seoForbiddenTitle' => seoForbiddenTitle,
      'seoForbiddenDescription' => seoForbiddenDescription,
      _ => key,
    };
  }
}
