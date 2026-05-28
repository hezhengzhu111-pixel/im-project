import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => 'IM 即时通讯';

  @override
  String get navChat => '聊天';

  @override
  String get navContacts => '联系人';

  @override
  String get navGroups => '群组';

  @override
  String get navMoments => '朋友圈';

  @override
  String get navSettings => '设置';

  @override
  String get loginTitle => '登录';

  @override
  String get loginUsername => '用户名';

  @override
  String get loginPassword => '密码';

  @override
  String get loginButton => '登录';

  @override
  String get loginNoAccount => '没有账号？';

  @override
  String get loginRegister => '注册';

  @override
  String get chatSend => '发送';

  @override
  String get chatSearch => '搜索';

  @override
  String get chatNoSessions => '暂无会话';

  @override
  String get contactsSearch => '搜索联系人';

  @override
  String get contactsNoFriends => '暂无好友';

  @override
  String contactsFriends(Object count) {
    return '好友 ($count)';
  }

  @override
  String contactsRequests(Object count) {
    return '请求 ($count)';
  }

  @override
  String get contactsAddFriend => '添加好友';

  @override
  String get contactsFriendRequests => '好友请求';

  @override
  String get contactsNoRequests => '暂无好友请求';

  @override
  String get contactsOnline => '在线';

  @override
  String get contactsOffline => '离线';

  @override
  String get contactsFriendRequestReason => '请求添加你为好友';

  @override
  String get contactsAccept => '接受';

  @override
  String get contactsReject => '拒绝';

  @override
  String get contactsAccepted => '已接受';

  @override
  String get contactsRejected => '已拒绝';

  @override
  String get retry => '重试';

  @override
  String get noData => '暂无数据';

  @override
  String get e2eeEncrypted => '端到端加密已启用';

  @override
  String get e2eeNegotiating => '正在协商加密';

  @override
  String get e2eeFailed => '端到端加密异常';

  @override
  String get e2eePlaintext => '未启用端到端加密';

  @override
  String get e2eeMessageEncrypted => '此消息已端到端加密';

  @override
  String get e2eeAccept => '接受加密';

  @override
  String get e2eeReject => '拒绝加密';

  @override
  String get e2eeExit => '退出加密';

  @override
  String get e2eeInitiate => '启用端到端加密';

  @override
  String get settingsEditProfile => '编辑资料';

  @override
  String get settingsTitle => '设置';

  @override
  String get settingsSubtitle => '只保留日常聊天需要的高频选项。';

  @override
  String get settingsBack => '返回';

  @override
  String get settingsAccount => '账号';

  @override
  String get settingsAppearance => '外观';

  @override
  String get settingsNotifications => '通知';

  @override
  String get settingsPrivacy => '隐私';

  @override
  String get settingsStorage => '存储';

  @override
  String get settingsAi => 'AI';

  @override
  String get settingsProfile => '个人资料';

  @override
  String get settingsProfileDesc => '查看头像、昵称和账号信息';

  @override
  String get settingsLanguage => '语言';

  @override
  String get settingsLanguageDesc => '切换界面显示语言';

  @override
  String get settingsTheme => '主题';

  @override
  String get settingsThemeDesc => '选择浅色、深色或跟随系统';

  @override
  String get settingsThemeLight => '浅色';

  @override
  String get settingsThemeDark => '深色';

  @override
  String get settingsThemeAuto => '跟随系统';

  @override
  String get settingsNotification => '消息通知';

  @override
  String get settingsSound => '提示音';

  @override
  String get settingsInsecureVoice => 'HTTP 公网语音';

  @override
  String get settingsInsecureVoiceDesc => '允许在 HTTP 连接下录制语音消息（不推荐）';

  @override
  String get settingsReadReceipt => '已读回执';

  @override
  String get settingsReadReceiptDesc => '允许对方看到消息已读状态';

  @override
  String get settingsClearCache => '清理本地缓存';

  @override
  String get settingsClearCacheDesc => '清除会话选择和临时页面状态';

  @override
  String get settingsAiAssistant => 'AI 助手';

  @override
  String get settingsAiAssistantDesc => '配置大模型 API Key、自动回复、知识库';

  @override
  String get settingsLogout => '退出登录';

  @override
  String get settingsLogoutTitle => '退出登录';

  @override
  String get settingsLogoutMessage => '确定要退出当前账号吗？';

  @override
  String get settingsCacheTitle => '清理缓存';

  @override
  String get settingsCacheMessage => '清理本地 UI 缓存？登录状态不会被清除。';

  @override
  String get settingsCacheCleared => '缓存已清理';

  @override
  String get profileTitle => '个人资料';

  @override
  String get profileSubtitle => '维护基础身份信息，其他低频安全操作保持折叠。';

  @override
  String get profileBack => '返回';

  @override
  String get profileChangeAvatar => '更换头像';

  @override
  String get profileAvatarTip => '支持 jpg、png、webp 等常见图片格式';

  @override
  String get profileAccountInfo => '基础信息';

  @override
  String get profileUsername => '用户名';

  @override
  String get profileNickname => '昵称';

  @override
  String get profileEmail => '邮箱';

  @override
  String get profilePhone => '手机号';

  @override
  String get profileGender => '性别';

  @override
  String get profileGenderMale => '男';

  @override
  String get profileGenderFemale => '女';

  @override
  String get profileGenderSecret => '保密';

  @override
  String get profileBirthday => '生日';

  @override
  String get profileSignature => '签名';

  @override
  String get profileLocation => '地区';

  @override
  String get profileSave => '保存修改';

  @override
  String get profileReset => '重置';

  @override
  String get profileSecurity => '账户安全';

  @override
  String get profilePassword => '登录密码';

  @override
  String get profileChange => '修改';

  @override
  String get profileEmailVerify => '邮箱验证';

  @override
  String get profilePhoneVerify => '手机验证';

  @override
  String get profileBound => '已绑定';

  @override
  String get profileUnbound => '未绑定';

  @override
  String get profilePrivacy => '隐私';

  @override
  String get profileAllowStrangerAdd => '允许陌生人添加';

  @override
  String get profileAllowStrangerAddDesc => '允许通过搜索找到您并发起好友申请';

  @override
  String get profileShowOnlineStatus => '显示在线状态';

  @override
  String get profileShowOnlineStatusDesc => '好友可以看到您的在线状态';

  @override
  String get profileAllowViewMoments => '允许查看朋友圈';

  @override
  String get profileAllowViewMomentsDesc => '控制朋友圈对外可见范围';

  @override
  String get profileChangePassword => '修改密码';

  @override
  String get profileCurrentPassword => '当前密码';

  @override
  String get profileCurrentPasswordRequired => '请输入当前密码';

  @override
  String get profileNewPassword => '新密码';

  @override
  String get profileNewPasswordRequired => '请输入新密码';

  @override
  String get profileConfirmPassword => '确认密码';

  @override
  String get profilePasswordMismatch => '两次输入的密码不一致';

  @override
  String get profilePasswordLength => '密码长度为 6 到 20 个字符';

  @override
  String get profileNicknameRequired => '请输入昵称';

  @override
  String get profileNicknameLength => '昵称长度为 1 到 20 个字符';

  @override
  String get profileSaved => '个人资料已更新';

  @override
  String get profileAvatarUpdated => '头像已更新';

  @override
  String get profilePasswordUpdated => '密码修改成功';

  @override
  String get profilePrivacySaved => '隐私设置已保存';

  @override
  String get profileUpdateFailed => '更新个人资料失败';

  @override
  String get profileUploadFailed => '头像上传失败';

  @override
  String get aiTitle => 'AI 助手';

  @override
  String get aiApiKeys => 'API Key 管理';

  @override
  String get aiApiKeysDesc => '配置你的大模型 API Key（支持 DeepSeek、MiniMax 等）';

  @override
  String get aiAutoReply => '自动回复';

  @override
  String get aiAutoReplyDesc => '开启后 AI 将代你自动回复消息';

  @override
  String get aiAutoReplyEnabled => '启用自动回复';

  @override
  String get aiAutoReplyPersona => 'AI 人设';

  @override
  String get aiAutoReplyPersonaPlaceholder => '描述你想让 AI 扮演的角色和说话风格...';

  @override
  String get aiProvider => '模型提供商';

  @override
  String get aiKeyName => '标签';

  @override
  String get aiKeyNamePlaceholder => '给这个 Key 起个名字';

  @override
  String get aiApiKeyInput => 'API Key';

  @override
  String get aiStatus => '状态';

  @override
  String get aiTesting => '测试中...';

  @override
  String get aiTestConnection => '测试连接';

  @override
  String get aiAddKey => '添加 Key';

  @override
  String get aiDeleteKey => '删除 Key';

  @override
  String get aiDeleteConfirm => '确定要删除这个 Key 吗？';

  @override
  String get aiNoKeys => '暂无 API Key，点击添加';

  @override
  String get aiSave => '保存';

  @override
  String get commonConfirm => '确认';

  @override
  String get commonCancel => '取消';

  @override
  String get commonSuccess => '操作成功';

  @override
  String get commonFailed => '操作失败';

  @override
  String get commonLoading => '加载中...';

  @override
  String get validationRequired => '此项为必填项';

  @override
  String validationUsernameMinLength(Object min) {
    return '用户名长度至少为 $min 个字符';
  }

  @override
  String validationUsernameMaxLength(Object max) {
    return '用户名长度不能超过 $max 个字符';
  }

  @override
  String get validationUsernameInvalidChars => '用户名只能包含字母、数字和下划线';

  @override
  String get validationEmailInvalid => '请输入正确的邮箱格式';

  @override
  String validationPasswordMinLength(Object min) {
    return '密码长度至少为 $min 个字符';
  }

  @override
  String validationPasswordMaxLength(Object max) {
    return '密码长度不能超过 $max 个字符';
  }

  @override
  String get validationPasswordStrength => '密码必须包含字母和数字';

  @override
  String get validationPasswordMismatch => '两次输入的密码不一致';

  @override
  String get validationAgreementRequired => '请阅读并同意用户协议和隐私政策';

  @override
  String get validationNicknameRequired => '请输入昵称';

  @override
  String validationNicknameMaxLength(Object max) {
    return '昵称长度不能超过 $max 个字符';
  }

  @override
  String get loginSubtitle => '请登录您的加密通信账户';

  @override
  String get loginRememberMe => '记住我';

  @override
  String get loginNoAccountRegister => '没有账号？注册';

  @override
  String get registerTitle => '注册';

  @override
  String get registerSubtitle => '创建您的账户，开始聊天之旅';

  @override
  String get registerEmail => '邮箱';

  @override
  String get registerConfirmPassword => '确认密码';

  @override
  String get registerAgreementPrefix => '我已阅读并同意 ';

  @override
  String get registerAgreementSuffix => ' 和 ';

  @override
  String get registerUserAgreement => '用户协议';

  @override
  String get registerPrivacyPolicy => '隐私政策';

  @override
  String get registerButton => '注册';

  @override
  String get registerHasAccountLogin => '已有账号？登录';

  @override
  String get registerAgreementRequired => '请阅读并同意用户协议和隐私政策';

  @override
  String get chatSelectSession => '选择一个会话开始聊天';

  @override
  String get chatSearchHint => '搜索会话...';

  @override
  String chatMessageCount(Object count) {
    return '$count 条消息';
  }

  @override
  String chatMemberCount(Object count) {
    return '$count 人';
  }

  @override
  String get chatImageSending => '图片发送功能开发中...';

  @override
  String get chatFileSending => '文件发送功能开发中...';

  @override
  String get chatVoiceSending => '语音发送功能开发中...';

  @override
  String get chatInputHint => '输入消息...';

  @override
  String get chatAttach => '附件';

  @override
  String get chatImage => '图片';

  @override
  String get chatFile => '文件';

  @override
  String get chatVoice => '语音';

  @override
  String get validatorUsernameRequired => '请输入用户名';

  @override
  String get validatorUsernameLength => '用户名长度在 3 到 20 个字符';

  @override
  String get validatorUsernameFormat => '用户名只能包含字母、数字和下划线';

  @override
  String get validatorEmailRequired => '请输入邮箱';

  @override
  String get validatorEmailFormat => '请输入正确的邮箱格式';

  @override
  String get validatorPasswordRequired => '请输入密码';

  @override
  String get validatorPasswordLength => '密码长度在 8 到 64 个字符';

  @override
  String get validatorPasswordFormat => '密码必须包含字母和数字';

  @override
  String get validatorConfirmPasswordRequired => '请确认密码';

  @override
  String get validatorPasswordMismatch => '两次输入密码不一致';

  @override
  String get a11yEncryptedMessage => '此消息已端到端加密';

  @override
  String get a11yNetworkDisconnected => '网络已断开';

  @override
  String get a11yNetworkConnected => '网络已连接';

  @override
  String get a11ySettingsProfile => '个人信息';

  @override
  String get a11ySettingsAppearance => '外观设置';

  @override
  String get a11ySettingsNotifications => '通知设置';

  @override
  String get a11ySettingsSecurity => '安全设置';

  @override
  String get a11ySettingsStorage => '存储设置';

  @override
  String get a11ySettingsAi => 'AI 设置';

  @override
  String get a11ySendMessage => '发送消息';

  @override
  String get a11yAddAttachment => '添加附件';

  @override
  String get a11yVoiceInput => '语音输入';

  @override
  String get addFriendTitle => '添加好友';

  @override
  String get addFriendSearchHint => '搜索用户名或昵称';

  @override
  String get addFriendSearchFailed => '搜索失败，请重试';

  @override
  String addFriendRequestSent(Object name) {
    return '已向 $name 发送好友请求';
  }

  @override
  String get addFriendRequestFailed => '发送请求失败，请重试';

  @override
  String get addFriendNoMatch => '未找到匹配的用户';

  @override
  String get addFriendSearchPrompt => '输入关键词搜索用户';

  @override
  String get addFriendButton => '添加';

  @override
  String get groupCreateTooltip => '创建群组';

  @override
  String get groupNoGroups => '暂无群组';

  @override
  String get groupCreateTitle => '创建群组';

  @override
  String get groupCreateButton => '创建';

  @override
  String get groupNameLabel => '群组名称';

  @override
  String get groupDescLabel => '描述（可选）';

  @override
  String get groupSelectMembers => '选择成员';
}
