import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('zh')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'IM Messenger'**
  String get appTitle;

  /// No description provided for @navChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get navChat;

  /// No description provided for @navContacts.
  ///
  /// In en, this message translates to:
  /// **'Contacts'**
  String get navContacts;

  /// No description provided for @navGroups.
  ///
  /// In en, this message translates to:
  /// **'Groups'**
  String get navGroups;

  /// No description provided for @navMoments.
  ///
  /// In en, this message translates to:
  /// **'Moments'**
  String get navMoments;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Login'**
  String get loginTitle;

  /// No description provided for @loginUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get loginUsername;

  /// No description provided for @loginPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get loginPassword;

  /// No description provided for @loginButton.
  ///
  /// In en, this message translates to:
  /// **'Login'**
  String get loginButton;

  /// No description provided for @loginNoAccount.
  ///
  /// In en, this message translates to:
  /// **'No account?'**
  String get loginNoAccount;

  /// No description provided for @loginRegister.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get loginRegister;

  /// No description provided for @chatSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get chatSend;

  /// No description provided for @chatSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get chatSearch;

  /// No description provided for @chatNoSessions.
  ///
  /// In en, this message translates to:
  /// **'No conversations yet'**
  String get chatNoSessions;

  /// No description provided for @contactsSearch.
  ///
  /// In en, this message translates to:
  /// **'Search contacts'**
  String get contactsSearch;

  /// No description provided for @contactsNoFriends.
  ///
  /// In en, this message translates to:
  /// **'No friends yet'**
  String get contactsNoFriends;

  /// No description provided for @contactsAddFriend.
  ///
  /// In en, this message translates to:
  /// **'Add Friend'**
  String get contactsAddFriend;

  /// No description provided for @contactsFriendRequests.
  ///
  /// In en, this message translates to:
  /// **'Friend Requests'**
  String get contactsFriendRequests;

  /// No description provided for @contactsAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get contactsAccept;

  /// No description provided for @contactsReject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get contactsReject;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @noData.
  ///
  /// In en, this message translates to:
  /// **'No data'**
  String get noData;

  /// No description provided for @e2eeEncrypted.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encryption enabled'**
  String get e2eeEncrypted;

  /// No description provided for @e2eeNegotiating.
  ///
  /// In en, this message translates to:
  /// **'Negotiating encryption'**
  String get e2eeNegotiating;

  /// No description provided for @e2eeFailed.
  ///
  /// In en, this message translates to:
  /// **'Encryption error'**
  String get e2eeFailed;

  /// No description provided for @e2eePlaintext.
  ///
  /// In en, this message translates to:
  /// **'Encryption not enabled'**
  String get e2eePlaintext;

  /// No description provided for @e2eeMessageEncrypted.
  ///
  /// In en, this message translates to:
  /// **'This message is end-to-end encrypted'**
  String get e2eeMessageEncrypted;

  /// No description provided for @e2eeAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept encryption'**
  String get e2eeAccept;

  /// No description provided for @e2eeReject.
  ///
  /// In en, this message translates to:
  /// **'Reject encryption'**
  String get e2eeReject;

  /// No description provided for @e2eeExit.
  ///
  /// In en, this message translates to:
  /// **'Exit encryption'**
  String get e2eeExit;

  /// No description provided for @e2eeInitiate.
  ///
  /// In en, this message translates to:
  /// **'Enable end-to-end encryption'**
  String get e2eeInitiate;

  /// No description provided for @settingsEditProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get settingsEditProfile;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'High-frequency options only.'**
  String get settingsSubtitle;

  /// No description provided for @settingsBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get settingsBack;

  /// No description provided for @settingsAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get settingsAccount;

  /// No description provided for @settingsAppearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsAppearance;

  /// No description provided for @settingsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsNotifications;

  /// No description provided for @settingsPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get settingsPrivacy;

  /// No description provided for @settingsStorage.
  ///
  /// In en, this message translates to:
  /// **'Storage'**
  String get settingsStorage;

  /// No description provided for @settingsAi.
  ///
  /// In en, this message translates to:
  /// **'AI'**
  String get settingsAi;

  /// No description provided for @settingsProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get settingsProfile;

  /// No description provided for @settingsProfileDesc.
  ///
  /// In en, this message translates to:
  /// **'View avatar, nickname and account info'**
  String get settingsProfileDesc;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// No description provided for @settingsLanguageDesc.
  ///
  /// In en, this message translates to:
  /// **'Switch interface language'**
  String get settingsLanguageDesc;

  /// No description provided for @settingsTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get settingsTheme;

  /// No description provided for @settingsThemeDesc.
  ///
  /// In en, this message translates to:
  /// **'Choose light, dark, or follow system'**
  String get settingsThemeDesc;

  /// No description provided for @settingsThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeLight;

  /// No description provided for @settingsThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeDark;

  /// No description provided for @settingsThemeAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get settingsThemeAuto;

  /// No description provided for @settingsNotification.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsNotification;

  /// No description provided for @settingsSound.
  ///
  /// In en, this message translates to:
  /// **'Sound'**
  String get settingsSound;

  /// No description provided for @settingsInsecureVoice.
  ///
  /// In en, this message translates to:
  /// **'HTTP voice recording'**
  String get settingsInsecureVoice;

  /// No description provided for @settingsInsecureVoiceDesc.
  ///
  /// In en, this message translates to:
  /// **'Allow voice recording over HTTP connections (not recommended)'**
  String get settingsInsecureVoiceDesc;

  /// No description provided for @settingsReadReceipt.
  ///
  /// In en, this message translates to:
  /// **'Read receipts'**
  String get settingsReadReceipt;

  /// No description provided for @settingsReadReceiptDesc.
  ///
  /// In en, this message translates to:
  /// **'Allow others to see when you read messages'**
  String get settingsReadReceiptDesc;

  /// No description provided for @settingsClearCache.
  ///
  /// In en, this message translates to:
  /// **'Clear local cache'**
  String get settingsClearCache;

  /// No description provided for @settingsClearCacheDesc.
  ///
  /// In en, this message translates to:
  /// **'Clear session selection and temporary page state'**
  String get settingsClearCacheDesc;

  /// No description provided for @settingsAiAssistant.
  ///
  /// In en, this message translates to:
  /// **'AI Assistant'**
  String get settingsAiAssistant;

  /// No description provided for @settingsAiAssistantDesc.
  ///
  /// In en, this message translates to:
  /// **'Configure LLM API keys, auto-reply, knowledge base'**
  String get settingsAiAssistantDesc;

  /// No description provided for @settingsLogout.
  ///
  /// In en, this message translates to:
  /// **'Logout'**
  String get settingsLogout;

  /// No description provided for @settingsLogoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Logout'**
  String get settingsLogoutTitle;

  /// No description provided for @settingsLogoutMessage.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to logout?'**
  String get settingsLogoutMessage;

  /// No description provided for @settingsCacheTitle.
  ///
  /// In en, this message translates to:
  /// **'Clear Cache'**
  String get settingsCacheTitle;

  /// No description provided for @settingsCacheMessage.
  ///
  /// In en, this message translates to:
  /// **'Clear local UI cache? Login state will be preserved.'**
  String get settingsCacheMessage;

  /// No description provided for @settingsCacheCleared.
  ///
  /// In en, this message translates to:
  /// **'Cache cleared'**
  String get settingsCacheCleared;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @profileSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Maintain basic identity info.'**
  String get profileSubtitle;

  /// No description provided for @profileBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get profileBack;

  /// No description provided for @profileChangeAvatar.
  ///
  /// In en, this message translates to:
  /// **'Change avatar'**
  String get profileChangeAvatar;

  /// No description provided for @profileAvatarTip.
  ///
  /// In en, this message translates to:
  /// **'Supports jpg, png, webp formats'**
  String get profileAvatarTip;

  /// No description provided for @profileAccountInfo.
  ///
  /// In en, this message translates to:
  /// **'Basic info'**
  String get profileAccountInfo;

  /// No description provided for @profileUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get profileUsername;

  /// No description provided for @profileNickname.
  ///
  /// In en, this message translates to:
  /// **'Nickname'**
  String get profileNickname;

  /// No description provided for @profileEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get profileEmail;

  /// No description provided for @profilePhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get profilePhone;

  /// No description provided for @profileGender.
  ///
  /// In en, this message translates to:
  /// **'Gender'**
  String get profileGender;

  /// No description provided for @profileGenderMale.
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get profileGenderMale;

  /// No description provided for @profileGenderFemale.
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get profileGenderFemale;

  /// No description provided for @profileGenderSecret.
  ///
  /// In en, this message translates to:
  /// **'Secret'**
  String get profileGenderSecret;

  /// No description provided for @profileBirthday.
  ///
  /// In en, this message translates to:
  /// **'Birthday'**
  String get profileBirthday;

  /// No description provided for @profileSignature.
  ///
  /// In en, this message translates to:
  /// **'Signature'**
  String get profileSignature;

  /// No description provided for @profileLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get profileLocation;

  /// No description provided for @profileSave.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get profileSave;

  /// No description provided for @profileReset.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get profileReset;

  /// No description provided for @profileSecurity.
  ///
  /// In en, this message translates to:
  /// **'Account security'**
  String get profileSecurity;

  /// No description provided for @profilePassword.
  ///
  /// In en, this message translates to:
  /// **'Login password'**
  String get profilePassword;

  /// No description provided for @profileChange.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get profileChange;

  /// No description provided for @profileEmailVerify.
  ///
  /// In en, this message translates to:
  /// **'Email verification'**
  String get profileEmailVerify;

  /// No description provided for @profilePhoneVerify.
  ///
  /// In en, this message translates to:
  /// **'Phone verification'**
  String get profilePhoneVerify;

  /// No description provided for @profileBound.
  ///
  /// In en, this message translates to:
  /// **'Bound'**
  String get profileBound;

  /// No description provided for @profileUnbound.
  ///
  /// In en, this message translates to:
  /// **'Unbound'**
  String get profileUnbound;

  /// No description provided for @profilePrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get profilePrivacy;

  /// No description provided for @profileAllowStrangerAdd.
  ///
  /// In en, this message translates to:
  /// **'Allow stranger requests'**
  String get profileAllowStrangerAdd;

  /// No description provided for @profileAllowStrangerAddDesc.
  ///
  /// In en, this message translates to:
  /// **'Allow others to find you and send friend requests'**
  String get profileAllowStrangerAddDesc;

  /// No description provided for @profileShowOnlineStatus.
  ///
  /// In en, this message translates to:
  /// **'Show online status'**
  String get profileShowOnlineStatus;

  /// No description provided for @profileShowOnlineStatusDesc.
  ///
  /// In en, this message translates to:
  /// **'Friends can see whether you are online'**
  String get profileShowOnlineStatusDesc;

  /// No description provided for @profileAllowViewMoments.
  ///
  /// In en, this message translates to:
  /// **'Allow moments access'**
  String get profileAllowViewMoments;

  /// No description provided for @profileAllowViewMomentsDesc.
  ///
  /// In en, this message translates to:
  /// **'Control who can view your moments'**
  String get profileAllowViewMomentsDesc;

  /// No description provided for @profileChangePassword.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get profileChangePassword;

  /// No description provided for @profileCurrentPassword.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get profileCurrentPassword;

  /// No description provided for @profileCurrentPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter current password'**
  String get profileCurrentPasswordRequired;

  /// No description provided for @profileNewPassword.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get profileNewPassword;

  /// No description provided for @profileNewPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter new password'**
  String get profileNewPasswordRequired;

  /// No description provided for @profileConfirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get profileConfirmPassword;

  /// No description provided for @profilePasswordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get profilePasswordMismatch;

  /// No description provided for @profilePasswordLength.
  ///
  /// In en, this message translates to:
  /// **'Password must be 6-20 characters'**
  String get profilePasswordLength;

  /// No description provided for @profileNicknameRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter a nickname'**
  String get profileNicknameRequired;

  /// No description provided for @profileNicknameLength.
  ///
  /// In en, this message translates to:
  /// **'Nickname must be 1-20 characters'**
  String get profileNicknameLength;

  /// No description provided for @profileSaved.
  ///
  /// In en, this message translates to:
  /// **'Profile updated'**
  String get profileSaved;

  /// No description provided for @profileAvatarUpdated.
  ///
  /// In en, this message translates to:
  /// **'Avatar updated'**
  String get profileAvatarUpdated;

  /// No description provided for @profilePasswordUpdated.
  ///
  /// In en, this message translates to:
  /// **'Password changed'**
  String get profilePasswordUpdated;

  /// No description provided for @profilePrivacySaved.
  ///
  /// In en, this message translates to:
  /// **'Privacy settings saved'**
  String get profilePrivacySaved;

  /// No description provided for @profileUpdateFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to update profile'**
  String get profileUpdateFailed;

  /// No description provided for @profileUploadFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to upload avatar'**
  String get profileUploadFailed;

  /// No description provided for @aiTitle.
  ///
  /// In en, this message translates to:
  /// **'AI Assistant'**
  String get aiTitle;

  /// No description provided for @aiApiKeys.
  ///
  /// In en, this message translates to:
  /// **'API Key Management'**
  String get aiApiKeys;

  /// No description provided for @aiApiKeysDesc.
  ///
  /// In en, this message translates to:
  /// **'Configure your LLM API keys (DeepSeek, MiniMax, etc.)'**
  String get aiApiKeysDesc;

  /// No description provided for @aiAutoReply.
  ///
  /// In en, this message translates to:
  /// **'Auto Reply'**
  String get aiAutoReply;

  /// No description provided for @aiAutoReplyDesc.
  ///
  /// In en, this message translates to:
  /// **'AI will auto-reply to messages when enabled'**
  String get aiAutoReplyDesc;

  /// No description provided for @aiAutoReplyEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enable auto reply'**
  String get aiAutoReplyEnabled;

  /// No description provided for @aiAutoReplyPersona.
  ///
  /// In en, this message translates to:
  /// **'AI Persona'**
  String get aiAutoReplyPersona;

  /// No description provided for @aiAutoReplyPersonaPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Describe the role and speaking style you want AI to play...'**
  String get aiAutoReplyPersonaPlaceholder;

  /// No description provided for @aiProvider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get aiProvider;

  /// No description provided for @aiKeyName.
  ///
  /// In en, this message translates to:
  /// **'Label'**
  String get aiKeyName;

  /// No description provided for @aiKeyNamePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Give this key a name'**
  String get aiKeyNamePlaceholder;

  /// No description provided for @aiApiKeyInput.
  ///
  /// In en, this message translates to:
  /// **'API Key'**
  String get aiApiKeyInput;

  /// No description provided for @aiStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get aiStatus;

  /// No description provided for @aiTesting.
  ///
  /// In en, this message translates to:
  /// **'Testing...'**
  String get aiTesting;

  /// No description provided for @aiTestConnection.
  ///
  /// In en, this message translates to:
  /// **'Test connection'**
  String get aiTestConnection;

  /// No description provided for @aiAddKey.
  ///
  /// In en, this message translates to:
  /// **'Add Key'**
  String get aiAddKey;

  /// No description provided for @aiDeleteKey.
  ///
  /// In en, this message translates to:
  /// **'Delete Key'**
  String get aiDeleteKey;

  /// No description provided for @aiDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete this key?'**
  String get aiDeleteConfirm;

  /// No description provided for @aiNoKeys.
  ///
  /// In en, this message translates to:
  /// **'No API keys yet, click to add'**
  String get aiNoKeys;

  /// No description provided for @aiSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get aiSave;

  /// No description provided for @commonConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get commonConfirm;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonSuccess.
  ///
  /// In en, this message translates to:
  /// **'Success'**
  String get commonSuccess;

  /// No description provided for @commonFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get commonFailed;

  /// No description provided for @commonLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get commonLoading;

  /// No description provided for @validationRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required'**
  String get validationRequired;

  /// No description provided for @validationUsernameMinLength.
  ///
  /// In en, this message translates to:
  /// **'Username must be at least {min} characters'**
  String validationUsernameMinLength(Object min);

  /// No description provided for @validationUsernameMaxLength.
  ///
  /// In en, this message translates to:
  /// **'Username must be no more than {max} characters'**
  String validationUsernameMaxLength(Object max);

  /// No description provided for @validationUsernameInvalidChars.
  ///
  /// In en, this message translates to:
  /// **'Username can only contain letters, numbers, and underscores'**
  String get validationUsernameInvalidChars;

  /// No description provided for @validationEmailInvalid.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid email address'**
  String get validationEmailInvalid;

  /// No description provided for @validationPasswordMinLength.
  ///
  /// In en, this message translates to:
  /// **'Password must be at least {min} characters'**
  String validationPasswordMinLength(Object min);

  /// No description provided for @validationPasswordMaxLength.
  ///
  /// In en, this message translates to:
  /// **'Password must be no more than {max} characters'**
  String validationPasswordMaxLength(Object max);

  /// No description provided for @validationPasswordStrength.
  ///
  /// In en, this message translates to:
  /// **'Password must contain both letters and digits'**
  String get validationPasswordStrength;

  /// No description provided for @validationPasswordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get validationPasswordMismatch;

  /// No description provided for @validationAgreementRequired.
  ///
  /// In en, this message translates to:
  /// **'You must accept the agreement to continue'**
  String get validationAgreementRequired;

  /// No description provided for @validationNicknameRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter a nickname'**
  String get validationNicknameRequired;

  /// No description provided for @validationNicknameMaxLength.
  ///
  /// In en, this message translates to:
  /// **'Nickname must be no more than {max} characters'**
  String validationNicknameMaxLength(Object max);

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Please log in to your encrypted communication account'**
  String get loginSubtitle;

  /// No description provided for @loginRememberMe.
  ///
  /// In en, this message translates to:
  /// **'Remember me'**
  String get loginRememberMe;

  /// No description provided for @loginNoAccountRegister.
  ///
  /// In en, this message translates to:
  /// **'No account? Register'**
  String get loginNoAccountRegister;

  /// No description provided for @registerTitle.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get registerTitle;

  /// No description provided for @registerSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Create your account and start chatting'**
  String get registerSubtitle;

  /// No description provided for @registerEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get registerEmail;

  /// No description provided for @registerConfirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get registerConfirmPassword;

  /// No description provided for @registerAgreementPrefix.
  ///
  /// In en, this message translates to:
  /// **'I have read and agree to the '**
  String get registerAgreementPrefix;

  /// No description provided for @registerAgreementSuffix.
  ///
  /// In en, this message translates to:
  /// **' and '**
  String get registerAgreementSuffix;

  /// No description provided for @registerUserAgreement.
  ///
  /// In en, this message translates to:
  /// **'User Agreement'**
  String get registerUserAgreement;

  /// No description provided for @registerPrivacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get registerPrivacyPolicy;

  /// No description provided for @registerButton.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get registerButton;

  /// No description provided for @registerHasAccountLogin.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? Login'**
  String get registerHasAccountLogin;

  /// No description provided for @registerAgreementRequired.
  ///
  /// In en, this message translates to:
  /// **'Please read and agree to the User Agreement and Privacy Policy'**
  String get registerAgreementRequired;

  /// No description provided for @chatSelectSession.
  ///
  /// In en, this message translates to:
  /// **'Select a conversation to start chatting'**
  String get chatSelectSession;

  /// No description provided for @chatSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search conversations...'**
  String get chatSearchHint;

  /// No description provided for @chatMessageCount.
  ///
  /// In en, this message translates to:
  /// **'{count} messages'**
  String chatMessageCount(Object count);

  /// No description provided for @chatMemberCount.
  ///
  /// In en, this message translates to:
  /// **'{count} members'**
  String chatMemberCount(Object count);

  /// No description provided for @chatImageSending.
  ///
  /// In en, this message translates to:
  /// **'Image sending feature under development...'**
  String get chatImageSending;

  /// No description provided for @chatFileSending.
  ///
  /// In en, this message translates to:
  /// **'File sending feature under development...'**
  String get chatFileSending;

  /// No description provided for @chatInputHint.
  ///
  /// In en, this message translates to:
  /// **'Type a message...'**
  String get chatInputHint;

  /// No description provided for @chatAttach.
  ///
  /// In en, this message translates to:
  /// **'Attach'**
  String get chatAttach;

  /// No description provided for @chatImage.
  ///
  /// In en, this message translates to:
  /// **'Image'**
  String get chatImage;

  /// No description provided for @chatFile.
  ///
  /// In en, this message translates to:
  /// **'File'**
  String get chatFile;

  /// No description provided for @chatVoice.
  ///
  /// In en, this message translates to:
  /// **'Voice'**
  String get chatVoice;

  /// No description provided for @validatorUsernameRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter a username'**
  String get validatorUsernameRequired;

  /// No description provided for @validatorUsernameLength.
  ///
  /// In en, this message translates to:
  /// **'Username must be 3-20 characters'**
  String get validatorUsernameLength;

  /// No description provided for @validatorUsernameFormat.
  ///
  /// In en, this message translates to:
  /// **'Username can only contain letters, numbers, and underscores'**
  String get validatorUsernameFormat;

  /// No description provided for @validatorEmailRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter an email'**
  String get validatorEmailRequired;

  /// No description provided for @validatorEmailFormat.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid email format'**
  String get validatorEmailFormat;

  /// No description provided for @validatorPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter a password'**
  String get validatorPasswordRequired;

  /// No description provided for @validatorPasswordLength.
  ///
  /// In en, this message translates to:
  /// **'Password must be 8-64 characters'**
  String get validatorPasswordLength;

  /// No description provided for @validatorPasswordFormat.
  ///
  /// In en, this message translates to:
  /// **'Password must contain letters and numbers'**
  String get validatorPasswordFormat;

  /// No description provided for @validatorConfirmPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Please confirm your password'**
  String get validatorConfirmPasswordRequired;

  /// No description provided for @validatorPasswordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get validatorPasswordMismatch;

  /// No description provided for @a11yEncryptedMessage.
  ///
  /// In en, this message translates to:
  /// **'This message is end-to-end encrypted'**
  String get a11yEncryptedMessage;

  /// No description provided for @a11yNetworkDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Network disconnected'**
  String get a11yNetworkDisconnected;

  /// No description provided for @a11yNetworkConnected.
  ///
  /// In en, this message translates to:
  /// **'Network connected'**
  String get a11yNetworkConnected;

  /// No description provided for @a11ySettingsProfile.
  ///
  /// In en, this message translates to:
  /// **'Personal info'**
  String get a11ySettingsProfile;

  /// No description provided for @a11ySettingsAppearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance settings'**
  String get a11ySettingsAppearance;

  /// No description provided for @a11ySettingsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notification settings'**
  String get a11ySettingsNotifications;

  /// No description provided for @a11ySettingsSecurity.
  ///
  /// In en, this message translates to:
  /// **'Security settings'**
  String get a11ySettingsSecurity;

  /// No description provided for @a11ySettingsStorage.
  ///
  /// In en, this message translates to:
  /// **'Storage settings'**
  String get a11ySettingsStorage;

  /// No description provided for @a11ySettingsAi.
  ///
  /// In en, this message translates to:
  /// **'AI settings'**
  String get a11ySettingsAi;

  /// No description provided for @a11ySendMessage.
  ///
  /// In en, this message translates to:
  /// **'Send message'**
  String get a11ySendMessage;

  /// No description provided for @a11yAddAttachment.
  ///
  /// In en, this message translates to:
  /// **'Add attachment'**
  String get a11yAddAttachment;

  /// No description provided for @a11yVoiceInput.
  ///
  /// In en, this message translates to:
  /// **'Voice input'**
  String get a11yVoiceInput;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
