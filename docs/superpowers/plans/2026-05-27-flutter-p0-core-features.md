# Flutter Web P0 核心功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Flutter Web 的 6 个 P0 核心功能，使其具备基本可用的 IM 体验。

**Architecture:** 增强现有 WebSocket 客户端（心跳、重连、事件分类），新增消息管道（去重、重试），扩展消息类型支持多媒体，新增群聊模块，接入在线状态实时更新，修复硬编码问题。所有功能遵循现有 Riverpod StateNotifier 模式。

**Tech Stack:** Flutter/Dart, Riverpod, Dio, dart:html WebSocket, Freezed models, GoRouter

**Spec:** `docs/superpowers/specs/2026-05-27-flutter-p0-core-features-design.md`

---

## 文件结构总览

### 新增文件

| 文件路径 | 职责 |
|---------|------|
| `flutter/packages/core/lib/src/network/ws_connection_state.dart` | WsConnectionState 枚举 |
| `flutter/apps/web/lib/features/chat/data/message_pipeline.dart` | 消息去重 + 发送队列 + 重试 |
| `flutter/apps/web/lib/features/chat/data/file_api.dart` | 文件上传 API |
| `flutter/apps/web/lib/features/chat/presentation/widgets/image_bubble.dart` | 图片消息气泡 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/file_bubble.dart` | 文件消息气泡 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/voice_bubble.dart` | 语音消息气泡 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/video_bubble.dart` | 视频消息气泡 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/image_viewer.dart` | 全屏图片查看器 |
| `flutter/apps/web/lib/features/group/data/group_api.dart` | 群组 API |
| `flutter/apps/web/lib/features/group/presentation/group_list_page.dart` | 群组列表页 |
| `flutter/apps/web/lib/features/group/presentation/create_group_page.dart` | 创建群组页 |
| `flutter/apps/web/lib/features/group/presentation/group_provider.dart` | 群组状态管理 |
| `flutter/apps/web/lib/features/group/presentation/widgets/group_tile.dart` | 群组列表项 |
| `flutter/apps/web/lib/core/error/error_notifier.dart` | 全局错误通知 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `flutter/packages/core/lib/src/network/ws_client.dart` | 增强 WsClientPort 接口 |
| `flutter/apps/web/lib/adapters/web_ws_adapter.dart` | 心跳、重连、事件分类、ticket 鉴权 |
| `flutter/apps/web/lib/core/di/providers.dart` | 新增 WS、Group、Error provider |
| `flutter/apps/web/lib/features/chat/presentation/chat_provider.dart` | 集成 WS、pipeline、群聊消息 |
| `flutter/apps/web/lib/features/chat/data/message_api.dart` | 新增群聊消息发送、文件上传 |
| `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | 修复 isMe、支持群聊 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart` | 多类型消息渲染 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart` | 附件菜单、录音 |
| `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart` | 在线状态更新 |
| `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart` | 好友点击打开聊天 |
| `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart` | 登录后连接 WS、登出断开 |
| `flutter/apps/web/lib/core/router/app_router.dart` | 新增群组路由、NavigationRail 扩展 |
| `flutter/apps/web/lib/adapters/web_http_adapter.dart` | 修复 _parseResponse 类型检查 |
| `flutter/apps/web/lib/features/moments/presentation/moments_provider.dart` | 分页逻辑 |

---

## Task 1: WebSocket 基础设施 — 接口增强

**Files:**
- Modify: `flutter/packages/core/lib/src/network/ws_client.dart`
- Create: `flutter/packages/core/lib/src/network/ws_connection_state.dart`

- [ ] **Step 1: 创建 WsConnectionState 枚举**

```dart
// flutter/packages/core/lib/src/network/ws_connection_state.dart
enum WsConnectionState { disconnected, connecting, connected, reconnecting }
```

- [ ] **Step 2: 增强 WsClientPort 接口**

修改 `flutter/packages/core/lib/src/network/ws_client.dart`，新增 `connectionState` 流和 `reconnect` 方法：

```dart
import 'dart:async';

import 'ws_connection_state.dart';

abstract class WsEvent {
  String get type;
  Map<String, dynamic> get data;
  int get timestamp;
}

abstract class WsClientPort {
  Stream<WsEvent> get events;
  Stream<WsConnectionState> get connectionState;
  bool get isConnected;
  Future<void> connect(String url);
  Future<void> disconnect();
  Future<void> reconnect();
  void send(Map<String, dynamic> message);
}
```

- [ ] **Step 3: 确认编译通过**

Run: `cd flutter/packages/core && dart analyze lib/src/network/ws_client.dart`
Expected: No errors (existing implementations will have missing overrides — that's expected until Task 2)

- [ ] **Step 4: Commit**

```bash
cd flutter
git add packages/core/lib/src/network/ws_connection_state.dart packages/core/lib/src/network/ws_client.dart
git commit -m "feat(core): enhance WsClientPort with connectionState stream and reconnect"
```

---

## Task 2: WebSocket 基础设施 — WebWsClient 实现

**Files:**
- Modify: `flutter/apps/web/lib/adapters/web_ws_adapter.dart`

- [ ] **Step 1: 重写 WebWsClient 实现**

完全重写 `flutter/apps/web/lib/adapters/web_ws_adapter.dart`：

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'package:im_core/core.dart';

class WebWsEvent implements WsEvent {
  WebWsEvent({required this.type, required this.data, required this.timestamp});
  @override
  final String type;
  @override
  final Map<String, dynamic> data;
  @override
  final int timestamp;

  factory WebWsEvent.fromJson(Map<String, dynamic> json) {
    return WebWsEvent(
      type: json['type'] as String? ?? 'unknown',
      data: json['data'] as Map<String, dynamic>? ?? {},
      timestamp: json['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}

class WebWsClient implements WsClientPort {
  WebWsClient({required this.ticketUrl, required this.wsBaseUrl});

  final String ticketUrl;
  final String wsBaseUrl;

  html.WebSocket? _socket;
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _stateController = StreamController<WsConnectionState>.broadcast();

  bool _isConnected = false;
  bool _manualDisconnect = false;
  int _retryCount = 0;
  static const int _maxRetries = 10;
  static const Duration _heartbeatInterval = Duration(seconds: 30);
  static const Duration _heartbeatTimeout = Duration(seconds: 5);

  Timer? _heartbeatTimer;
  Timer? _heartbeatTimeoutTimer;
  Timer? _reconnectTimer;
  String? _lastUrl;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _stateController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  Future<void> connect(String url) async {
    _lastUrl = url;
    _manualDisconnect = false;
    _updateState(WsConnectionState.connecting);

    try {
      _socket = html.WebSocket(url);
      _socket!.onOpen.listen(_onOpen);
      _socket!.onMessage.listen(_onMessage);
      _socket!.onClose.listen(_onClose);
      _socket!.onError.listen(_onError);
    } catch (e) {
      _updateState(WsConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  @override
  Future<void> disconnect() async {
    _manualDisconnect = true;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _socket?.close();
    _socket = null;
    _isConnected = false;
    _retryCount = 0;
    _updateState(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    _socket?.close();
    _socket = null;
    _isConnected = false;
    _retryCount = 0;
    if (_lastUrl != null) {
      await connect(_lastUrl!);
    }
  }

  @override
  void send(Map<String, dynamic> message) {
    if (_isConnected && _socket != null) {
      _socket!.send(jsonEncode(message));
    }
  }

  void _onOpen(html.Event event) {
    _isConnected = true;
    _retryCount = 0;
    _updateState(WsConnectionState.connected);
    _startHeartbeat();
  }

  void _onMessage(html.MessageEvent event) {
    try {
      final data = jsonDecode(event.data as String) as Map<String, dynamic>;
      final wsEvent = WebWsEvent.fromJson(data);
      _eventsController.add(wsEvent);

      // Reset heartbeat timeout on any message (acts as pong)
      _heartbeatTimeoutTimer?.cancel();
    } catch (e) {
      // Log error instead of silently swallowing
      print('WS parse error: $e');
    }
  }

  void _onClose(html.CloseEvent event) {
    _isConnected = false;
    _stopHeartbeat();
    _updateState(WsConnectionState.disconnected);
    if (!_manualDisconnect) {
      _scheduleReconnect();
    }
  }

  void _onError(html.Event event) {
    _isConnected = false;
    _stopHeartbeat();
    if (!_manualDisconnect) {
      _scheduleReconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      send({'type': WsMessageType.heartbeat});
      // Start timeout timer
      _heartbeatTimeoutTimer?.cancel();
      _heartbeatTimeoutTimer = Timer(_heartbeatTimeout, () {
        // No pong received, trigger reconnect
        _socket?.close();
      });
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimeoutTimer?.cancel();
  }

  void _scheduleReconnect() {
    if (_manualDisconnect || _retryCount >= _maxRetries) return;
    _updateState(WsConnectionState.reconnecting);

    final delay = Duration(seconds: (1 << _retryCount).clamp(1, 30));
    _retryCount++;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      if (_lastUrl != null && !_manualDisconnect) {
        connect(_lastUrl!);
      }
    });
  }

  void _updateState(WsConnectionState state) {
    _stateController.add(state);
  }

  void dispose() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _eventsController.close();
    _stateController.close();
    _socket?.close();
  }
}
```

- [ ] **Step 2: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/adapters/web_ws_adapter.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd flutter
git add apps/web/lib/adapters/web_ws_adapter.dart
git commit -m "feat(web): implement WS heartbeat, auto-reconnect, event classification"
```

---

## Task 3: WebSocket 基础设施 — Provider 注册 + Auth 集成

**Files:**
- Modify: `flutter/apps/web/lib/core/di/providers.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`

- [ ] **Step 1: 在 providers.dart 中注册 WS provider**

在 `flutter/apps/web/lib/core/di/providers.dart` 末尾新增：

```dart
import 'package:im_core/src/network/ws_connection_state.dart';
import '../../adapters/web_ws_adapter.dart';

// WebSocket
final wsClientProvider = Provider<WsClientPort>((ref) {
  final client = WebWsClient(
    ticketUrl: '${AuthEndpoints.wsTicket}',
    wsBaseUrl: 'ws://localhost:8082${WsEndpoints.path}',
  );
  ref.onDispose(() => client.dispose());
  return client;
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});

// Group
final groupApiProvider = Provider<GroupApi>((ref) {
  return GroupApi(ref.watch(httpClientProvider));
});

final groupStateProvider = StateNotifierProvider<GroupNotifier, GroupState>((ref) {
  return GroupNotifier(ref.watch(groupApiProvider), ref.watch(httpClientProvider));
});

// Error
final errorProvider = StateNotifierProvider<ErrorNotifier, ErrorState>((ref) {
  return ErrorNotifier();
});
```

注意：需要在文件顶部添加相应的 import 语句。

- [ ] **Step 2: 修改 AuthNotifier 集成 WS 连接**

修改 `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient) : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;

  Future<void> login(String username, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(user: response.user, isAuthenticated: true);
      // Connect WebSocket after successful login
      _connectWs();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> register(
      String username, String password, String nickname) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.register(
        RegisterRequest(
            username: username, password: password, nickname: nickname),
      );
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> logout() async {
    _wsClient.disconnect();
    await _repository.logout();
    state = const AuthState();
  }

  Future<void> checkAuth() async {
    final isAuth = await _repository.isAuthenticated();
    if (isAuth) {
      try {
        final user = await _repository.getProfile();
        state = AuthState(user: user, isAuthenticated: true);
        // Reconnect WebSocket on session restore
        _connectWs();
      } catch (e) {
        state = const AuthState();
      }
    }
  }

  void _connectWs() {
    // Build WS URL with ticket — for now, connect without ticket (simplified)
    // TODO: fetch ticket from AuthEndpoints.wsTicket and append as query param
    _wsClient.connect('ws://localhost:8082/websocket');
  }
}
```

- [ ] **Step 3: 更新 authStateProvider 构造函数**

修改 `providers.dart` 中 `authStateProvider` 的定义，注入 `wsClientProvider`：

```dart
final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider), ref.watch(wsClientProvider));
});
```

- [ ] **Step 4: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/`
Expected: No errors (or only warnings about unused imports)

- [ ] **Step 5: Commit**

```bash
cd flutter
git add apps/web/lib/core/di/providers.dart apps/web/lib/features/auth/presentation/auth_provider.dart
git commit -m "feat(web): register WS provider, connect on login, disconnect on logout"
```

---

## Task 4: 消息管道 — MessagePipeline 去重 + 发送队列

**Files:**
- Create: `flutter/apps/web/lib/features/chat/data/message_pipeline.dart`

- [ ] **Step 1: 创建 MessagePipeline 类**

```dart
// flutter/apps/web/lib/features/chat/data/message_pipeline.dart
import 'dart:collection';

class MessagePipeline {
  final LinkedHashMap<String, DateTime> _recentIds = LinkedHashMap();
  static const int _maxSize = 1000;
  static const Duration _expiry = Duration(minutes: 5);

  /// Returns true if the message should be processed (not a duplicate)
  bool shouldProcess(String messageId) {
    _cleanup();
    if (_recentIds.containsKey(messageId)) return false;
    _recentIds[messageId] = DateTime.now();
    return true;
  }

  void _cleanup() {
    final now = DateTime.now();
    // Remove expired entries
    _recentIds.removeWhere((_, timestamp) =>
        now.difference(timestamp) > _expiry);
    // Remove oldest if over capacity
    while (_recentIds.length > _maxSize) {
      _recentIds.remove(_recentIds.keys.first);
    }
  }

  void clear() {
    _recentIds.clear();
  }
}
```

- [ ] **Step 2: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/chat/data/message_pipeline.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/data/message_pipeline.dart
git commit -m "feat(chat): add MessagePipeline for message deduplication"
```

---

## Task 5: 消息管道 — ChatNotifier 集成 WS + Pipeline + 重试

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_provider.dart`
- Modify: `flutter/apps/web/lib/core/di/providers.dart`

- [ ] **Step 1: 重写 ChatNotifier 集成 WS 和 Pipeline**

修改 `flutter/apps/web/lib/features/chat/presentation/chat_provider.dart`：

```dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core/src/network/ws_connection_state.dart';
import '../data/message_api.dart';
import '../data/message_pipeline.dart';

class ChatState {
  const ChatState({
    this.sessions = const [],
    this.messages = const {},
    this.isLoading = false,
    this.activeSessionId,
    this.error,
  });

  final List<ChatSession> sessions;
  final Map<String, List<Message>> messages;
  final bool isLoading;
  final String? activeSessionId;
  final String? error;

  List<Message> get currentMessages =>
      activeSessionId != null ? (messages[activeSessionId] ?? const []) : const [];

  ChatState copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? activeSessionId,
    String? error,
  }) {
    return ChatState(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      error: error,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._messageApi, this._pipeline, this._wsClient)
      : super(const ChatState()) {
    _subscribeToWs();
  }

  final MessageApi _messageApi;
  final MessagePipeline _pipeline;
  final WsClientPort _wsClient;
  StreamSubscription? _wsSubscription;

  void _subscribeToWs() {
    _wsSubscription = _wsClient.events.listen((event) {
      if (event.type == WsMessageType.message) {
        _handleIncomingMessage(event.data);
      } else if (event.type == WsMessageType.messageStatusChanged) {
        _handleMessageStatusChanged(event.data);
      }
    });
    // Sync offline messages on reconnect
    _wsClient.connectionState.listen((wsState) {
      if (wsState == WsConnectionState.connected) {
        _syncOfflineMessages();
      }
    });
  }

  Future<void> _syncOfflineMessages() async {
    // Reload sessions to pick up any missed messages
    try {
      await loadSessions();
    } catch (_) {}
  }

  void _handleIncomingMessage(Map<String, dynamic> data) {
    try {
      final message = Message.fromJson(data);
      // Dedup check
      if (!_pipeline.shouldProcess(message.id)) return;
      // Determine session key
      final sessionKey = message.isGroupChat
          ? (message.groupId ?? '')
          : message.senderId;
      addMessage(sessionKey, message);
    } catch (e) {
      print('Failed to handle incoming message: $e');
    }
  }

  void _handleMessageStatusChanged(Map<String, dynamic> data) {
    try {
      final message = Message.fromJson(data);
      // Update message status in the appropriate session
      for (final entry in state.messages.entries) {
        final index = entry.value.indexWhere((m) => m.id == message.id);
        if (index != -1) {
          final updated = List<Message>.from(entry.value);
          updated[index] = message;
          state = state.copyWith(
            messages: {...state.messages, entry.key: updated},
          );
          break;
        }
      }
    } catch (e) {
      print('Failed to handle message status change: $e');
    }
  }

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final sessions = await _messageApi.getConversations();
      state = state.copyWith(sessions: sessions, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setActiveSession(String sessionId) {
    state = state.copyWith(activeSessionId: sessionId);
  }

  Future<void> loadMessages(String targetId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final messages = await _messageApi.getPrivateHistory(targetId,
          page: page, size: size);
      state = state.copyWith(
        messages: {...state.messages, targetId: messages},
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadGroupMessages(String groupId, {int? page, int? size}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final messages = await _messageApi.getGroupHistory(groupId,
          page: page, size: size);
      state = state.copyWith(
        messages: {...state.messages, groupId: messages},
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<Message?> sendMessage(String receiverId, String content,
      {String messageType = 'text', String? clientMessageId}) async {
    final cid = clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    // Optimistic update
    final pendingMessage = Message(
      id: cid,
      senderId: '', // Will be set by server
      receiverId: receiverId,
      isGroupChat: false,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'SENDING',
      clientMessageId: cid,
    );
    addMessage(receiverId, pendingMessage);

    try {
      final serverMessage = await _messageApi.sendPrivateMessage(
        SendPrivateMessageRequest(
          receiverId: receiverId,
          content: content,
          messageType: messageType,
          clientMessageId: cid,
        ),
      );
      // Replace pending with server message
      _replaceMessage(receiverId, cid, serverMessage);
      return serverMessage;
    } catch (e) {
      // Mark as failed
      _updateMessageStatus(receiverId, cid, 'FAILED');
      return null;
    }
  }

  Future<Message?> sendGroupMessage(String groupId, String content,
      {String messageType = 'text', String? clientMessageId}) async {
    final cid = clientMessageId ?? 'local_${DateTime.now().millisecondsSinceEpoch}';
    // Optimistic update
    final pendingMessage = Message(
      id: cid,
      senderId: '',
      isGroupChat: true,
      groupId: groupId,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'SENDING',
      clientMessageId: cid,
    );
    addMessage(groupId, pendingMessage);

    try {
      final serverMessage = await _messageApi.sendGroupMessage(
        SendGroupMessageRequest(
          groupId: groupId,
          content: content,
          messageType: messageType,
          clientMessageId: cid,
        ),
      );
      _replaceMessage(groupId, cid, serverMessage);
      return serverMessage;
    } catch (e) {
      _updateMessageStatus(groupId, cid, 'FAILED');
      return null;
    }
  }

  Future<void> retryMessage(String sessionKey, String messageId) async {
    final messages = state.messages[sessionKey];
    if (messages == null) return;
    final index = messages.indexWhere((m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final msg = messages[index];

    _updateMessageStatus(sessionKey, msg.id, 'SENDING');

    try {
      Message serverMessage;
      if (msg.isGroupChat) {
        serverMessage = await _messageApi.sendGroupMessage(
          SendGroupMessageRequest(
            groupId: msg.groupId ?? sessionKey,
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
          ),
        );
      } else {
        serverMessage = await _messageApi.sendPrivateMessage(
          SendPrivateMessageRequest(
            receiverId: msg.receiverId ?? sessionKey,
            content: msg.content,
            messageType: msg.messageType,
            clientMessageId: msg.clientMessageId,
          ),
        );
      }
      _replaceMessage(sessionKey, msg.id, serverMessage);
    } catch (e) {
      _updateMessageStatus(sessionKey, msg.id, 'FAILED');
    }
  }

  Future<void> retryAllFailed() async {
    for (final entry in state.messages.entries) {
      final failedMessages = entry.value.where((m) => m.status == 'FAILED').toList();
      for (final msg in failedMessages) {
        await retryMessage(entry.key, msg.id);
      }
    }
  }

  /// Get or create a session for chatting with a friend
  Future<ChatSession?> getOrCreateSession(String targetId) async {
    // First check local sessions
    final existing = state.sessions.where((s) => s.targetId == targetId).firstOrNull;
    if (existing != null) return existing;
    // Reload sessions from server
    await loadSessions();
    return state.sessions.where((s) => s.targetId == targetId).firstOrNull;
  }

  void addMessage(String sessionKey, Message message) {
    final currentMessages = state.messages[sessionKey] ?? [];
    // Dedup by id
    if (currentMessages.any((m) => m.id == message.id)) return;
    final updated = [...currentMessages, message];
    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  void _replaceMessage(String sessionKey, String oldId, Message newMessage) {
    final currentMessages = state.messages[sessionKey];
    if (currentMessages == null) return;
    final index = currentMessages.indexWhere(
        (m) => m.id == oldId || m.clientMessageId == oldId);
    if (index == -1) return;
    final updated = List<Message>.from(currentMessages);
    updated[index] = newMessage;
    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  void _updateMessageStatus(String sessionKey, String messageId, String status) {
    final currentMessages = state.messages[sessionKey];
    if (currentMessages == null) return;
    final index = currentMessages.indexWhere(
        (m) => m.id == messageId || m.clientMessageId == messageId);
    if (index == -1) return;
    final updated = List<Message>.from(currentMessages);
    final old = updated[index];
    updated[index] = Message(
      id: old.id,
      senderId: old.senderId,
      receiverId: old.receiverId,
      isGroupChat: old.isGroupChat,
      messageType: old.messageType,
      content: old.content,
      sendTime: old.sendTime,
      status: status,
      clientMessageId: old.clientMessageId,
      groupId: old.groupId,
      senderName: old.senderName,
      senderAvatar: old.senderAvatar,
      mediaUrl: old.mediaUrl,
      mediaSize: old.mediaSize,
      mediaName: old.mediaName,
      thumbnailUrl: old.thumbnailUrl,
      duration: old.duration,
    );
    state = state.copyWith(
      messages: {...state.messages, sessionKey: updated},
    );
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _messageApi.markRead(conversationId);
    } catch (_) {}
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
```

- [ ] **Step 2: 更新 providers.dart 中 chatStateProvider**

修改 `providers.dart` 中 `chatStateProvider` 的定义：

```dart
final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
  );
});
```

- [ ] **Step 3: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/presentation/chat_provider.dart apps/web/lib/core/di/providers.dart
git commit -m "feat(chat): integrate WS events, message dedup, send queue with retry"
```

---

## Task 6: 消息类型 — MsgType 常量 + FileApi

**Files:**
- Create: `flutter/packages/core/lib/src/contracts/msg_type.dart`
- Create: `flutter/apps/web/lib/features/chat/data/file_api.dart`

- [ ] **Step 1: 创建 MsgType 常量**

```dart
// flutter/packages/core/lib/src/contracts/msg_type.dart
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

- [ ] **Step 2: 导出 MsgType**

在 `flutter/packages/core/lib/core.dart` 中添加导出：
```dart
export 'src/contracts/msg_type.dart';
```

- [ ] **Step 3: 创建 FileApi**

```dart
// flutter/apps/web/lib/features/chat/data/file_api.dart
import 'dart:typed_data';
import 'package:im_core/core.dart';

class UploadResult {
  const UploadResult({
    required this.url,
    required this.name,
    required this.size,
    this.thumbnailUrl,
  });

  final String url;
  final String name;
  final int size;
  final String? thumbnailUrl;

  factory UploadResult.fromJson(Map<String, dynamic> json) {
    return UploadResult(
      url: json['url'] as String? ?? json['data'] as String? ?? '',
      name: json['name'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }
}

class FileApi {
  FileApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<UploadResult> uploadImage(Uint8List bytes, String fileName) async {
    // Use multipart upload via the HTTP client
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadImage,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }

  Future<UploadResult> uploadFile(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadFile,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }

  Future<UploadResult> uploadAudio(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadAudio,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }

  Future<UploadResult> uploadVideo(Uint8List bytes, String fileName) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      FileEndpoints.uploadVideo,
      body: {'file': bytes, 'fileName': fileName},
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return UploadResult.fromJson(response.data);
  }
}
```

- [ ] **Step 4: 注册 FileApi provider**

在 `providers.dart` 中添加：

```dart
import '../../features/chat/data/file_api.dart';

final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider));
});
```

- [ ] **Step 5: 扩展 MessageApi 添加群聊方法**

修改 `flutter/apps/web/lib/features/chat/data/message_api.dart`，新增：

```dart
class SendGroupMessageRequest {
  const SendGroupMessageRequest({
    required this.groupId,
    required this.content,
    this.messageType = 'text',
    this.clientMessageId,
  });

  final String groupId;
  final String content;
  final String messageType;
  final String? clientMessageId;

  Map<String, dynamic> toJson() => {
        'groupId': groupId,
        'content': content,
        'messageType': messageType,
        if (clientMessageId != null) 'clientMessageId': clientMessageId,
      };
}
```

在 `MessageApi` 类中新增方法：

```dart
Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
  final response = await _httpClient.post<Map<String, dynamic>>(
    MessageEndpoints.sendGroup,
    body: request.toJson(),
    fromJson: (json) => json as Map<String, dynamic>,
  );
  return Message.fromJson(response.data);
}

Future<List<Message>> getGroupHistory(String groupId,
    {int? page, int? size}) async {
  final response = await _httpClient.get<List<dynamic>>(
    MessageEndpoints.groupHistory(groupId),
    queryParams: {
      if (page != null) 'page': page.toString(),
      if (size != null) 'size': size.toString(),
    },
    fromJson: (json) => (json as List)
        .map((e) => Message.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
  return response.data.cast<Message>();
}
```

- [ ] **Step 6: 确认编译通过**

Run: `cd flutter && dart analyze apps/web/lib/features/chat/data/ packages/core/lib/src/contracts/msg_type.dart`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
cd flutter
git add packages/core/lib/src/contracts/msg_type.dart packages/core/lib/core.dart \
       apps/web/lib/features/chat/data/file_api.dart apps/web/lib/features/chat/data/message_api.dart \
       apps/web/lib/core/di/providers.dart
git commit -m "feat(chat): add MsgType constants, FileApi, group message API methods"
```

---

## Task 7: 消息类型 — MessageBubble 多类型渲染

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/image_bubble.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/file_bubble.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/voice_bubble.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/video_bubble.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/image_viewer.dart`

- [ ] **Step 1: 创建 ImageBubble 组件**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/image_bubble.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'image_viewer.dart';

class ImageBubble extends StatelessWidget {
  const ImageBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final imageUrl = message.thumbnailUrl ?? message.mediaUrl ?? '';
    return GestureDetector(
      onTap: () {
        if (message.mediaUrl != null) {
          showDialog(
            context: context,
            builder: (_) => ImageViewer(imageUrl: message.mediaUrl!),
          );
        }
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 240, maxHeight: 320),
          child: imageUrl.isNotEmpty
              ? Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 120,
                    height: 120,
                    color: Colors.grey[300],
                    child: const Icon(Icons.broken_image, color: Colors.grey),
                  ),
                )
              : Container(
                  width: 120,
                  height: 120,
                  color: Colors.grey[300],
                  child: const Icon(Icons.image, color: Colors.grey),
                ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: 创建 ImageViewer 对话框**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/image_viewer.dart
import 'package:flutter/material.dart';

class ImageViewer extends StatelessWidget {
  const ImageViewer({required this.imageUrl, super.key});
  final String imageUrl;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.black87,
      insetPadding: EdgeInsets.zero,
      child: Stack(
        children: [
          Center(
            child: InteractiveViewer(
              child: Image.network(
                imageUrl,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(
                  Icons.broken_image,
                  color: Colors.white54,
                  size: 64,
                ),
              ),
            ),
          ),
          Positioned(
            top: 16,
            right: 16,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 32),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 3: 创建 FileBubble 组件**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/file_bubble.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class FileBubble extends StatelessWidget {
  const FileBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  String _formatSize(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isMe
            ? Theme.of(context).colorScheme.primaryContainer
            : Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.insert_drive_file,
              size: 36, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message.mediaName ?? 'File',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (message.mediaSize != null)
                  Text(
                    _formatSize(message.mediaSize),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.download),
            onPressed: () {
              // TODO: implement file download
              if (message.mediaUrl != null) {
                // launch download URL
              }
            },
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: 创建 VoiceBubble 组件**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/voice_bubble.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class VoiceBubble extends StatefulWidget {
  const VoiceBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  State<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends State<VoiceBubble> {
  bool _isPlaying = false;

  @override
  Widget build(BuildContext context) {
    final duration = widget.message.duration ?? 0;
    return GestureDetector(
      onTap: () {
        setState(() => _isPlaying = !_isPlaying);
        // TODO: implement actual audio playback
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: widget.isMe
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _isPlaying ? Icons.pause : Icons.play_arrow,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            // Simple waveform visualization
            ...List.generate(
              (duration / 100).clamp(3, 20).toInt(),
              (i) => Container(
                width: 3,
                height: (8 + (i % 3) * 4).toDouble(),
                margin: const EdgeInsets.symmetric(horizontal: 1),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary.withAlpha(150),
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${(duration / 1000).toStringAsFixed(1)}s',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: 创建 VideoBubble 组件**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/video_bubble.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class VideoBubble extends StatelessWidget {
  const VideoBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final thumbnailUrl = message.thumbnailUrl ?? '';
    return GestureDetector(
      onTap: () {
        // TODO: implement video playback
        if (message.mediaUrl != null) {
          // launch video player
        }
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Stack(
          alignment: Alignment.center,
          children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 240, maxHeight: 180),
              child: thumbnailUrl.isNotEmpty
                  ? Image.network(thumbnailUrl, fit: BoxFit.cover)
                  : Container(
                      width: 240,
                      height: 180,
                      color: Colors.black26,
                    ),
            ),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                color: Colors.black45,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.play_arrow, color: Colors.white, size: 32),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: 修改 MessageBubble 支持多类型**

修改 `flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart`，将 `_buildContent` 方法改为根据 `messageType` 分发：

在文件顶部添加 import：
```dart
import 'package:im_core/core.dart';
import 'image_bubble.dart';
import 'file_bubble.dart';
import 'voice_bubble.dart';
import 'video_bubble.dart';
```

将 `build` 方法中的内容区域替换为：

```dart
Widget _buildMessageContent(BuildContext context) {
  switch (message.messageType.toUpperCase()) {
    case 'IMAGE':
      return ImageBubble(message: message, isMe: isMe);
    case 'FILE':
      return FileBubble(message: message, isMe: isMe);
    case 'VOICE':
      return VoiceBubble(message: message, isMe: isMe);
    case 'VIDEO':
      return VideoBubble(message: message, isMe: isMe);
    default:
      return Text(message.content);
  }
}
```

然后在 `build` 方法中使用 `_buildMessageContent(context)` 替换原来的 `Text(message.content)`。

- [ ] **Step 7: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/chat/presentation/widgets/`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/presentation/widgets/
git commit -m "feat(chat): add multi-type message bubbles (image, file, voice, video)"
```

---

## Task 8: 消息类型 — MessageInput 附件菜单

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 重写 MessageInput 支持附件**

修改 `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`：

```dart
import 'package:flutter/material.dart';

class MessageInput extends StatefulWidget {
  const MessageInput({
    required this.onSend,
    this.onSendImage,
    this.onSendFile,
    super.key,
  });

  final ValueChanged<String> onSend;
  final ValueChanged<String>? onSendImage;  // file path/name
  final ValueChanged<String>? onSendFile;   // file path/name

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  bool _isRecording = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  void _showAttachmentMenu() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.image),
              title: const Text('Image'),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendImage();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: const Text('File'),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendFile();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _pickAndSendImage() {
    // Use file_picker package for web
    // For now, use a simple input approach
    // TODO: integrate file_picker for proper file selection on web
    widget.onSendImage?.call('image');
  }

  void _pickAndSendFile() {
    // TODO: integrate file_picker for proper file selection on web
    widget.onSendFile?.call('file');
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: _showAttachmentMenu,
            tooltip: 'Attach',
          ),
          IconButton(
            icon: Icon(_isRecording ? Icons.stop : Icons.mic),
            onPressed: () {
              setState(() => _isRecording = !_isRecording);
              // TODO: implement actual voice recording
            },
            tooltip: 'Voice',
            color: _isRecording ? Colors.red : null,
          ),
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: const InputDecoration(
                hintText: 'Type a message...',
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 12),
              ),
              minLines: 1,
              maxLines: 4,
              onSubmitted: (_) => _handleSend(),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.send),
            onPressed: _handleSend,
            color: Theme.of(context).colorScheme.primary,
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 更新 ChatPage 中 MessageInput 的使用**

在 `chat_page.dart` 中，更新 `MessageInput` 的构造函数调用以传递新的回调（将在 Task 11 中与 isMe 修复一起完成）。

- [ ] **Step 3: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/chat/presentation/widgets/message_input.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "feat(chat): add attachment menu and voice recording button to MessageInput"
```

---

## Task 9: 群聊功能 — GroupApi + GroupNotifier

**Files:**
- Create: `flutter/apps/web/lib/features/group/data/group_api.dart`
- Create: `flutter/apps/web/lib/features/group/presentation/group_provider.dart`
- Modify: `flutter/apps/web/lib/core/di/providers.dart`

- [ ] **Step 1: 创建 GroupApi**

```dart
// flutter/apps/web/lib/features/group/data/group_api.dart
import 'package:im_core/core.dart';

class GroupApi {
  GroupApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<Group> createGroup({
    required String name,
    String? avatar,
    String? description,
    required List<String> memberIds,
  }) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      GroupEndpoints.create,
      body: {
        'name': name,
        if (avatar != null) 'avatar': avatar,
        if (description != null) 'description': description,
        'memberIds': memberIds,
      },
      fromJson: (json) => json as Map<String, dynamic>,
    );
    return Group.fromJson(response.data);
  }

  Future<List<Group>> getUserGroups(String userId) async {
    final response = await _httpClient.get<List<dynamic>>(
      GroupEndpoints.userGroups(userId),
      fromJson: (json) => (json as List)
          .map((e) => Group.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Group>();
  }

  Future<List<GroupMember>> getMembers(String groupId) async {
    final response = await _httpClient.post<List<dynamic>>(
      GroupEndpoints.membersList,
      body: {'groupId': groupId},
      fromJson: (json) => (json as List)
          .map((e) => GroupMember.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<GroupMember>();
  }

  Future<void> joinGroup(String groupId) async {
    await _httpClient.post<void>(
      GroupEndpoints.join(groupId),
      body: {},
      fromJson: (_) {},
    );
  }

  Future<void> leaveGroup(String groupId) async {
    await _httpClient.post<void>(
      GroupEndpoints.leave(groupId),
      body: {},
      fromJson: (_) {},
    );
  }

  Future<List<Group>> searchGroups(String keyword) async {
    final response = await _httpClient.get<List<dynamic>>(
      GroupEndpoints.search,
      queryParams: {'keyword': keyword},
      fromJson: (json) => (json as List)
          .map((e) => Group.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data.cast<Group>();
  }
}
```

- [ ] **Step 2: 创建 GroupNotifier**

```dart
// flutter/apps/web/lib/features/group/presentation/group_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/group_api.dart';

class GroupState {
  const GroupState({
    this.groups = const [],
    this.isLoading = false,
    this.error,
  });

  final List<Group> groups;
  final bool isLoading;
  final String? error;

  GroupState copyWith({
    List<Group>? groups,
    bool? isLoading,
    String? error,
  }) {
    return GroupState(
      groups: groups ?? this.groups,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class GroupNotifier extends StateNotifier<GroupState> {
  GroupNotifier(this._groupApi, this._httpClient) : super(const GroupState());

  final GroupApi _groupApi;
  final HttpClientPort _httpClient;

  Future<void> loadGroups(String userId) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final groups = await _groupApi.getUserGroups(userId);
      state = state.copyWith(groups: groups, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<Group?> createGroup({
    required String name,
    String? description,
    required List<String> memberIds,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final group = await _groupApi.createGroup(
        name: name,
        description: description,
        memberIds: memberIds,
      );
      state = state.copyWith(
        groups: [...state.groups, group],
        isLoading: false,
      );
      return group;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return null;
    }
  }

  Future<bool> leaveGroup(String groupId) async {
    try {
      await _groupApi.leaveGroup(groupId);
      state = state.copyWith(
        groups: state.groups.where((g) => g.id != groupId).toList(),
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<List<GroupMember>> getMembers(String groupId) async {
    return _groupApi.getMembers(groupId);
  }
}
```

- [ ] **Step 3: 确认 providers.dart 中已注册 groupApiProvider 和 groupStateProvider**

（已在 Task 3 Step 1 中完成，确认无误即可）

- [ ] **Step 4: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/group/`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd flutter
git add apps/web/lib/features/group/
git commit -m "feat(group): add GroupApi and GroupNotifier for group management"
```

---

## Task 10: 群聊功能 — 群组页面 + 路由

**Files:**
- Create: `flutter/apps/web/lib/features/group/presentation/group_list_page.dart`
- Create: `flutter/apps/web/lib/features/group/presentation/create_group_page.dart`
- Create: `flutter/apps/web/lib/features/group/presentation/widgets/group_tile.dart`
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: 创建 GroupTile 组件**

```dart
// flutter/apps/web/lib/features/group/presentation/widgets/group_tile.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class GroupTile extends StatelessWidget {
  const GroupTile({required this.group, this.onTap, super.key});
  final Group group;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundImage:
            group.avatar != null ? NetworkImage(group.avatar!) : null,
        child: group.avatar == null
            ? Text(group.name.isNotEmpty ? group.name[0] : '?')
            : null,
      ),
      title: Text(group.name),
      subtitle: Text(
        '${group.memberCount ?? 0} members',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      onTap: onTap,
    );
  }
}
```

- [ ] **Step 2: 创建 GroupListPage**

```dart
// flutter/apps/web/lib/features/group/presentation/group_list_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import '../../../core/di/providers.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../chat/presentation/chat_provider.dart';
import 'widgets/group_tile.dart';

class GroupListPage extends ConsumerStatefulWidget {
  const GroupListPage({super.key});

  @override
  ConsumerState<GroupListPage> createState() => _GroupListPageState();
}

class _GroupListPageState extends ConsumerState<GroupListPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final userId = ref.read(authStateProvider).user?.id;
      if (userId != null) {
        ref.read(groupStateProvider.notifier).loadGroups(userId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final groupState = ref.watch(groupStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Groups'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => context.push('/groups/create'),
            tooltip: 'Create Group',
          ),
        ],
      ),
      body: groupState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : groupState.groups.isEmpty
              ? const Center(child: Text('No groups yet'))
              : ListView.builder(
                  itemCount: groupState.groups.length,
                  itemBuilder: (context, index) {
                    final group = groupState.groups[index];
                    return GroupTile(
                      group: group,
                      onTap: () {
                        // Open group chat
                        final chatNotifier =
                            ref.read(chatStateProvider.notifier);
                        chatNotifier.setActiveSession(group.id);
                        chatNotifier.loadGroupMessages(group.id);
                        context.go('/chat');
                      },
                    );
                  },
                ),
    );
  }
}
```

- [ ] **Step 3: 创建 CreateGroupPage**

```dart
// flutter/apps/web/lib/features/group/presentation/create_group_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/di/providers.dart';
import '../../contacts/presentation/contacts_provider.dart';

class CreateGroupPage extends ConsumerStatefulWidget {
  const CreateGroupPage({super.key});

  @override
  ConsumerState<CreateGroupPage> createState() => _CreateGroupPageState();
}

class _CreateGroupPageState extends ConsumerState<CreateGroupPage> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final Set<String> _selectedMemberIds = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(contactsStateProvider.notifier).loadFriends();
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _createGroup() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    final group = await ref.read(groupStateProvider.notifier).createGroup(
          name: name,
          description: _descController.text.trim().isEmpty
              ? null
              : _descController.text.trim(),
          memberIds: _selectedMemberIds.toList(),
        );

    if (group != null && mounted) {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final contactsState = ref.watch(contactsStateProvider);
    final groupState = ref.watch(groupStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Group'),
        actions: [
          TextButton(
            onPressed: groupState.isLoading ? null : _createGroup,
            child: groupState.isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Create'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: 'Group Name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descController,
            decoration: const InputDecoration(
              labelText: 'Description (optional)',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 24),
          Text('Select Members', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...contactsState.friends.map((friend) => CheckboxListTile(
                value: _selectedMemberIds.contains(friend.friendId),
                onChanged: (checked) {
                  setState(() {
                    if (checked == true) {
                      _selectedMemberIds.add(friend.friendId);
                    } else {
                      _selectedMemberIds.remove(friend.friendId);
                    }
                  });
                },
                title: Text(friend.nickname ?? friend.username),
                secondary: CircleAvatar(
                  backgroundImage: friend.avatar != null
                      ? NetworkImage(friend.avatar!)
                      : null,
                  child: friend.avatar == null
                      ? Text((friend.nickname ?? friend.username)
                          .isNotEmpty
                          ? (friend.nickname ?? friend.username)[0]
                          : '?')
                      : null,
                ),
              )),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: 更新路由**

修改 `flutter/apps/web/lib/core/router/app_router.dart`：

1. 在文件顶部添加 import：
```dart
import '../../features/group/presentation/group_list_page.dart';
import '../../features/group/presentation/create_group_page.dart';
```

2. 在 `ShellRoute` 的 `routes` 中添加群组路由（在 `/contacts` 之后）：
```dart
GoRoute(path: '/groups', builder: (_, __) => const GroupListPage()),
GoRoute(path: '/groups/create', builder: (_, __) => const CreateGroupPage()),
```

3. 修改 `MainLayout` 的 `NavigationRail`，在 `contacts` 和 `moments` 之间添加 `groups`：
```dart
const NavigationRailDestination(
  icon: Icon(Icons.group_outlined),
  selectedIcon: Icon(Icons.group),
  label: Text('Groups'),
),
```

4. 更新 `_selectedIndex` 的计算逻辑，在 `contacts` 之后加入 `groups`：
```dart
int _selectedIndex(String path) {
  if (path.startsWith('/chat')) return 0;
  if (path.startsWith('/contacts')) return 1;
  if (path.startsWith('/groups')) return 2;
  if (path.startsWith('/moments')) return 3;
  if (path.startsWith('/settings')) return 4;
  return 0;
}
```

5. 更新 `_onDestinationSelected` 的路由映射：
```dart
void _onDestinationSelected(int index) {
  switch (index) {
    case 0: context.go('/chat'); break;
    case 1: context.go('/contacts'); break;
    case 2: context.go('/groups'); break;
    case 3: context.go('/moments'); break;
    case 4: context.go('/settings'); break;
  }
}
```

- [ ] **Step 5: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/group/ lib/core/router/app_router.dart`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd flutter
git add apps/web/lib/features/group/presentation/ apps/web/lib/core/router/app_router.dart
git commit -m "feat(group): add group list page, create group page, and routes"
```

---

## Task 11: 在线状态 + 好友点击打开聊天 + 修复 isMe

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart`
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 扩展 ContactsNotifier 支持在线状态更新**

修改 `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart`：

```dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/contacts_api.dart';

class ContactsState {
  const ContactsState({
    this.friends = const [],
    this.friendRequests = const [],
    this.isLoading = false,
  });

  final List<Friendship> friends;
  final List<FriendRequest> friendRequests;
  final bool isLoading;

  ContactsState copyWith({
    List<Friendship>? friends,
    List<FriendRequest>? friendRequests,
    bool? isLoading,
  }) {
    return ContactsState(
      friends: friends ?? this.friends,
      friendRequests: friendRequests ?? this.friendRequests,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class ContactsNotifier extends StateNotifier<ContactsState> {
  ContactsNotifier(this._api, this._wsClient) : super(const ContactsState()) {
    _subscribeToWs();
  }

  final ContactsApi _api;
  final WsClientPort _wsClient;
  StreamSubscription? _wsSubscription;

  void _subscribeToWs() {
    _wsSubscription = _wsClient.events.listen((event) {
      if (event.type == WsMessageType.onlineStatus) {
        _handleOnlineStatus(event.data);
      } else if (event.type == WsMessageType.friendRequest ||
          event.type == WsMessageType.friendAccepted) {
        // Refresh contacts on friend events
        loadFriends();
      }
    });
  }

  void _handleOnlineStatus(Map<String, dynamic> data) {
    try {
      final userIds = (data['userIds'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];
      final online = data['online'] as bool? ?? false;

      if (userIds.isEmpty) return;

      final updatedFriends = state.friends.map((f) {
        if (userIds.contains(f.friendId)) {
          return f.copyWith(isOnline: online);
        }
        return f;
      }).toList();

      state = state.copyWith(friends: updatedFriends);
    } catch (e) {
      print('Failed to handle online status: $e');
    }
  }

  Future<void> loadFriends() async {
    state = state.copyWith(isLoading: true);
    try {
      final friends = await _api.getFriends();
      try {
        final requests = await _api.getFriendRequests();
        state = state.copyWith(
          friends: friends,
          friendRequests: requests,
          isLoading: false,
        );
      } catch (_) {
        state = state.copyWith(friends: friends, isLoading: false);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> acceptRequest(String requestId) async {
    await _api.acceptFriendRequest(requestId);
    await loadFriends();
  }

  Future<void> rejectRequest(String requestId) async {
    await _api.rejectFriendRequest(requestId);
    await loadFriends();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
```

- [ ] **Step 2: 更新 providers.dart 中 contactsStateProvider**

修改 `providers.dart` 中 `contactsStateProvider` 的定义，注入 `wsClientProvider`：

```dart
final contactsStateProvider = StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(ref.watch(contactsApiProvider), ref.watch(wsClientProvider));
});
```

- [ ] **Step 3: 修改 ContactsPage 支持好友点击打开聊天**

修改 `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`：

在文件顶部添加 import：
```dart
import 'package:go_router/go_router.dart';
import '../../chat/presentation/chat_provider.dart';
```

修改 `_FriendTile` 的 `onTap` 回调（在 `contacts_page.dart` 中找到 `_FriendTile` 的 `onTap`）：

```dart
onTap: () async {
  final chatNotifier = ref.read(chatStateProvider.notifier);
  final session = await chatNotifier.getOrCreateSession(friend.friendId);
  if (session != null) {
    chatNotifier.setActiveSession(session.id);
    if (context.mounted) {
      context.go('/chat');
    }
  }
},
```

注意：需要将 `_FriendTile` 改为 `ConsumerWidget` 或通过回调传递 `ref`。最简单的方式是在 `ContactsPage` 中定义回调并传入。

- [ ] **Step 4: 修复 ChatPage 中的 isMe 硬编码**

修改 `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`：

1. 在文件顶部添加 import：
```dart
import '../../auth/presentation/auth_provider.dart';
```

2. 找到 `isMe: msg.senderId == 'current_user'` 这行（约第 149 行），替换为：
```dart
final currentUserId = ref.watch(authStateProvider).user?.id ?? '';
// ...
isMe: msg.senderId == currentUserId,
```

- [ ] **Step 5: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/contacts/ lib/features/chat/presentation/chat_page.dart`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd flutter
git add apps/web/lib/features/contacts/presentation/contacts_provider.dart \
       apps/web/lib/features/contacts/presentation/contacts_page.dart \
       apps/web/lib/features/chat/presentation/chat_page.dart \
       apps/web/lib/core/di/providers.dart
git commit -m "feat(contacts): add online status updates, friend tap opens chat, fix isMe hardcoded"
```

---

## Task 12: 全局错误提示 + 代码质量修复

**Files:**
- Create: `flutter/apps/web/lib/core/error/error_notifier.dart`
- Modify: `flutter/apps/web/lib/core/router/app_router.dart` (MainLayout)
- Modify: `flutter/apps/web/lib/adapters/web_http_adapter.dart`
- Modify: `flutter/apps/web/lib/features/moments/presentation/moments_provider.dart`

- [ ] **Step 1: 创建 ErrorNotifier**

```dart
// flutter/apps/web/lib/core/error/error_notifier.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ErrorState {
  const ErrorState({this.message, this.timestamp});
  final String? message;
  final DateTime? timestamp;
}

class ErrorNotifier extends StateNotifier<ErrorState> {
  ErrorNotifier() : super(const ErrorState());

  void showError(String message) {
    state = ErrorState(message: message, timestamp: DateTime.now());
  }

  void clear() {
    state = const ErrorState();
  }
}
```

- [ ] **Step 2: 在 MainLayout 中添加 SnackBar 错误监听**

修改 `flutter/apps/web/lib/core/router/app_router.dart` 中的 `MainLayout`：

将 `MainLayout` 从 `StatelessWidget` 改为 `ConsumerWidget`，然后在 `build` 方法中添加错误监听：

```dart
class MainLayout extends ConsumerWidget {
  const MainLayout({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Listen for errors
    ref.listen<ErrorState>(errorProvider, (prev, next) {
      if (next.message != null && next.message != prev?.message) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.message!),
            duration: const Duration(seconds: 3),
          ),
        );
        ref.read(errorProvider.notifier).clear();
      }
    });

    // ... rest of the existing build method
  }
}
```

- [ ] **Step 3: 修复 WebHttpClient._parseResponse 类型检查**

修改 `flutter/apps/web/lib/adapters/web_http_adapter.dart` 中的 `_parseResponse` 方法：

找到解析 `data` 的部分，将假设 `data` 是 `Map` 的逻辑改为类型检查：

```dart
// Before: assumes data is always a Map
final data = jsonBody['data'];

// After: add type check
final rawData = jsonBody['data'];
dynamic data;
if (rawData is Map<String, dynamic>) {
  data = rawData;
} else if (rawData is List) {
  data = rawData;
} else {
  data = rawData;
}
```

- [ ] **Step 4: 修复 MomentsNotifier 分页逻辑**

修改 `flutter/apps/web/lib/features/moments/presentation/moments_provider.dart`：

在 `MomentsState` 中添加 `hasMore` 和 `cursor` 字段：

```dart
class MomentsState {
  const MomentsState({
    this.posts = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.cursor,
    this.error,
  });

  final List<MomentsPost> posts;
  final bool isLoading;
  final bool hasMore;
  final String? cursor;
  final String? error;

  MomentsState copyWith({
    List<MomentsPost>? posts,
    bool? isLoading,
    bool? hasMore,
    String? cursor,
    String? error,
  }) {
    return MomentsState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      cursor: cursor ?? this.cursor,
      error: error,
    );
  }
}
```

修改 `loadFeed` 方法支持分页：

```dart
Future<void> loadFeed({bool refresh = false}) async {
  if (state.isLoading) return;
  if (!refresh && !state.hasMore) return;

  state = state.copyWith(isLoading: true, error: null);
  try {
    final newPosts = await _api.getFeed(
      cursor: refresh ? null : state.cursor,
    );
    state = state.copyWith(
      posts: refresh ? newPosts : [...state.posts, ...newPosts],
      isLoading: false,
      hasMore: newPosts.length >= 20, // page size
      cursor: newPosts.isNotEmpty ? newPosts.last.id : state.cursor,
    );
  } catch (e) {
    state = state.copyWith(isLoading: false, error: e.toString());
  }
}
```

- [ ] **Step 5: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd flutter
git add apps/web/lib/core/error/error_notifier.dart \
       apps/web/lib/core/router/app_router.dart \
       apps/web/lib/adapters/web_http_adapter.dart \
       apps/web/lib/features/moments/presentation/moments_provider.dart \
       apps/web/lib/core/di/providers.dart
git commit -m "fix(web): add global error snackbar, fix HTTP parse type check, add moments pagination"
```

---

## Task 13: ChatPage 集成 — 群聊支持 + 消息类型发送

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 更新 ChatPage 支持群聊和多媒体发送**

修改 `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`：

1. 在文件顶部添加必要的 import：
```dart
import 'package:im_core/core.dart';
import '../../auth/presentation/auth_provider.dart';
import '../data/file_api.dart';
```

2. 更新 session tap handler，区分私聊和群聊：
```dart
onTap: () {
  ref.read(chatStateProvider.notifier).setActiveSession(session.id);
  if (session.conversationType == 'group' || session.type == 'group') {
    ref.read(chatStateProvider.notifier).loadGroupMessages(session.targetId);
  } else {
    ref.read(chatStateProvider.notifier).loadMessages(session.targetId);
  }
},
```

3. 更新 `MessageInput` 的 `onSend` 回调，支持多媒体：
```dart
MessageInput(
  onSend: (text) {
    final activeSession = chatState.sessions
        .where((s) => s.id == chatState.activeSessionId)
        .firstOrNull;
    if (activeSession == null) return;
    if (activeSession.conversationType == 'group' ||
        activeSession.type == 'group') {
      ref.read(chatStateProvider.notifier).sendGroupMessage(
            activeSession.targetId,
            text,
          );
    } else {
      ref.read(chatStateProvider.notifier).sendMessage(
            activeSession.targetId,
            text,
          );
    }
  },
),
```

- [ ] **Step 2: 确认编译通过**

Run: `cd flutter/apps/web && dart analyze lib/features/chat/presentation/chat_page.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(chat): integrate group chat support and multi-type message sending"
```

---

## Task 14: 最终验证 — 全量编译 + 端到端检查

**Files:** 无新增/修改

- [ ] **Step 1: 全量编译检查**

Run: `cd flutter/apps/web && dart analyze lib/`
Expected: No errors

- [ ] **Step 2: 检查所有 provider 依赖链是否正确**

确认 `providers.dart` 中的 provider 依赖链：
- `wsClientProvider` → `WebWsClient`
- `authStateProvider` → `AuthNotifier` (depends on `authRepositoryProvider`, `wsClientProvider`)
- `chatStateProvider` → `ChatNotifier` (depends on `messageApiProvider`, `MessagePipeline`, `wsClientProvider`)
- `contactsStateProvider` → `ContactsNotifier` (depends on `contactsApiProvider`, `wsClientProvider`)
- `groupStateProvider` → `GroupNotifier` (depends on `groupApiProvider`, `httpClientProvider`)
- `errorProvider` → `ErrorNotifier`
- `fileApiProvider` → `FileApi` (depends on `httpClientProvider`)

- [ ] **Step 3: 运行应用验证**

Run: `cd flutter/apps/web && flutter run -d chrome`
Expected: App launches, login works, chat loads, WS connects

- [ ] **Step 4: 最终 Commit（如有修复）**

```bash
cd flutter
git add -A
git commit -m "chore(flutter): P0 core features complete - final fixes"
```
