# Mobile UI Copy Audit (XM-05)

> Task: XM-05 - Mobile English Copy Scan Checklist
> Generated: 2026-05-15
> Scope: `frontend/apps/mobile/src/` - React Native mobile app
> Purpose: Identify hardcoded English UI strings for Chinese localization. This document is the checklist only; no source code was modified.

## Scan Summary

| Metric | Value |
|---|---|
| Directories scanned | screens/, components/, app/navigation/, e2ee/, services/notification/ |
| Files scanned | 38 |
| Total English strings found | 156 |
| P0 (core/error) | 60 |
| P1 (settings/profile/labels) | 62 |
| P2 (debug/auxiliary/moments) | 34 |
| Source code modified | **NO** |

## Notes

- **Already Chinese**: `AiSettingsScreen.tsx`, `PrivacySettingsScreen.tsx`, and `e2eeDeferred.ts` are already fully in Chinese. They are excluded from the checklist.
- "Message" is used in 3 different contexts requiring separate i18n keys: chat placeholder ("消息"), add-friend label ("验证消息"), friend-profile button ("发消息").
- "Please try again" appears in 7+ Alert.alert calls across LoginScreen and ChatScreen -- a single shared key suffices.
- "Username" / "Password" appear in both LoginScreen and RegisterScreen -- shared keys.
- "On"/"Off" in SessionInfoScreen should co-translate with Pin/Mute labels.
- Navigator files (AuthNavigator, ChatNavigator, etc.) use `headerShown: false` and contain no visible text.
- `PrimaryButton.tsx`, `TextField.tsx`, `Screen.tsx` receive text via props -- no hardcoded strings.
- Brand names (DeepSeek, OpenAI, MiniMax) in AiSettingsScreen are not translated.
- Technical terms (`?`, `99+`, `AI`, `N/A`, `WebSocket`, `FCM`, `SQLite`) are kept as-is or minimally adapted.

---

## P0 - Core Chat / Login / Error Messages

| # | File | Current English | Suggested Chinese | Notes |
|---|---|---|---|---|
| 1 | `src/screens/auth/LoginScreen.tsx:30` | Login | 登录 | Primary button label |
| 2 | `src/screens/auth/LoginScreen.tsx:30` | Signing in... | 登录中... | Loading state |
| 3 | `src/screens/auth/LoginScreen.tsx:21` | Login failed | 登录失败 | Alert title |
| 4 | `src/screens/auth/LoginScreen.tsx:21` | Please try again | 请重试 | Alert fallback (shared, 7+ uses) |
| 5 | `src/screens/auth/LoginScreen.tsx:28` | Username | 用户名 | TextField label (shared with Register) |
| 6 | `src/screens/auth/LoginScreen.tsx:29` | Password | 密码 | TextField label (shared with Register) |
| 7 | `src/screens/auth/LoginScreen.tsx:31` | Create account | 注册账号 | Navigation button |
| 8 | `src/screens/auth/RegisterScreen.tsx:30` | Register | 注册 | Title + button |
| 9 | `src/screens/auth/RegisterScreen.tsx:25` | Register failed | 注册失败 | Alert title |
| 10 | `src/screens/auth/RegisterScreen.tsx:32` | Nickname | 昵称 | TextField label |
| 11 | `src/screens/auth/RegisterScreen.tsx:33` | Email | 邮箱 | TextField label |
| 12 | `src/screens/auth/RegisterScreen.tsx:34` | Phone | 手机号 | TextField label |
| 13 | `src/screens/auth/RegisterScreen.tsx:37` | Back to login | 返回登录 | Navigation button |
| 14 | `src/screens/chat/ChatScreen.tsx:97` | Chat | 聊天 | Screen title (when no session) |
| 15 | `src/screens/chat/ChatScreen.tsx:97` | No active conversation | 暂无会话 | Empty state |
| 16 | `src/screens/chat/ChatScreen.tsx:39` | Send failed | 发送失败 | Alert title |
| 17 | `src/screens/chat/ChatScreen.tsx:50` | Media failed | 媒体发送失败 | Alert title |
| 18 | `src/screens/chat/ChatScreen.tsx:61` | Camera failed | 拍照失败 | Alert title |
| 19 | `src/screens/chat/ChatScreen.tsx:72` | File failed | 文件发送失败 | Alert title |
| 20 | `src/screens/chat/ChatScreen.tsx:92` | Voice failed | 语音发送失败 | Alert title |
| 21 | `src/screens/chat/ChatScreen.tsx:138` | Send | 发送 | Send button |
| 22 | `src/screens/chat/ChatScreen.tsx:132` | Message | 消息 | TextInput placeholder (context: chat input) |
| 23 | `src/screens/chat/ChatScreen.tsx:132` | E2EE not supported on mobile | 移动端暂不支持端到端加密 | Placeholder when encrypted |
| 24 | `src/screens/chat/ChatScreen.tsx:128` | Voice | 语音 | Voice toggle button |
| 25 | `src/screens/chat/ChatScreen.tsx:128` | Stop | 停止 | Stop recording button |
| 26 | `src/screens/chat/ChatScreen.tsx:125` | Cam | 拍照 | Camera shortcut button |
| 27 | `src/screens/chat/ChatScreen.tsx:126` | File | 文件 | File picker button |
| 28 | `src/screens/chat/ChatScreen.tsx:104` | Info | 详情 | Session info button |
| 29 | `src/screens/chat/SessionListScreen.tsx:22` | Chats | 消息 | Screen title |
| 30 | `src/screens/chat/SessionListScreen.tsx:24` | No conversations | 暂无会话 | Empty state title |
| 31 | `src/screens/chat/SessionListScreen.tsx:24` | Start from Contacts or Groups. | 从通讯录或群组开始聊天。 | Empty state subtitle |
| 32 | `src/screens/contacts/AddFriendScreen.tsx:16` | Add Friend | 添加好友 | Screen title |
| 33 | `src/screens/contacts/AddFriendScreen.tsx:20` | Search | 搜索 | Search button |
| 34 | `src/screens/contacts/AddFriendScreen.tsx:18` | Message | 验证消息 | TextField label (context: friend request) |
| 35 | `src/screens/contacts/AddFriendScreen.tsx:34` | - Add | - 添加 | Search result suffix |
| 36 | `src/screens/contacts/ContactsScreen.tsx:23` | Contacts | 通讯录 | Screen title |
| 37 | `src/screens/contacts/ContactsScreen.tsx:25` | Add | 添加 | Add friend button |
| 38 | `src/screens/contacts/ContactsScreen.tsx:30` | No friends | 暂无好友 | Empty state |
| 39 | `src/screens/contacts/ContactsScreen.tsx:44` | online | 在线 | Status text |
| 40 | `src/screens/contacts/ContactsScreen.tsx:48` | Friend requests | 好友请求 | Navigation button |
| 41 | `src/screens/contacts/FriendRequestsScreen.tsx:18` | Friend Requests | 好友请求 | Screen title |
| 42 | `src/screens/contacts/FriendRequestsScreen.tsx:19` | No requests | 暂无好友请求 | Empty state |
| 43 | `src/screens/contacts/FriendRequestsScreen.tsx:32` | Accept | 同意 | Accept button |
| 44 | `src/screens/contacts/FriendRequestsScreen.tsx:39` | Reject | 拒绝 | Reject button |
| 45 | `src/screens/contacts/FriendProfileScreen.tsx:14` | Friend | 好友资料 | Screen title |
| 46 | `src/screens/contacts/FriendProfileScreen.tsx:14` | No friend selected | 未选择好友 | Fallback text |
| 47 | `src/screens/contacts/FriendProfileScreen.tsx:22` | Message | 发消息 | Chat button (context: friend profile) |
| 48 | `src/screens/contacts/FriendProfileScreen.tsx:32` | Delete friend | 删除好友 | Action button |
| 49 | `src/screens/groups/GroupsScreen.tsx:21` | Groups | 群组 | Screen title |
| 50 | `src/screens/groups/GroupsScreen.tsx:21` | New | 新建 | Create button |
| 51 | `src/screens/groups/GroupsScreen.tsx:22` | No groups | 暂无群组 | Empty state |
| 52 | `src/screens/groups/GroupsScreen.tsx:36` | Join group | 加入群组 | Join button |
| 53 | `src/screens/groups/CreateGroupScreen.tsx:26` | Group created | 群组已创建 | Alert after action |
| 54 | `src/screens/groups/JoinGroupScreen.tsx:32` | - Join | - 加入 | Inline button suffix |
| 55 | `src/screens/groups/AddGroupMembersScreen.tsx:22` | Members added | 成员已添加 | Alert after action |
| 56 | `src/screens/groups/GroupProfileScreen.tsx:14` | No group selected | 未选择群组 | Fallback text |
| 57 | `src/screens/groups/GroupMembersScreen.tsx:21` | No members loaded | 暂无成员 | Empty state |
| 58 | `src/screens/moments/MomentsFeedScreen.tsx:117` | No moments | 暂无动态 | Empty state |
| 59 | `src/screens/moments/MomentDetailScreen.tsx:58` | Deleted | 已删除 | Alert after action |
| 60 | `src/components/common/StateViews.tsx:70` | Network unavailable. Changes will retry when online. | 网络不可用，恢复网络后将自动重试 | Offline banner |

---

## P1 - Settings / Profile / Navigation / Labels

| # | File | Current English | Suggested Chinese | Notes |
|---|---|---|---|---|
| 1 | `src/app/navigation/MainTabs.tsx:22` | Chats | 消息 | Bottom tab label |
| 2 | `src/app/navigation/MainTabs.tsx:23` | Contacts | 通讯录 | Bottom tab label |
| 3 | `src/app/navigation/MainTabs.tsx:24` | Groups | 群组 | Bottom tab label |
| 4 | `src/app/navigation/MainTabs.tsx:26` | Profile | 我的 | Bottom tab label |
| 5 | `src/screens/chat/ChatSearchScreen.tsx:15` | Search Messages | 搜索消息 | Screen title |
| 6 | `src/screens/chat/ChatSearchScreen.tsx:18` | Keyword | 关键词 | TextField label |
| 7 | `src/screens/chat/SessionInfoScreen.tsx:19` | Session Info | 会话详情 | Screen title |
| 8 | `src/screens/chat/SessionInfoScreen.tsx:15` | No session | 无会话 | Fallback text |
| 9 | `src/screens/chat/SessionInfoScreen.tsx:23` | Pin: | 置顶： | Label prefix |
| 10 | `src/screens/chat/SessionInfoScreen.tsx:23` | On | 开启 | Toggle status |
| 11 | `src/screens/chat/SessionInfoScreen.tsx:23` | Off | 关闭 | Toggle status |
| 12 | `src/screens/chat/SessionInfoScreen.tsx:26` | Mute: | 免打扰： | Label prefix |
| 13 | `src/screens/chat/SessionInfoScreen.tsx:29` | Clear history | 清空聊天记录 | Action button |
| 14 | `src/screens/chat/SessionInfoScreen.tsx:32` | History cleared | 聊天记录已清空 | Alert confirmation |
| 15 | `src/screens/chat/GroupReadDetailScreen.tsx:11` | Read Details | 已读详情 | Screen title |
| 16 | `src/screens/chat/GroupReadDetailScreen.tsx:12` | Private chat | 私聊 | Empty state |
| 17 | `src/screens/chat/GroupReadDetailScreen.tsx:12` | Read details only apply to group messages. | 已读详情仅适用于群消息。 | Empty state subtitle |
| 18 | `src/screens/groups/CreateGroupScreen.tsx:15` | Create Group | 创建群组 | Screen title |
| 19 | `src/screens/groups/CreateGroupScreen.tsx:16` | Name | 名称 | Input label |
| 20 | `src/screens/groups/CreateGroupScreen.tsx:17` | Description | 描述 | Input label |
| 21 | `src/screens/groups/CreateGroupScreen.tsx:18` | Member IDs, comma separated | 成员ID，用逗号分隔 | Input label |
| 22 | `src/screens/groups/CreateGroupScreen.tsx:21` | Create | 创建 | Button |
| 23 | `src/screens/groups/JoinGroupScreen.tsx:15` | Join Group | 加入群组 | Screen title |
| 24 | `src/screens/groups/JoinGroupScreen.tsx:17` | Keyword | 关键词 | Input label |
| 25 | `src/screens/groups/JoinGroupScreen.tsx:19` | Search | 搜索 | Button |
| 26 | `src/screens/groups/AddGroupMembersScreen.tsx:15` | Add Members | 添加成员 | Screen title |
| 27 | `src/screens/groups/AddGroupMembersScreen.tsx:16` | Member IDs, comma separated | 成员ID，用逗号分隔 | Input label |
| 28 | `src/screens/groups/AddGroupMembersScreen.tsx:19` | Add | 添加 | Button |
| 29 | `src/screens/groups/GroupProfileScreen.tsx:13` | Group Profile | 群资料 | Screen title |
| 30 | `src/screens/groups/GroupProfileScreen.tsx:15` | members | 人 | Member count unit |
| 31 | `src/screens/groups/GroupProfileScreen.tsx:19` | Leave group | 退出群组 | Action button |
| 32 | `src/screens/groups/GroupMembersScreen.tsx:20` | Group Members | 群成员 | Screen title |
| 33 | `src/screens/profile/ProfileScreen.tsx:15` | Profile | 我的 | Screen title |
| 34 | `src/screens/profile/ProfileScreen.tsx:17` | Email not bound | 邮箱未绑定 | Status indicator |
| 35 | `src/screens/profile/ProfileScreen.tsx:18` | Phone not bound | 手机未绑定 | Status indicator |
| 36 | `src/screens/profile/ProfileScreen.tsx:19` | Edit profile | 编辑资料 | Button |
| 37 | `src/screens/profile/ProfileScreen.tsx:20` | Change password | 修改密码 | Button |
| 38 | `src/screens/profile/ProfileScreen.tsx:21` | Settings | 设置 | Button |
| 39 | `src/screens/profile/ProfileScreen.tsx:23` | Admin logs | 管理日志 | Admin-only link |
| 40 | `src/screens/profile/ProfileScreen.tsx:27` | Logout | 退出登录 | Button |
| 41 | `src/screens/profile/EditProfileScreen.tsx:29` | Edit Profile | 编辑资料 | Screen title |
| 42 | `src/screens/profile/EditProfileScreen.tsx:30` | Nickname | 昵称 | Input label |
| 43 | `src/screens/profile/EditProfileScreen.tsx:31` | Email | 邮箱 | Input label |
| 44 | `src/screens/profile/EditProfileScreen.tsx:32` | Phone | 手机号 | Input label |
| 45 | `src/screens/profile/EditProfileScreen.tsx:33` | Signature | 个性签名 | Input label |
| 46 | `src/screens/profile/EditProfileScreen.tsx:35` | Upload avatar | 上传头像 | Button |
| 47 | `src/screens/profile/EditProfileScreen.tsx:41` | Save | 保存 | Button |
| 48 | `src/screens/profile/EditProfileScreen.tsx:43` | Saved | 已保存 | Alert after action |
| 49 | `src/screens/profile/ChangePasswordScreen.tsx:13` | Change Password | 修改密码 | Screen title |
| 50 | `src/screens/profile/ChangePasswordScreen.tsx:14` | Current password | 当前密码 | Input label |
| 51 | `src/screens/profile/ChangePasswordScreen.tsx:15` | New password | 新密码 | Input label |
| 52 | `src/screens/profile/ChangePasswordScreen.tsx:18` | Save | 保存 | Button |
| 53 | `src/screens/profile/ChangePasswordScreen.tsx:19` | Password changed | 密码已修改 | Alert after action |
| 54 | `src/screens/settings/SettingsScreen.tsx:25` | Settings | 设置 | Screen title |
| 55 | `src/screens/settings/SettingsScreen.tsx:8` | Privacy | 隐私 | Menu item |
| 56 | `src/screens/settings/SettingsScreen.tsx:9` | Notifications | 通知 | Menu item |
| 57 | `src/screens/settings/SettingsScreen.tsx:10` | Language | 语言 | Menu item |
| 58 | `src/screens/settings/SettingsScreen.tsx:11` | Theme | 主题 | Menu item |
| 59 | `src/screens/settings/SettingsScreen.tsx:12` | Storage | 存储 | Menu item |
| 60 | `src/screens/settings/SettingsScreen.tsx:13` | AI Assistant | AI 助手 | Menu item |
| 61 | `src/screens/settings/SettingsScreen.tsx:14` | About | 关于 | Menu item |
| 62 | `src/screens/settings/SettingsScreen.tsx:19` | Debug Diagnostics | 调试诊断 | Menu item (debug only) |

---

## P2 - Moments / Debug / Auxiliary / Low Visibility

| # | File | Current English | Suggested Chinese | Notes |
|---|---|---|---|---|
| 1 | `src/screens/auth/LoginScreen.tsx:26` | IM Mobile | IM 移动版 | App title in header |
| 2 | `src/screens/auth/LoginScreen.tsx:27` | Android-first native client | Android 原生客户端 | Tagline |
| 3 | `src/screens/settings/NotificationSettingsScreen.tsx:11` | Notifications | 通知 | Screen title |
| 4 | `src/screens/settings/NotificationSettingsScreen.tsx:14` | Notifications | 通知 | Toggle label |
| 5 | `src/screens/settings/NotificationSettingsScreen.tsx:22` | Sound | 提示音 | Toggle label |
| 6 | `src/screens/settings/LanguageSettingsScreen.tsx:9` | Language | 语言 | Screen title |
| 7 | `src/screens/settings/ThemeSettingsScreen.tsx:9` | Theme | 主题 | Screen title |
| 8 | `src/screens/settings/ThemeSettingsScreen.tsx:10` | Light | 浅色 | Theme option |
| 9 | `src/screens/settings/ThemeSettingsScreen.tsx:11` | Dark | 深色 | Theme option |
| 10 | `src/screens/settings/ThemeSettingsScreen.tsx:12` | System | 跟随系统 | Theme option |
| 11 | `src/screens/settings/StorageSettingsScreen.tsx:11` | Storage | 存储 | Screen title |
| 12 | `src/screens/settings/StorageSettingsScreen.tsx:13` | Clear cache | 清除缓存 | Button |
| 13 | `src/screens/settings/StorageSettingsScreen.tsx:18` | Cache cleared | 缓存已清除 | Alert confirmation |
| 14 | `src/screens/settings/AboutScreen.tsx:7` | About | 关于 | Screen title |
| 15 | `src/screens/settings/AboutScreen.tsx:8` | @im/mobile Bare React Native Android-first client | @im/mobile 裸 React Native Android 优先客户端 | About text |
| 16 | `src/screens/settings/AboutScreen.tsx:9` | iOS structure exists but Android is the validation target for this phase. | iOS 结构已存在，但本阶段以 Android 为验证目标。 | About text |
| 17 | `src/screens/settings/DebugDiagnosticsScreen.tsx:79` | Debug Diagnostics | 调试诊断 | Screen title |
| 18 | `src/screens/settings/DebugDiagnosticsScreen.tsx:85` | Runtime | 运行时 | Section title |
| 19 | `src/screens/settings/DebugDiagnosticsScreen.tsx:86` | App env | 应用环境 | Label |
| 20 | `src/screens/settings/DebugDiagnosticsScreen.tsx:87` | API base | API 地址 | Label |
| 21 | `src/screens/settings/DebugDiagnosticsScreen.tsx:88` | WS base | WS 地址 | Label |
| 22 | `src/screens/settings/DebugDiagnosticsScreen.tsx:89` | Current user id | 当前用户 ID | Label |
| 23 | `src/screens/settings/DebugDiagnosticsScreen.tsx:89` | Not logged in | 未登录 | Fallback value |
| 24 | `src/screens/settings/DebugDiagnosticsScreen.tsx:93` | Live Status | 实时状态 | Section title |
| 25 | `src/screens/settings/DebugDiagnosticsScreen.tsx:95` | Reconnect attempts | 重连次数 | Label |
| 26 | `src/screens/settings/DebugDiagnosticsScreen.tsx:96` | Pending count | 待处理数量 | Label |
| 27 | `src/screens/settings/DebugDiagnosticsScreen.tsx:97` | SQLite mode | SQLite 模式 | Label |
| 28 | `src/screens/settings/DebugDiagnosticsScreen.tsx:98` | SQLite persistence | SQLite 持久化 | Label |
| 29 | `src/screens/settings/DebugDiagnosticsScreen.tsx:99` | FCM token available | FCM Token 可用 | Label |
| 30 | `src/screens/settings/DebugDiagnosticsScreen.tsx:103` | Recent Errors | 最近错误 | Section title |
| 31 | `src/screens/settings/DebugDiagnosticsScreen.tsx:104` | Last API error | 最近 API 错误 | Label |
| 32 | `src/screens/settings/DebugDiagnosticsScreen.tsx:110` | Last WS error | 最近 WS 错误 | Label |
| 33 | `src/screens/settings/DebugDiagnosticsScreen.tsx:116` | Recent warn/error logs | 最近警告/错误日志 | Label |
| 34 | `src/screens/settings/DebugDiagnosticsScreen.tsx:47` | No recent warnings or errors | 暂无警告或错误 | Empty state |
| 35 | `src/screens/settings/DebugDiagnosticsScreen.tsx:14` | N/A | 无 | Fallback value |
| 36 | `src/screens/settings/DebugDiagnosticsScreen.tsx:121` | Actions | 操作 | Section title |
| 37 | `src/screens/settings/DebugDiagnosticsScreen.tsx:123` | Copy redacted logs | 复制裁剪日志 | Button |
| 38 | `src/screens/settings/DebugDiagnosticsScreen.tsx:126` | Logs copied | 日志已复制 | Alert confirmation |
| 39 | `src/screens/settings/DebugDiagnosticsScreen.tsx:131` | Reconnect WebSocket | 重连 WebSocket | Button |
| 40 | `src/screens/settings/DebugDiagnosticsScreen.tsx:135` | Reconnect triggered | 重连已触发 | Alert confirmation |
| 41 | `src/screens/settings/DebugDiagnosticsScreen.tsx:141` | Retry pending | 重试待处理 | Button |
| 42 | `src/screens/settings/DebugDiagnosticsScreen.tsx:145` | Pending retry triggered | 待处理重试已触发 | Alert confirmation |
| 43 | `src/screens/settings/DebugDiagnosticsScreen.tsx:150` | Clear local cache | 清除本地缓存 | Button |
| 44 | `src/screens/settings/DebugDiagnosticsScreen.tsx:55` | Clear local cache? | 清除本地缓存？ | Alert title |
| 45 | `src/screens/settings/DebugDiagnosticsScreen.tsx:55` | This keeps your login session but removes local cache, pending data, upload tasks, and recent diagnostics. | 将保留登录会话，但会移除本地缓存、待处理数据、上传任务和近期诊断信息。 | Alert message |
| 46 | `src/screens/settings/DebugDiagnosticsScreen.tsx:56` | Cancel | 取消 | Alert button |
| 47 | `src/screens/settings/DebugDiagnosticsScreen.tsx:58` | Continue | 继续 | Alert button |
| 48 | `src/screens/settings/DebugDiagnosticsScreen.tsx:60` | Confirm cache clear | 确认清除缓存 | Alert title |
| 49 | `src/screens/settings/DebugDiagnosticsScreen.tsx:60` | This cannot be undone. Clear local cache now? | 此操作不可撤销，确定清除本地缓存？ | Alert message |
| 50 | `src/screens/settings/DebugDiagnosticsScreen.tsx:63` | Clear | 清除 | Alert destructive button |
| 51 | `src/screens/settings/DebugDiagnosticsScreen.tsx:66` | Local cache cleared | 本地缓存已清除 | Alert confirmation |
| 52 | `src/screens/logs/LogMonitorScreen.tsx:20` | Logs | 日志 | Screen title |
| 53 | `src/screens/logs/LogMonitorScreen.tsx:21` | Admin log permission is not granted. Local app logs are shown. | 未授予管理员日志权限，仅显示本地应用日志。 | Permission notice |
| 54 | `src/screens/moments/CreateMomentScreen.tsx:50` | Create Moment | 发布动态 | Screen title |
| 55 | `src/screens/moments/CreateMomentScreen.tsx:52` | What's on your mind? | 想说点什么？ | TextField placeholder |
| 56 | `src/screens/moments/CreateMomentScreen.tsx:56` | Pick a photo | 选择照片 | Button |
| 57 | `src/screens/moments/CreateMomentScreen.tsx:56` | Photo selected (${files.length}) | 已选择 ${files.length} 张照片 | Button with count |
| 58 | `src/screens/moments/CreateMomentScreen.tsx:17` | Coming soon | 即将推出 | Badge text |
| 59 | `src/screens/moments/CreateMomentScreen.tsx:64` | Multiple photos | 多图发布 | Coming soon feature |
| 60 | `src/screens/moments/CreateMomentScreen.tsx:65` | Video upload | 视频上传 | Coming soon feature |
| 61 | `src/screens/moments/CreateMomentScreen.tsx:66` | Visibility settings | 可见范围设置 | Coming soon feature |
| 62 | `src/screens/moments/CreateMomentScreen.tsx:67` | Add location | 添加位置 | Coming soon feature |
| 63 | `src/screens/moments/CreateMomentScreen.tsx:71` | Publishing... | 发布中... | Loading state |
| 64 | `src/screens/moments/CreateMomentScreen.tsx:71` | Publish | 发布 | Button |
| 65 | `src/screens/moments/CreateMomentScreen.tsx:73` | Cancel | 取消 | Cancel button |
| 66 | `src/screens/moments/CreateMomentScreen.tsx:33` | Empty post | 内容为空 | Alert title |
| 67 | `src/screens/moments/CreateMomentScreen.tsx:33` | Please write something or add a photo. | 请输入内容或添加照片。 | Alert message |
| 68 | `src/screens/moments/CreateMomentScreen.tsx:38` | Published | 已发布 | Alert title |
| 69 | `src/screens/moments/CreateMomentScreen.tsx:38` | Your moment has been shared! | 动态已发布！ | Alert message |
| 70 | `src/screens/moments/CreateMomentScreen.tsx:41` | Error | 错误 | Alert title |
| 71 | `src/screens/moments/CreateMomentScreen.tsx:41` | Failed to publish. Please try again. | 发布失败，请重试。 | Alert message |
| 72 | `src/screens/moments/MomentsFeedScreen.tsx:126` | Moments | 朋友圈 | Screen title |
| 73 | `src/screens/moments/MomentsFeedScreen.tsx:139` | Notifications | 通知 | Header button |
| 74 | `src/screens/moments/MomentsFeedScreen.tsx:140` | Post | 发布 | Header button |
| 75 | `src/screens/moments/MomentsFeedScreen.tsx:93` | Loading more... | 加载更多... | Footer loading |
| 76 | `src/screens/moments/MomentsFeedScreen.tsx:95` | No more moments | 没有更多动态 | Footer end |
| 77 | `src/screens/moments/MomentsFeedScreen.tsx:102` | Loading moments... | 加载动态中... | Empty state loading |
| 78 | `src/screens/moments/MomentsFeedScreen.tsx:107` | Failed to load | 加载失败 | Error title |
| 79 | `src/screens/moments/MomentsFeedScreen.tsx:109` | Retry | 重试 | Error retry button |
| 80 | `src/screens/moments/MomentsFeedScreen.tsx:117` | Be the first to share a moment! | 来发布第一条动态吧！ | Empty state subtitle |
| 81 | `src/screens/moments/MomentsFeedScreen.tsx:118` | Post | 发布 | Empty state action button |
| 82 | `src/screens/moments/MomentsFeedScreen.tsx:43` | Video | 视频 | Media placeholder (1 video) |
| 83 | `src/screens/moments/MomentsFeedScreen.tsx:43` | ${mediaCount} photo${s} | ${mediaCount} 张照片 | Media placeholder |
| 84 | `src/screens/moments/MomentsFeedScreen.tsx:44` | Tap to view | 点击查看 | Media hint |
| 85 | `src/screens/moments/MomentsFeedScreen.tsx:58` | Liked | 已点赞 | Like button (active) |
| 86 | `src/screens/moments/MomentsFeedScreen.tsx:58` | Like | 点赞 | Like button (inactive) |
| 87 | `src/screens/moments/MomentsFeedScreen.tsx:63` | Comments | 评论 | Comments label |
| 88 | `src/screens/moments/MomentDetailScreen.tsx:88` | Moment | 动态 | Screen title |
| 89 | `src/screens/moments/MomentDetailScreen.tsx:51` | Delete Moment | 删除动态 | Alert title |
| 90 | `src/screens/moments/MomentDetailScreen.tsx:51` | Are you sure you want to delete this moment? | 确定要删除这条动态吗？ | Alert message |
| 91 | `src/screens/moments/MomentDetailScreen.tsx:52` | Cancel | 取消 | Alert button |
| 92 | `src/screens/moments/MomentDetailScreen.tsx:54` | Delete | 删除 | Alert destructive button |
| 93 | `src/screens/moments/MomentDetailScreen.tsx:126` | ${post.likeCount} likes | ${post.likeCount} 赞 | Stats row |
| 94 | `src/screens/moments/MomentDetailScreen.tsx:127` | ${post.commentCount} comments | ${post.commentCount} 条评论 | Stats row |
| 95 | `src/screens/moments/MomentDetailScreen.tsx:130` | Delete moment | 删除动态 | Action button |
| 96 | `src/screens/moments/MomentDetailScreen.tsx:135` | Write a comment | 写评论... | TextField label |
| 97 | `src/screens/moments/MomentDetailScreen.tsx:136` | Sending... | 发送中... | Loading state |
| 98 | `src/screens/moments/MomentDetailScreen.tsx:136` | Send comment | 发表评论 | Button |
| 99 | `src/screens/moments/MomentDetailScreen.tsx:141` | Comments | 评论 | Section title |
| 100 | `src/screens/moments/MomentDetailScreen.tsx:143` | Loading comments... | 加载评论中... | Loading state |
| 101 | `src/screens/moments/MomentDetailScreen.tsx:145` | No comments yet | 暂无评论 | Empty state |
| 102 | `src/screens/moments/MomentDetailScreen.tsx:79` | Error | 错误 | Alert title |
| 103 | `src/screens/moments/MomentDetailScreen.tsx:79` | Failed to post comment | 评论发表失败 | Alert message |
| 104 | `src/screens/moments/MomentDetailScreen.tsx:90` | No moment selected | 未选择动态 | Empty state title |
| 105 | `src/screens/moments/MomentDetailScreen.tsx:91` | Go back and select a moment to view | 返回并选择一条动态查看 | Empty state subtitle |
| 106 | `src/screens/moments/MomentDetailScreen.tsx:92` | Go Back | 返回 | Empty state action |
| 107 | `src/screens/moments/MomentsNotificationsScreen.tsx:63` | Notifications | 通知 | Screen title |
| 108 | `src/screens/moments/MomentsNotificationsScreen.tsx:65` | Notification features are being enhanced. Full support coming soon. | 通知功能正在完善中，敬请期待。 | Header notice |
| 109 | `src/screens/moments/MomentsNotificationsScreen.tsx:19` | Loading notifications... | 加载通知中... | Loading state |
| 110 | `src/screens/moments/MomentsNotificationsScreen.tsx:24` | No notifications | 暂无通知 | Empty state title |
| 111 | `src/screens/moments/MomentsNotificationsScreen.tsx:25` | When someone likes or comments on your moments, you'll see it here | 当有人点赞或评论你的动态时，会在这里显示 | Empty state subtitle |
| 112 | `src/screens/moments/MomentsNotificationsScreen.tsx:51` | liked your moment | 赞了你的动态 | Notification text |
| 113 | `src/screens/moments/MomentsNotificationsScreen.tsx:51` | commented on your moment | 评论了你的动态 | Notification text |
| 114 | `src/screens/moments/UserMomentsScreen.tsx:85` | ${userNickname} | ${userNickname} | Screen title (dynamic, OK) |
| 115 | `src/screens/moments/UserMomentsScreen.tsx:67` | Profile coming soon | 个人主页即将上线 | Coming soon badge |
| 116 | `src/screens/moments/UserMomentsScreen.tsx:64` | ${posts.length} moment${s} | ${posts.length} 条动态 | Post count |
| 117 | `src/screens/moments/UserMomentsScreen.tsx:73` | Loading moments... | 加载动态中... | Loading state |
| 118 | `src/screens/moments/UserMomentsScreen.tsx:74` | Failed to load | 加载失败 | Error title |
| 119 | `src/screens/moments/UserMomentsScreen.tsx:74` | Retry | 重试 | Error retry button |
| 120 | `src/screens/moments/UserMomentsScreen.tsx:75` | No moments | 暂无动态 | Empty state title |
| 121 | `src/screens/moments/UserMomentsScreen.tsx:75` | This user hasn't posted anything yet | 该用户还没有发布过动态 | Empty state subtitle |
| 122 | `src/screens/moments/UserMomentsScreen.tsx:79` | Loading more... | 加载更多... | Footer loading |
| 123 | `src/screens/moments/UserMomentsScreen.tsx:80` | No more moments | 没有更多动态 | Footer end |
| 124 | `src/screens/moments/UserMomentsScreen.tsx:98` | ${item.media.length} media file${s} | ${item.media.length} 个媒体文件 | Media count |
| 125 | `src/screens/moments/UserMomentsScreen.tsx:103` | ${item.likeCount} likes | ${item.likeCount} 赞 | Stats |
| 126 | `src/screens/moments/UserMomentsScreen.tsx:104` | ${item.commentCount} comments | ${item.commentCount} 条评论 | Stats |
| 127 | `src/components/chat/SessionRow.tsx:17` | Pinned | 已置顶 | Session flag |
| 128 | `src/components/chat/SessionRow.tsx:18` | Muted | 已免打扰 | Session flag |
| 129 | `src/components/chat/SessionRow.tsx:21` | No messages yet | 暂无消息 | Empty session preview |
| 130 | `src/components/chat/MessageBubble.tsx:56` | Play voice | 播放语音 | Voice message action |
| 131 | `src/components/chat/MessageBubble.tsx:56` | Stop voice | 停止播放 | Voice message action |
| 132 | `src/components/chat/MessageBubble.tsx:71` | Open file | 打开文件 | File message action |
| 133 | `src/components/chat/MessageBubble.tsx:80` | Failed. Tap to retry. | 发送失败，点击重试 | Send failure indicator |
| 134 | `src/components/common/StateViews.tsx:5` | Loading... | 加载中... | Default loading text |
| 135 | `src/components/common/StateViews.tsx:57` | Retry | 重试 | Error retry button (default) |
| 136 | `src/app/navigation/RootNavigator.tsx:19` | Restoring session... | 正在恢复会话... | Session restore loading |
| 137 | `src/services/notification/notificationService.ts:118` | IM Messages | 消息通知 | Android notification channel name |
| 138 | `src/services/notification/notificationService.ts:133` | IM | IM | Notification title fallback |
| 139 | `src/services/notification/notificationService.ts:134` | New notification | 新通知 | Notification body fallback |
| 140 | `src/services/notification/notificationService.ts:208` | Group message | 群消息 | Notification title (group) |
| 141 | `src/services/notification/notificationService.ts:208` | New message | 新消息 | Notification title (private) |
| 142 | `src/services/notification/notificationService.ts:209` | Encrypted message | 加密消息 | Notification body (encrypted) |

---

## Files With No English UI Strings

The following scanned files were confirmed clean (no hardcoded English UI text):

- `src/app/navigation/AuthNavigator.tsx` - headerShown: false
- `src/app/navigation/ChatNavigator.tsx` - headerShown: false
- `src/app/navigation/ContactsNavigator.tsx` - headerShown: false
- `src/app/navigation/GroupsNavigator.tsx` - headerShown: false
- `src/app/navigation/MomentsNavigator.tsx` - headerShown: false
- `src/app/navigation/ProfileNavigator.tsx` - headerShown: false
- `src/app/navigation/navigationRef.ts` - no UI text
- `src/components/common/PrimaryButton.tsx` - receives text via props
- `src/components/forms/TextField.tsx` - receives text via props
- `src/components/common/Screen.tsx` - receives title via props
- `src/e2ee/e2eeDeferred.ts` - already in Chinese
- `src/e2ee/E2eeUnsupportedMessage.tsx` - imports Chinese constants
- `src/e2ee/E2eeUnsupportedNotice.tsx` - imports Chinese constants
- `src/screens/settings/AiSettingsScreen.tsx` - already in Chinese (brand names kept as-is)
- `src/screens/settings/PrivacySettingsScreen.tsx` - already in Chinese
