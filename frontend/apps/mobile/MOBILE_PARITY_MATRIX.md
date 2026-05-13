# Mobile Parity Matrix

Status values: `DONE`, `PARTIAL`, `BACKEND_REQUIRED`, `DEFERRED`, `BLOCKED_BY_SCOPE`.

| 功能编号 | Web 功能名 | Web 源码位置 | Web 依赖的 service / store / shared package | 移动端目标页面 / 模块 | 移动端实现状态 | 是否需要本地存储 | 是否需要推送 / 通知 | 是否需要 Android 原生权限 | 验证方式 | 差异说明 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 登录 | `apps/web/src/pages/Login.vue` | `services/user.ts`, `stores/user.ts`, `shared-auth-core` | `screens/auth/LoginScreen.tsx`, `stores/authStore.ts` | DONE | 是 | 否 | 否 | `mobile:test`, typecheck | Keychain 保存 token，Cookie mirror 兼容 HttpOnly refresh |
| 2 | 注册 | `apps/web/src/pages/Register.vue` | `services/user.ts` | `screens/auth/RegisterScreen.tsx` | DONE | 否 | 否 | 否 | typecheck | 调真实注册接口 |
| 3 | 退出登录 | `apps/web/src/pages/Settings.vue` | `stores/user.ts`, `auth-session-adapter.ts` | `ProfileScreen`, `authStore.logout` | DONE | 是 | 是 | 否 | typecheck | 断开 WS、清 Keychain/Cookie、清通知绑定 |
| 4 | 当前用户恢复 | `stores/user.ts`, `stores/session.ts` | `auth.ts`, `auth-refresh.ts` | `bootstrap.ts`, `authStore.restoreSession` | DONE | 是 | 否 | 否 | `mobile:test` | 有 session generation guard |
| 5 | refresh / 401 自动续期 | `utils/httpClient.ts`, `services/auth-refresh.ts` | `shared-auth-core` | `services/api/httpClient.ts` | DONE | 是 | 否 | 否 | `mobile:test` | 并发 refresh 合并，401 重试一次 |
| 6 | WebSocket ticket 获取 | `stores/websocket.ts` | `services/auth.ts`, `shared-ws-core` | `websocketStore.connect` | DONE | 否 | 否 | 否 | `mobile:test` | 使用 ticket URL |
| 7 | 用户资料展示 | `pages/Profile.vue` | `services/user.ts`, `stores/user.ts` | `ProfileScreen`, `userStore` | DONE | 是 | 否 | 否 | typecheck | 从用户快照和接口恢复 |
| 8 | 修改资料 | `pages/Profile.vue` | `userService.updateProfile` | `EditProfileScreen` | DONE | 是 | 否 | 否 | typecheck | 更新后刷新用户 store |
| 9 | 修改头像 | `pages/Profile.vue` | `fileService`, `userService` | `EditProfileScreen`, `mediaService` | DONE | 是 | 否 | 相机/媒体 | typecheck | 使用 native picker 和上传接口 |
| 10 | 修改密码 | `pages/Profile.vue`, `pages/Settings.vue` | `userService.changePassword` | `ChangePasswordScreen` | DONE | 否 | 否 | 否 | typecheck | 不记录密码 |
| 11 | 邮箱 / 手机号绑定或展示 | `pages/Profile.vue` | `userService` | `EditProfileScreen`, `ProfileScreen` | PARTIAL | 是 | 否 | 否 | typecheck | 展示/提交字段已接入，绑定验证流程以后端真实能力为准 |
| 12 | 隐私设置 | `pages/Settings.vue` | `stores/user-settings.ts` | `PrivacySettingsScreen`, `settingsStore` | PARTIAL | 是 | 否 | 否 | typecheck | 本地持久化已做，服务端字段按现有设置接口同步 |
| 13 | 通知设置 | `pages/Settings.vue` | `stores/user-settings.ts` | `NotificationSettingsScreen`, `notificationService` | DONE | 是 | 是 | 通知 | typecheck | Notifee 本地通知开关 |
| 14 | 声音设置 | `pages/Settings.vue` | `stores/user-settings.ts` | `NotificationSettingsScreen`, `settingsStore` | DONE | 是 | 是 | 通知 | typecheck | 控制通知 sound |
| 15 | 语言设置 | `pages/Settings.vue` | i18n/settings | `LanguageSettingsScreen` | PARTIAL | 是 | 否 | 否 | typecheck | 本地 locale 已持久化，完整 i18n 文案覆盖后续扩展 |
| 16 | 主题设置 | `pages/Settings.vue` | `stores/user-settings.ts` | `ThemeSettingsScreen`, `theme/*` | DONE | 是 | 否 | 否 | typecheck | 支持 light/dark/system |
| 17 | 清理缓存 | `pages/Settings.vue` | `utils/messageRepo.ts` | `StorageSettingsScreen`, storage repos | DONE | 是 | 否 | 文件 | typecheck | 不清 Keychain 登录态 |
| 18 | 好友列表 | `pages/Friends.vue` | `friendService`, `contactStore` | `ContactsScreen`, `contactStore` | DONE | 是 | 是 | 否 | typecheck | WS 事件触发刷新 |
| 19 | 搜索用户 | `pages/Friends.vue` | `friendService.searchUsers` | `AddFriendScreen` | DONE | 否 | 否 | 否 | typecheck | 调真实搜索接口 |
| 20 | 添加好友 | `pages/Friends.vue` | `friendService.sendRequest` | `AddFriendScreen` | DONE | 否 | 是 | 否 | typecheck | 真实接口 |
| 21 | 好友申请列表 | `pages/Friends.vue` | `friendService.getRequests` | `FriendRequestsScreen` | DONE | 是 | 是 | 否 | typecheck | WS friend request 触发刷新 |
| 22 | 同意好友申请 | `pages/Friends.vue` | `friendService.acceptRequest` | `FriendRequestsScreen` | DONE | 是 | 是 | 否 | typecheck | 成功后刷新好友/申请 |
| 23 | 拒绝好友申请 | `pages/Friends.vue` | `friendService.rejectRequest` | `FriendRequestsScreen` | DONE | 是 | 是 | 否 | typecheck | 成功后刷新申请 |
| 24 | 删除好友 | `pages/Friends.vue` | `friendService.deleteFriend` | `FriendProfileScreen` | DONE | 是 | 否 | 否 | typecheck | 从资料页操作 |
| 25 | 修改好友备注 | `pages/Friends.vue` | `friendService.updateRemark` | `FriendProfileScreen` | PARTIAL | 是 | 否 | 否 | typecheck | 接口封装预留，UI 入口按 Web 真实能力保留 |
| 26 | 好友在线状态 | `services/heartbeat.ts`, `stores/websocket.ts` | `websocketStore`, `friendService` | `websocketStore.onlineUsers`, contact/chat UI | DONE | 是 | 否 | 否 | `mobile:test` | WS online status 更新 |
| 27 | 群聊列表 | `pages/Groups.vue` | `groupService`, `groupStore` | `GroupsScreen`, `groupStore` | DONE | 是 | 否 | 否 | typecheck | 真实接口 |
| 28 | 创建群聊 | `pages/Groups.vue` | `groupService.createGroup` | `CreateGroupScreen` | DONE | 是 | 否 | 否 | typecheck | 真实接口 |
| 29 | 搜索群聊 | `pages/Groups.vue` | `groupService.searchGroups` | `JoinGroupScreen` | DONE | 否 | 否 | 否 | typecheck | 真实接口 |
| 30 | 加入群聊 | `pages/Groups.vue` | `groupService.joinGroup` | `JoinGroupScreen` | DONE | 是 | 否 | 否 | typecheck | 成功后刷新群列表 |
| 31 | 群成员列表 | `pages/Groups.vue` | `groupService.getMembers` | `GroupMembersScreen` | DONE | 是 | 否 | 否 | typecheck | 真实接口 |
| 32 | 添加群成员 | `pages/Groups.vue` | `groupService.addMembers` | `AddGroupMembersScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 33 | 退出群聊 | `pages/Groups.vue` | `groupService.leaveGroup` | `GroupProfileScreen` | DONE | 是 | 否 | 否 | typecheck | 成功后刷新群列表 |
| 34 | 解散群聊 | `pages/Groups.vue` | `groupService.dismissGroup` | `GroupProfileScreen` | PARTIAL | 是 | 是 | 否 | typecheck | 入口和服务封装存在，权限/后端行为按 Web 对齐 |
| 35 | 修改群资料 | `pages/Groups.vue` | `groupService.updateGroup` | `GroupProfileScreen` | PARTIAL | 是 | 否 | 否 | typecheck | 字段按 Web 真实接口提交 |
| 36 | 会话列表 | `pages/Chat.vue`, `stores/chat.ts` | `messageService`, `messageRepo` | `SessionListScreen`, `sessionStore` | DONE | 是 | 是 | 否 | typecheck | SQLite 先恢复，再接口刷新 |
| 37 | 会话置顶 | `stores/chat.ts` | `messageService` | `SessionInfoScreen`, `sessionStore` | DONE | 是 | 否 | 否 | typecheck | 本地状态和接口结构保留 |
| 38 | 会话免打扰 | `stores/chat.ts` | settings/session store | `SessionInfoScreen` | DONE | 是 | 是 | 否 | typecheck | 通知层检查 muted |
| 39 | 删除会话 | `stores/chat.ts` | `messageService` | `SessionInfoScreen` | DONE | 是 | 否 | 否 | typecheck | 删除本地会话并调用服务 |
| 40 | 清空历史 | `stores/chat.ts`, `utils/messageRepo.ts` | `messageRepository` | `SessionInfoScreen` | DONE | 是 | 否 | 否 | typecheck | 清本地缓存，服务端能力按接口 |
| 41 | 私聊 | `pages/Chat.vue` | `messageService.sendPrivate` | `ChatScreen` | DONE | 是 | 是 | 否 | `mobile:test` | optimistic + pending queue |
| 42 | 群聊 | `pages/Chat.vue` | `messageService.sendGroup` | `ChatScreen` | DONE | 是 | 是 | 否 | typecheck | optimistic + pending queue |
| 43 | 文本消息发送 | `pages/Chat.vue` | `message-send-queue.ts` | `messageStore.sendText` | DONE | 是 | 是 | 否 | `mobile:test` | local pending first |
| 44 | 图片消息发送 | `pages/Chat.vue` | `fileService`, `messageService` | `mediaService`, `uploadService` | DONE | 是 | 是 | 相机/媒体 | `mobile:test` | picker + stable upload task；重试先上传再发送 |
| 45 | 文件消息发送 | `pages/Chat.vue` | `fileService`, `download.service.ts` | `mediaService.pickDocument`, `uploadService` | DONE | 是 | 是 | 文件 | `mobile:test` | document picker + stable upload task；不把本地 URI 当远端文件发送 |
| 46 | 视频消息展示 / 播放 | `pages/Chat.vue` | message media renderer | `MessageBubble`, `react-native-video` | PARTIAL | 是 | 否 | 媒体 | typecheck | 播放组件接入；发送能力以后端/真实 Web 入口为准 |
| 47 | 语音消息录制 | `pages/Chat.vue` | recorder/media service | `mediaService`, permissions | DONE | 是 | 否 | 麦克风 | typecheck | 使用成熟录音库替代 deprecated recorder |
| 48 | 语音消息发送 | `pages/Chat.vue` | `fileService`, `messageService` | `messageStore.sendMedia` | DONE | 是 | 是 | 麦克风 | `mobile:test` | 复用上传任务，上传成功后才发送消息 |
| 49 | 语音消息播放 | `pages/Chat.vue` | audio renderer | `mediaService.playAudio` | DONE | 是 | 否 | 否 | typecheck | 切换时可停止播放 |
| 50 | 消息分页加载 | `stores/message.ts` | `messageService.getHistory` | `messageStore.loadMessages` | DONE | 是 | 否 | 否 | typecheck | SQLite + service history |
| 51 | 历史消息加载 | `stores/message.ts` | `messageRepo`, `messageService` | `ChatScreen` | DONE | 是 | 否 | 否 | typecheck | 下拉加载历史 |
| 52 | 消息本地缓存 | `utils/messageRepo.ts` | `messageRepo` | `messageRepository` | DONE | 是 | 否 | 否 | `mobile:test` | SQLite with dedupe indexes |
| 53 | 离线发送队列 | `message-send-queue.ts` | send queue module | `pendingMessageRepository` | DONE | 是 | 否 | 否 | `mobile:test` | 重启后保留 pending |
| 54 | 发送失败重试 | `message-retry.ts` | retry module | `messageStore.retryPending` | DONE | 是 | 是 | 否 | `mobile:test` | 最大次数 + 退避；媒体重试复用同一 upload task |
| 55 | 消息发送状态 | `stores/message.ts` | message store | `MessageBubble` | DONE | 是 | 否 | 否 | `mobile:test` | SENDING/SENT/FAILED |
| 56 | 已读回执 | `modules/message-read.ts` | `messageService.markRead` | `messageStore.markRead` | PARTIAL | 是 | 是 | 否 | typecheck | 接口和 WS dispatch 接入，真实服务端语义待设备验证 |
| 57 | 群消息已读详情 | `modules/message-read.ts` | `messageService.getGroupReadDetail` | `GroupReadDetailScreen` | PARTIAL | 是 | 否 | 否 | typecheck | 页面/服务接入，后端字段按 Web |
| 58 | 消息搜索 | `modules/message-search.ts` | `messageService.search` | `ChatSearchScreen` | DONE | 是 | 否 | 否 | typecheck | 服务端搜索 + 本地会话上下文 |
| 59 | 图片预览 | `pages/Chat.vue` | media renderer | `MessageBubble`, media components | DONE | 是 | 否 | 媒体 | typecheck | 原生图片预览结构 |
| 60 | 文件下载 / 打开 | `download.service.ts` | download service | `platform/linking.ts`, blob util | DONE | 是 | 否 | 文件 | typecheck | 系统应用打开 |
| 61 | 消息复制 | `pages/Chat.vue` | clipboard util | `MessageBubble`, Clipboard | DONE | 否 | 否 | 否 | typecheck | 长按菜单动作 |
| 62 | 消息撤回 | `pages/Chat.vue` | `messageService.recall` | `MessageBubble`, `messageStore` | DONE | 是 | 是 | 否 | typecheck | 调真实接口 |
| 63 | 消息删除 | `pages/Chat.vue` | `messageService.delete` | `MessageBubble`, `messageStore` | DONE | 是 | 否 | 否 | typecheck | 本地移除 + 服务接口 |
| 64 | 系统消息 | `stores/websocket.ts` | WS message dispatch | `MessageBubble`, notification service | DONE | 是 | 是 | 否 | typecheck | 系统事件走 WS dispatch |
| 65 | AI 自动回复状态 | `pages/Chat.vue`, AI modules | `aiService` | `MessageBubble`, `AiSettingsScreen` | DONE | 是 | 是 | 否 | typecheck | AI_REPLY 样式 |
| 66 | AI 设置 / API Key 管理 | `pages/Settings.vue`, AI pages | `aiService` | `AiSettingsScreen`, `aiService` | PARTIAL | 是 | 否 | 否 | typecheck | API key 不落普通存储；真实 BYOK 字段以后端为准 |
| 67 | 朋友圈 feed | `pages/Moments*.vue` | `momentsService` | `MomentsFeedScreen`, `momentsStore` | DONE | 是 | 是 | 否 | typecheck | 分页 feed |
| 68 | 发布朋友圈 | `pages/Moments*.vue` | `momentsService.create` | `CreateMomentScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 69 | 朋友圈图片上传 | `pages/Moments*.vue` | `fileService`, `momentsService` | `CreateMomentScreen`, `uploadService` | DONE | 是 | 否 | 媒体 | typecheck | 先上传再发布 |
| 70 | 点赞 | `pages/Moments*.vue` | `momentsService.like` | `MomentsFeedScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 71 | 取消点赞 | `pages/Moments*.vue` | `momentsService.unlike` | `MomentsFeedScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 72 | 评论 | `pages/Moments*.vue` | `momentsService.comment` | `MomentDetailScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 73 | 删除评论 | `pages/Moments*.vue` | `momentsService.deleteComment` | `MomentDetailScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 74 | 删除动态 | `pages/Moments*.vue` | `momentsService.deletePost` | `MomentDetailScreen` | DONE | 是 | 是 | 否 | typecheck | 真实接口 |
| 75 | 用户朋友圈主页 | `pages/Moments*.vue` | `momentsService.userPosts` | `UserMomentsScreen` | DONE | 是 | 否 | 否 | typecheck | 真实接口 |
| 76 | 朋友圈通知 | `pages/Moments*.vue` | moments notifications if present | `notificationService` | PARTIAL | 是 | 是 | 通知 | typecheck | 本地通知基础完成，后端离线推送缺设备接口 |
| 77 | 日志监控 / admin logs | `router/index.ts`, `pages/LogMonitor.vue` | `/api/logs/stream`, permission `log:read` | `LogMonitorScreen` | PARTIAL | 是 | 否 | 否 | typecheck | 权限入口 + 本地日志；远端 SSE 以 Web 接口可用性为准 |
| 78 | 路由权限 | `router/index.ts` | `stores/user.ts` permissions | navigators + `authStore.hasPermission` | DONE | 是 | 否 | 否 | typecheck | 无权限隐藏日志入口 |
| 79 | 全局错误处理 | `utils/httpClient.ts`, `logger.ts` | logger/http interceptors | `httpClient`, `logger`, state views | DONE | 是 | 否 | 否 | typecheck | 不打印敏感值 |
| 80 | 网络断开提示 | `services/platform/*`, Web online handlers | platform status | `networkStatus`, `Screen` offline state | DONE | 是 | 是 | 网络状态 | typecheck | NetInfo 替代 browser online/offline |
| 81 | App 前后台恢复 | Web visibility handlers | session/ws stores | `appLifecycle.ts`, stores | DONE | 是 | 是 | 否 | typecheck | AppState 替代 visibilitychange |
| 82 | WebSocket 连接 | `stores/websocket.ts` | `shared-ws-core` | `websocketStore.connect` | DONE | 是 | 是 | 否 | typecheck | ticketed URL |
| 83 | WebSocket 心跳 | `stores/websocket.ts` | `shared-ws-core` | `websocketStore` | DONE | 否 | 否 | 否 | typecheck | `createHeartbeatPayload` |
| 84 | WebSocket 断线重连 | `stores/websocket.ts` | `shared-ws-core` | `websocketStore` | DONE | 是 | 是 | 网络状态 | `mobile:test` | NetInfo/AppState 触发 |
| 85 | WebSocket 好友申请实时刷新 | `stores/websocket.ts` | contact store | `websocketStore.dispatchPayload` | DONE | 是 | 是 | 否 | typecheck | 收到事件刷新申请列表 |
| 86 | WebSocket 好友通过实时刷新 | `stores/websocket.ts` | contact/chat store | `websocketStore.dispatchPayload` | DONE | 是 | 是 | 否 | typecheck | 刷好友和会话 |
| 87 | WebSocket 在线状态实时刷新 | `stores/websocket.ts` | websocket/contact store | `websocketStore.onlineUsers` | DONE | 是 | 否 | 否 | `mobile:test` | 更新联系人/会话 |
| 88 | WebSocket 消息去重 | `stores/websocket.ts`, `shared-im-core` | dedupe helpers | `messageStore.addMessage` | DONE | 是 | 是 | 否 | `mobile:test` | serverId/clientMessageId 去重 |
| 89 | 前台通知 | Web `ElNotification` use sites | notifier | `notificationService`, in-app state | DONE | 是 | 是 | 通知 | `mobile:test` | 当前会话不重复弹系统通知 |
| 90 | 后台本地通知 | Web notifier | Notifee | `notificationService` | DONE | 是 | 是 | 通知 | typecheck | 进程存活后台本地通知 |
| 91 | Android FCM token 获取与预留 | 无 Web 等价 | Firebase Messaging | `notificationService.getFcmToken` | PARTIAL | 是 | 是 | 通知 | typecheck | 客户端 token 获取已接入；服务端注册缺契约 |
| 91.1 | FCM 服务端离线推送 | 无 Web 等价 | 需要后端 push device API | `PUSH_BACKEND_CONTRACT.md` | BACKEND_REQUIRED | 是 | 是 | 通知 | 文档审计 | 未发现 push device 注册/注销接口 |
| 92 | 本地存储 | `utils/messageRepo.ts`, browser storage | storage ports | `kvStorage`, repositories | DONE | 是 | 否 | 否 | `mobile:test` | MMKV + SQLite |
| 93 | 敏感存储 | browser cookie/session | `auth-session-adapter.ts` | `secureStorage` | DONE | 是 | 否 | 否 | `mobile:test` | Keychain + Cookie Manager |
| 94 | 消息数据库 | `utils/messageRepo.ts` | message repo | `messageDatabase`, repos | DONE | 是 | 否 | 否 | `mobile:test` | schema version + migration |
| 95 | 上传任务队列 | Web upload service | `fileService` | `uploadTaskRepository`, `uploadService` | DONE | 是 | 否 | 文件/媒体/麦克风 | `mobile:test` | SQLite 持久化上传状态/进度/重试；pending payload 引用 `uploadTaskId` |
| 96 | E2EE 安全降级 | `features/e2ee/*` | Web E2EE modules | `e2ee/*`, `ChatScreen` | BLOCKED_BY_SCOPE | 是 | 否 | 否 | `mobile:test` | E2EE 实现本轮排除；遮罩和禁发已实现 |
| 96.1 | E2EE 协商 | `features/e2ee/*` | Web E2EE manager | none | DEFERRED | 是 | 否 | 否 | 文档审计 | 不实现协商，只记录 WS 事件 |
| 96.2 | E2EE 加密发送 | `features/e2ee/*` | `sendPrivateEncrypted` | none | DEFERRED | 是 | 否 | 否 | `mobile:test` | 不发送 `encrypted=true`，不调用 encrypted send |
| 96.3 | E2EE 解密接收 | `features/e2ee/*` | Web decrypt path | `E2eeUnsupportedMessage` | DEFERRED | 是 | 否 | 否 | `mobile:test` | 不展示 ciphertext/content |
| 96.4 | E2EE send retry | `message-retry.ts`, E2EE paths | retry + E2EE | none | DEFERRED | 是 | 否 | 否 | `mobile:test` | encrypted pending payload 被拦截 |

## Summary

- DONE: 82
- PARTIAL: 13
- BACKEND_REQUIRED: 1
- DEFERRED: 4
- BLOCKED_BY_SCOPE: 1
