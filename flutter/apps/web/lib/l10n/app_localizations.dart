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

  /// No description provided for @contactsSortByName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get contactsSortByName;

  /// No description provided for @contactsSortByOnline.
  ///
  /// In en, this message translates to:
  /// **'Online status'**
  String get contactsSortByOnline;

  /// No description provided for @contactsSortByTime.
  ///
  /// In en, this message translates to:
  /// **'Time added'**
  String get contactsSortByTime;

  /// No description provided for @contactsNoFriends.
  ///
  /// In en, this message translates to:
  /// **'No friends yet'**
  String get contactsNoFriends;

  /// No description provided for @contactsFriends.
  ///
  /// In en, this message translates to:
  /// **'Friends ({count})'**
  String contactsFriends(Object count);

  /// No description provided for @contactsRequests.
  ///
  /// In en, this message translates to:
  /// **'Requests ({count})'**
  String contactsRequests(Object count);

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

  /// No description provided for @contactsNoRequests.
  ///
  /// In en, this message translates to:
  /// **'No friend requests'**
  String get contactsNoRequests;

  /// No description provided for @contactsOnline.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get contactsOnline;

  /// No description provided for @contactsOffline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get contactsOffline;

  /// No description provided for @contactsFriendRequestReason.
  ///
  /// In en, this message translates to:
  /// **'Requests to be your friend'**
  String get contactsFriendRequestReason;

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

  /// No description provided for @contactsAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get contactsAccepted;

  /// No description provided for @contactsRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get contactsRejected;

  /// No description provided for @contactsEditRemark.
  ///
  /// In en, this message translates to:
  /// **'Edit remark'**
  String get contactsEditRemark;

  /// No description provided for @contactsRemarkLabel.
  ///
  /// In en, this message translates to:
  /// **'Remark'**
  String get contactsRemarkLabel;

  /// No description provided for @contactsRemarkHint.
  ///
  /// In en, this message translates to:
  /// **'Add a note for this contact'**
  String get contactsRemarkHint;

  /// No description provided for @contactsRemarkSaved.
  ///
  /// In en, this message translates to:
  /// **'Remark updated'**
  String get contactsRemarkSaved;

  /// No description provided for @contactsRemarkSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to update remark'**
  String get contactsRemarkSaveFailed;

  /// No description provided for @contactsDeleteFriend.
  ///
  /// In en, this message translates to:
  /// **'Delete friend'**
  String get contactsDeleteFriend;

  /// No description provided for @contactsDeleteFriendConfirm.
  ///
  /// In en, this message translates to:
  /// **'Remove {name} from your contacts?'**
  String contactsDeleteFriendConfirm(Object name);

  /// No description provided for @contactsDeleteFriendDone.
  ///
  /// In en, this message translates to:
  /// **'Friend removed'**
  String get contactsDeleteFriendDone;

  /// No description provided for @contactsDeleteFriendFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to remove friend'**
  String get contactsDeleteFriendFailed;

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

  /// No description provided for @chatVoiceSending.
  ///
  /// In en, this message translates to:
  /// **'Voice sending feature under development...'**
  String get chatVoiceSending;

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

  /// No description provided for @addFriendTitle.
  ///
  /// In en, this message translates to:
  /// **'Add Friend'**
  String get addFriendTitle;

  /// No description provided for @addFriendSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search by username or nickname'**
  String get addFriendSearchHint;

  /// No description provided for @addFriendSearchFailed.
  ///
  /// In en, this message translates to:
  /// **'Search failed, please try again'**
  String get addFriendSearchFailed;

  /// No description provided for @addFriendRequestSent.
  ///
  /// In en, this message translates to:
  /// **'Friend request sent to {name}'**
  String addFriendRequestSent(Object name);

  /// No description provided for @addFriendRequestFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to send request, please try again'**
  String get addFriendRequestFailed;

  /// No description provided for @addFriendNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No matching users found'**
  String get addFriendNoMatch;

  /// No description provided for @addFriendSearchPrompt.
  ///
  /// In en, this message translates to:
  /// **'Enter keywords to search users'**
  String get addFriendSearchPrompt;

  /// No description provided for @addFriendButton.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get addFriendButton;

  /// No description provided for @addFriendTypeUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get addFriendTypeUsername;

  /// No description provided for @addFriendTypeEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get addFriendTypeEmail;

  /// No description provided for @addFriendTypePhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get addFriendTypePhone;

  /// No description provided for @addFriendSearchByEmail.
  ///
  /// In en, this message translates to:
  /// **'Search by email'**
  String get addFriendSearchByEmail;

  /// No description provided for @addFriendSearchByPhone.
  ///
  /// In en, this message translates to:
  /// **'Search by phone number'**
  String get addFriendSearchByPhone;

  /// No description provided for @addFriendVerificationHint.
  ///
  /// In en, this message translates to:
  /// **'Enter a verification message (optional)'**
  String get addFriendVerificationHint;

  /// No description provided for @addFriendRequestDuplicate.
  ///
  /// In en, this message translates to:
  /// **'A pending friend request already exists, synced to request list'**
  String get addFriendRequestDuplicate;

  /// No description provided for @addFriendAlreadyFriend.
  ///
  /// In en, this message translates to:
  /// **'Already friends'**
  String get addFriendAlreadyFriend;

  /// No description provided for @addFriendPendingOutgoing.
  ///
  /// In en, this message translates to:
  /// **'Request sent'**
  String get addFriendPendingOutgoing;

  /// No description provided for @addFriendSelf.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get addFriendSelf;

  /// No description provided for @groupCreateTooltip.
  ///
  /// In en, this message translates to:
  /// **'Create group'**
  String get groupCreateTooltip;

  /// No description provided for @groupNoGroups.
  ///
  /// In en, this message translates to:
  /// **'No groups yet'**
  String get groupNoGroups;

  /// No description provided for @groupCreateTitle.
  ///
  /// In en, this message translates to:
  /// **'Create Group'**
  String get groupCreateTitle;

  /// No description provided for @groupCreateButton.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get groupCreateButton;

  /// No description provided for @groupNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Group name'**
  String get groupNameLabel;

  /// No description provided for @groupDescLabel.
  ///
  /// In en, this message translates to:
  /// **'Description (optional)'**
  String get groupDescLabel;

  /// No description provided for @groupSelectMembers.
  ///
  /// In en, this message translates to:
  /// **'Select members'**
  String get groupSelectMembers;

  /// No description provided for @notFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Page not found'**
  String get notFoundTitle;

  /// No description provided for @notFoundBackHome.
  ///
  /// In en, this message translates to:
  /// **'Back to Home'**
  String get notFoundBackHome;

  /// No description provided for @loadingFailed.
  ///
  /// In en, this message translates to:
  /// **'Loading failed: {error}'**
  String loadingFailed(Object error);

  /// No description provided for @momentsPublishTitle.
  ///
  /// In en, this message translates to:
  /// **'Publish Moment'**
  String get momentsPublishTitle;

  /// No description provided for @momentsPublishButton.
  ///
  /// In en, this message translates to:
  /// **'Publish Moment'**
  String get momentsPublishButton;

  /// No description provided for @momentsShareHint.
  ///
  /// In en, this message translates to:
  /// **'Share something...'**
  String get momentsShareHint;

  /// No description provided for @momentsVisibility.
  ///
  /// In en, this message translates to:
  /// **'Who can see'**
  String get momentsVisibility;

  /// No description provided for @momentsLocationHint.
  ///
  /// In en, this message translates to:
  /// **'Add location (optional)'**
  String get momentsLocationHint;

  /// No description provided for @momentsPublishSuccess.
  ///
  /// In en, this message translates to:
  /// **'Published successfully'**
  String get momentsPublishSuccess;

  /// No description provided for @commentDeleteConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete Confirmation'**
  String get commentDeleteConfirmTitle;

  /// No description provided for @commentDeleteConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete this comment?'**
  String get commentDeleteConfirmMessage;

  /// No description provided for @commentDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commentDelete;

  /// No description provided for @momentsDeletePost.
  ///
  /// In en, this message translates to:
  /// **'Delete Post'**
  String get momentsDeletePost;

  /// No description provided for @momentsDeletePostConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete this post? This cannot be undone.'**
  String get momentsDeletePostConfirm;

  /// No description provided for @momentsDeletePostSuccess.
  ///
  /// In en, this message translates to:
  /// **'Post deleted'**
  String get momentsDeletePostSuccess;

  /// No description provided for @momentsDeletePostFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to delete post'**
  String get momentsDeletePostFailed;

  /// No description provided for @commentReply.
  ///
  /// In en, this message translates to:
  /// **'Reply'**
  String get commentReply;

  /// No description provided for @commentWriteHint.
  ///
  /// In en, this message translates to:
  /// **'Write a comment...'**
  String get commentWriteHint;

  /// No description provided for @commentNoComments.
  ///
  /// In en, this message translates to:
  /// **'No comments yet'**
  String get commentNoComments;

  /// No description provided for @e2eeDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Enable End-to-End Encryption'**
  String get e2eeDialogTitle;

  /// No description provided for @e2eeDialogDescription.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encryption uses Signal Protocol to protect your messages:'**
  String get e2eeDialogDescription;

  /// No description provided for @e2eeSignalBullet1.
  ///
  /// In en, this message translates to:
  /// **'• Message content is only visible on both devices'**
  String get e2eeSignalBullet1;

  /// No description provided for @e2eeSignalBullet2.
  ///
  /// In en, this message translates to:
  /// **'• Server cannot read encrypted messages'**
  String get e2eeSignalBullet2;

  /// No description provided for @e2eeSignalBullet3.
  ///
  /// In en, this message translates to:
  /// **'• Each message is encrypted with an independent key'**
  String get e2eeSignalBullet3;

  /// No description provided for @e2eeDialogFooter.
  ///
  /// In en, this message translates to:
  /// **'After enabling, both parties need to confirm before encrypted communication can begin.'**
  String get e2eeDialogFooter;

  /// No description provided for @e2eeConfirmEnable.
  ///
  /// In en, this message translates to:
  /// **'Confirm Enable'**
  String get e2eeConfirmEnable;

  /// No description provided for @e2eeRequestTitle.
  ///
  /// In en, this message translates to:
  /// **'End-to-End Encryption Request'**
  String get e2eeRequestTitle;

  /// No description provided for @e2eeRequestDescription.
  ///
  /// In en, this message translates to:
  /// **'{name} requests to enable end-to-end encryption'**
  String e2eeRequestDescription(Object name);

  /// No description provided for @e2eeSignalProtocol.
  ///
  /// In en, this message translates to:
  /// **'Signal Protocol protection:'**
  String get e2eeSignalProtocol;

  /// No description provided for @e2eeEncryptedStatus.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encryption enabled'**
  String get e2eeEncryptedStatus;

  /// No description provided for @e2eeNegotiatingStatus.
  ///
  /// In en, this message translates to:
  /// **'Negotiating encryption...'**
  String get e2eeNegotiatingStatus;

  /// No description provided for @e2eeFailedStatus.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encryption error'**
  String get e2eeFailedStatus;

  /// No description provided for @e2eeDetails.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get e2eeDetails;

  /// No description provided for @e2eeClearState.
  ///
  /// In en, this message translates to:
  /// **'Clear state'**
  String get e2eeClearState;

  /// No description provided for @commonClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// No description provided for @formErrorServer.
  ///
  /// In en, this message translates to:
  /// **'Server error. Please try again.'**
  String get formErrorServer;

  /// No description provided for @formErrorNetwork.
  ///
  /// In en, this message translates to:
  /// **'Network error. Please check your connection.'**
  String get formErrorNetwork;

  /// No description provided for @formErrorAuth.
  ///
  /// In en, this message translates to:
  /// **'Invalid username or password.'**
  String get formErrorAuth;

  /// No description provided for @formErrorRateLimit.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please try again later.'**
  String get formErrorRateLimit;

  /// No description provided for @e2eeEncryptedBadge.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encryption enabled'**
  String get e2eeEncryptedBadge;

  /// No description provided for @e2eeNegotiatingBadge.
  ///
  /// In en, this message translates to:
  /// **'Negotiating encryption'**
  String get e2eeNegotiatingBadge;

  /// No description provided for @e2eeFailedBadge.
  ///
  /// In en, this message translates to:
  /// **'Encryption error'**
  String get e2eeFailedBadge;

  /// No description provided for @e2eePlaintextBadge.
  ///
  /// In en, this message translates to:
  /// **'Encryption not enabled'**
  String get e2eePlaintextBadge;

  /// No description provided for @networkDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Network disconnected, messages will be sent when restored'**
  String get networkDisconnected;

  /// No description provided for @chatMessagesFailed.
  ///
  /// In en, this message translates to:
  /// **'{count} messages failed to send'**
  String chatMessagesFailed(Object count);

  /// No description provided for @chatMessagesPending.
  ///
  /// In en, this message translates to:
  /// **'{count} messages waiting to send'**
  String chatMessagesPending(Object count);

  /// No description provided for @chatRetrying.
  ///
  /// In en, this message translates to:
  /// **'Retrying to send messages...'**
  String get chatRetrying;

  /// No description provided for @chatRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get chatRetry;

  /// No description provided for @errorE2eeNotReady.
  ///
  /// In en, this message translates to:
  /// **'E2EE negotiation not complete, waiting for peer confirmation'**
  String get errorE2eeNotReady;

  /// No description provided for @errorAlreadyRecording.
  ///
  /// In en, this message translates to:
  /// **'Already recording'**
  String get errorAlreadyRecording;

  /// No description provided for @errorNotRecording.
  ///
  /// In en, this message translates to:
  /// **'Not recording'**
  String get errorNotRecording;

  /// No description provided for @errorRecordingNotImplemented.
  ///
  /// In en, this message translates to:
  /// **'Voice recording not yet implemented'**
  String get errorRecordingNotImplemented;

  /// No description provided for @momentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Moments'**
  String get momentsTitle;

  /// No description provided for @momentsUserFallback.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get momentsUserFallback;

  /// No description provided for @momentsDailyOverview.
  ///
  /// In en, this message translates to:
  /// **'Daily Overview'**
  String get momentsDailyOverview;

  /// No description provided for @momentsInteractions.
  ///
  /// In en, this message translates to:
  /// **'Interactions'**
  String get momentsInteractions;

  /// No description provided for @momentsPhotos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get momentsPhotos;

  /// No description provided for @momentsComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get momentsComments;

  /// No description provided for @momentsRecentInteractions.
  ///
  /// In en, this message translates to:
  /// **'Recent Interactions'**
  String get momentsRecentInteractions;

  /// No description provided for @momentsNoRecentInteractions.
  ///
  /// In en, this message translates to:
  /// **'No recent interactions'**
  String get momentsNoRecentInteractions;

  /// No description provided for @momentsSharePrompt.
  ///
  /// In en, this message translates to:
  /// **'Share your life moments'**
  String get momentsSharePrompt;

  /// No description provided for @momentsShareDesc.
  ///
  /// In en, this message translates to:
  /// **'Photos, text, videos can all be published to Moments'**
  String get momentsShareDesc;

  /// No description provided for @momentsNoPosts.
  ///
  /// In en, this message translates to:
  /// **'No moments yet'**
  String get momentsNoPosts;

  /// No description provided for @momentsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get momentsNotifications;

  /// No description provided for @momentsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get momentsMarkAllRead;

  /// No description provided for @momentsNoNotifications.
  ///
  /// In en, this message translates to:
  /// **'No notifications'**
  String get momentsNoNotifications;

  /// No description provided for @momentsNotificationLiked.
  ///
  /// In en, this message translates to:
  /// **'{name} liked your moment'**
  String momentsNotificationLiked(Object name);

  /// No description provided for @momentsNotificationCommented.
  ///
  /// In en, this message translates to:
  /// **'{name} commented on your moment'**
  String momentsNotificationCommented(Object name);

  /// No description provided for @momentsNotificationReplied.
  ///
  /// In en, this message translates to:
  /// **'{name} replied to your comment'**
  String momentsNotificationReplied(Object name);

  /// No description provided for @momentsNotificationInteracted.
  ///
  /// In en, this message translates to:
  /// **'{name} interacted with you'**
  String momentsNotificationInteracted(Object name);

  /// No description provided for @momentsVisibilityPublic.
  ///
  /// In en, this message translates to:
  /// **'Public'**
  String get momentsVisibilityPublic;

  /// No description provided for @momentsVisibilityFriends.
  ///
  /// In en, this message translates to:
  /// **'Friends only'**
  String get momentsVisibilityFriends;

  /// No description provided for @momentsVisibilitySelf.
  ///
  /// In en, this message translates to:
  /// **'Only me'**
  String get momentsVisibilitySelf;

  /// No description provided for @momentsAddMedia.
  ///
  /// In en, this message translates to:
  /// **'Add photos/videos, max {count}'**
  String momentsAddMedia(Object count);

  /// No description provided for @momentsShowFull.
  ///
  /// In en, this message translates to:
  /// **'Show full'**
  String get momentsShowFull;

  /// No description provided for @timeJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get timeJustNow;

  /// No description provided for @timeMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min ago'**
  String timeMinutesAgo(Object minutes);

  /// No description provided for @timeHoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{hours} h ago'**
  String timeHoursAgo(Object hours);

  /// No description provided for @timeDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{days} d ago'**
  String timeDaysAgo(Object days);

  /// No description provided for @brandBadge.
  ///
  /// In en, this message translates to:
  /// **'End-to-End Encrypted'**
  String get brandBadge;

  /// No description provided for @brandTitle.
  ///
  /// In en, this message translates to:
  /// **'Secure · Private · Instant'**
  String get brandTitle;

  /// No description provided for @brandSubtitle.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encrypted instant messaging,\nyour messages are only decrypted on your device.'**
  String get brandSubtitle;

  /// No description provided for @brandFeatureE2eeLabel.
  ///
  /// In en, this message translates to:
  /// **'E2EE Enabled'**
  String get brandFeatureE2eeLabel;

  /// No description provided for @brandFeatureE2ee.
  ///
  /// In en, this message translates to:
  /// **'Powered by Signal Protocol, messages visible only on both devices'**
  String get brandFeatureE2ee;

  /// No description provided for @brandFeatureRealtimeLabel.
  ///
  /// In en, this message translates to:
  /// **'Realtime Delivery'**
  String get brandFeatureRealtimeLabel;

  /// No description provided for @brandFeatureRealtime.
  ///
  /// In en, this message translates to:
  /// **'WebSocket long-polling, millisecond-level message delivery'**
  String get brandFeatureRealtime;

  /// No description provided for @brandFeatureDeviceTrustLabel.
  ///
  /// In en, this message translates to:
  /// **'Device Trust'**
  String get brandFeatureDeviceTrustLabel;

  /// No description provided for @brandFeatureDeviceTrust.
  ///
  /// In en, this message translates to:
  /// **'Multi-device login with cloud sync, continue conversations anywhere'**
  String get brandFeatureDeviceTrust;

  /// No description provided for @brandFeatureAiLabel.
  ///
  /// In en, this message translates to:
  /// **'AI Assistant Online'**
  String get brandFeatureAiLabel;

  /// No description provided for @brandFeatureAi.
  ///
  /// In en, this message translates to:
  /// **'Built-in AI for smart Q&A, translation, and content creation'**
  String get brandFeatureAi;

  /// No description provided for @seoLoginTitle.
  ///
  /// In en, this message translates to:
  /// **'Login - IM'**
  String get seoLoginTitle;

  /// No description provided for @seoLoginDescription.
  ///
  /// In en, this message translates to:
  /// **'Secure messaging, end-to-end encrypted login'**
  String get seoLoginDescription;

  /// No description provided for @seoRegisterTitle.
  ///
  /// In en, this message translates to:
  /// **'Register - IM'**
  String get seoRegisterTitle;

  /// No description provided for @seoRegisterDescription.
  ///
  /// In en, this message translates to:
  /// **'Create your IM account'**
  String get seoRegisterDescription;

  /// No description provided for @seoChatTitle.
  ///
  /// In en, this message translates to:
  /// **'Chat - IM'**
  String get seoChatTitle;

  /// No description provided for @seoChatDescription.
  ///
  /// In en, this message translates to:
  /// **'Chat with friends securely, end-to-end encrypted'**
  String get seoChatDescription;

  /// No description provided for @seoContactsTitle.
  ///
  /// In en, this message translates to:
  /// **'Contacts - IM'**
  String get seoContactsTitle;

  /// No description provided for @seoContactsDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage your contacts'**
  String get seoContactsDescription;

  /// No description provided for @seoAddFriendTitle.
  ///
  /// In en, this message translates to:
  /// **'Add Friend - IM'**
  String get seoAddFriendTitle;

  /// No description provided for @seoAddFriendDescription.
  ///
  /// In en, this message translates to:
  /// **'Search and add new friends'**
  String get seoAddFriendDescription;

  /// No description provided for @seoGroupsTitle.
  ///
  /// In en, this message translates to:
  /// **'Groups - IM'**
  String get seoGroupsTitle;

  /// No description provided for @seoGroupsDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage and join groups'**
  String get seoGroupsDescription;

  /// No description provided for @seoCreateGroupTitle.
  ///
  /// In en, this message translates to:
  /// **'Create Group - IM'**
  String get seoCreateGroupTitle;

  /// No description provided for @seoCreateGroupDescription.
  ///
  /// In en, this message translates to:
  /// **'Create a new group chat'**
  String get seoCreateGroupDescription;

  /// No description provided for @seoMomentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Moments - IM'**
  String get seoMomentsTitle;

  /// No description provided for @seoMomentsDescription.
  ///
  /// In en, this message translates to:
  /// **'View friends\' updates'**
  String get seoMomentsDescription;

  /// No description provided for @seoMomentsNotificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Moment Notifications - IM'**
  String get seoMomentsNotificationsTitle;

  /// No description provided for @seoMomentsNotificationsDescription.
  ///
  /// In en, this message translates to:
  /// **'View moments interaction notifications'**
  String get seoMomentsNotificationsDescription;

  /// No description provided for @seoSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings - IM'**
  String get seoSettingsTitle;

  /// No description provided for @seoSettingsDescription.
  ///
  /// In en, this message translates to:
  /// **'Personalize your IM experience'**
  String get seoSettingsDescription;

  /// No description provided for @seoProfileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile - IM'**
  String get seoProfileTitle;

  /// No description provided for @seoProfileDescription.
  ///
  /// In en, this message translates to:
  /// **'Edit your profile'**
  String get seoProfileDescription;

  /// No description provided for @seoAiSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'AI Settings - IM'**
  String get seoAiSettingsTitle;

  /// No description provided for @seoAiSettingsDescription.
  ///
  /// In en, this message translates to:
  /// **'Configure AI assistant'**
  String get seoAiSettingsDescription;

  /// No description provided for @authInvalidCredentials.
  ///
  /// In en, this message translates to:
  /// **'Invalid username or password.'**
  String get authInvalidCredentials;

  /// No description provided for @authNetworkError.
  ///
  /// In en, this message translates to:
  /// **'Network error. Please check your connection.'**
  String get authNetworkError;

  /// No description provided for @authServerError.
  ///
  /// In en, this message translates to:
  /// **'Server error. Please try again later.'**
  String get authServerError;

  /// No description provided for @authTooManyRequests.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please try again later.'**
  String get authTooManyRequests;

  /// No description provided for @authUnknownError.
  ///
  /// In en, this message translates to:
  /// **'An unexpected error occurred. Please try again.'**
  String get authUnknownError;

  /// No description provided for @seoAppTitle.
  ///
  /// In en, this message translates to:
  /// **'IM - Secure Messaging'**
  String get seoAppTitle;

  /// No description provided for @seoAppDescription.
  ///
  /// In en, this message translates to:
  /// **'IM is a secure messaging app with end-to-end encryption, group chat, and more.'**
  String get seoAppDescription;

  /// No description provided for @errorShareNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Sharing not available in this browser'**
  String get errorShareNotAvailable;

  /// No description provided for @errorClipboardNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Clipboard not available in this browser'**
  String get errorClipboardNotAvailable;

  /// No description provided for @errorNotificationPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Notification permission denied'**
  String get errorNotificationPermissionDenied;

  /// No description provided for @errorMicrophonePermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Microphone permission denied'**
  String get errorMicrophonePermissionDenied;

  /// No description provided for @errorFileReadFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to read file data'**
  String get errorFileReadFailed;

  /// No description provided for @e2eeNegotiationNotification.
  ///
  /// In en, this message translates to:
  /// **'{name} requests to enable end-to-end encryption'**
  String e2eeNegotiationNotification(Object name);

  /// No description provided for @chatLoadMoreHistory.
  ///
  /// In en, this message translates to:
  /// **'Load earlier messages'**
  String get chatLoadMoreHistory;

  /// No description provided for @chatNoMoreHistory.
  ///
  /// In en, this message translates to:
  /// **'No earlier messages'**
  String get chatNoMoreHistory;

  /// No description provided for @joinGroup.
  ///
  /// In en, this message translates to:
  /// **'Join Group'**
  String get joinGroup;

  /// No description provided for @joinGroupSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search group name...'**
  String get joinGroupSearchHint;

  /// No description provided for @joinGroupNoResults.
  ///
  /// In en, this message translates to:
  /// **'No matching groups found'**
  String get joinGroupNoResults;

  /// No description provided for @joinGroupInputHint.
  ///
  /// In en, this message translates to:
  /// **'Enter keywords to search groups'**
  String get joinGroupInputHint;

  /// No description provided for @joinGroupSuccess.
  ///
  /// In en, this message translates to:
  /// **'Joined {name}'**
  String joinGroupSuccess(Object name);

  /// No description provided for @joinGroupError.
  ///
  /// In en, this message translates to:
  /// **'Failed to join, please try again'**
  String get joinGroupError;

  /// No description provided for @joinGroupMembers.
  ///
  /// In en, this message translates to:
  /// **'{count} members'**
  String joinGroupMembers(Object count);

  /// No description provided for @joinGroupTooltip.
  ///
  /// In en, this message translates to:
  /// **'Join Group'**
  String get joinGroupTooltip;

  /// No description provided for @avatarUnsupportedFormat.
  ///
  /// In en, this message translates to:
  /// **'Only jpg, png, gif formats are supported'**
  String get avatarUnsupportedFormat;

  /// No description provided for @avatarSizeExceeded.
  ///
  /// In en, this message translates to:
  /// **'File size cannot exceed 2MB'**
  String get avatarSizeExceeded;

  /// No description provided for @avatarUpdateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Avatar updated successfully'**
  String get avatarUpdateSuccess;

  /// No description provided for @avatarUploadFailed.
  ///
  /// In en, this message translates to:
  /// **'Upload failed: {error}'**
  String avatarUploadFailed(Object error);
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
