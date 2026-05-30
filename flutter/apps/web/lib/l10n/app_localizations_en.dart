import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'IM Messenger';

  @override
  String get navChat => 'Chat';

  @override
  String get navContacts => 'Contacts';

  @override
  String get navGroups => 'Groups';

  @override
  String get navMoments => 'Moments';

  @override
  String get navSettings => 'Settings';

  @override
  String get loginTitle => 'Login';

  @override
  String get loginUsername => 'Username';

  @override
  String get loginPassword => 'Password';

  @override
  String get loginButton => 'Login';

  @override
  String get loginNoAccount => 'No account?';

  @override
  String get loginRegister => 'Register';

  @override
  String get chatSend => 'Send';

  @override
  String get chatSearch => 'Search';

  @override
  String get chatNoSessions => 'No conversations yet';

  @override
  String get contactsSearch => 'Search contacts';

  @override
  String get contactsSortByName => 'Name';

  @override
  String get contactsSortByOnline => 'Online status';

  @override
  String get contactsSortByTime => 'Time added';

  @override
  String get contactsNoFriends => 'No friends yet';

  @override
  String contactsFriends(Object count) {
    return 'Friends ($count)';
  }

  @override
  String contactsRequests(Object count) {
    return 'Requests ($count)';
  }

  @override
  String get contactsAddFriend => 'Add Friend';

  @override
  String get contactsFriendRequests => 'Friend Requests';

  @override
  String get contactsNoRequests => 'No friend requests';

  @override
  String get contactsOnline => 'Online';

  @override
  String get contactsOffline => 'Offline';

  @override
  String get contactsFriendRequestReason => 'Requests to be your friend';

  @override
  String get contactsAccept => 'Accept';

  @override
  String get contactsReject => 'Reject';

  @override
  String get contactsAccepted => 'Accepted';

  @override
  String get contactsRejected => 'Rejected';

  @override
  String get contactsEditRemark => 'Edit remark';

  @override
  String get contactsRemarkLabel => 'Remark';

  @override
  String get contactsRemarkHint => 'Add a note for this contact';

  @override
  String get contactsRemarkSaved => 'Remark updated';

  @override
  String get contactsRemarkSaveFailed => 'Failed to update remark';

  @override
  String get contactsDeleteFriend => 'Delete friend';

  @override
  String contactsDeleteFriendConfirm(Object name) {
    return 'Remove $name from your contacts?';
  }

  @override
  String get contactsDeleteFriendDone => 'Friend removed';

  @override
  String get contactsDeleteFriendFailed => 'Failed to remove friend';

  @override
  String get retry => 'Retry';

  @override
  String get noData => 'No data';

  @override
  String get e2eeEncrypted => 'End-to-end encryption enabled';

  @override
  String get e2eeNegotiating => 'Negotiating encryption';

  @override
  String get e2eeFailed => 'Encryption error';

  @override
  String get e2eePlaintext => 'Encryption not enabled';

  @override
  String get e2eeMessageEncrypted => 'This message is end-to-end encrypted';

  @override
  String get e2eeAccept => 'Accept encryption';

  @override
  String get e2eeReject => 'Reject encryption';

  @override
  String get e2eeExit => 'Exit encryption';

  @override
  String get e2eeInitiate => 'Enable end-to-end encryption';

  @override
  String get settingsEditProfile => 'Edit profile';

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

  @override
  String get validationRequired => 'This field is required';

  @override
  String validationUsernameMinLength(Object min) {
    return 'Username must be at least $min characters';
  }

  @override
  String validationUsernameMaxLength(Object max) {
    return 'Username must be no more than $max characters';
  }

  @override
  String get validationUsernameInvalidChars => 'Username can only contain letters, numbers, and underscores';

  @override
  String get validationEmailInvalid => 'Please enter a valid email address';

  @override
  String validationPasswordMinLength(Object min) {
    return 'Password must be at least $min characters';
  }

  @override
  String validationPasswordMaxLength(Object max) {
    return 'Password must be no more than $max characters';
  }

  @override
  String get validationPasswordStrength => 'Password must contain both letters and digits';

  @override
  String get validationPasswordMismatch => 'Passwords do not match';

  @override
  String get validationAgreementRequired => 'You must accept the agreement to continue';

  @override
  String get validationNicknameRequired => 'Please enter a nickname';

  @override
  String validationNicknameMaxLength(Object max) {
    return 'Nickname must be no more than $max characters';
  }

  @override
  String get loginSubtitle => 'Please log in to your encrypted communication account';

  @override
  String get loginRememberMe => 'Remember me';

  @override
  String get loginNoAccountRegister => 'No account? Register';

  @override
  String get registerTitle => 'Register';

  @override
  String get registerSubtitle => 'Create your account and start chatting';

  @override
  String get registerEmail => 'Email';

  @override
  String get registerConfirmPassword => 'Confirm password';

  @override
  String get registerAgreementPrefix => 'I have read and agree to the ';

  @override
  String get registerAgreementSuffix => ' and ';

  @override
  String get registerUserAgreement => 'User Agreement';

  @override
  String get registerPrivacyPolicy => 'Privacy Policy';

  @override
  String get registerButton => 'Register';

  @override
  String get registerHasAccountLogin => 'Already have an account? Login';

  @override
  String get registerAgreementRequired => 'Please read and agree to the User Agreement and Privacy Policy';

  @override
  String get chatSelectSession => 'Select a conversation to start chatting';

  @override
  String get chatSearchHint => 'Search conversations...';

  @override
  String chatMessageCount(Object count) {
    return '$count messages';
  }

  @override
  String chatMemberCount(Object count) {
    return '$count members';
  }

  @override
  String get chatImageSending => 'Image sending feature under development...';

  @override
  String get chatFileSending => 'File sending feature under development...';

  @override
  String get chatVoiceSending => 'Voice sending feature under development...';

  @override
  String get chatInputHint => 'Type a message...';

  @override
  String get chatAttach => 'Attach';

  @override
  String get chatImage => 'Image';

  @override
  String get chatFile => 'File';

  @override
  String get chatVoice => 'Voice';

  @override
  String get validatorUsernameRequired => 'Please enter a username';

  @override
  String get validatorUsernameLength => 'Username must be 3-20 characters';

  @override
  String get validatorUsernameFormat => 'Username can only contain letters, numbers, and underscores';

  @override
  String get validatorEmailRequired => 'Please enter an email';

  @override
  String get validatorEmailFormat => 'Please enter a valid email format';

  @override
  String get validatorPasswordRequired => 'Please enter a password';

  @override
  String get validatorPasswordLength => 'Password must be 8-64 characters';

  @override
  String get validatorPasswordFormat => 'Password must contain letters and numbers';

  @override
  String get validatorConfirmPasswordRequired => 'Please confirm your password';

  @override
  String get validatorPasswordMismatch => 'Passwords do not match';

  @override
  String get a11yEncryptedMessage => 'This message is end-to-end encrypted';

  @override
  String get a11yNetworkDisconnected => 'Network disconnected';

  @override
  String get a11yNetworkConnected => 'Network connected';

  @override
  String get a11ySettingsProfile => 'Personal info';

  @override
  String get a11ySettingsAppearance => 'Appearance settings';

  @override
  String get a11ySettingsNotifications => 'Notification settings';

  @override
  String get a11ySettingsSecurity => 'Security settings';

  @override
  String get a11ySettingsStorage => 'Storage settings';

  @override
  String get a11ySettingsAi => 'AI settings';

  @override
  String get a11ySendMessage => 'Send message';

  @override
  String get a11yAddAttachment => 'Add attachment';

  @override
  String get a11yVoiceInput => 'Voice input';

  @override
  String get addFriendTitle => 'Add Friend';

  @override
  String get addFriendSearchHint => 'Search by username or nickname';

  @override
  String get addFriendSearchFailed => 'Search failed, please try again';

  @override
  String addFriendRequestSent(Object name) {
    return 'Friend request sent to $name';
  }

  @override
  String get addFriendRequestFailed => 'Failed to send request, please try again';

  @override
  String get addFriendNoMatch => 'No matching users found';

  @override
  String get addFriendSearchPrompt => 'Enter keywords to search users';

  @override
  String get addFriendButton => 'Add';

  @override
  String get addFriendTypeUsername => 'Username';

  @override
  String get addFriendTypeEmail => 'Email';

  @override
  String get addFriendTypePhone => 'Phone';

  @override
  String get addFriendSearchByEmail => 'Search by email';

  @override
  String get addFriendSearchByPhone => 'Search by phone number';

  @override
  String get addFriendVerificationHint => 'Enter a verification message (optional)';

  @override
  String get addFriendRequestDuplicate => 'A pending friend request already exists, synced to request list';

  @override
  String get addFriendAlreadyFriend => 'Already friends';

  @override
  String get addFriendPendingOutgoing => 'Request sent';

  @override
  String get addFriendSelf => 'You';

  @override
  String get groupCreateTooltip => 'Create group';

  @override
  String get groupNoGroups => 'No groups yet';

  @override
  String get groupCreateTitle => 'Create Group';

  @override
  String get groupCreateButton => 'Create';

  @override
  String get groupNameLabel => 'Group name';

  @override
  String get groupDescLabel => 'Description (optional)';

  @override
  String get groupSelectMembers => 'Select members';

  @override
  String get notFoundTitle => 'Page not found';

  @override
  String get notFoundBackHome => 'Back to Home';

  @override
  String loadingFailed(Object error) {
    return 'Loading failed: $error';
  }

  @override
  String get momentsPublishTitle => 'Publish Moment';

  @override
  String get momentsPublishButton => 'Publish Moment';

  @override
  String get momentsShareHint => 'Share something...';

  @override
  String get momentsVisibility => 'Who can see';

  @override
  String get momentsLocationHint => 'Add location (optional)';

  @override
  String get momentsPublishSuccess => 'Published successfully';

  @override
  String get commentDeleteConfirmTitle => 'Delete Confirmation';

  @override
  String get commentDeleteConfirmMessage => 'Are you sure you want to delete this comment?';

  @override
  String get commentDelete => 'Delete';

  @override
  String get momentsDeletePost => 'Delete Post';

  @override
  String get momentsDeletePostConfirm => 'Are you sure you want to delete this post? This cannot be undone.';

  @override
  String get momentsDeletePostSuccess => 'Post deleted';

  @override
  String get momentsDeletePostFailed => 'Failed to delete post';

  @override
  String get commentReply => 'Reply';

  @override
  String get commentWriteHint => 'Write a comment...';

  @override
  String get commentNoComments => 'No comments yet';

  @override
  String get e2eeDialogTitle => 'Enable End-to-End Encryption';

  @override
  String get e2eeDialogDescription => 'End-to-end encryption uses Signal Protocol to protect your messages:';

  @override
  String get e2eeSignalBullet1 => '• Message content is only visible on both devices';

  @override
  String get e2eeSignalBullet2 => '• Server cannot read encrypted messages';

  @override
  String get e2eeSignalBullet3 => '• Each message is encrypted with an independent key';

  @override
  String get e2eeDialogFooter => 'After enabling, both parties need to confirm before encrypted communication can begin.';

  @override
  String get e2eeConfirmEnable => 'Confirm Enable';

  @override
  String get e2eeRequestTitle => 'End-to-End Encryption Request';

  @override
  String e2eeRequestDescription(Object name) {
    return '$name requests to enable end-to-end encryption';
  }

  @override
  String get e2eeSignalProtocol => 'Signal Protocol protection:';

  @override
  String get e2eeEncryptedStatus => 'End-to-end encryption enabled';

  @override
  String get e2eeNegotiatingStatus => 'Negotiating encryption...';

  @override
  String get e2eeFailedStatus => 'End-to-end encryption error';

  @override
  String get e2eeDetails => 'Details';

  @override
  String get e2eeClearState => 'Clear state';

  @override
  String get commonClose => 'Close';

  @override
  String get formErrorServer => 'Server error. Please try again.';

  @override
  String get formErrorNetwork => 'Network error. Please check your connection.';

  @override
  String get formErrorAuth => 'Invalid username or password.';

  @override
  String get formErrorRateLimit => 'Too many attempts. Please try again later.';

  @override
  String get e2eeEncryptedBadge => 'End-to-end encryption enabled';

  @override
  String get e2eeNegotiatingBadge => 'Negotiating encryption';

  @override
  String get e2eeFailedBadge => 'Encryption error';

  @override
  String get e2eePlaintextBadge => 'Encryption not enabled';

  @override
  String get networkDisconnected => 'Network disconnected, messages will be sent when restored';

  @override
  String chatMessagesFailed(Object count) {
    return '$count messages failed to send';
  }

  @override
  String chatMessagesPending(Object count) {
    return '$count messages waiting to send';
  }

  @override
  String get chatRetrying => 'Retrying to send messages...';

  @override
  String get chatRetry => 'Retry';

  @override
  String get errorE2eeNotReady => 'E2EE negotiation not complete, waiting for peer confirmation';

  @override
  String get errorAlreadyRecording => 'Already recording';

  @override
  String get errorNotRecording => 'Not recording';

  @override
  String get errorRecordingNotImplemented => 'Voice recording not yet implemented';

  @override
  String get momentsTitle => 'Moments';

  @override
  String get momentsUserFallback => 'User';

  @override
  String get momentsDailyOverview => 'Daily Overview';

  @override
  String get momentsInteractions => 'Interactions';

  @override
  String get momentsPhotos => 'Photos';

  @override
  String get momentsComments => 'Comments';

  @override
  String get momentsRecentInteractions => 'Recent Interactions';

  @override
  String get momentsNoRecentInteractions => 'No recent interactions';

  @override
  String get momentsSharePrompt => 'Share your life moments';

  @override
  String get momentsShareDesc => 'Photos, text, videos can all be published to Moments';

  @override
  String get momentsNoPosts => 'No moments yet';

  @override
  String get momentsNotifications => 'Notifications';

  @override
  String get momentsMarkAllRead => 'Mark all as read';

  @override
  String get momentsNoNotifications => 'No notifications';

  @override
  String momentsNotificationLiked(Object name) {
    return '$name liked your moment';
  }

  @override
  String momentsNotificationCommented(Object name) {
    return '$name commented on your moment';
  }

  @override
  String momentsNotificationReplied(Object name) {
    return '$name replied to your comment';
  }

  @override
  String momentsNotificationInteracted(Object name) {
    return '$name interacted with you';
  }

  @override
  String get momentsVisibilityPublic => 'Public';

  @override
  String get momentsVisibilityFriends => 'Friends only';

  @override
  String get momentsVisibilitySelf => 'Only me';

  @override
  String momentsAddMedia(Object count) {
    return 'Add photos/videos, max $count';
  }

  @override
  String get momentsShowFull => 'Show full';

  @override
  String get timeJustNow => 'just now';

  @override
  String timeMinutesAgo(Object minutes) {
    return '$minutes min ago';
  }

  @override
  String timeHoursAgo(Object hours) {
    return '$hours h ago';
  }

  @override
  String timeDaysAgo(Object days) {
    return '$days d ago';
  }

  @override
  String get brandBadge => 'End-to-End Encrypted';

  @override
  String get brandTitle => 'Secure · Private · Instant';

  @override
  String get brandSubtitle => 'End-to-end encrypted instant messaging,\nyour messages are only decrypted on your device.';

  @override
  String get brandFeatureE2eeLabel => 'E2EE Enabled';

  @override
  String get brandFeatureE2ee => 'Powered by Signal Protocol, messages visible only on both devices';

  @override
  String get brandFeatureRealtimeLabel => 'Realtime Delivery';

  @override
  String get brandFeatureRealtime => 'WebSocket long-polling, millisecond-level message delivery';

  @override
  String get brandFeatureDeviceTrustLabel => 'Device Trust';

  @override
  String get brandFeatureDeviceTrust => 'Multi-device login with cloud sync, continue conversations anywhere';

  @override
  String get brandFeatureAiLabel => 'AI Assistant Online';

  @override
  String get brandFeatureAi => 'Built-in AI for smart Q&A, translation, and content creation';

  @override
  String get seoLoginTitle => 'Login - IM';

  @override
  String get seoLoginDescription => 'Secure messaging, end-to-end encrypted login';

  @override
  String get seoRegisterTitle => 'Register - IM';

  @override
  String get seoRegisterDescription => 'Create your IM account';

  @override
  String get seoChatTitle => 'Chat - IM';

  @override
  String get seoChatDescription => 'Chat with friends securely, end-to-end encrypted';

  @override
  String get seoContactsTitle => 'Contacts - IM';

  @override
  String get seoContactsDescription => 'Manage your contacts';

  @override
  String get seoAddFriendTitle => 'Add Friend - IM';

  @override
  String get seoAddFriendDescription => 'Search and add new friends';

  @override
  String get seoGroupsTitle => 'Groups - IM';

  @override
  String get seoGroupsDescription => 'Manage and join groups';

  @override
  String get seoCreateGroupTitle => 'Create Group - IM';

  @override
  String get seoCreateGroupDescription => 'Create a new group chat';

  @override
  String get seoMomentsTitle => 'Moments - IM';

  @override
  String get seoMomentsDescription => 'View friends\' updates';

  @override
  String get seoMomentsNotificationsTitle => 'Moment Notifications - IM';

  @override
  String get seoMomentsNotificationsDescription => 'View moments interaction notifications';

  @override
  String get seoSettingsTitle => 'Settings - IM';

  @override
  String get seoSettingsDescription => 'Personalize your IM experience';

  @override
  String get seoProfileTitle => 'Profile - IM';

  @override
  String get seoProfileDescription => 'Edit your profile';

  @override
  String get seoAiSettingsTitle => 'AI Settings - IM';

  @override
  String get seoAiSettingsDescription => 'Configure AI assistant';

  @override
  String get authInvalidCredentials => 'Invalid username or password.';

  @override
  String get authNetworkError => 'Network error. Please check your connection.';

  @override
  String get authServerError => 'Server error. Please try again later.';

  @override
  String get authTooManyRequests => 'Too many attempts. Please try again later.';

  @override
  String get authUnknownError => 'An unexpected error occurred. Please try again.';

  @override
  String get seoAppTitle => 'IM - Secure Messaging';

  @override
  String get seoAppDescription => 'IM is a secure messaging app with end-to-end encryption, group chat, and more.';

  @override
  String get errorShareNotAvailable => 'Sharing not available in this browser';

  @override
  String get errorClipboardNotAvailable => 'Clipboard not available in this browser';

  @override
  String get errorNotificationPermissionDenied => 'Notification permission denied';

  @override
  String get errorMicrophonePermissionDenied => 'Microphone permission denied';

  @override
  String get errorFileReadFailed => 'Failed to read file data';

  @override
  String e2eeNegotiationNotification(Object name) {
    return '$name requests to enable end-to-end encryption';
  }

  @override
  String get chatLoadMoreHistory => 'Load earlier messages';

  @override
  String get chatNoMoreHistory => 'No earlier messages';

  @override
  String get joinGroup => 'Join Group';

  @override
  String get joinGroupSearchHint => 'Search group name...';

  @override
  String get joinGroupNoResults => 'No matching groups found';

  @override
  String get joinGroupInputHint => 'Enter keywords to search groups';

  @override
  String joinGroupSuccess(Object name) {
    return 'Joined $name';
  }

  @override
  String get joinGroupError => 'Failed to join, please try again';

  @override
  String joinGroupMembers(Object count) {
    return '$count members';
  }

  @override
  String get joinGroupTooltip => 'Join Group';
}
