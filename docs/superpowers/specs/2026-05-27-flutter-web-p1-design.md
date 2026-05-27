# Flutter Web P1 功能设计文档

> 日期: 2026-05-27
> 范围: Flutter Web P1 功能补齐（对标 Vue Web）

---

## 一、概述

基于 `docs/vue-web-vs-flutter-web-analysis.md` 的分析，P1 包含 7 项功能。其中 2 项已基本实现（消息发送失败重试、离线消息同步），本文档定义剩余 5 项功能的设计方案。

### 功能清单

| 功能 | 优先级 | 复杂度 | 阶段 |
|------|--------|--------|------|
| E2EE 端到端加密 | P1 | 高 | 阶段 1 |
| 消息已读回执 | P1 | 低 | 阶段 2 |
| 添加好友/搜索用户 | P1 | 中 | 阶段 2 |
| 国际化（i18n） | P1 | 中 | 阶段 2 |
| 移动端响应式适配 | P1 | 中 | 阶段 3 |

### 实施策略

采用**方案 A：E2EE 优先 + 功能并行**：

- **阶段 1**：E2EE 集成（影响核心消息流，先稳定）
- **阶段 2**：已读回执 + 添加好友 + i18n（互相独立，可并行）
- **阶段 3**：移动端适配（需要所有功能就绪后统一适配）

---

## 二、E2EE 端到端加密集成

### 2.1 现状

**已完成**：
- Rust 核心（X3DH + Double Ratchet）在 `flutter/native/rust/src/api/e2ee.rs`
- Flutter Rust Bridge 代码生成在 `packages/core/lib/src/generated/api/e2ee.dart`
- Dart 抽象接口 `E2eeService` 在 `packages/core/lib/src/crypto/e2ee_service.dart`
- 数据模型支持：`Message` 有 `encrypted`、`e2eeDeviceId`、`e2eeEnvelope`、`decryptStatus` 字段
- `E2eeEnvelope` 模型、`E2eeNegotiationPayload` 模型已定义
- `WsMessageType.e2eeNegotiation` 常量已定义

**需要实现**：
- Dart 侧 `E2eeService` 具体实现（调用 FRB）
- 密钥存储（IndexedDB + SecureStorage）
- WebSocket E2EE 协商流程
- 消息发送加密 + 接收解密管线
- 设备注册 + 预密钥管理
- Channel Ping/Pong 验证
- UI 状态显示组件

### 2.2 架构设计

对标 Vue Web 的 7 层架构：

```
┌─────────────────────────────────────────────┐
│  UI Layer                                   │
│  EncryptionBadge, NegotiationDialog,        │
│  EncryptionBanner, MessageEncryptionIcon     │
├─────────────────────────────────────────────┤
│  Integration Layer                          │
│  ChatNotifier (send encrypt / receive decrypt)│
├─────────────────────────────────────────────┤
│  Manager Layer                              │
│  E2eeManager: negotiation, device reg,      │
│  message decryptor, channel ping/pong       │
├─────────────────────────────────────────────┤
│  Service Layer                              │
│  WebE2eeAdapter (FRB bindings)              │
├─────────────────────────────────────────────┤
│  Storage Layer                              │
│  E2eeKeyStore (IndexedDB),                  │
│  E2eeSessionStore (IndexedDB),              │
│  E2eeMetaStore (SecureStorage)              │
├─────────────────────────────────────────────┤
│  API Layer                                  │
│  E2eeApi: /api/keys/*, /api/e2ee/*          │
├─────────────────────────────────────────────┤
│  Core (Rust via FRB)                        │
│  X3DH key agreement + Double Ratchet        │
└─────────────────────────────────────────────┘
```

### 2.3 文件结构

```
packages/core/lib/src/crypto/
  e2ee_service.dart          # 抽象接口（已有）
  e2ee_types.dart            # E2EE 类型定义（会话状态枚举、密钥材料等）

apps/web/lib/features/e2ee/
  data/
    e2ee_api.dart            # HTTP API: 密钥上传/获取、协商请求/接受/拒绝
    e2ee_manager.dart        # 核心管理器
    e2ee_key_store.dart      # IndexedDB 密钥存储
    e2ee_session_store.dart  # IndexedDB 会话状态存储
    e2ee_meta_store.dart     # SecureStorage 临时元数据
    message_decryptor.dart   # 解密调度器（串行队列 + 去重）
    channel_ping.dart        # Channel Ping/Pong 验证
  presentation/
    e2ee_provider.dart       # Riverpod provider（E2EE 状态管理）
    encryption_badge.dart    # 会话级状态徽章
    encryption_banner.dart   # 聊天区顶部状态横幅
    negotiation_dialog.dart  # 协商响应对话框
    encryption_dialog.dart   # 发起加密对话框
    message_lock_icon.dart   # 消息级锁图标

apps/web/lib/adapters/
  web_e2ee_adapter.dart      # E2eeService 实现（调用 FRB）
```

### 2.4 存储层设计

**IndexedDB 存储**（`e2ee_key_store.dart` + `e2ee_session_store.dart`）：
- 数据库名：`e2ee_keys`，版本 3
- 对象存储：
  - `identity`：身份密钥材料（`rustLocalKeyMaterial`）
  - `prekeys`：预密钥对
  - `sessions`：会话状态（v3 信封格式，绑定上下文）
  - `meta`：设备 ID、公钥包
- 使用 `idb_shelf` 包（Flutter Web 兼容的 IndexedDB 封装），回退方案：`dart:indexed_db`（Web 平台原生 API）

**SecureStorage 存储**（`e2ee_meta_store.dart`）：
- 会话状态：`e2ee:status:{sessionId}` → `plaintext|negotiating|encrypted|failed`
- 远程设备 ID：`e2ee:remote_device:{sessionId}`
- 待处理握手：`e2ee:initial_handshake:{sessionId}`
- 验证短语：`e2ee:verify_phrase:{sessionId}`
- 已发布 OTK：`e2ee:otk_published:{deviceId}`
- 设备 ID：`e2ee_device_id`

**状态信封 v3**：
- 绑定 `(userId, localDeviceId, sessionId, remoteUserIdHash, remoteDeviceId)`
- 读取时校验上下文，不匹配则丢弃（触发重新协商）
- remoteUserId 存储为 SHA-256 指纹（前 16 位 hex）

### 2.5 E2eeManager 核心 API

```dart
class E2eeManager {
  /// 初始化管理器
  Future<void> init(String deviceId);

  /// 确保本地设备已注册（生成/补充密钥，上传公钥包）
  Future<void> ensureDeviceRegistered();

  /// 发起 E2EE 协商
  Future<void> initiateNegotiation(String sessionId, String peerId);

  /// 响应 E2EE 协商
  Future<void> respondToNegotiation(
    String sessionId,
    String senderIdentityKey,
    String handshake,
    String requesterId,
    String senderDeviceId,
    String targetDeviceId,
    String verifyPhrase,
  );

  /// 加密消息，返回 E2eeEnvelope
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderUserId,
    required String recipientUserId,
    required String plaintext,
  });

  /// 解密消息
  Future<String?> decryptEnvelope({
    required String sessionId,
    required Map<String, dynamic> envelope,
    required String senderUserId,
  });

  /// 退出加密
  Future<void> exitEncryption(String sessionId);

  /// 清理资源
  void dispose();
}
```

### 2.6 协商流程

**发起方流程**：
1. 用户点击"启用加密" → `initiateNegotiation(sessionId, peerId)`
2. 重置之前的协商状态
3. 调用 `/api/e2ee/disable` 清除服务端旧状态
4. 设置本地状态为 `"negotiating"`
5. 调用 `ensureDeviceRegistered()`
6. 调用 `/api/keys/bundle/{userId}` 获取对方预密钥包
7. 备份现有会话状态
8. 调用 FRB `x3dhInitiate()` 创建出站 X3DH 会话
9. 持久化会话状态到 IndexedDB
10. 生成 6 位验证短语，保存到 SecureStorage
11. 保存待处理握手到 SecureStorage
12. 调用 `/api/e2ee/request` 发送协商请求（含握手、身份公钥、设备 ID、验证短语）

**响应方流程**：
1. WS 收到 `E2EE_NEGOTIATION` 事件（action=request）
2. 解析 `requestPayloadJson`：握手、senderIdentityKey、senderDeviceId、targetDeviceId、verifyPhrase
3. 显示 `NegotiationDialog`
4. 用户点击"接受"：
   - 校验设备 ID
   - 备份现有会话
   - 调用 FRB `x3dhRespond()` 创建入站 X3DH 会话
   - 标记 OTK 已消费
   - 持久化会话状态到 IndexedDB
   - 保存验证短语
   - 设置状态为 `"encrypted"`
   - 调用 `/api/e2ee/accept` 确认
5. 用户点击"拒绝"：调用 `/api/e2ee/reject`

### 2.7 消息流集成

**发送路径**（修改 `chat_provider.dart` 的 `sendMessage`）：

```dart
Future<Message?> sendMessage(String receiverId, String content, ...) async {
  // 检查加密状态
  final status = await _e2eeMetaStore.getSessionStatus(sessionId);
  if (status == 'negotiating') {
    // 阻止发送，提示用户
    return null;
  }

  String? e2eeEnvelopeJson;
  if (status == 'encrypted' || session.encrypted == true) {
    final envelope = await _e2eeManager.encryptToEnvelope(
      sessionId: sessionId,
      senderUserId: _currentUserId(),
      recipientUserId: receiverId,
      plaintext: content,
    );
    e2eeEnvelopeJson = jsonEncode(envelope);
    // 本地存储明文用于显示
    // HTTP 请求只发送加密信封，不发送明文
  }

  // ... 原有 optimistic send 逻辑 ...
}
```

**接收路径**（修改 `_handleIncomingMessage`）：

```dart
void _handleIncomingMessage(Map<String, dynamic> data) {
  try {
    var message = Message.fromJson(data);
    if (!_pipeline.shouldProcess(message.id)) return;

    // 解密
    if (message.encrypted == true && message.e2eeEnvelope != null) {
      final plaintext = await _e2eeManager.decryptEnvelope(
        sessionId: sessionId,
        envelope: message.e2eeEnvelope!.toJson(),
        senderUserId: message.senderId,
      );
      if (plaintext != null) {
        message = message.copyWith(content: plaintext);
      }
    }

    final sessionKey = message.isGroupChat ? message.groupId! : message.senderId;
    addMessage(sessionKey, message);
  } catch (e) {
    print('Failed to handle incoming message: $e');
  }
}
```

**解密调度器**（`message_decryptor.dart`）：
- 每会话串行队列（`Map<String, Queue<Future>>`）防止 Double Ratchet 状态损坏
- 每消息去重缓存（500 条 LRU）
- 解密失败自愈：无会话且无握手 → 触发 `initiateNegotiation()`
- 跳过自己的消息（`decryptStatus == "skipped_own"`）

### 2.8 Channel Ping/Pong

```dart
class ChannelPing {
  /// 启动 ping 定时器（每 30 分钟）
  void start(String sessionId, String verifyPhrase);

  /// 处理收到的 ping
  Future<void> handleIncomingPing(String content, String sessionId, String senderId);

  /// 处理收到的 pong
  void handleIncomingPong(String content, String sessionId);

  /// 停止
  void stop();
}
```

流程：
- 协商完成 → 3 秒延迟后发送首次 ping
- 每 30 分钟发送 `E2EE_PING|{phrase}|{timestamp}`（加密消息）
- 对方回复 `E2EE_PONG|{phrase}|{timestamp}`
- 验证短语不匹配或 30 秒超时 → 退出加密，重置为明文，通知服务端

### 2.9 设备注册 + 预密钥管理

```dart
Future<void> ensureDeviceRegistered() async {
  final keyMaterial = await _keyStore.getKeyMaterial();
  if (keyMaterial == null) {
    // 生成新密钥
    final bundle = await _e2eeService.generateKeyBundle(100);
    // 上传公钥包到服务端
    await _e2eeApi.uploadBundle(bundle);
    // 保存到 IndexedDB
    await _keyStore.saveKeyMaterial(bundle);
    // 清除所有现有会话（新密钥使旧棘轮失效）
    await _sessionStore.clearAll();
  } else {
    // 发送心跳
    await _e2eeApi.heartbeat();
    // OTK 不足 20 个时补充
    final remaining = await _e2eeApi.getOtkCount();
    if (remaining < 20) {
      await _e2eeApi.replenishOtk();
    }
  }
}
```

### 2.10 UI 组件

**EncryptionBadge**（会话级状态徽章）：
- `encrypted`：绿色 + 锁图标 + "端到端加密已启用"
- `negotiating`：琥珀色 + 旋转加载 + "正在协商加密"
- `failed`：红色 + 锁图标 + "端到端加密异常"
- `plaintext`：灰色 + 锁图标 + "未启用端到端加密"

**MessageEncryptionIcon**（消息级锁图标）：
- 加密消息右下角显示小锁图标
- 悬停提示"此消息已端到端加密"

**EncryptionBanner**（聊天区顶部横幅）：
- `negotiating`：琥珀色，"加密协商中..."
- `encrypted`：绿色，"端到端加密已开启" + "详情"/"退出加密" 链接
- `failed`：红色，"端到端加密异常" + "清理状态" 链接

**NegotiationDialog**（协商响应对话框）：
- 显示请求者名称、Signal Protocol 特性说明
- "接受" / "拒绝" 按钮

**EncryptionDialog**（发起加密对话框）：
- 显示 Signal Protocol 信息和功能说明
- "确认" 按钮触发 `initiateNegotiation()`

---

## 三、消息已读回执

### 3.1 现状

**已完成**：
- `chat_provider.dart:126` 已处理 `READ_RECEIPT` WS 事件（将消息标记为 READ）
- `message_bubble.dart:147` 已有 `_statusIcon` 区分 SENT/DELIVERED/READ
- `message_api.dart` 已有 `markRead(conversationId)` API

### 3.2 需要补充

1. **区分已读/已送达颜色**：
   - 当前 READ 和 DELIVERED 都用 `Icons.done_all`，颜色相同
   - 修改：READ 状态使用蓝色 `Colors.blue`，DELIVERED 使用默认灰色

2. **自动发送已读回执**：
   - 进入会话时自动调用 `markRead`
   - 新消息到达且当前在该会话 → 自动 `markRead`
   - 修改 `setActiveSession()` 和 `_handleIncomingMessage()`

3. **群聊已读列表**（可选）：
   - 长按消息弹出已读成员列表

### 3.3 实现方案

**修改 `message_bubble.dart`**：
```dart
IconData _statusIcon(String status) {
  switch (status) {
    case 'READ': return Icons.done_all;  // 蓝色
    case 'DELIVERED': return Icons.done_all;  // 灰色
    case 'SENT': return Icons.check;
    case 'SENDING': return Icons.access_time;
    default: return Icons.access_time;
  }
}

// 在 Row 中添加颜色区分
Icon(
  _statusIcon(message.status),
  size: 14,
  color: message.status == 'READ'
      ? Colors.blue
      : theme.colorScheme.onPrimary.withAlpha(170),
)
```

**修改 `chat_provider.dart`**：
```dart
void setActiveSession(String sessionId) {
  state = state.copyWith(activeSessionId: sessionId);
  // 自动发送已读回执
  markRead(sessionId);
}

void _handleIncomingMessage(Map<String, dynamic> data) {
  // ... 现有逻辑 ...
  final sessionKey = message.isGroupChat ? message.groupId! : message.senderId;
  addMessage(sessionKey, message);

  // 如果当前正在查看该会话，自动标记已读
  if (state.activeSessionId == sessionKey) {
    markRead(sessionKey);
  }
}
```

---

## 四、添加好友/搜索用户

### 4.1 现状

- `contacts_api.dart` 已有：`getFriends`, `getFriendRequests`, `accept`, `reject`
- 端点已定义：`/friend/request`, `/friend/accept`, `/friend/reject`
- 缺少：搜索用户 API + 发送好友申请 API + UI

### 4.2 新增 API 方法

**修改 `contacts_api.dart`**：
```dart
/// 搜索用户
Future<List<User>> searchUsers(String keyword) async {
  final response = await _httpClient.get('/user/search', queryParameters: {'keyword': keyword});
  return (response['data'] as List).map((e) => User.fromJson(e)).toList();
}

/// 发送好友申请
Future<void> sendFriendRequest(String targetUserId, {String? reason}) async {
  await _httpClient.post('/friend/request', data: {
    'targetUserId': targetUserId,
    if (reason != null) 'reason': reason,
  });
}
```

### 4.3 新增页面

**`features/contacts/presentation/add_friend_page.dart`**：

```
┌─────────────────────────────────┐
│ ← 添加好友                      │
├─────────────────────────────────┤
│ [🔍 搜索用户名或昵称...    ]    │
├─────────────────────────────────┤
│ 搜索结果：                      │
│ ┌─────────────────────────────┐ │
│ │ 👤 用户A    @userA   [添加] │ │
│ │ 👤 用户B    @userB   [已发] │ │
│ │ 👤 用户C    @userC   [好友] │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- 搜索框：实时搜索（防抖 500ms）
- 搜索结果：头像、昵称、用户名
- 按钮状态："添加" / "已发送" / "已是好友"
- 空状态："未找到用户"

### 4.4 入口

**修改 `contacts_page.dart`**：
- 右上角添加 `IconButton(icon: Icon(Icons.person_add))`
- 点击导航到 `/contacts/add`

**修改 `app_router.dart`**：
- 添加路由：`GoRoute(path: 'contacts/add', builder: ...)` under the contacts shell route

---

## 五、国际化（i18n）

### 5.1 技术方案

使用 Flutter 官方 `intl` + `.arb` 文件方案。

### 5.2 配置文件

**`l10n.yaml`**（项目根目录）：
```yaml
arb-dir: lib/l10n
template-arb-file: app_zh.arb
output-localization-file: app_localizations.dart
```

**`pubspec.yaml`**（`apps/web`）：
```yaml
flutter:
  generate: true
```

### 5.3 ARB 文件结构

**`lib/l10n/app_zh.arb`**（中文，模板）：
```json
{
  "@@locale": "zh",
  "appTitle": "IM 即时通讯",
  "navChat": "聊天",
  "navContacts": "联系人",
  "navGroups": "群组",
  "navMoments": "朋友圈",
  "navSettings": "设置",
  "loginTitle": "登录",
  "loginUsername": "用户名",
  "loginPassword": "密码",
  "loginButton": "登录",
  "loginNoAccount": "没有账号？",
  "loginRegister": "注册",
  "chatSend": "发送",
  "chatSearch": "搜索",
  "chatNoSessions": "暂无会话",
  "contactsSearch": "搜索联系人",
  "contactsNoFriends": "暂无好友",
  "contactsAddFriend": "添加好友",
  "contactsFriendRequests": "好友请求",
  "contactsAccept": "接受",
  "contactsReject": "拒绝",
  "confirm": "确认",
  "cancel": "取消",
  "loading": "加载中...",
  "retry": "重试",
  "noData": "暂无数据",
  "e2eeEncrypted": "端到端加密已启用",
  "e2eeNegotiating": "正在协商加密",
  "e2eeFailed": "端到端加密异常",
  "e2eePlaintext": "未启用端到端加密",
  "e2eeMessageEncrypted": "此消息已端到端加密",
  "e2eeAccept": "接受加密",
  "e2eeReject": "拒绝加密",
  "e2eeExit": "退出加密",
  "e2eeInitiate": "启用端到端加密",
  "settingsLanguage": "语言",
  "settingsTheme": "主题",
  "settingsLogout": "退出登录",
  "settingsEditProfile": "编辑资料"
}
```

**`lib/l10n/app_en.arb`**（英文）：
```json
{
  "@@locale": "en",
  "appTitle": "IM Messenger",
  "navChat": "Chat",
  "navContacts": "Contacts",
  "navGroups": "Groups",
  "navMoments": "Moments",
  "navSettings": "Settings",
  "loginTitle": "Login",
  "loginUsername": "Username",
  "loginPassword": "Password",
  "loginButton": "Login",
  "loginNoAccount": "Don't have an account?",
  "loginRegister": "Register",
  "chatSend": "Send",
  "chatSearch": "Search",
  "chatNoSessions": "No conversations",
  "contactsSearch": "Search contacts",
  "contactsNoFriends": "No friends",
  "contactsAddFriend": "Add Friend",
  "contactsFriendRequests": "Friend Requests",
  "contactsAccept": "Accept",
  "contactsReject": "Reject",
  "confirm": "Confirm",
  "cancel": "Cancel",
  "loading": "Loading...",
  "retry": "Retry",
  "noData": "No data",
  "e2eeEncrypted": "End-to-end encryption enabled",
  "e2eeNegotiating": "Negotiating encryption...",
  "e2eeFailed": "Encryption error",
  "e2eePlaintext": "Encryption not enabled",
  "e2eeMessageEncrypted": "This message is end-to-end encrypted",
  "e2eeAccept": "Accept encryption",
  "e2eeReject": "Reject encryption",
  "e2eeExit": "Exit encryption",
  "e2eeInitiate": "Enable end-to-end encryption",
  "settingsLanguage": "Language",
  "settingsTheme": "Theme",
  "settingsLogout": "Logout",
  "settingsEditProfile": "Edit Profile"
}
```

### 5.4 MaterialApp 配置

**修改 `app.dart`**：
```dart
MaterialApp.router(
  // ... 现有配置 ...
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  locale: ref.watch(localeProvider), // 从设置中读取
)
```

### 5.5 语言切换

**修改 `settings_page.dart`**：
- 添加语言切换选项：中文 / English
- 使用 `localeProvider` 管理当前语言
- 切换后持久化到 SecureStorage

### 5.6 字符串提取策略

按模块逐步提取：
1. 导航栏 + 通用（确认/取消/加载）→ 优先级最高
2. 登录/注册页面
3. 聊天页面
4. 联系人页面
5. 群组页面
6. 朋友圈页面
7. 设置页面
8. E2EE 相关

---

## 六、移动端响应式适配

### 6.1 断点系统

```dart
class Breakpoints {
  static const double mobile = 600;
  static const double tablet = 900;
}

enum ScreenSize { mobile, tablet, desktop }

ScreenSize getScreenSize(double width) {
  if (width < Breakpoints.mobile) return ScreenSize.mobile;
  if (width < Breakpoints.tablet) return ScreenSize.tablet;
  return ScreenSize.desktop;
}
```

### 6.2 布局策略

| 断点 | 导航方式 | 内容区 |
|------|---------|--------|
| Mobile (< 600px) | BottomNavigationBar | 全屏页面 |
| Tablet (600-900px) | 折叠 NavigationRail（仅图标） | 内容区 |
| Desktop (> 900px) | 展开 NavigationRail（图标+文字） | 三栏布局 |

### 6.3 移动端组件

**MobileTabBar**（底部导航栏）：
- 5 个 tab：聊天、联系人、群组、朋友圈、设置
- 使用 `BottomNavigationBar` 或 `NavigationBar`
- 当前选中项高亮

**MobileChatPage**：
- 全屏显示聊天内容
- AppBar 显示对方名称 + 返回按钮
- 消息输入框在底部
- 键盘弹出时自动调整布局

**MobileConversationList**：
- 全屏会话列表
- 顶部搜索框
- 左滑删除/置顶

### 6.4 路由适配

**修改 `app_router.dart`**：
```dart
ShellRoute(
  builder: (context, state, child) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenSize = getScreenSize(constraints.maxWidth);
        if (screenSize == ScreenSize.mobile) {
          return MobileShell(child: child);  // BottomNavigationBar
        } else {
          return DesktopShell(child: child); // NavigationRail
        }
      },
    );
  },
  routes: [/* 现有路由 */],
)
```

### 6.5 触摸优化

- 增大点击区域（最小 48dp）
- 添加滑动手势（左滑删除消息、下拉加载历史）
- 消息长按弹出操作菜单（复制、撤回、删除）
- 输入框支持多行自适应

---

## 七、依赖项

### 新增依赖

| 包 | 用途 | 阶段 |
|---|------|------|
| `idb_shelf` | Flutter Web IndexedDB 访问 | 阶段 1 |
| `crypto` | SHA-256 指纹计算 | 阶段 1 |
| `intl` | 已有依赖，i18n 框架 | 阶段 2 |
| `flutter_localizations` | Flutter 本地化支持 | 阶段 2 |

### 已有依赖（无需新增）

- `flutter_rust_bridge`：FRB 绑定
- `flutter_secure_storage`：安全存储
- `dio`：HTTP 客户端
- `go_router`：路由
- `flutter_riverpod`：状态管理
- `freezed_annotation`：数据模型

---

## 八、测试策略

### E2EE 测试
- 单元测试：E2eeManager 各方法（mock FRB + mock 存储）
- 集成测试：协商流程端到端（发起 → 响应 → 加密 → 解密）
- Rust 核心已有测试覆盖

### 已读回执测试
- 单元测试：`_handleReadReceipt` 状态更新
- Widget 测试：READ 状态图标颜色

### 添加好友测试
- 单元测试：搜索 API、发送申请 API
- Widget 测试：搜索结果列表、按钮状态

### i18n 测试
- 验证所有页面字符串可翻译
- 验证语言切换后 UI 更新

### 移动端适配测试
- Widget 测试：不同断点下的布局
- 集成测试：移动端导航流程

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| FRB 在 Web 平台性能 | E2EE 加解密延迟 | Web 平台不支持 Isolate，使用 `Future.microtask` + 进度指示器，或分片处理 |
| IndexedDB 兼容性 | 密钥存储失败 | 使用 `idb_shelf` 包，提供 SecureStorage 回退 |
| E2EE 协商竞态 | 双方同时发起协商 | 服务端仲裁 + 本地状态机 |
| i18n 字符串遗漏 | 部分文本未翻译 | 逐模块提取 + 代码审查 |
| 移动端键盘遮挡 | 输入框被键盘覆盖 | 使用 `Scaffold.resizeToAvoidBottomInset` |
