// ignore: unused_import
import 'package:intl/intl.dart' as intl;
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
  String get languageChinese => '中文';

  @override
  String get languageEnglish => 'English';

  @override
  String get chatSend => '发送';

  @override
  String get chatSearch => '搜索';

  @override
  String get chatNoSessions => '暂无会话';

  @override
  String get contactsSearch => '搜索联系人';

  @override
  String get contactsSortByName => '按名称';

  @override
  String get contactsSortByOnline => '按在线状态';

  @override
  String get contactsSortByTime => '按添加时间';

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
  String get contactsEditRemark => '设置备注';

  @override
  String get contactsRemarkLabel => '好友备注';

  @override
  String get contactsRemarkHint => '为这个联系人添加备注';

  @override
  String get contactsRemarkSaved => '备注已更新';

  @override
  String get contactsRemarkSaveFailed => '备注更新失败';

  @override
  String get contactsDeleteFriend => '删除好友';

  @override
  String contactsDeleteFriendConfirm(Object name) {
    return '确定将 $name 从联系人中删除吗？';
  }

  @override
  String get contactsDeleteFriendDone => '好友已删除';

  @override
  String get contactsDeleteFriendFailed => '删除好友失败';

  @override
  String get contactsSendMessage => '发送消息';

  @override
  String get contactsVoiceCall => '语音通话';

  @override
  String get contactsVideoCall => '视频通话';

  @override
  String get contactsNoValue => '未设置';

  @override
  String get contactsPermission => '权限';

  @override
  String get contactsSource => '来源';

  @override
  String get contactsAddedTime => '添加时间';

  @override
  String get contactsOnlineStatus => '在线状态';

  @override
  String get contactsSignature => '个性签名';

  @override
  String get contactsMoments => '朋友圈';

  @override
  String get contactsDailyOverview => '每日概览';

  @override
  String get contactsRecentInteractions => '最近互动';

  @override
  String get contactsSearchNoResults => '未找到匹配的联系人';

  @override
  String contactsNewRequestFrom(Object name) {
    return '$name 请求添加你为好友';
  }

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
  String get registerUserAgreementContent =>
      '1. 服务条款\n欢迎使用IM聊天应用。在使用本服务前，请仔细阅读并理解本协议的所有条款。\n\n2. 用户责任\n用户应当遵守相关法律法规，不得利用本服务从事违法违规活动。\n\n3. 隐私保护\n我们重视用户隐私，将按照隐私政策保护用户个人信息。\n\n4. 服务变更\n我们保留随时修改或终止服务的权利，恕不另行通知。';

  @override
  String get registerPrivacyPolicyContent =>
      '1. 信息收集\n我们仅收集为提供服务所必需的用户信息。\n\n2. 信息使用\n收集的信息仅用于提供和改善服务，不会用于其他目的。\n\n3. 信息保护\n我们采用行业标准的安全措施保护用户信息安全。\n\n4. 信息共享\n除法律要求外，我们不会与第三方共享用户个人信息。';

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
  String get addFriendTypeUsername => '用户名';

  @override
  String get addFriendTypeEmail => '邮箱';

  @override
  String get addFriendTypePhone => '手机号';

  @override
  String get addFriendSearchByEmail => '搜索邮箱';

  @override
  String get addFriendSearchByPhone => '搜索手机号';

  @override
  String get addFriendVerificationHint => '填写验证消息（选填）';

  @override
  String get addFriendRequestDuplicate => '已有待处理的好友申请，已同步到好友申请列表';

  @override
  String get addFriendAlreadyFriend => '已是好友';

  @override
  String get addFriendPendingOutgoing => '已发送申请';

  @override
  String get addFriendSelf => '你自己';

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

  @override
  String get groupAvatarLabel => '群组头像 URL';

  @override
  String get groupEnterChat => '进入聊天';

  @override
  String get groupLeave => '退出群聊';

  @override
  String groupLeaveConfirm(Object name) {
    return '确定退出 $name？';
  }

  @override
  String get groupLeaveSuccess => '已退出群聊';

  @override
  String get groupLeaveFailed => '退出群聊失败';

  @override
  String get groupMembers => '成员';

  @override
  String get groupMemberListTitle => '群成员';

  @override
  String get groupNoDescription => '暂无描述';

  @override
  String get groupNoMembers => '暂无成员';

  @override
  String get groupLoadMembersFailed => '加载成员失败';

  @override
  String get groupSelectGroupHint => '选择一个群组查看详情';

  @override
  String groupTotalGroups(Object count) {
    return '$count 个群组';
  }

  @override
  String get notFoundTitle => '页面不存在';

  @override
  String get notFoundBackHome => '返回首页';

  @override
  String get forbiddenTitle => '无权访问';

  @override
  String get forbiddenMessage => '您没有权限访问此页面。';

  @override
  String get forbiddenBackHome => '返回首页';

  @override
  String get pageLoadFailed => '页面加载失败';

  @override
  String get pageLoadRetry => '重试';

  @override
  String loadingFailed(Object error) {
    return '加载失败: $error';
  }

  @override
  String get momentsPublishTitle => '发布动态';

  @override
  String get momentsPublishButton => '发布动态';

  @override
  String get momentsShareHint => '分享新鲜事...';

  @override
  String get momentsVisibility => '谁可以看';

  @override
  String get momentsLocationHint => '添加位置（选填）';

  @override
  String get momentsPublishSuccess => '发布成功';

  @override
  String get commentDeleteConfirmTitle => '删除确认';

  @override
  String get commentDeleteConfirmMessage => '确定要删除这条评论吗？';

  @override
  String get commentDelete => '删除';

  @override
  String get momentsDeletePost => '删除动态';

  @override
  String get momentsDeletePostConfirm => '确定要删除这条动态吗？删除后无法恢复。';

  @override
  String get momentsDeletePostSuccess => '动态已删除';

  @override
  String get momentsDeletePostFailed => '删除失败';

  @override
  String get commentReply => '回复';

  @override
  String get commentWriteHint => '写评论...';

  @override
  String get commentNoComments => '暂无评论';

  @override
  String get e2eeDialogTitle => '启用端到端加密';

  @override
  String get e2eeDialogDescription => '端到端加密使用 Signal Protocol 保护您的消息：';

  @override
  String get e2eeSignalBullet1 => '• 消息内容仅在双方设备上可见';

  @override
  String get e2eeSignalBullet2 => '• 服务器无法读取加密消息';

  @override
  String get e2eeSignalBullet3 => '• 每条消息使用独立密钥加密';

  @override
  String get e2eeDialogFooter => '启用后，双方需要确认才能开始加密通信。';

  @override
  String get e2eeConfirmEnable => '确认启用';

  @override
  String get e2eeRequestTitle => '端到端加密请求';

  @override
  String e2eeRequestDescription(Object name) {
    return '$name 请求启用端到端加密';
  }

  @override
  String get e2eeSignalProtocol => 'Signal Protocol 保护：';

  @override
  String get e2eeEncryptedStatus => '端到端加密已开启';

  @override
  String get e2eeNegotiatingStatus => '加密协商中...';

  @override
  String get e2eeFailedStatus => '端到端加密异常';

  @override
  String get e2eeDetails => '详情';

  @override
  String get e2eeClearState => '清理状态';

  @override
  String get commonClose => '关闭';

  @override
  String get formErrorServer => '服务器错误，请重试。';

  @override
  String get formErrorNetwork => '网络错误，请检查连接。';

  @override
  String get formErrorAuth => '用户名或密码错误。';

  @override
  String get formErrorRateLimit => '尝试次数过多，请稍后重试。';

  @override
  String get e2eeEncryptedBadge => '端到端加密已启用';

  @override
  String get e2eeNegotiatingBadge => '正在协商加密';

  @override
  String get e2eeFailedBadge => '端到端加密异常';

  @override
  String get e2eePlaintextBadge => '未启用端到端加密';

  @override
  String get networkDisconnected => '网络已断开，消息将在恢复后自动发送';

  @override
  String chatMessagesFailed(Object count) {
    return '$count 条消息发送失败';
  }

  @override
  String chatMessagesPending(Object count) {
    return '$count 条消息等待发送';
  }

  @override
  String get chatRetrying => '正在重试发送消息...';

  @override
  String get chatRetry => '重试';

  @override
  String get errorE2eeNotReady => '端到端加密协商尚未完成，请等待对方确认。';

  @override
  String get errorAlreadyRecording => '已在录音中';

  @override
  String get errorNotRecording => '未在录音中';

  @override
  String get errorRecordingNotImplemented => '录音功能待实现';

  @override
  String get momentsTitle => '朋友圈';

  @override
  String get momentsUserFallback => '用户';

  @override
  String get momentsDailyOverview => '今日概览';

  @override
  String get momentsInteractions => '互动';

  @override
  String get momentsPhotos => '照片';

  @override
  String get momentsComments => '评论';

  @override
  String get momentsRecentInteractions => '最近互动';

  @override
  String get momentsNoRecentInteractions => '暂无最近互动';

  @override
  String get momentsSharePrompt => '分享你的生活瞬间';

  @override
  String get momentsShareDesc => '照片、文字、视频都可以发布到朋友圈';

  @override
  String get momentsNoPosts => '暂无动态';

  @override
  String get momentsNotifications => '通知';

  @override
  String get momentsMarkAllRead => '全部已读';

  @override
  String get momentsNoNotifications => '暂无通知';

  @override
  String momentsNotificationLiked(Object name) {
    return '$name 赞了你的动态';
  }

  @override
  String momentsNotificationCommented(Object name) {
    return '$name 评论了你的动态';
  }

  @override
  String momentsNotificationReplied(Object name) {
    return '$name 回复了你的评论';
  }

  @override
  String momentsNotificationInteracted(Object name) {
    return '$name 与你互动';
  }

  @override
  String get momentsVisibilityPublic => '公开';

  @override
  String get momentsVisibilityFriends => '好友可见';

  @override
  String get momentsVisibilitySelf => '仅自己';

  @override
  String momentsAddMedia(Object count) {
    return '添加图片/视频，最多 $count 张';
  }

  @override
  String get momentsShowFull => '全文';

  @override
  String get momentsNoMorePosts => '没有更多了';

  @override
  String get momentsPostNotFound => '动态不存在';

  @override
  String get timeJustNow => '刚刚';

  @override
  String timeMinutesAgo(Object minutes) {
    return '$minutes分钟前';
  }

  @override
  String timeHoursAgo(Object hours) {
    return '$hours小时前';
  }

  @override
  String timeDaysAgo(Object days) {
    return '$days天前';
  }

  @override
  String get brandBadge => '端对端加密';

  @override
  String get brandTitle => '安全 · 私密 · 即时';

  @override
  String get brandSubtitle => '端对端加密即时通信系统，\n您的消息仅在设备上解密。';

  @override
  String get brandFeatureE2eeLabel => '端对端加密';

  @override
  String get brandFeatureE2ee => '基于 Signal Protocol，消息仅在双方设备上可见';

  @override
  String get brandFeatureRealtimeLabel => '实时消息同步';

  @override
  String get brandFeatureRealtime => 'WebSocket 长连接，消息毫秒级送达与同步';

  @override
  String get brandFeatureDeviceTrustLabel => '多设备安全登录';

  @override
  String get brandFeatureDeviceTrust => '多端登录，聊天记录云端同步，随时随地继续对话';

  @override
  String get brandFeatureAiLabel => 'AI 助手在线';

  @override
  String get brandFeatureAi => '内置 AI 助手，支持智能问答、翻译与内容创作';

  @override
  String get seoLoginTitle => '登录 - IM';

  @override
  String get seoLoginDescription => '安全即时通讯，端到端加密登录';

  @override
  String get seoRegisterTitle => '注册 - IM';

  @override
  String get seoRegisterDescription => '创建您的 IM 账户';

  @override
  String get seoChatTitle => '聊天 - IM';

  @override
  String get seoChatDescription => '与好友安全聊天，端到端加密';

  @override
  String get seoContactsTitle => '通讯录 - IM';

  @override
  String get seoContactsDescription => '管理您的联系人';

  @override
  String get seoAddFriendTitle => '添加好友 - IM';

  @override
  String get seoAddFriendDescription => '搜索并添加新朋友';

  @override
  String get seoGroupsTitle => '群组 - IM';

  @override
  String get seoGroupsDescription => '管理和加入群组';

  @override
  String get seoCreateGroupTitle => '创建群组 - IM';

  @override
  String get seoCreateGroupDescription => '创建新的群组聊天';

  @override
  String get seoMomentsTitle => '朋友圈 - IM';

  @override
  String get seoMomentsDescription => '查看好友动态';

  @override
  String get seoMomentsNotificationsTitle => '动态通知 - IM';

  @override
  String get seoMomentsNotificationsDescription => '查看朋友圈互动通知';

  @override
  String get seoSettingsTitle => '设置 - IM';

  @override
  String get seoSettingsDescription => '个性化您的 IM 体验';

  @override
  String get seoProfileTitle => '个人资料 - IM';

  @override
  String get seoProfileDescription => '编辑您的个人资料';

  @override
  String get seoAiSettingsTitle => 'AI 设置 - IM';

  @override
  String get seoAiSettingsDescription => '配置 AI 助手';

  @override
  String get authInvalidCredentials => '用户名或密码错误。';

  @override
  String get authNetworkError => '网络错误，请检查网络连接。';

  @override
  String get authServerError => '服务器错误，请稍后重试。';

  @override
  String get authTooManyRequests => '尝试次数过多，请稍后重试。';

  @override
  String get authUnknownError => '发生未知错误，请重试。';

  @override
  String get seoAppTitle => 'IM - 安全即时通讯';

  @override
  String get seoAppDescription => 'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能';

  @override
  String get errorShareNotAvailable => '当前浏览器不支持分享';

  @override
  String get errorClipboardNotAvailable => '当前浏览器不支持剪贴板';

  @override
  String get errorNotificationPermissionDenied => '通知权限被拒绝';

  @override
  String get errorMicrophonePermissionDenied => '麦克风权限被拒绝';

  @override
  String get errorFileReadFailed => '无法读取文件数据';

  @override
  String e2eeNegotiationNotification(Object name) {
    return '$name 请求与你开启端到端加密';
  }

  @override
  String get chatLoadMoreHistory => '加载更早的消息';

  @override
  String get chatNoMoreHistory => '没有更早的消息了';

  @override
  String get chatSessionNotFoundTitle => '会话不存在';

  @override
  String get chatSessionNotFoundMessage => '该会话不存在或您已无权访问。';

  @override
  String get chatBackToSessions => '返回会话列表';

  @override
  String get chatLoadingConversation => '正在加载会话...';

  @override
  String get chatNoMessages => '暂无消息';

  @override
  String get chatMessagesLoadFailed => '消息加载失败';

  @override
  String get chatMentionUnavailable => '成员列表加载失败，@ 功能暂不可用';

  @override
  String chatMembersLoadFailed(Object error) {
    return '群成员加载失败：$error';
  }

  @override
  String get chatGroupChat => '群聊';

  @override
  String get chatE2eeStartFailed => '开启加密协商失败。';

  @override
  String get chatE2eeAcceptFailed => '接受加密请求失败。';

  @override
  String get chatE2eeEncryptFailed => '消息加密失败，请重新开启加密协商。';

  @override
  String get chatE2eeGroupUnavailable => '群聊端到端加密需要 Sender Key 支持，暂不可用。';

  @override
  String get chatE2eeGroupUnavailableTooltip => '群聊加密不可用';

  @override
  String get joinGroup => '加入群聊';

  @override
  String get joinGroupSearchHint => '搜索群组名称...';

  @override
  String get joinGroupNoResults => '未找到匹配的群组';

  @override
  String get joinGroupInputHint => '输入关键词搜索群组';

  @override
  String joinGroupSuccess(Object name) {
    return '已加入 $name';
  }

  @override
  String get joinGroupError => '加入失败，请重试';

  @override
  String joinGroupMembers(Object count) {
    return '$count 成员';
  }

  @override
  String get joinGroupTooltip => '加入群聊';

  @override
  String get avatarUnsupportedFormat => '仅支持 jpg、png、gif 格式';

  @override
  String get avatarSizeExceeded => '文件大小不能超过 2MB';

  @override
  String get avatarUpdateSuccess => '头像更新成功';

  @override
  String avatarUploadFailed(Object error) {
    return '上传失败：$error';
  }

  @override
  String get settingsDeleteAccount => '删除账号';

  @override
  String get settingsDeleteAccountConfirm => '确定要删除账号吗？';

  @override
  String get settingsDeleteAccountWarning => '删除账号后，所有数据将被永久删除，且无法恢复。';

  @override
  String get settingsDeleteAccountPasswordHint => '请输入密码确认';

  @override
  String get settingsDeleteAccountAcknowledge => '我已了解风险';

  @override
  String get settingsDeleteAccountFailed => '删除失败';

  @override
  String get settingsSecurity => '安全';

  @override
  String get settingsComingSoon => '即将推出';

  @override
  String get verificationCode => '验证码';

  @override
  String get sendVerificationCode => '发送验证码';

  @override
  String get verificationCodeSent => '验证码已发送';

  @override
  String get unsavedChangesTitle => '未保存的更改';

  @override
  String get unsavedChangesMessage => '您有未保存的更改，确定放弃吗？';

  @override
  String get unsavedChangesDiscard => '放弃';

  @override
  String get unsavedChangesKeepEditing => '继续编辑';

  @override
  String get accountTitle => '账号';

  @override
  String get accountProfile => '个人资料';

  @override
  String get accountProfileDesc => '查看头像、昵称和账号信息';

  @override
  String get accountPassword => '密码';

  @override
  String get accountPasswordDesc => '修改登录密码';

  @override
  String get accountLogout => '退出登录';

  @override
  String get accountDelete => '删除账号';

  @override
  String get accountId => 'ID';

  @override
  String get accountPhone => '手机';

  @override
  String get accountEmail => '邮箱';

  @override
  String get appearanceTitle => '外观';

  @override
  String get appearanceTheme => '主题';

  @override
  String get appearanceLanguage => '语言';

  @override
  String get themeLight => '浅色';

  @override
  String get themeDark => '深色';

  @override
  String get themeSystem => '跟随系统';

  @override
  String get notificationTitle => '通知';

  @override
  String get notificationEnable => '启用通知';

  @override
  String get notificationEnableDesc => '接收新消息推送';

  @override
  String get notificationSound => '声音';

  @override
  String get notificationVibrate => '振动';

  @override
  String get securityTitle => '安全';

  @override
  String get securityPrivacy => '隐私';

  @override
  String get securityAddFriend => '允许添加好友';

  @override
  String get securityAddFriendDesc => '允许陌生人发送好友请求';

  @override
  String get securityOnlineStatus => '显示在线状态';

  @override
  String get aiAssistant => 'AI 助手';

  @override
  String get aiComingSoon => '即将推出';

  @override
  String get logoutConfirmTitle => '退出登录';

  @override
  String get logoutConfirmMessage => '确定要退出登录吗？';

  @override
  String get logoutConfirmAction => '退出登录';

  @override
  String get deferredRouteLoadFailed => '页面加载失败';

  @override
  String get deferredRouteUnknownError => '未知错误';
}
