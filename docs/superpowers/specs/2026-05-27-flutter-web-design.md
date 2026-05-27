# Flutter Web 端设计文档

## 概述

以现有 Vue 3 Web 端为基础，搭建 Flutter Web 端，最终完全替代 Vue Web 前端。采用 Feature-First 分层架构，Rust 负责 E2EE + 归一化 + 消息处理，Dart 负责 HTTP/WS/UI。项目位于根目录 `flutter/`，支持未来 Flutter Desktop 复用代码。

## 决策汇总

| 决策 | 选择 | 理由 |
|------|------|------|
| 定位 | 完全替代 Vue Web 端 | 统一技术栈 |
| 共享包 | Dart 重写 | 语言壁垒，无法直接复用 TypeScript |
| E2EE | flutter_rust_bridge 复用 e2ee-core | 避免重写复杂加密算法 |
| 后端 | 对接现有 api-server-rs | API 契约不变 |
| 项目位置 | 根目录 `flutter/` | 独立于 frontend/ 目录 |
| 状态管理 | Riverpod | Flutter 生态最成熟 |
| UI | Material 3 | 快速搭建，风格统一 |
| WebSocket | Dart 原生 | 直接用浏览器 API |
| 架构 | Feature-First + Ports & Adapters | 支持桌面端代码复用 |

## 整体架构

### 项目结构

```
flutter/
├── packages/                    # 可跨平台复用的包
│   ├── core/                    # 平台无关的核心逻辑
│   │   ├── lib/
│   │   │   ├── network/         # HTTP/WS 接口定义 + 通用逻辑
│   │   │   ├── storage/         # 存储接口定义
│   │   │   ├── crypto/          # E2EE 桥接接口
│   │   │   ├── models/          # 数据模型（对应 shared-types）
│   │   │   ├── contracts/       # API 端点常量（对应 shared-api-contract）
│   │   │   ├── normalizers/     # 数据归一化（对应 shared-normalizers）
│   │   │   ├── auth/            # 认证核心逻辑（对应 shared-auth-core）
│   │   │   ├── im/              # IM 核心逻辑（对应 shared-im-core）
│   │   │   ├── ws/              # WS 核心逻辑（对应 shared-ws-core）
│   │   │   └── utils/           # 工具函数（对应 shared-utils）
│   │   └── pubspec.yaml
│   │
│   └── ui/                      # 共享 UI 组件（Material 3）
│       ├── lib/
│       │   ├── widgets/         # 通用组件
│       │   ├── theme/           # 主题
│       │   └── layouts/         # 布局组件
│       └── pubspec.yaml
│
├── apps/
│   ├── web/                     # Flutter Web 应用
│   │   ├── lib/
│   │   │   ├── main.dart
│   │   │   ├── app.dart
│   │   │   ├── adapters/        # Web 平台适配器
│   │   │   │   ├── web_storage_adapter.dart
│   │   │   │   ├── web_http_adapter.dart
│   │   │   │   ├── web_ws_adapter.dart
│   │   │   │   └── web_notification_adapter.dart
│   │   │   └── features/        # 功能模块（引用 packages/core）
│   │   │       ├── auth/
│   │   │       ├── chat/
│   │   │       ├── contacts/
│   │   │       ├── e2ee/
│   │   │       ├── moments/
│   │   │       └── settings/
│   │   └── pubspec.yaml
│   │
│   └── desktop/                 # 未来 Flutter Desktop 应用
│       ├── lib/
│       │   ├── adapters/        # Desktop 平台适配器
│       │   └── features/        # 复用相同的功能模块代码
│       └── pubspec.yaml
│
├── native/rust/                 # flutter_rust_bridge E2EE 代码
│   ├── Cargo.toml
│   └── src/
│
└── pubspec.yaml                 # workspace 根配置
```

### 架构分层

```
┌─ Dart View 层 ─────────────────────────────────────┐
│  UI 组件 / 路由 / Riverpod 状态展示                 │
│  调用 Service API → 渲染                            │
└──────────────────┬─────────────────────────────────┘
                   │ flutter_rust_bridge
┌─ Rust Service 层 ─────────────────────────────────┐
│  E2EE (e2ee-core): X3DH、Double Ratchet、信封编解码 │
│  数据归一化: DTO → 前端模型转换                      │
│  消息处理: 去重、排序、会话管理                      │
└────────────────────────────────────────────────────┘

┌─ Dart Service 层 ─────────────────────────────────┐
│  HTTP 客户端 (Dio): 拦截器链（Auth、Error、Log）    │
│  WebSocket: 连接管理、心跳、重连、事件分发           │
│  存储: 安全存储 + 本地存储                          │
└────────────────────────────────────────────────────┘
```

### 依赖方向

```
features/ → packages/core (接口 + 逻辑)
         → packages/ui (组件)
         → adapters/ (运行时注入)
```

功能模块本身是平台无关的，只有 adapters 层是平台特定的。未来 Flutter Desktop 只需实现自己的 `adapters/`，功能模块代码完全复用。

## 网络层设计

### HTTP 客户端

```dart
// packages/core/lib/network/http_client.dart
abstract class HttpClientPort {
  Future<ApiResponse<T>> get<T>(String path, {Map<String, dynamic>? query});
  Future<ApiResponse<T>> post<T>(String path, {dynamic body});
  Future<ApiResponse<T>> put<T>(String path, {dynamic body});
  Future<ApiResponse<T>> delete<T>(String path);
}

// apps/web/lib/adapters/web_http_adapter.dart
class WebHttpClient implements HttpClientPort {
  // 基于 dio，Web 端使用 BrowserHttpClientAdapter
}
```

**拦截器链**：
1. **Auth 拦截器** — 注入 Authorization header，自动刷新 token（401 时排队重试）
2. **Error 拦截器** — 统一错误处理，toast 提示
3. **Logging 拦截器** — 请求/响应日志

### WebSocket 客户端

```dart
// packages/core/lib/network/ws_client.dart
abstract class WsClientPort {
  Stream<WsEvent> get events;
  Future<void> connect(String url);
  Future<void> disconnect();
  void send(WsMessage message);
}

// apps/web/lib/adapters/web_ws_adapter.dart
class WebWsClient implements WsClientPort {
  // 基于 dart:html WebSocket
}
```

**WS 事件处理管线**：
```
WebSocket 消息 → parsePayload → classifyEvent → 去重 → 分发
                                                  ↓
                                    chatProvider / contactProvider / e2eeProvider
```

**心跳**：每 30 秒发送 heartbeat，超时自动重连，指数退避。

### API 端点常量

```dart
// packages/core/lib/contracts/api_endpoints.dart
class AuthEndpoints {
  static const parse = '/auth/parse';
  static const refresh = '/auth/refresh';
  static const wsTicket = '/auth/ws-ticket';
}
// ... 对应 shared-api-contract 的所有端点
```

## 状态管理设计

### Riverpod 状态架构

```
┌─ UI Layer ──────────────────────────────────────┐
│  ChatPage → ref.watch(chatProvider)             │
│  ContactsPage → ref.watch(contactsProvider)     │
└──────────────┬──────────────────────────────────┘
               │
┌─ State Layer (Riverpod Providers) ─────────────┐
│  chatProvider (StateNotifier<ChatState>)        │
│    ├── messages: Map<sessionId, List<Message>>  │
│    ├── sessions: List<ChatSession>              │
│    └── unreadCounts: Map<sessionId, int>        │
│                                                 │
│  contactsProvider (StateNotifier<ContactsState>)│
│    ├── friends: List<User>                      │
│    └── friendRequests: List<FriendRequest>      │
│                                                 │
│  authProvider (StateNotifier<AuthState>)        │
│    ├── user: User?                              │
│    └── token: String?                           │
│                                                 │
│  wsProvider (StreamProvider<WsEvent>)           │
│    └── 连接状态 + 事件流                        │
│                                                 │
│  e2eeProvider (StateNotifier<E2eeState>)        │
│    └── sessionStates: Map<sessionId, Status>    │
└──────────────┬──────────────────────────────────┘
               │
┌─ Service Layer ────────────────────────────────┐
│  AuthRepository (Dart) → HTTP API              │
│  MessageRepository (Dart) → HTTP + Rust 归一化  │
│  WsService (Dart) → WebSocket 事件流           │
│  RustService (bridge) → E2EE + 归一化 + 去重   │
└────────────────────────────────────────────────┘
```

### 数据流：发送消息

```
1. 用户输入 → MessageInput widget
2. 调用 chatProvider.sendMessage(text, sessionId)
3. Provider 调用 rustService.encrypt() (如果 E2EE)
4. Provider 调用 messageApi.send() (HTTP POST)
5. 乐观更新：立即添加到本地消息列表
6. WS 推送确认 → 更新消息状态 (sent → delivered)
```

### 数据流：接收消息

```
1. WsService.stream 收到 WS 消息
2. wsProvider 分发事件
3. chatProvider 处理消息事件：
   a. rustService.dedupKey() 去重
   b. 如果 E2EE → rustService.decrypt()
   c. rustService.normalizeMessage() 归一化
   d. 更新 messages 状态
4. UI 自动刷新（ref.watch 触发重建）
```

## E2EE 集成设计

### Rust 侧结构

```
native/rust/
├── Cargo.toml
│   dependencies:
│     flutter_rust_bridge: 2.x
│     e2ee-core (path: ../../backend/e2ee-core)
│     serde, bincode
└── src/
    ├── api/
    │   ├── identity.rs        # 密钥生成、设备注册
    │   ├── session.rs         # Session 创建、导出、恢复
    │   ├── encrypt.rs         # 加密
    │   ├── decrypt.rs         # 解密
    │   └── normalizer.rs      # 数据归一化（消息、会话、用户）
    ├── frb_generated.rs       # flutter_rust_bridge 自动生成
    └── lib.rs
```

### Dart 侧桥接

```dart
// packages/core/lib/crypto/e2ee_service.dart
class E2eeService {
  final RustLib _rust;

  // 密钥管理
  Future<PreKeyBundle> generatePreKeyBundle() => _rust.generatePreKeyBundle();
  Future<void> saveKeyMaterial(KeyMaterial keys) => _rust.saveKeys(keys);

  // Session 管理
  Future<SessionResult> createOutboundSession(RemoteBundle bundle) =>
      _rust.createOutboundSession(bundle: bundle);
  Future<SessionResult> createInboundSession(Handshake handshake) =>
      _rust.createInboundSession(handshake: handshake);

  // 加解密
  Future<EncryptedEnvelope> encrypt(String sessionId, String plaintext) =>
      _rust.encrypt(sessionId: sessionId, plaintext: utf8.encode(plaintext));
  Future<String> decrypt(String sessionId, EncryptedEnvelope envelope) =>
      _rust.decrypt(sessionId: sessionId, ciphertext: envelope.wire);
}
```

### Rust Service 接口

```dart
// flutter_rust_bridge 暴露给 Dart 的 API
class RustService {
  // E2EE
  Future<PreKeyBundle> generatePreKeyBundle(LocalKeyMaterial keys);
  Future<SessionResult> createOutboundSession(RemoteBundle bundle);
  Future<Uint8List> encrypt(String sessionId, Uint8List plaintext);
  Future<Uint8List> decrypt(String sessionId, Uint8List ciphertext);

  // 归一化
  Message normalizeMessage(RawMessageDTO raw);
  ChatSession normalizeSession(RawConversationDTO raw);

  // 消息处理
  String dedupKey(Message msg);
  List<Message> sortMessages(List<Message> msgs);
}
```

### 存储策略

| 数据 | Web 存储 | Desktop 存储 |
|------|---------|-------------|
| Session 状态 | IndexedDB | SQLite / 文件 |
| 密钥材料 | IndexedDB (加密) | 系统 Keychain |
| device_id | localStorage | 配置文件 |

存储通过 `packages/core` 的 `StoragePort` 接口抽象，各平台适配器实现。

## 路由与导航

### 路由配置（GoRouter）

```dart
final appRouter = GoRouter(
  initialLocation: '/chat',
  redirect: authGuard,
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
    GoRoute(path: '/register', builder: (_, __) => const RegisterPage()),
    ShellRoute(
      builder: (_, __, child) => MainLayout(child: child),
      routes: [
        GoRoute(path: '/chat', builder: (_, __) => const ChatPage()),
        GoRoute(path: '/chat/:sessionId', builder: (_, state) => ChatDetailPage(sessionId: state.pathParameters['sessionId']!)),
        GoRoute(path: '/contacts', builder: (_, __) => const ContactsPage()),
        GoRoute(path: '/moments', builder: (_, __) => const MomentsPage()),
        GoRoute(path: '/settings', builder: (_, __) => const SettingsPage()),
      ],
    ),
  ],
);
```

### 布局结构

```
┌─────────────────────────────────────────────┐
│ MainLayout                                  │
│ ┌──────┬──────────────────────────────────┐ │
│ │      │                                  │ │
│ │ 侧边 │        内容区域                   │ │
│ │ 导航 │   (ChatPage / ContactsPage /     │ │
│ │      │    MomentsPage / SettingsPage)   │ │
│ │      │                                  │ │
│ └──────┴──────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**响应式**：Web 端默认桌面布局（侧边栏 + 内容），窄屏自动切换为移动端布局（底部导航）。

## 功能模块映射

### 页面映射

| 功能 | Vue 组件/Store | Flutter 对应 |
|------|---------------|-------------|
| 登录/注册 | `Login.vue` + `userStore` | `LoginPage` + `authProvider` |
| 聊天列表 | `Chat.vue` + `chatStore.sessionStore` | `ChatPage` + `chatProvider.sessions` |
| 消息详情 | `ChatContainer.vue` + `messageStore` | `ChatDetailPage` + `chatProvider.messages` |
| 消息输入 | `MessageEditor.vue` | `MessageInput` widget |
| 联系人 | `Friends.vue` + `contactStore` | `ContactsPage` + `contactsProvider` |
| 朋友圈 | `MomentsContainer.vue` + `momentsStore` | `MomentsPage` + `momentsProvider` |
| 设置 | `Settings.vue` + `userSettingsStore` | `SettingsPage` + `settingsProvider` |
| E2EE 协商 | `ChatE2eeNegotiationDialog.vue` | `E2eeNegotiationDialog` widget |
| 文件上传 | `FileUpload` component | `FileUpload` widget |

### 消息类型支持

| 类型 | Vue 组件 | Flutter Widget |
|------|---------|---------------|
| TEXT | `MessageText` | `MessageTextBubble` |
| IMAGE | `MessageImage` | `MessageImageBubble` |
| FILE | `MessageFile` | `MessageFileBubble` |
| VIDEO | `MessageVideo` | `MessageVideoBubble` |
| VOICE | `MessageVoice` | `MessageVoiceBubble` |
| SYSTEM | `MessageSystem` | `MessageSystemBubble` |
| AI_REPLY | `MessageAiReply` | `MessageAiReplyBubble` |

## 错误处理

| 层 | 错误类型 | 处理方式 |
|---|---------|---------|
| HTTP | 网络错误、4xx/5xx | 拦截器统一处理，toast 提示 |
| WebSocket | 连接断开 | 自动重连（指数退避），UI 显示连接状态 |
| E2EE | 解密失败、协商失败 | 分类处理，UI 弹窗提示 |
| 业务 | 权限不足、资源不存在 | 全局错误码映射，统一提示 |

## 测试策略

| 层 | 测试类型 | 工具 |
|---|---------|------|
| Rust Service | 单元测试 | `cargo test` |
| Dart Provider | 单元测试 | `flutter_test` + `mockito` |
| Widget | Widget 测试 | `flutter_test` |
| 集成 | E2E 测试 | `integration_test` |
| 归一化 | 快照测试 | 对比 Vue 端输出 |

## 关键依赖

| 包 | 用途 |
|---|------|
| `flutter_rust_bridge` | Rust-Dart 桥接 |
| `flutter_rust_bridge_codegen` | 代码生成 |
| `dio` | HTTP 客户端 |
| `go_router` | 路由 |
| `flutter_riverpod` | 状态管理 |
| `freezed` | 不可变数据类 |
| `json_serializable` | JSON 序列化 |
| `web_socket_channel` | WebSocket |
| `flutter_secure_storage` | 安全存储 |
| `google_fonts` | 字体 |

## 与 Vue 端的包映射

| Vue 共享包 | Flutter 对应 |
|-----------|-------------|
| `shared-types` | `packages/core/lib/models/` |
| `shared-api-contract` | `packages/core/lib/contracts/` |
| `shared-platform-ports` | `packages/core/lib/network/` + `storage/` 接口定义 |
| `shared-normalizers` | Rust `native/rust/src/api/normalizer.rs` |
| `shared-auth-core` | `packages/core/lib/auth/` |
| `shared-e2ee-core` | Rust `e2ee-core` crate（通过 flutter_rust_bridge） |
| `shared-im-core` | `packages/core/lib/im/` + Rust 消息处理 |
| `shared-ws-core` | `packages/core/lib/ws/` |
| `shared-utils` | `packages/core/lib/utils/` |
