# Flutter Web P0 核心功能设计

> 设计日期: 2026-05-27
> 范围: Vue Web vs Flutter Web 差异分析中 P0 优先级的 6 个核心功能
> 参考文档: `docs/vue-web-vs-flutter-web-analysis.md`

---

## 一、背景与目标

Flutter Web 相比 Vue Web 存在大量功能缺失。本设计聚焦 P0（核心功能），实现后 Flutter Web 将具备基本可用的 IM 体验。

**P0 功能清单**：
1. WebSocket 心跳 + 自动重连 + 事件分类
2. 消息去重 + 发送队列重试
3. 消息类型扩展（IMAGE / FILE / VOICE / VIDEO）
4. 群聊功能（群组列表 + 创建 + 群聊会话）
5. 在线状态实时更新 + 好友点击打开聊天
6. 修复 `isMe` 硬编码 + 代码质量问题

**实现顺序**（存在依赖关系）：
```
1. WebSocket 基础设施
   ↓
2. 消息管道（去重 + 发送队列 + 重试）
   ↓
3. 消息类型扩展
   ↓
4. 群聊功能（依赖消息管道）
   ↓
5. 在线状态实时更新（依赖 WS 事件分发）
   ↓
6. 修复硬编码 + 集成测试
```

**设计原则**：尽量对齐 Vue Web 的功能、交互和 UI 风格，用 Flutter/Dart 实现。

---

## 二、WebSocket 基础设施

### 2.1 连接状态模型

新增到 `packages/core/lib/src/network/ws_client.dart`：

```dart
enum WsConnectionState { disconnected, connecting, connected, reconnecting }
```

### 2.2 增强 WsClientPort

在现有接口基础上新增：
- `Stream<WsConnectionState> connectionState` — 连接状态流，供 UI 监听
- `Future<void> reconnect()` — 手动触发重连

### 2.3 WebWsClient 增强

修改 `apps/web/lib/adapters/web_ws_adapter.dart`：

**Ticket 鉴权**：
- 连接前调用 HTTP API 获取 ticket
- WebSocket URL 带 `?ticket=xxx` 参数

**心跳机制**：
- 每 30 秒发送 `{"type":"HEARTBEAT"}`
- 5 秒内无响应（pong）则触发重连
- 使用 `Timer` 管理心跳周期

**自动重连**：
- 指数退避：1s → 2s → 4s → 8s → 16s → 30s
- 最大重试 10 次
- 连接成功后重置重试计数
- 手动 `disconnect()` 不触发自动重连

**事件分类**：
- 解析消息 `type` 字段，路由到对应的 Stream
- 使用已有的 `WsMessageType` 常量

### 2.4 Provider 注册

在 `apps/web/lib/core/di/providers.dart` 中新增：

```dart
final wsClientProvider = Provider<WsClientPort>((ref) {
  final httpClient = ref.watch(httpClientProvider);
  final secureStorage = ref.watch(secureStorageProvider);
  return WebWsClient(httpClient: httpClient, secureStorage: secureStorage);
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});
```

### 2.5 集成点

- **登录后连接**：`AuthNotifier.login()` 成功后调用 `wsClient.connect()`
- **登出时断开**：`AuthNotifier.logout()` 中调用 `wsClient.disconnect()`
- **ChatNotifier 订阅**：监听 WS `MESSAGE` 事件，实时添加新消息
- **ContactsNotifier 订阅**：监听 `FRIEND_REQUEST` / `FRIEND_ACCEPTED` 事件

---

## 三、消息管道（去重 + 发送队列 + 重试）

### 3.1 MessagePipeline 类

新建 `apps/web/lib/features/chat/data/message_pipeline.dart`：

```dart
class MessagePipeline {
  // 内存去重 Map：messageId -> timestamp
  final Map<String, DateTime> _recentMessageIds = {};
  static const int _maxSize = 1000;
  static const Duration _expiry = Duration(minutes: 5);

  /// 检查消息是否重复，非重复则返回 true
  bool shouldProcess(String messageId) {
    _cleanup();
    if (_recentMessageIds.containsKey(messageId)) return false;
    _recentMessageIds[messageId] = DateTime.now();
    return true;
  }

  void _cleanup() {
    // 淘汰过期和超容量的条目
  }
}
```

### 3.2 发送队列

**发送流程**：
1. 生成 `clientMessageId`（UUID）
2. 乐观更新：消息标记为 `SENDING`，立即显示在 UI
3. 调用 HTTP API 发送
4. 成功：更新为 `SENT`，替换为服务端返回的正式 ID
5. 失败：标记为 `FAILED`，显示重试按钮

**重试机制**：
- 单条重试：点击 `FAILED` 消息的重试按钮
- 批量重试：`retryPendingMessages()` 遍历所有 `FAILED` 消息
- 最大重试 3 次，间隔递增（2s → 4s → 8s）

### 3.3 离线消息同步（简化版）

- WS 重连成功后，调用 `MessageEndpoints.privateHistoryCursor` 接口拉取离线消息
- 使用最后一条消息的 `sendTime` 作为 `since` 参数
- 遍历所有活跃会话，逐个同步
- 同步的消息经过去重 pipeline 后添加到消息列表

### 3.4 ChatNotifier 修改

```dart
class ChatNotifier extends StateNotifier<ChatState> {
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  StreamSubscription? _wsSubscription;

  // 构造函数注入 pipeline 和 wsClient
  // 监听 WS 事件，经 pipeline 去重后添加到消息列表
  // sendMessage 使用 clientMessageId 乐观更新
}
```

---

## 四、消息类型扩展

### 4.1 消息类型常量

在 `packages/core/lib/src/contracts/` 中新增 `msg_type.dart`：

```dart
class MsgType {
  static const text = 'TEXT';
  static const image = 'IMAGE';
  static const file = 'FILE';
  static const voice = 'VOICE';
  static const video = 'VIDEO';
  static const system = 'SYSTEM';
  static const aiReply = 'AI_REPLY';
}
```

### 4.2 文件上传

使用已有的 `FileEndpoints.upload` 接口。

**新增 `FileApi`**（`apps/web/lib/features/chat/data/file_api.dart`）：
```dart
class FileApi {
  Future<UploadResult> uploadFile(File file);
  Future<UploadResult> uploadImage(File image);
}

class UploadResult {
  String url;
  String name;
  int size;
  String? thumbnailUrl;
}
```

### 4.3 MessageBubble 扩展

修改 `apps/web/lib/features/chat/presentation/widgets/message_bubble.dart`：

根据 `message.messageType` 渲染不同内容：

| 类型 | 气泡内容 | 交互 |
|------|---------|------|
| `TEXT` | 文本（现有实现） | — |
| `IMAGE` | 缩略图（`thumbnailUrl` 或 `mediaUrl`） | 点击全屏查看 |
| `FILE` | 文件图标 + 文件名 + 大小 | 点击下载 |
| `VOICE` | 播放按钮 + 时长 | 点击播放 |
| `VIDEO` | 视频缩略图 + 播放按钮 | 点击播放 |

**新建子组件**：
- `ImageBubble` — 图片消息气泡
- `FileBubble` — 文件消息气泡
- `VoiceBubble` — 语音消息气泡
- `VideoBubble` — 视频消息气泡

### 4.4 MessageInput 扩展

修改 `apps/web/lib/features/chat/presentation/widgets/message_input.dart`：

- 附件按钮展开为 PopupMenu：图片、文件
- 图片：`FilePicker` 选择 → 预览 → 上传 → 发送
- 文件：`FilePicker` 选择 → 显示文件信息 → 上传 → 发送
- 语音：P0 实现基础录音按钮（点击开始/停止录音），录音完成后上传为音频文件发送，不实现波形可视化等高级 UI

---

## 五、群聊功能

### 5.1 新增文件结构

```
features/group/
  data/
    group_api.dart              # GroupApi 类
  presentation/
    group_list_page.dart        # 群组列表页
    create_group_page.dart      # 创建群组页
    widgets/
      group_tile.dart           # 群组列表项组件
```

### 5.2 GroupApi

`apps/web/lib/features/group/data/group_api.dart`：

```dart
class GroupApi {
  final HttpClientPort _httpClient;

  Future<ApiResponse<Group>> createGroup({
    required String name,
    String? avatar,
    String? description,
    required List<String> memberIds,
  });

  Future<ApiResponse<List<Group>>> getUserGroups(String userId);
  Future<ApiResponse<List<GroupMember>>> getMembers(String groupId);
  Future<ApiResponse<void>> joinGroup(String groupId);
  Future<ApiResponse<void>> leaveGroup(String groupId);
  Future<ApiResponse<List<Group>>> searchGroups(String keyword);
}
```

### 5.3 GroupNotifier

```dart
class GroupState {
  List<Group> groups = [];
  bool isLoading = false;
  String? error;
}

class GroupNotifier extends StateNotifier<GroupState> {
  final GroupApi _groupApi;

  Future<void> loadGroups(String userId) async;
  Future<void> createGroup(String name, String? description, List<String> memberIds) async;
  Future<void> joinGroup(String groupId) async;
  Future<void> leaveGroup(String groupId) async;
}
```

### 5.4 Provider 注册

```dart
final groupApiProvider = Provider<GroupApi>((ref) {
  return GroupApi(ref.watch(httpClientProvider));
});

final groupStateProvider = StateNotifierProvider<GroupNotifier, GroupState>((ref) {
  return GroupNotifier(ref.watch(groupApiProvider));
});
```

### 5.5 群聊消息收发

**扩展 `MessageApi`**：
```dart
Future<ApiResponse<void>> sendGroupMessage(SendGroupMessageRequest request);
Future<ApiResponse<List<Message>>> getGroupHistory(String groupId, {int page = 0, int size = 20});
```

**扩展 `ChatNotifier`**：
- `sendGroupMessage(groupId, content, messageType)` — 群聊消息发送
- `loadGroupHistory(groupId)` — 群聊历史消息加载
- WS 收到 `MESSAGE` 事件时，根据 `isGroupChat` 字段决定路由到私聊还是群聊会话

### 5.6 路由

修改 `apps/web/lib/core/router/app_router.dart`：

新增路由：
- `/groups` → `GroupListPage`
- `/groups/create` → `CreateGroupPage`

**NavigationRail 扩展**：从 4 个 tab 变为 5 个：
```
Chat | Contacts | Groups | Moments | Settings
```

### 5.7 ChatPage 复用

群聊会话复用 `ChatPage` 的消息列表和输入组件：
- `conversationType` 为 `group` 时：
  - 标题显示群名 + 成员数
  - 消息列表复用 `MessageBubble`
  - `isMe` 判断同私聊（`senderId == currentUserId`）
  - @提及功能不在 P0 范围内（属于 P1）

---

## 六、在线状态实时更新

### 6.1 数据流

```
WS ON ONLINE_STATUS 事件
  → WebWsClient 解析 { type: "ONLINE_STATUS", data: { userIds: [...], online: true/false } }
  → ContactsNotifier.updateOnlineStatus(userIds, online)
  → UI 自动刷新好友列表的在线指示器（绿色圆点）
```

### 6.2 ContactsNotifier 扩展

```dart
void updateOnlineStatus(List<String> userIds, bool online) {
  final updatedFriends = state.friends.map((f) {
    if (userIds.contains(f.friendId)) {
      return f.copyWith(isOnline: online);
    }
    return f;
  }).toList();
  state = state.copyWith(friends: updatedFriends);
}
```

### 6.3 批量查询

- 页面加载时调用 HTTP API 批量查询好友在线状态
- WS 事件负责后续实时增量更新

### 6.4 好友点击打开聊天

修改 `apps/web/lib/features/contacts/presentation/contacts_page.dart`：

```dart
onTap: () async {
  final chatNotifier = ref.read(chatStateProvider.notifier);
  final session = await chatNotifier.getOrCreateSession(friend.friendId);
  if (session != null) {
    chatNotifier.setActiveSession(session.id);
    context.go('/chat');
  }
}
```

需要在 `ChatNotifier` 中新增 `getOrCreateSession(targetId)` 方法：
- 先在本地会话列表中查找
- 找到则返回，找不到则调用 API 创建新会话

---

## 七、修复硬编码 + 代码质量问题

### 7.1 修复 isMe 硬编码

修改 `apps/web/lib/features/chat/presentation/chat_page.dart:149`：

```dart
// Before:
isMe: msg.senderId == 'current_user',

// After:
final currentUserId = ref.watch(authStateProvider).user?.id ?? '';
// ...
isMe: msg.senderId == currentUserId,
```

### 7.2 代码质量问题修复

| 文件 | 问题 | 修复方案 |
|------|------|---------|
| `web_ws_adapter.dart` | `onMessage` 静默吞掉错误 | 改为 `logging.severe('WS parse error', e)` 记录 |
| `chat_provider.dart` | `loadSessions` 缺少 `isLoading=false` | 加载完成后 `state = state.copyWith(isLoading: false)` |
| `web_http_adapter.dart` | `_parseResponse` 假设 data 是 Map | 增加 `if (data is Map)` 类型检查 |
| `contacts_provider.dart` | `loadFriends` 不区分失败 | 分别 try-catch 好友和请求 |
| `moments_provider.dart` | `loadFeed` 无分页 | 增加 `hasMore` + `cursor` 分页逻辑 |

### 7.3 全局错误提示

新增 `apps/web/lib/core/error/error_notifier.dart`：

```dart
class ErrorState {
  String? message;
  DateTime? timestamp;
}

class ErrorNotifier extends StateNotifier<ErrorState> {
  void showError(String message) {
    state = ErrorState(message: message, timestamp: DateTime.now());
  }

  void clear() {
    state = ErrorState();
  }
}
```

在 `MainLayout` 中监听 `errorProvider`，显示 `SnackBar`：
```dart
ref.listen<ErrorState>(errorProvider, (prev, next) {
  if (next.message != null && next.message != prev?.message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(next.message!), duration: Duration(seconds: 3)),
    );
    ref.read(errorProvider.notifier).clear();
  }
});
```

---

## 八、依赖关系与风险

### 8.1 依赖关系

```
WebSocket 基础设施 ← 消息管道 ← 消息类型扩展
                   ← 在线状态
                   ← 群聊功能 ← 消息管道
修复硬编码 ← 独立，随时可做
```

### 8.2 风险点

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| WS ticket 接口不存在或变更 | 无法鉴权 | 先验证接口可用性，必要时简化为无 ticket 模式 |
| 文件上传接口返回格式不确定 | 消息类型扩展受阻 | 先对接接口确认格式 |
| 群聊消息格式与私聊不同 | 群聊功能受阻 | 参考 Vue Web 的群聊消息处理逻辑 |
| `dart:html` WebSocket 在 Flutter Web 中的兼容性 | WS 基础设施不稳 | 已有实现可工作，增量增强风险低 |

---

## 九、验收标准

P0 完成后，Flutter Web 应满足：

1. **WebSocket**：连接稳定，断线自动重连，心跳正常，事件分类正确
2. **消息去重**：WS 重连后不出现重复消息
3. **消息重试**：发送失败的消息可重试，不丢失
4. **多媒体消息**：可发送和接收图片、文件、语音、视频消息
5. **群聊**：可创建群组、群聊收发消息、查看群成员
6. **在线状态**：好友上线/下线实时更新
7. **好友交互**：点击好友可直接打开聊天
8. **isMe 修复**：消息气泡正确区分自己和他人
9. **错误提示**：API 错误有用户可见的提示
