import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsSubtitle => 'High-frequency options only.';

  @override
  String get settingsBack => 'Back';

  @override
  String get settingsAccount => 'Account';

  @override
  String get settingsAppearance => 'Appearance';

  @override
  String get settingsNotifications => 'Notifications';

  @override
  String get settingsPrivacy => 'Privacy';

  @override
  String get settingsStorage => 'Storage';

  @override
  String get settingsAi => 'AI';

  @override
  String get settingsProfile => 'Profile';

  @override
  String get settingsProfileDesc => 'View avatar, nickname and account info';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsLanguageDesc => 'Switch interface language';

  @override
  String get settingsTheme => 'Theme';

  @override
  String get settingsThemeDesc => 'Choose light, dark, or follow system';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsThemeAuto => 'Auto';

  @override
  String get settingsNotification => 'Notifications';

  @override
  String get settingsSound => 'Sound';

  @override
  String get settingsInsecureVoice => 'HTTP voice recording';

  @override
  String get settingsInsecureVoiceDesc => 'Allow voice recording over HTTP connections (not recommended)';

  @override
  String get settingsReadReceipt => 'Read receipts';

  @override
  String get settingsReadReceiptDesc => 'Allow others to see when you read messages';

  @override
  String get settingsClearCache => 'Clear local cache';

  @override
  String get settingsClearCacheDesc => 'Clear session selection and temporary page state';

  @override
  String get settingsAiAssistant => 'AI Assistant';

  @override
  String get settingsAiAssistantDesc => 'Configure LLM API keys, auto-reply, knowledge base';

  @override
  String get settingsLogout => 'Logout';

  @override
  String get settingsLogoutTitle => 'Logout';

  @override
  String get settingsLogoutMessage => 'Are you sure you want to logout?';

  @override
  String get settingsCacheTitle => 'Clear Cache';

  @override
  String get settingsCacheMessage => 'Clear local UI cache? Login state will be preserved.';

  @override
  String get settingsCacheCleared => 'Cache cleared';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileSubtitle => 'Maintain basic identity info.';

  @override
  String get profileBack => 'Back';

  @override
  String get profileChangeAvatar => 'Change avatar';

  @override
  String get profileAvatarTip => 'Supports jpg, png, webp formats';

  @override
  String get profileAccountInfo => 'Basic info';

  @override
  String get profileUsername => 'Username';

  @override
  String get profileNickname => 'Nickname';

  @override
  String get profileEmail => 'Email';

  @override
  String get profilePhone => 'Phone';

  @override
  String get profileGender => 'Gender';

  @override
  String get profileGenderMale => 'Male';

  @override
  String get profileGenderFemale => 'Female';

  @override
  String get profileGenderSecret => 'Secret';

  @override
  String get profileBirthday => 'Birthday';

  @override
  String get profileSignature => 'Signature';

  @override
  String get profileLocation => 'Location';

  @override
  String get profileSave => 'Save changes';

  @override
  String get profileReset => 'Reset';

  @override
  String get profileSecurity => 'Account security';

  @override
  String get profilePassword => 'Login password';

  @override
  String get profileChange => 'Change';

  @override
  String get profileEmailVerify => 'Email verification';

  @override
  String get profilePhoneVerify => 'Phone verification';

  @override
  String get profileBound => 'Bound';

  @override
  String get profileUnbound => 'Unbound';

  @override
  String get profilePrivacy => 'Privacy';

  @override
  String get profileAllowStrangerAdd => 'Allow stranger requests';

  @override
  String get profileAllowStrangerAddDesc => 'Allow others to find you and send friend requests';

  @override
  String get profileShowOnlineStatus => 'Show online status';

  @override
  String get profileShowOnlineStatusDesc => 'Friends can see whether you are online';

  @override
  String get profileAllowViewMoments => 'Allow moments access';

  @override
  String get profileAllowViewMomentsDesc => 'Control who can view your moments';

  @override
  String get profileChangePassword => 'Change password';

  @override
  String get profileCurrentPassword => 'Current password';

  @override
  String get profileCurrentPasswordRequired => 'Please enter current password';

  @override
  String get profileNewPassword => 'New password';

  @override
  String get profileNewPasswordRequired => 'Please enter new password';

  @override
  String get profileConfirmPassword => 'Confirm password';

  @override
  String get profilePasswordMismatch => 'Passwords do not match';

  @override
  String get profilePasswordLength => 'Password must be 6-20 characters';

  @override
  String get profileNicknameRequired => 'Please enter a nickname';

  @override
  String get profileNicknameLength => 'Nickname must be 1-20 characters';

  @override
  String get profileSaved => 'Profile updated';

  @override
  String get profileAvatarUpdated => 'Avatar updated';

  @override
  String get profilePasswordUpdated => 'Password changed';

  @override
  String get profilePrivacySaved => 'Privacy settings saved';

  @override
  String get profileUpdateFailed => 'Failed to update profile';

  @override
  String get profileUploadFailed => 'Failed to upload avatar';

  @override
  String get aiTitle => 'AI Assistant';

  @override
  String get aiApiKeys => 'API Key Management';

  @override
  String get aiApiKeysDesc => 'Configure your LLM API keys (DeepSeek, MiniMax, etc.)';

  @override
  String get aiAutoReply => 'Auto Reply';

  @override
  String get aiAutoReplyDesc => 'AI will auto-reply to messages when enabled';

  @override
  String get aiAutoReplyEnabled => 'Enable auto reply';

  @override
  String get aiAutoReplyPersona => 'AI Persona';

  @override
  String get aiAutoReplyPersonaPlaceholder => 'Describe the role and speaking style you want AI to play...';

  @override
  String get aiProvider => 'Provider';

  @override
  String get aiKeyName => 'Label';

  @override
  String get aiKeyNamePlaceholder => 'Give this key a name';

  @override
  String get aiApiKeyInput => 'API Key';

  @override
  String get aiStatus => 'Status';

  @override
  String get aiTesting => 'Testing...';

  @override
  String get aiTestConnection => 'Test connection';

  @override
  String get aiAddKey => 'Add Key';

  @override
  String get aiDeleteKey => 'Delete Key';

  @override
  String get aiDeleteConfirm => 'Are you sure you want to delete this key?';

  @override
  String get aiNoKeys => 'No API keys yet, click to add';

  @override
  String get aiSave => 'Save';

  @override
  String get commonConfirm => 'Confirm';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonSuccess => 'Success';

  @override
  String get commonFailed => 'Failed';

  @override
  String get commonLoading => 'Loading...';
}
