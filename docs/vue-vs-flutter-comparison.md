# Vue Web vs Flutter Web 功能实现对比分析报告

> 生成日期：2026-05-29
> 分析范围：`frontend/apps/web` (Vue) vs `flutter/apps/web` (Flutter)

---

## 目录

1. [技术栈对比](#一技术栈对比)
2. [路由/页面对比](#二路由页面对比)
3. [功能模块逐项对比](#三功能模块逐项对比)
   - 3.1 [认证模块](#31-认证模块)
   - 3.2 [聊天模块](#32-聊天模块)
   - 3.3 [E2EE 端到端加密](#33-e2ee-端到端加密)
   - 3.4 [联系人/好友模块](#34-联系人好友模块)
   - 3.5 [群组模块](#35-群组模块)
   - 3.6 [朋友圈模块](#36-朋友圈模块)
   - 3.7 [AI 助手模块](#37-ai-助手模块)
   - 3.8 [设置模块](#38-设置模块)
   - 3.9 [实时通信 (WebSocket)](#39-实时通信-websocket)
   - 3.10 [离线与持久化](#310-离线与持久化)
   - 3.11 [移动端/平台适配](#311-移动端平台适配)
4. [API 调用对比](#四api-调用对比)
5. [状态管理对比](#五状态管理对比)
6. [组件清单对比](#六组件清单对比)
7. [架构模式对比](#七架构模式对比)
8. [差异汇总](#八差异汇总)
9. [结论与建议](#九结论与建议)

---

## 一、技术栈对比

| 维度 | Vue Web | Flutter Web | 差异说明 |
|---|---|---|---|
| **框架** | Vue 3 (Composition API) | Flutter + Dart | 完全不同的技术体系 |
| **语言** | TypeScript | Dart | — |
| **状态管理** | Pinia (11 个 Store) | Riverpod (StateNotifier) | 思路相似，API 不同 |
| **路由** | Vue Router | go_router | Flutter 支持声明式路由 + ShellRoute |
| **UI 库** | Element Plus | Material Design | Vue 用了第三方 UI 库 |
| **国际化** | 自定义 i18n (~200+ 键) | Flutter l10n (中/英) | Vue 翻译更丰富 |
| **HTTP 客户端** | Axios + 拦截器 | 自定义 HttpClient + 端口抽象 | Flutter 用了端口模式解耦 |
| **WebSocket** | 原生 WebSocket + 重连 + 心跳 | 自定义 WsClient + 端口抽象 | 架构思路一致 |
| **持久化** | IndexedDB | IndexedDB (idb_shim) + SecureStorage | Flutter 多了安全存储层 |
| **移动端方案** | Capacitor (原生集成) | 无 | Vue 有完整的原生能力 |
| **构建工具** | Vite | Flutter build | — |
| **代码组织** | Feature-first + Store 模块化 | Feature-first + Data/Domain/Presentation 分层 | Flutter 分层更清晰 |

---

## 二、路由/页面对比

### Vue 路由表 (11 个路由)

| 路径 | 路由名称 | 组件 | 权限 |
|---|---|---|---|
| `/` | — | — | 重定向到 `/chat` |
| `/login` | Login | `pages/Login.vue` | 无需认证，已登录隐藏 |
| `/register` | Register | `pages/Register.vue` | 无需认证，已登录隐藏 |
| `/chat` | Chat | `pages/Chat.vue` | 需要认证 |
| `/contacts` | Contacts | `pages/Friends.vue` | 需要认证 |
| `/profile` | Profile | `pages/Profile.vue` | 需要认证 |
| `/settings` | Settings | `pages/Settings.vue` | 需要认证 |
| `/settings/ai` | AiSettings | `pages/AiSettings.vue` | 需要认证 |
| `/admin/logs` | LogMonitor | `pages/LogMonitor.vue` | 需要认证 + `log:read` 权限 |
| `/moments` | Moments | `features/moments/MomentsContainer.vue` | 需要认证 |
| `/moments/user/:userId` | MomentsUserProfile | `features/moments/MomentsUserProfile.vue` | 需要认证 |
| `/:pathMatch(.*)*` | NotFound | `pages/NotFound.vue` | 无需认证 |

### Flutter 路由表 (16 个路由)

| 路由路径 | 名称 | 页面组件 | 说明 |
|---|---|---|---|
| `/login` | login | `LoginPage` | 已登录自动跳转 |
| `/register` | register | `RegisterPage` | 已登录自动跳转 |
| `/debug/gallery` | — | `ComponentGalleryPage` | 仅 kDebugMode |
| `/chat` | chat | `ChatPage` | 支持 `?sessionId=` 查询参数 |
| `/chat/:sessionId` | chatSession | `ChatPage` | 指定会话 |
| `/contacts` | contacts | `ContactsPage` | 联系人列表 |
| `/contacts/add` | contactsAdd | `AddFriendPage` | 添加好友（延迟加载） |
| `/groups` | groups | `GroupListPage` | 群组列表 |
| `/groups/create` | groupsCreate | `CreateGroupPage` | 创建群组（延迟加载） |
| `/moments` | moments | `MomentsMainPage` | 朋友圈主页 |
| `/moments/notifications` | momentsNotifications | `MomentsNotificationsPage` | 朋友圈通知（延迟加载） |
| `/settings` | settings | `SettingsPage` | 设置主页 |
| `/settings/profile` | settingsProfile | `ProfilePage` | 个人资料（延迟加载） |
| `/settings/ai` | settingsAi | `AiSettingsPage` | AI 设置（延迟加载） |
| `/:pathMatch(.*)*` | notFound | `NotFoundPage` | 404 兜底 |

### 路由差异分析

| 页面 | Vue | Flutter | 说明 |
|---|---|---|---|
| 聊天主页 | ✅ | ✅ | 功能一致 |
| 联系人列表 | ✅ | ✅ | 功能一致 |
| 个人资料 | ✅ | ✅ | Vue `/profile`，Flutter `/settings/profile` |
| 设置 | ✅ | ✅ | 功能一致 |
| AI 设置 | ✅ | ✅ | 功能一致 |
| 朋友圈 | ✅ | ✅ | 功能一致 |
| 登录/注册 | ✅ | ✅ | 功能一致 |
| 404 | ✅ | ✅ | 功能一致 |
| **朋友圈用户主页** | ✅ `/moments/user/:userId` | ❌ | **Flutter 缺失** |
| **日志监控** | ✅ `/admin/logs` | ❌ | **Flutter 缺失**（需 `log:read` 权限） |
| **群组列表** | ❌ | ✅ `/groups` | **Flutter 新增**（Vue 无独立页面） |
| **创建群组** | ❌ | ✅ `/groups/create` | **Flutter 新增** |
| **添加好友** | ❌ | ✅ `/contacts/add` | **Flutter 新增**（独立页面） |
| **组件画廊** | ❌ | ✅ `/debug/gallery` | Flutter 调试用 |
| **根路径重定向** | ✅ `/` → `/chat` | ❌ | Flutter 未实现 |

---

## 三、功能模块逐项对比

### 3.1 认证模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 用户登录 | ✅ | ✅ | ✅ 一致 — 均调用 POST 登录接口 |
| 用户注册 | ✅ | ✅ | ✅ 一致 — 均调用 POST 注册接口 |
| Token 刷新 | ✅ | ✅ | ✅ 一致 — 均使用协调模式刷新 |
| 会话恢复 | ✅ | ✅ | ✅ 一致 — 启动时检查 Token 有效性 |
| 权限控制 | ✅ | ✅ | ✅ 一致 — 路由守卫 + permission meta |
| WebSocket 票据 | ✅ | ✅ | ✅ 一致 — 登录后获取 ws-ticket |
| 用户协议弹窗 | ❌ | ✅ | Flutter 新增 — 注册时展示协议 |

**结论**：认证模块逻辑基本一致，Flutter 多了用户协议弹窗。

---

### 3.2 聊天模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 私聊消息收发 | ✅ | ✅ | ✅ 一致 |
| 群聊消息收发 | ✅ | ✅ | ✅ 一致 |
| 文本消息 | ✅ | ✅ | ✅ 一致 |
| 图片消息 | ✅ | ✅ | ✅ 一致 — 均支持上传 + 气泡展示 |
| 文件消息 | ✅ | ✅ | ✅ 一致 |
| 语音消息 | ✅ | ✅ | ✅ 一致 — 均有 VoiceBubble |
| 视频消息 | ✅ | ✅ | ✅ 一致 — 均有 VideoBubble |
| 历史消息加载（页码分页） | ✅ | ✅ | ✅ 一致 |
| 历史消息加载（游标分页） | ✅ | ✅ | ✅ 一致 |
| 已读回执 | ✅ | ✅ | ✅ 一致 |
| 消息状态追踪 | ✅ | ✅ | ✅ 一致 |
| 会话列表 | ✅ | ✅ | ✅ 一致 |
| 消息配置 | ✅ | ✅ | ✅ 一致 |
| **消息撤回** | ✅ `recallMessage` | ❌ | **Flutter 缺失** |
| **消息删除** | ✅ `deleteMessage` | ❌ | **Flutter 缺失** |
| **消息搜索** | ✅ `ChatSearchDialog` | ❌ | **Flutter 缺失** |
| **右键菜单** | ✅ `useContextMenu` | ❌ | **Flutter 缺失** |
| **消息操作（复制/撤回/删除）** | ✅ `useMessageActions` | ❌ | **Flutter 缺失** |
| **音频播放器** | ✅ `useAudioPlayer` | ❌ | **Flutter 缺失**（有 VoiceBubble 但无独立播放器） |
| **语音录制** | ✅ `useVoiceRecorder` | ❌ | **Flutter 缺失** |
| **消息内容解析/渲染** | ✅ `renderMessageTokens` | ❌ | **Flutter 缺失**（可能内联实现） |
| **群消息已读详情** | ✅ `ChatGroupReadDialog` | ❌ | **Flutter 缺失** |
| 离线消息发件箱 (Outbox) | ❌ | ✅ `MessageOutbox` | **Flutter 新增** — IndexedDB 持久化 |
| 文本自动分段发送 | ❌ | ✅ | **Flutter 新增** |
| 消息去重 Pipeline | ❌ | ✅ `MessagePipeline` | **Flutter 新增** |
| 网络状态横幅 | ❌ | ✅ `NetworkStatusBanner` | **Flutter 新增** |
| 加载更多历史按钮 | ❌ | ✅ `LoadMoreHistoryButton` | **Flutter 新增** |
| 消息发送队列 | ✅ `message-send-queue` | ❌ | Vue 用队列，Flutter 用 Outbox 替代 |
| 消息重试 | ✅ `message-retry` | ✅ (Outbox 内置) | 实现方式不同 |

**结论**：聊天模块是差异最大的模块。Flutter 缺失消息撤回/删除/搜索等操作功能，但新增了 Outbox 离线队列。Vue 的消息发送用队列模式，Flutter 用 Outbox 模式，架构思路不同但目标一致。

---

### 3.3 E2EE 端到端加密

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| X3DH 密钥协商 | ✅ `engine/x3dh.ts` | ✅ | ✅ 一致 |
| Double Ratchet 算法 | ✅ `engine/double-ratchet.ts` | ✅ | ✅ 一致 |
| Web Crypto API 原语 | ✅ `engine/crypto-primitives.ts` | ✅ | ✅ 一致 |
| 编解码工具 | ✅ `engine/codec.ts` | ✅ | ✅ 一致 |
| 密钥存储 (IndexedDB) | ✅ `store/key-store.ts` | ✅ `E2eeKeyStore` | ✅ 一致 |
| 会话加密状态存储 | ✅ `store/session-store.ts` | ✅ `E2eeSessionStore` | ✅ 一致 |
| 加密协商（发起） | ✅ `requestEncryption` | ✅ `POST /e2ee/request` | ✅ 一致 |
| 加密协商（接受） | ✅ `acceptEncryption` | ✅ `POST /e2ee/accept` | ✅ 一致 |
| 加密协商（拒绝） | ✅ `rejectEncryption` | ✅ `POST /e2ee/reject` | ✅ 一致 |
| 禁用加密 | ✅ `disableEncryption` | ✅ `POST /e2ee/disable` | ✅ 一致 |
| 待处理协商 | ✅ `getPendingNegotiations` | ✅ `GET /e2ee/pending` | ✅ 一致 |
| 设备心跳 | ✅ `heartbeat` | ✅ `POST /e2ee/heartbeat` | ✅ 一致 |
| OTK 管理 | ✅ | ✅ `otkCount` + `otk` | ✅ 一致 |
| 公钥包上传 | ✅ `uploadBundle` | ✅ `POST /e2ee/bundle` | ✅ 一致 |
| 获取用户公钥包 | ✅ `getBundle` | ✅ `GET /e2ee/bundle/:userId` | ✅ 一致 |
| 加密状态徽章 | ✅ `ChatEncryptionBadge` | ✅ `EncryptionBadge` | ✅ 一致 |
| 加密横幅 | ✅ `ChatEncryptionBanner` | ✅ `EncryptionBanner` | ✅ 一致 |
| 加密设置弹窗 | ✅ `ChatEncryptionDialog` | ✅ `EncryptionDialog` | ✅ 一致 |
| 协商弹窗 | ✅ `ChatE2eeNegotiationDialog` | ✅ `NegotiationDialog` | ✅ 一致 |
| **Sender Key 群聊加密** | ✅ `engine/sender-key.ts` | ❌ | **Flutter 缺失** |
| **群聊加密 API** | ✅ `group-service.ts` (5个接口) | ❌ | **Flutter 缺失** |
| **密钥恢复码** | ✅ `manager/recovery.ts` | ❌ | **Flutter 缺失** |
| **恢复码 salt/备份 API** | ✅ `getSalt` + `uploadBackup` + `getBackup` | ❌ | **Flutter 缺失** |
| **媒体文件加密** | ✅ `engine/media-crypto.ts` + Web Worker | ❌ | **Flutter 缺失** |
| **消息缓冲（乱序处理）** | ✅ `engine/message-buffer.ts` | ❌ | **Flutter 缺失** |
| **设备管理（删除设备）** | ✅ `deleteDevice` | ❌ | **Flutter 缺失** |
| **设备列表查询** | ✅ `getDevices` + `getUserDevices` + `getGroupDevices` | ❌ | **Flutter 缺失** |
| **加密通道 Ping/Pong** | ✅ `manager/channel-ping.ts` | ❌ | **Flutter 缺失** |
| **协商事件发射器** | ✅ `negotiation-events.ts` | ❌ | **Flutter 缺失** |
| **状态事件** | ✅ `status-events.ts` | ❌ | **Flutter 缺失** |
| **设备身份管理** | ✅ `manager/device-identity.ts` | ❌ | **Flutter 缺失** |
| **本地设备密钥管理** | ✅ `manager/local-device.ts` | ❌ | **Flutter 缺失** |
| **待解密消息队列** | ✅ `manager/pending-messages.ts` | ❌ | **Flutter 缺失** |
| **消息解密器** | ✅ `manager/message-decryptor.ts` | ❌ | **Flutter 缺失** |
| **E2EE 运行时** | ✅ `runtime.ts` | ❌ | **Flutter 缺失** |
| **群聊加密弹窗** | ✅ `GroupEncryptionDialog` | ❌ | **Flutter 缺失** |
| **安全面板** | ✅ `SecurityPanel` | ❌ | **Flutter 缺失** |
| 消息锁图标 | ❌ | ✅ `MessageLockIcon` | Flutter 新增 |
| 元数据存储 | ❌ | ✅ `E2eeMetaStore` (SecureStorage) | Flutter 新增 |

**结论**：E2EE 是差距最大的模块。Vue 实现了完整的加密体系（X3DH + Double Ratchet + Sender Key + 媒体加密 + 密钥恢复），Flutter 仅实现了基础的 X3DH + Double Ratchet。**Flutter 缺失约 60% 的 E2EE 功能**。

---

### 3.4 联系人/好友模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 好友列表 | ✅ `getList` | ✅ `GET /friends` | ✅ 一致 |
| 发送好友请求 | ✅ `add` | ✅ `POST /friends/request` | ✅ 一致 |
| 获取好友请求列表 | ✅ `getRequests` | ✅ `GET /friends/requests` | ✅ 一致 |
| 接受好友请求 | ✅ `handleRequest` | ✅ `POST /friends/accept` | ✅ 一致 |
| 拒绝好友请求 | ✅ `handleRequest` | ✅ `POST /friends/reject` | ✅ 一致 |
| 删除好友 | ✅ `delete` | ✅ `DELETE /friends` | ✅ 一致 |
| 修改好友备注 | ✅ `updateRemark` | ✅ `PUT /friends/remark` | ✅ 一致 |
| 搜索用户 | ✅ `search` | ✅ `GET /users/search` | ✅ 一致 |
| 在线状态查询 | ✅ `checkOnlineStatus` | ✅ `POST /users/online-status` | ✅ 一致 |
| 在线状态实时追踪 (WS) | ✅ `WsMessageType.onlineStatus` | ✅ `WsMessageType.onlineStatus` | ✅ 一致 |
| 新好友请求通知 (WS) | ✅ `WsMessageType.friendRequest` | ✅ `WsMessageType.friendRequest` | ✅ 一致 |
| 好友请求被接受通知 (WS) | ✅ `WsMessageType.friendAccepted` | ✅ `WsMessageType.friendAccepted` | ✅ 一致 |
| 好友刷新防抖 | ✅ | ❌ | **Flutter 缺失** |
| 联系人工具栏 | ❌ | ✅ `ContactsToolbar` | Flutter 新增 |

**结论**：联系人模块逻辑高度一致，Flutter 仅缺失好友刷新防抖优化。

---

### 3.5 群组模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 创建群组 | ✅ `POST /groups` | ✅ `POST /groups` | ✅ 一致 |
| 获取群组列表 | ✅ `GET /groups` | ✅ `GET /groups/user/:userId` | ✅ 一致 |
| 获取群成员 | ✅ `POST /groups/members` | ✅ `POST /groups/members` | ✅ 一致 |
| 加入群组 | ✅ `POST /groups/join` | ✅ `POST /groups/:id/join` | ✅ 一致 |
| 退出群组 | ✅ `POST /groups/quit` | ✅ `POST /groups/:id/leave` | ✅ 一致 |
| 搜索群组 | ✅ `GET /groups/search` | ✅ `GET /groups/search` | ✅ 一致 |
| **添加群成员** | ✅ `POST /groups/members/add` | ❌ | **Flutter 缺失** |
| **解散群组** | ✅ `DELETE /groups/:id` | ❌ | **Flutter 缺失** |
| **更新群组信息** | ✅ `PUT /groups/:id` | ❌ | **Flutter 缺失** |
| 加入群组弹窗 | ❌ | ✅ `JoinGroupDialog` | Flutter 新增 |
| 群组列表项组件 | ❌ | ✅ `GroupTile` | Flutter 新增 |

**结论**：群组模块 Flutter 缺失管理类操作（添加成员、解散、更新信息），但新增了独立的群组页面和组件。

---

### 3.6 朋友圈模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| Feed 流（游标分页） | ✅ `getFeed` | ✅ `GET /moments/feed` | ✅ 一致 |
| 发布动态 | ✅ `createPost` | ✅ `POST /moments` | ✅ 一致 |
| 删除动态 | ✅ `deletePost` | ✅ `DELETE /moments/:id` | ✅ 一致 |
| 点赞 | ✅ `likePost` | ✅ `POST /moments/:id/like` | ✅ 一致 |
| 取消点赞 | ✅ `unlikePost` | ✅ `DELETE /moments/:id/like` | ✅ 一致 |
| 获取点赞列表 | ✅ `getLikes` | ✅ `GET /moments/:id/likes` | ✅ 一致 |
| 发表评论 | ✅ `createComment` | ✅ `POST /moments/:id/comments` | ✅ 一致 |
| 删除评论 | ✅ `deleteComment` | ✅ `DELETE /moments/comments/:id` | ✅ 一致 |
| 获取评论列表 | ✅ `getComments` | ✅ `GET /moments/:id/comments` | ✅ 一致 |
| 通知列表 | ✅ `getNotifications` | ✅ `GET /moments/notifications` | ✅ 一致 |
| 标记通知已读 | ✅ `markNotificationsRead` | ✅ `PUT /moments/notifications/read` | ✅ 一致 |
| 可见性设置 | ✅ `MomentsVisibilityPicker` | ✅ `VisibilityPicker` | ✅ 一致 |
| 用户动态列表 | ✅ `getUserPosts` | ✅ `GET /moments/user/:id` | ✅ 一致 |
| 封面组件 | ✅ `MomentsCover` | ✅ `MomentsCover` | ✅ 一致 |
| 图片查看器 | ✅ `MomentsImageViewer` | ✅ (ImageViewer 复用) | ✅ 一致 |
| 发布编辑器 | ✅ `MomentsComposer` | ✅ `MomentsComposerPage` | ✅ 一致 |
| 媒体上传 | ✅ | ✅ `MediaUploadGrid` | ✅ 一致 |
| 位置信息 | ❌ | ✅ | Flutter 新增 |
| 侧边栏 | ❌ | ✅ `MomentsSidebar` | Flutter 新增 |
| 顶部栏 | ❌ | ✅ `MomentsTopbar` | Flutter 新增 |
| 点赞栏 | ✅ `MomentsLikeBar` | ✅ `LikeBar` | ✅ 一致 |
| 评论区 | ✅ `MomentsComments` | ✅ `CommentSection` | ✅ 一致 |

**结论**：朋友圈模块逻辑高度一致，Flutter 新增了位置信息和 UI 组件。

---

### 3.7 AI 助手模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 获取 API Key 列表 | ✅ `listKeys` | ✅ `GET /ai/keys` | ✅ 一致 |
| 创建 API Key | ✅ `createKey` | ✅ `POST /ai/keys` | ✅ 一致 |
| 删除 API Key | ✅ `deleteKey` | ✅ `DELETE /ai/keys/:id` | ✅ 一致 |
| 测试 API Key | ✅ `testKey` | ✅ `POST /ai/keys/:id/test` | ✅ 一致 |
| 获取 AI 设置 | ✅ `getSettings` | ✅ `GET /ai/settings` | ✅ 一致 |
| 更新 AI 设置 | ✅ `updateSettings` | ✅ `PUT /ai/settings` | ✅ 一致 |
| **更新 API Key** | ✅ `updateKey` (PUT) | ❌ | **Flutter 缺失** |
| API Key 卡片 | ❌ | ✅ `ApiKeyCard` | Flutter 新增 |
| 添加 API Key 表单 | ❌ | ✅ `AddApiKeyForm` | Flutter 新增 |

**结论**：AI 模块基本一致，Flutter 缺失更新 API Key 功能。

---

### 3.8 设置模块

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 获取用户设置 | ✅ `getSettings` | ✅ `GET /users/settings` | ✅ 一致 |
| 更新隐私设置 | ✅ `updateSettings(privacy)` | ✅ `PUT /users/settings/privacy` | ✅ 一致 |
| 更新消息设置 | ✅ `updateSettings(message)` | ✅ `PUT /users/settings/message` | ✅ 一致 |
| 更新通用设置 | ✅ `updateSettings(general)` | ✅ `PUT /users/settings/general` | ✅ 一致 |
| 更新个人资料 | ✅ `updateProfile` | ✅ `PUT /users/profile` | ✅ 一致 |
| 修改密码 | ✅ `changePassword` | ✅ `PUT /users/password` | ✅ 一致 |
| 发送手机验证码 | ✅ `sendPhoneCode` | ✅ `POST /users/phone-code` | ✅ 一致 |
| 绑定手机号 | ✅ `bindPhone` | ✅ `POST /users/phone-bind` | ✅ 一致 |
| 发送邮箱验证码 | ✅ `sendEmailCode` | ✅ `POST /users/email-code` | ✅ 一致 |
| 绑定邮箱 | ✅ `bindEmail` | ✅ `POST /users/email-bind` | ✅ 一致 |
| 注销账号 | ✅ `deleteAccount` | ✅ `DELETE /users/account` | ✅ 一致 |
| 主题切换（亮/暗/系统） | ✅ | ✅ | ✅ 一致 |
| 语言切换（中/英） | ✅ | ✅ | ✅ 一致 |
| **缓存清理** | ✅ | ❌ | **Flutter 缺失** |
| 修改密码弹窗 | ❌ | ✅ `PasswordDialog` | Flutter 新增 |
| 绑定手机弹窗 | ❌ | ✅ `BindPhoneDialog` | Flutter 新增 |
| 绑定邮箱弹窗 | ❌ | ✅ `BindEmailDialog` | Flutter 新增 |
| 分段控制器 | ❌ | ✅ `SegmentedControl` | Flutter 新增 |
| 个人资料头图 | ❌ | ✅ `ProfileHero` | Flutter 新增 |

**结论**：设置模块逻辑高度一致，Flutter 仅缺失缓存清理功能，但新增了更多 UI 组件。

---

### 3.9 实时通信 (WebSocket)

| 功能 | Vue | Flutter | 逻辑一致性 |
|---|---|---|---|
| 连接管理 | ✅ `websocket.ts` | ✅ `WsClient` | ✅ 一致 |
| 自动重连 | ✅ | ✅ | ✅ 一致 |
| 心跳 | ✅ | ✅ | ✅ 一致 |
| 消息去重 | ✅ | ✅ | ✅ 一致 |
| 新消息事件 | ✅ `WsMessageType.message` | ✅ `WsMessageType.message` | ✅ 一致 |
| 消息状态变更 | ✅ `WsMessageType.messageStatusChanged` | ✅ `WsMessageType.messageStatusChanged` | ✅ 一致 |
| 已读回执 | ✅ `WsMessageType.readReceipt` | ✅ `WsMessageType.readReceipt` | ✅ 一致 |
| 系统消息 | ✅ `WsMessageType.system` | ✅ `WsMessageType.system` | ✅ 一致 |
| E2EE 协商事件 | ✅ `WsMessageType.e2eeNegotiation` | ✅ `WsMessageType.e2eeNegotiation` | ✅ 一致 |
| 在线状态 | ✅ `WsMessageType.onlineStatus` | ✅ `WsMessageType.onlineStatus` | ✅ 一致 |
| 好友请求 | ✅ `WsMessageType.friendRequest` | ✅ `WsMessageType.friendRequest` | ✅ 一致 |
| 好友接受 | ✅ `WsMessageType.friendAccepted` | ✅ `WsMessageType.friendAccepted` | ✅ 一致 |
| **好友刷新防抖** | ✅ | ❌ | **Flutter 缺失** |
| 连接状态栏 | ✅ `ConnectionStatusBar` | ❌ | Vue 独有 |

**结论**：WebSocket 模块逻辑高度一致，Flutter 仅缺失防抖优化。

---

### 3.10 离线与持久化

| 功能 | Vue | Flutter | 说明 |
|---|---|---|---|
| 消息 IndexedDB 持久化 | ✅ `messageRepo.ts` | ✅ `MessageOutbox` | 实现方式不同 |
| 离线消息同步 | ✅ | ✅ | 一致 |
| 失败消息自动重试 | ✅ `message-retry` | ✅ (Outbox 内置) | Vue 用队列，Flutter 用 Outbox |
| **离线消息发件箱** | ❌ | ✅ `MessageOutbox` | **Flutter 新增** — 独立的持久化队列 |
| **发件箱事件流** | ❌ | ✅ `outboxEventsProvider` | Flutter 新增 |
| **待发送/失败计数** | ❌ | ✅ `outboxPendingCountProvider` | Flutter 新增 |

**结论**：Flutter 的离线支持更完善，有独立的 Outbox 机制。

---

### 3.11 移动端/平台适配

| 功能 | Vue | Flutter | 说明 |
|---|---|---|---|
| **Capacitor 原生集成** | ✅ | ❌ | Vue 独有 |
| **相机/相册** | ✅ (Capacitor) | ❌ | |
| **文件系统** | ✅ (Capacitor) | ❌ | |
| **原生分享** | ✅ (Capacitor) | ✅ (Web Share API) | 实现不同 |
| **网络检测** | ✅ (Capacitor) | ✅ (Web API) | 实现不同 |
| **应用生命周期** | ✅ (Capacitor) | ❌ | |
| **响应式布局（桌面/移动）** | ✅ `DesktopChatLayout` + `MobileChatLayout` | ❌ | Vue 有双布局 |
| **移动端专用组件** | ✅ (5个: MobileChatHeader, MobileChatRoom, MobileContactList, MobileConversationList, MobileTabBar) | ❌ | Vue 独有 |
| **移动端检测** | ✅ `useIsMobile` | ❌ | |
| **键盘弹出适配** | ✅ `useKeyboardInset` | ❌ | |

**结论**：Vue 有完整的移动端原生能力，Flutter Web 完全没有这层适配。

---

## 四、API 调用对比

### 4.1 认证 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| POST 登录 | ✅ | ✅ | 一致 |
| POST 注册 | ✅ | ✅ | 一致 |
| POST 登出 | ✅ | ✅ | 一致 |
| POST Token 刷新 | ✅ | ✅ | 一致 |
| POST WS 票据 | ✅ | ✅ | 一致 |
| GET 用户资料 | ✅ | ✅ | 一致 |

### 4.2 消息 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| GET 会话列表 | ✅ | ✅ | 一致 |
| GET 私聊历史（页码） | ✅ | ✅ | 一致 |
| GET 私聊历史（游标） | ✅ | ✅ | 一致 |
| POST 发送私聊 | ✅ | ✅ | 一致 |
| POST 发送加密私聊 | ✅ | ✅ | 一致 |
| GET 消息配置 | ✅ | ✅ | 一致 |
| POST 标记已读 | ✅ | ✅ | 一致 |
| POST 发送群聊 | ✅ | ✅ | 一致 |
| GET 群聊历史（页码） | ✅ | ✅ | 一致 |
| GET 群聊历史（游标） | ✅ | ✅ | 一致 |
| **POST 撤回消息** | ✅ | ❌ | **Flutter 缺失** |
| **POST 删除消息** | ✅ | ❌ | **Flutter 缺失** |

### 4.3 文件 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| POST 上传图片 | ✅ | ✅ | 一致 |
| POST 上传文件 | ✅ | ✅ | 一致 |
| POST 上传音频 | ✅ | ✅ | 一致 |
| POST 上传视频 | ✅ | ✅ | 一致 |
| **DELETE 删除文件** | ✅ | ❌ | **Flutter 缺失** |

### 4.4 联系人 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| GET 好友列表 | ✅ | ✅ | 一致 |
| GET 好友请求 | ✅ | ✅ | 一致 |
| POST 接受请求 | ✅ | ✅ | 一致 |
| POST 拒绝请求 | ✅ | ✅ | 一致 |
| GET 搜索用户 | ✅ | ✅ | 一致 |
| POST 发送请求 | ✅ | ✅ | 一致 |
| DELETE 删除好友 | ✅ | ✅ | 一致 |
| PUT 修改备注 | ✅ | ✅ | 一致 |
| POST 在线状态 | ✅ | ✅ | 一致 |

### 4.5 群组 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| POST 创建群组 | ✅ | ✅ | 一致 |
| GET 群组列表 | ✅ | ✅ | 一致 |
| POST 群成员列表 | ✅ | ✅ | 一致 |
| POST 加入群组 | ✅ | ✅ | 一致 |
| POST 退出群组 | ✅ | ✅ | 一致 |
| GET 搜索群组 | ✅ | ✅ | 一致 |
| **POST 添加群成员** | ✅ | ❌ | **Flutter 缺失** |
| **DELETE 解散群组** | ✅ | ❌ | **Flutter 缺失** |
| **PUT 更新群组信息** | ✅ | ❌ | **Flutter 缺失** |

### 4.6 朋友圈 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| GET Feed 流 | ✅ | ✅ | 一致 |
| GET 单条动态 | ✅ | ✅ | 一致 |
| POST 创建动态 | ✅ | ✅ | 一致 |
| DELETE 删除动态 | ✅ | ✅ | 一致 |
| POST 添加媒体 | ✅ | ✅ | 一致 |
| GET 用户动态 | ✅ | ✅ | 一致 |
| POST 点赞 | ✅ | ✅ | 一致 |
| DELETE 取消点赞 | ✅ | ✅ | 一致 |
| GET 点赞列表 | ✅ | ✅ | 一致 |
| POST 创建评论 | ✅ | ✅ | 一致 |
| DELETE 删除评论 | ✅ | ✅ | 一致 |
| GET 评论列表 | ✅ | ✅ | 一致 |
| GET 通知列表 | ✅ | ✅ | 一致 |
| PUT 标记通知已读 | ✅ | ✅ | 一致 |

### 4.7 设置 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| GET 用户设置 | ✅ | ✅ | 一致 |
| PUT 更新设置 | ✅ | ✅ | 一致 |
| PUT 更新资料 | ✅ | ✅ | 一致 |
| PUT 修改密码 | ✅ | ✅ | 一致 |
| POST 发送手机验证码 | ✅ | ✅ | 一致 |
| POST 绑定手机 | ✅ | ✅ | 一致 |
| POST 发送邮箱验证码 | ✅ | ✅ | 一致 |
| POST 绑定邮箱 | ✅ | ✅ | 一致 |
| DELETE 注销账号 | ✅ | ✅ | 一致 |

### 4.8 AI API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| GET Key 列表 | ✅ | ✅ | 一致 |
| POST 创建 Key | ✅ | ✅ | 一致 |
| DELETE 删除 Key | ✅ | ✅ | 一致 |
| POST 测试 Key | ✅ | ✅ | 一致 |
| GET AI 设置 | ✅ | ✅ | 一致 |
| PUT 更新 AI 设置 | ✅ | ✅ | 一致 |
| **PUT 更新 Key** | ✅ | ❌ | **Flutter 缺失** |

### 4.9 E2EE API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| POST 上传公钥包 | ✅ | ✅ | 一致 |
| GET 获取公钥包 | ✅ | ✅ | 一致 |
| POST 发送协商请求 | ✅ | ✅ | 一致 |
| POST 接受协商 | ✅ | ✅ | 一致 |
| POST 拒绝协商 | ✅ | ✅ | 一致 |
| POST 禁用加密 | ✅ | ✅ | 一致 |
| GET 待处理协商 | ✅ | ✅ | 一致 |
| POST 设备心跳 | ✅ | ✅ | 一致 |
| GET OTK 数量 | ✅ | ✅ | 一致 |
| POST 补充 OTK | ✅ | ✅ | 一致 |
| **GET 设备列表** | ✅ | ❌ | **Flutter 缺失** |
| **GET 用户设备** | ✅ | ❌ | **Flutter 缺失** |
| **GET 群组设备** | ✅ | ❌ | **Flutter 缺失** |
| **DELETE 删除设备** | ✅ | ❌ | **Flutter 缺失** |
| **GET 恢复码 salt** | ✅ | ❌ | **Flutter 缺失** |
| **POST 上传恢复码备份** | ✅ | ❌ | **Flutter 缺失** |
| **GET 获取恢复码备份** | ✅ | ❌ | **Flutter 缺失** |
| **POST 启用群聊加密** | ✅ | ❌ | **Flutter 缺失** |
| **POST 推送 Sender Key** | ✅ | ❌ | **Flutter 缺失** |
| **GET 获取 Sender Key** | ✅ | ❌ | **Flutter 缺失** |
| **DELETE 删除 Sender Key** | ✅ | ❌ | **Flutter 缺失** |
| **GET 群聊加密状态** | ✅ | ❌ | **Flutter 缺失** |

### 4.10 日志 API

| 接口 | Vue | Flutter | 状态 |
|---|---|---|---|
| **SSE 日志流** | ✅ `/api/logs/stream` | ❌ | **Flutter 缺失** |

### API 统计

| 类别 | Vue 总数 | Flutter 总数 | 缺失数 |
|---|---|---|---|
| 认证 | 6 | 6 | 0 |
| 消息 | 12 | 10 | 2 |
| 文件 | 5 | 4 | 1 |
| 联系人 | 9 | 9 | 0 |
| 群组 | 9 | 6 | 3 |
| 朋友圈 | 14 | 14 | 0 |
| 设置 | 9 | 9 | 0 |
| AI | 7 | 6 | 1 |
| E2EE | 22 | 10 | 12 |
| 日志 | 1 | 0 | 1 |
| **合计** | **94** | **74** | **20** |

---

## 五、状态管理对比

### Vue (Pinia Store)

| Store | 职责 |
|---|---|
| `user` | 用户认证、Token、权限、会话恢复 |
| `chat` | 聊天编排器，聚合 session/message/contact/group |
| `session` | 会话 CRUD、置顶、免打扰、未读计数 |
| `message` | 消息收发、历史加载、搜索、已读、E2EE 解密拦截 |
| `contact` | 好友列表、请求、搜索、备注 |
| `group` | 群组列表、创建、退出 |
| `websocket` | WS 连接、重连、心跳、事件分发 |
| `moments` | 朋友圈 Feed、点赞、通知 |
| `i18n` | 国际化 |
| `user-settings` | 用户设置、密码、绑定、注销 |
| `e2ee` | E2EE 密钥和会话状态 |

### Flutter (Riverpod Providers)

| Provider | 职责 |
|---|---|
| `authStateProvider` | 认证状态 |
| `chatStateProvider` | 聊天状态（含 Outbox） |
| `contactsStateProvider` | 联系人状态 |
| `groupStateProvider` | 群组状态 |
| `momentsFeedProvider` | 朋友圈 Feed |
| `composerProvider` | 发布编辑器 |
| `notificationsProvider` | 朋友圈通知 |
| `momentsInteractionsProvider` | 动态互动（family） |
| `settingsStateProvider` | 用户设置 |
| `profileStateProvider` | 个人资料 |
| `aiSettingsStateProvider` | AI 设置 |
| `e2eeManagerProvider` | E2EE 管理器 |
| `networkStatusProvider` | 网络状态 |
| `errorProvider` | 全局错误 |
| `languageProvider` | 语言 |
| `themeModeProvider` | 主题 |

### 差异

| 维度 | Vue | Flutter |
|---|---|---|
| Store 数量 | 11 | 16+ Provider |
| 消息子模块 | 6 个子模块 (helpers/loading/read/retry/search/send-queue) | 1 个 Notifier + Outbox |
| 聊天编排 | `chat` store 聚合 4 个子 store | `chatStateProvider` 单一 Notifier |
| 离线队列 | 消息发送队列 | MessageOutbox (独立 Provider) |
| E2EE 存储 | key-store + session-store | keyStore + sessionStore + metaStore |
| 网络状态 | 内置在 websocket store | 独立 `networkStatusProvider` |

---

## 六、组件清单对比

### Vue 组件

| 分类 | 组件 |
|---|---|
| AI | AiStatusBadge, HumanHandoffNotice |
| 通用 | ActionSheet, EmptyState, ErrorState, ImageViewer, SkeletonList |
| 布局 | SideNavBar |
| 移动端 | MobileChatHeader, MobileChatRoom, MobileContactList, MobileConversationList, MobileTabBar |
| 安全 | EncryptionBadge, SecurityPanel |
| 状态 | ConnectionStatusBar |
| 聊天 | ChatContainer, ChatComposer, ChatMessageList, ChatMessageItem, ChatSidebarPanel, ChatDialogs, ChatE2eeNegotiationDialog, ChatEncryptionBadge, ChatEncryptionBanner, ChatEncryptionDialog, GroupEncryptionDialog, ChatGroupReadDialog, ChatSearchDialog |
| 朋友圈 | MomentsContainer, MomentsFeed, MomentsPostCard, MomentsComposer, MomentsLikeBar, MomentsComments, MomentsCover, MomentsNotifications, MomentsUserProfile, MomentsImageViewer, MomentsVisibilityPicker |

### Flutter 组件

| 分类 | 组件 |
|---|---|
| 全局 | ValidatedForm, ValidatedFormField, FormErrorBanner |
| 认证 | AgreementDialog, AuthCard, BrandShowcase, DecorativeBackground, GradientButton |
| 聊天 | ChatHeader, MessageBubble, MessageInput, SessionTile, FileBubble, ImageBubble, ImageViewer, VideoBubble, VoiceBubble, NetworkStatusBanner, LoadMoreHistoryButton |
| 联系人 | ContactsToolbar |
| 群组 | GroupTile, JoinGroupDialog |
| 朋友圈 | MediaUploadGrid, VisibilityPicker, PostCard, MediaGrid, LikeBar, CommentSection, MomentsCover, MomentsSidebar, MomentsTopbar |
| 设置 | SettingsNavPanel, SettingsSection, SegmentedControl, ProfileHero, PasswordDialog, BindPhoneDialog, BindEmailDialog, ApiKeyCard, AddApiKeyForm |
| E2EE | EncryptionBadge, EncryptionBanner, EncryptionDialog, NegotiationDialog, MessageLockIcon |
| 调试 | DebugPanel, DebugPanelEntry |

### 组件差异

| Vue 有 / Flutter 无 | Flutter 有 / Vue 无 |
|---|---|
| AiStatusBadge | ValidatedForm / ValidatedFormField |
| HumanHandoffNotice | FormErrorBanner |
| ActionSheet | AgreementDialog |
| EmptyState | AuthCard |
| ErrorState | BrandShowcase |
| SkeletonList | DecorativeBackground |
| SideNavBar | GradientButton |
| MobileChatHeader | ChatHeader |
| MobileChatRoom | MessageBubble |
| MobileContactList | MessageInput |
| MobileConversationList | SessionTile |
| MobileTabBar | FileBubble |
| SecurityPanel | ImageBubble |
| ConnectionStatusBar | VideoBubble |
| ChatContainer | VoiceBubble |
| ChatComposer | NetworkStatusBanner |
| ChatMessageList | LoadMoreHistoryButton |
| ChatMessageItem | ContactsToolbar |
| ChatSidebarPanel | GroupTile |
| ChatDialogs | JoinGroupDialog |
| ChatGroupReadDialog | MediaUploadGrid |
| ChatSearchDialog | PostCard |
| GroupEncryptionDialog | MediaGrid |
| MomentsContainer | SettingsNavPanel |
| MomentsFeed | SettingsSection |
| MomentsPostCard | SegmentedControl |
| MomentsComposer | ProfileHero |
| MomentsComments | PasswordDialog |
| MomentsNotifications | BindPhoneDialog |
| MomentsUserProfile | BindEmailDialog |
| MomentsImageViewer | ApiKeyCard |
| | AddApiKeyForm |
| | MessageLockIcon |
| | DebugPanel |

---

## 七、架构模式对比

### 7.1 代码组织

| 维度 | Vue | Flutter |
|---|---|---|
| 目录结构 | Feature-first | Feature-first + Data/Domain/Presentation |
| 分层 | 组件 + Composables + Store + Service | Data (API/Repository) + Domain (Entities/UseCases) + Presentation (Pages/Widgets/Notifiers) |
| 依赖注入 | 隐式（Store 直接 import） | 显式（Riverpod Provider 注入） |

### 7.2 数据流

| 维度 | Vue | Flutter |
|---|---|---|
| 状态更新 | Store 直接 mutation | StateNotifier + copyWith |
| 异步处理 | async/await in Store actions | async/await in Notifier methods |
| WebSocket 集成 | Store 内部订阅 WS 事件 | Notifier 内部订阅 WS 事件流 |
| 错误处理 | try/catch + error state | try/catch + ErrorState |

### 7.3 平台抽象

| 维度 | Vue | Flutter |
|---|---|---|
| HTTP | Axios 实例 + 拦截器 | HttpClientPort 接口 + WebHttpAdapter |
| WebSocket | 原生 WebSocket + 自定义封装 | WsClientPort 接口 + WebWsAdapter |
| 存储 | localStorage + IndexedDB | StoragePort + SecureStoragePort + WebStorageAdapter |
| 文件选择 | HTML input | FilePickerPort + WebFilePickerAdapter |
| 通知 | 浏览器 Notification API | NotificationPort + WebNotificationAdapter |
| 剪贴板 | navigator.clipboard | ClipboardPort + WebClipboardAdapter |
| 分享 | Web Share API / Capacitor | SharePort + WebShareAdapter |
| 录音 | MediaRecorder | AudioRecorderPort + WebAudioRecorderAdapter |

**结论**：Flutter 的端口/适配器模式更解耦，Vue 直接使用平台 API。

---

## 八、差异汇总

### 8.1 Flutter 缺失的功能（共 25 项）

#### 高优先级（核心功能缺失）

| # | 功能 | 模块 | 影响 |
|---|---|---|---|
| 1 | 消息撤回 | 聊天 | 用户无法撤回已发送消息 |
| 2 | 消息删除 | 聊天 | 用户无法删除消息 |
| 3 | 消息搜索 | 聊天 | 用户无法搜索历史消息 |
| 4 | Sender Key 群聊加密 | E2EE | 群聊无端到端加密 |
| 5 | 密钥恢复码 | E2EE | 用户丢失设备后无法恢复密钥 |
| 6 | 媒体文件加密 | E2EE | 媒体文件未加密传输 |
| 7 | 消息缓冲（乱序处理） | E2EE | 乱序消息可能解密失败 |
| 8 | 设备管理 | E2EE | 用户无法查看/删除已注册设备 |
| 9 | 添加群成员 | 群组 | 无法向已有群组添加新成员 |
| 10 | 解散群组 | 群组 | 群主无法解散群组 |
| 11 | 更新群组信息 | 群组 | 无法修改群名称/头像等 |

#### 中优先级（体验缺失）

| # | 功能 | 模块 | 影响 |
|---|---|---|---|
| 12 | 更新 API Key | AI | 无法编辑已创建的 API Key |
| 13 | 缓存清理 | 设置 | 用户无法手动清理缓存 |
| 14 | 朋友圈用户主页 | 朋友圈 | 无法查看某用户的全部动态 |
| 15 | 语音录制 | 聊天 | 无法录制语音消息 |
| 16 | 音频播放器 | 聊天 | 语音消息播放体验不完整 |
| 17 | 右键菜单 | 聊天 | 桌面端缺少快捷操作菜单 |
| 18 | 消息操作（复制/撤回/删除） | 聊天 | 消息长按/右键操作缺失 |
| 19 | 好友刷新防抖 | 联系人 | 频繁刷新可能造成性能问题 |
| 20 | 删除文件 | 文件 | 无法删除已上传文件 |
| 21 | 群消息已读详情 | 聊天 | 无法查看群消息已读状态 |

#### 低优先级（平台/管理功能）

| # | 功能 | 模块 | 影响 |
|---|---|---|---|
| 22 | SSE 日志监控 | 管理 | 无实时日志查看能力 |
| 23 | Capacitor 原生集成 | 平台 | 无原生能力（相机/文件系统等） |
| 24 | 响应式布局 | UI | 无桌面/移动端自适应 |
| 25 | 移动端专用组件 | UI | 无移动端优化组件 |

### 8.2 Flutter 新增的功能（共 10 项）

| # | 功能 | 模块 | 说明 |
|---|---|---|---|
| 1 | 离线消息发件箱 (Outbox) | 聊天 | IndexedDB 持久化的离线队列 |
| 2 | 文本自动分段发送 | 聊天 | 长文本自动分段 |
| 3 | 消息去重 Pipeline | 聊天 | 独立的消息去重层 |
| 4 | 网络状态横幅 | 聊天 | 网络断开时显示提示 |
| 5 | 加载更多历史按钮 | 聊天 | 手动加载更多历史消息 |
| 6 | 消息锁图标 | E2EE | 加密消息的视觉标识 |
| 7 | 用户协议弹窗 | 认证 | 注册时展示协议 |
| 8 | 独立群组列表页 | 群组 | 独立的群组管理页面 |
| 9 | 独立添加好友页 | 联系人 | 独立的添加好友页面 |
| 10 | 朋友圈 UI 增强 | 朋友圈 | 位置信息、侧边栏、顶部栏 |

### 8.3 逻辑一致性统计

| 模块 | Vue 功能数 | Flutter 功能数 | 一致数 | 缺失数 | 新增数 | 一致性 |
|---|---|---|---|---|---|---|
| 认证 | 6 | 7 | 6 | 0 | 1 | 100% |
| 聊天 | 18 | 15 | 11 | 7 | 4 | 61% |
| E2EE | 27 | 15 | 14 | 13 | 2 | 52% |
| 联系人 | 10 | 10 | 9 | 1 | 1 | 90% |
| 群组 | 9 | 8 | 6 | 3 | 1 | 67% |
| 朋友圈 | 17 | 20 | 17 | 0 | 3 | 100% |
| AI | 7 | 8 | 6 | 1 | 2 | 86% |
| 设置 | 14 | 18 | 13 | 1 | 5 | 93% |
| WebSocket | 12 | 11 | 11 | 1 | 0 | 92% |
| 离线 | 3 | 6 | 3 | 0 | 3 | 100% |
| 平台 | 10 | 0 | 0 | 10 | 0 | 0% |
| **合计** | **133** | **118** | **96** | **37** | **22** | **72%** |

---

## 九、结论与建议

### 9.1 总体评估

Flutter Web 大约实现了 Vue Web **72%** 的功能。

- **核心聊天和社交功能**：基本完整（认证、消息收发、好友、朋友圈）
- **E2EE 安全特性**：差距最大，仅实现约 52%
- **消息管理操作**：缺失撤回、删除、搜索
- **群组管理**：缺失管理类操作
- **平台适配**：完全没有移动端原生能力

### 9.2 实现逻辑一致性

在已实现的功能中，**约 90% 遵循同一套业务逻辑**：
- API 调用端点和参数一致
- 数据流模式相似（Store/Notifier 持有状态，异步操作更新）
- WebSocket 事件处理一致
- 路由守卫逻辑一致

**不一致的地方**：
1. **消息发送架构**：Vue 用发送队列，Flutter 用 Outbox 模式
2. **平台抽象层**：Vue 直接调用 API，Flutter 用端口/适配器模式
3. **状态管理粒度**：Vue 的 chat store 聚合了 4 个子 store，Flutter 用单一 Notifier
4. **组件命名**：命名风格不同但功能对应

### 9.3 建议优先补齐的功能

**第一批（核心安全）**：
1. 消息撤回 + 删除
2. Sender Key 群聊加密
3. 密钥恢复码
4. 设备管理

**第二批（用户体验）**：
5. 消息搜索
6. 语音录制 + 播放
7. 添加/解散群组
8. 朋友圈用户主页

**第三批（完善优化）**：
9. 右键菜单 + 消息操作
10. 缓存清理
11. 响应式布局
