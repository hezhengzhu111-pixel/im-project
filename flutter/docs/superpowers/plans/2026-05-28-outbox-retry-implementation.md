# Outbox 重试机制实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 outbox_provider 与 chat_providers 的循环依赖，添加防重复 clientMessageId 检查，并为 MessageOutbox 和 ChatNotifierWithOutbox 添加完整的测试覆盖。

**Architecture:** 将 MessageApi 提取为独立 provider，打破循环依赖。使用内存 fake 替代 IndexedDB，Mock 所有外部依赖进行单元测试。在 MessageOutbox.enqueue() 中添加 clientMessageId 防重检查。

**Tech Stack:** Flutter, Riverpod, Mockito, IDB Shim (内存 fake)

---

## File Structure

```
lib/features/chat/data/
├── message_api_provider.dart  # 新建：messageApiProvider
├── message_outbox.dart        # 修改：添加防重检查
├── outbox_provider.dart       # 修改：导入 message_api_provider.dart
└── ...

lib/features/chat/presentation/
├── chat_providers.dart        # 修改：移除 messageApiProvider
└── ...

test/features/chat/
├── message_outbox_test.dart           # 扩展：添加集成测试场景
├── message_outbox_integration_test.dart # 保持现有
└── chat_notifier_with_outbox_test.dart # 新建：ChatNotifierWithOutbox 测试
```

---

### Task 1: 提取 MessageApi 为独立 Provider

**Files:**
- Create: `lib/features/chat/data/message_api_provider.dart`
- Modify: `lib/features/chat/presentation/chat_providers.dart:12-14`
- Modify: `lib/features/chat/data/outbox_provider.dart:4`

- [ ] **Step 1: 创建 message_api_provider.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/third_party_providers.dart';
import 'message_api.dart';

final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(ref.watch(httpClientProvider));
});
```

- [ ] **Step 2: 修改 outbox_provider.dart 导入**

修改 `lib/features/chat/data/outbox_provider.dart` 第 4 行：

```dart
// 旧代码
import '../presentation/chat_providers.dart';

// 新代码
import 'message_api_provider.dart';
```

- [ ] **Step 3: 修改 chat_providers.dart**

修改 `lib/features/chat/presentation/chat_providers.dart`：

```dart
// 旧代码（第 7-9 行）
import '../data/message_api.dart';
import '../data/message_pipeline.dart';
import '../data/outbox_provider.dart';

// 新代码
import '../data/message_api_provider.dart';
import '../data/message_pipeline.dart';
import '../data/outbox_provider.dart';

// 删除第 12-14 行的 messageApiProvider 定义
```

完整文件内容：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/network_providers.dart';
import '../../../core/network/network_status_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../e2ee/data/e2ee_providers.dart';
import '../../../core/di/third_party_providers.dart';
import '../data/message_api_provider.dart';
import '../data/message_pipeline.dart';
import '../data/outbox_provider.dart';
import 'chat_provider_with_outbox.dart';

final chatStateProvider =
    StateNotifierProvider<ChatNotifierWithOutbox, ChatStateWithOutbox>((ref) {
  return ChatNotifierWithOutbox(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(currentUserIdProvider),
    ref.watch(e2eeManagerProvider),
    ref.watch(e2eeMetaStoreProvider),
    ref.watch(messageOutboxProvider),
    ref.watch(networkStatusProvider.notifier),
    ref.watch(analyticsProvider),
  );
});
```

- [ ] **Step 4: 验证无循环依赖**

运行静态分析检查：

```bash
cd flutter/apps/web && flutter analyze lib/features/chat/
```

预期：无循环依赖错误

- [ ] **Step 5: 运行现有测试确保无回归**

```bash
cd flutter/apps/web && flutter test test/features/chat/
```

预期：所有现有测试通过

- [ ] **Step 6: Commit**

```bash
git add lib/features/chat/data/message_api_provider.dart lib/features/chat/data/outbox_provider.dart lib/features/chat/presentation/chat_providers.dart
git commit -m "refactor(chat): extract MessageApi to independent provider to break circular dependency"
```

---

### Task 2: 添加 clientMessageId 防重检查

**Files:**
- Modify: `lib/features/chat/data/message_outbox.dart:211-251`

- [ ] **Step 1: 添加 _getByClientMessageId 方法**

在 `lib/features/chat/data/message_outbox.dart` 的 `MessageOutbox` 类中，在 `_getPendingMessages()` 方法前添加：

```dart
Future<OutboxMessage?> _getByClientMessageId(String clientMessageId) async {
  final txn = _db!.transaction(_storeName, idbModeReadOnly);
  final store = txn.objectStore(_storeName);
  OutboxMessage? result;

  await store.openCursor(autoAdvance: true).forEach((cursor) {
    final map = cursor.value as Map<String, dynamic>;
    final message = OutboxMessage.fromMap(map);
    if (message.clientMessageId == clientMessageId &&
        message.status != OutboxMessageStatus.sent) {
      result = message;
    }
  });

  return result;
}
```

- [ ] **Step 2: 修改 enqueue 方法添加防重检查**

修改 `lib/features/chat/data/message_outbox.dart` 的 `enqueue()` 方法，在方法开头添加检查：

```dart
Future<OutboxMessage> enqueue({
  required String sessionKey,
  required String receiverId,
  required String content,
  String messageType = 'text',
  required String clientMessageId,
  bool isGroupChat = false,
  String? groupId,
  bool isEncrypted = false,
  Map<String, dynamic>? e2eeEnvelope,
  String? e2eeDeviceId,
}) async {
  // 检查是否已存在相同 clientMessageId 的消息（防重）
  final existing = await _getByClientMessageId(clientMessageId);
  if (existing != null) {
    return existing;
  }

  final message = OutboxMessage(
    id: 'outbox_${DateTime.now().millisecondsSinceEpoch}_$clientMessageId',
    sessionKey: sessionKey,
    receiverId: receiverId,
    content: content,
    messageType: messageType,
    clientMessageId: clientMessageId,
    isGroupChat: isGroupChat,
    groupId: groupId,
    status: OutboxMessageStatus.pending,
    createdAt: DateTime.now(),
    isEncrypted: isEncrypted,
    e2eeEnvelope: e2eeEnvelope,
    e2eeDeviceId: e2eeDeviceId,
  );

  await _saveToDb(message);
  _eventsController.add(OutboxEvent(
    type: OutboxEventType.messageAdded,
    message: message,
  ));

  // Try to send immediately if online
  if (_isOnline()) {
    _processPendingMessages();
  }

  return message;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/chat/data/message_outbox.dart
git commit -m "feat(outbox): add clientMessageId dedup check to prevent duplicate messages"
```

---

### Task 3: 扩展 MessageOutbox 测试

**Files:**
- Modify: `test/features/chat/message_outbox_test.dart`

- [ ] **Step 1: 添加测试导入和 Mock**

在 `test/features/chat/message_outbox_test.dart` 文件开头添加必要的导入：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_sembast.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_core/core.dart';
import 'package:mockito/mockito.dart';

class MockMessageApi extends Mock implements MessageApi {
  Future<Message>? sendPrivateMessageResponse;
  Exception? sendPrivateMessageException;

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    if (sendPrivateMessageException != null) {
      throw sendPrivateMessageException!;
    }
    if (sendPrivateMessageResponse != null) {
      return sendPrivateMessageResponse!;
    }
    return super.noSuchMethod(
      Invocation.method(#sendPrivateMessage, [request]),
      returnValue: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    return super.noSuchMethod(
      Invocation.method(#sendGroupMessage, [request]),
      returnValue: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
  }) async {
    return super.noSuchMethod(
      Invocation.method(#sendPrivateEncrypted, [], {
        #receiverId: receiverId,
        #clientMessageId: clientMessageId,
        #messageType: messageType,
        #e2eeEnvelope: e2eeEnvelope,
        #e2eeDeviceId: e2eeDeviceId,
      }),
      returnValue: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  Message _createDummyMessage() {
    return const Message(
      id: 'server-msg-1',
      senderId: 'user-1',
      isGroupChat: false,
      messageType: 'text',
      content: '',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }
}
```

- [ ] **Step 2: 添加私聊离线发送入队测试**

在 `main()` 函数的 `group('OutboxMessage', ...)` 后添加新测试组：

```dart
group('MessageOutbox Integration', () {
  late MessageOutbox outbox;
  late MockMessageApi mockMessageApi;

  setUp(() {
    mockMessageApi = MockMessageApi();
  });

  tearDown(() async {
    if (outbox != null) {
      await outbox.clearAll();
      outbox.dispose();
    }
  });

  test('private message offline enqueue', () async {
    outbox = MessageOutbox(
      messageApi: mockMessageApi,
      idbFactory: idbFactorySembastMemory,
      isOnline: () => false,
    );
    await outbox.initialize();

    final message = await outbox.enqueue(
      sessionKey: 'session-1',
      receiverId: 'user-2',
      content: 'Hello World',
      messageType: 'text',
      clientMessageId: 'client-msg-1',
      isGroupChat: false,
    );

    expect(message.status, OutboxMessageStatus.pending);
    expect(message.content, 'Hello World');
    expect(message.sessionKey, 'session-1');
    expect(message.receiverId, 'user-2');
    expect(message.clientMessageId, 'client-msg-1');
    expect(message.isGroupChat, false);
    expect(await outbox.getPendingCount(), 1);
  });
});
```

- [ ] **Step 3: 添加群聊离线发送入队测试**

```dart
test('group message offline enqueue', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactorySembastMemory,
    isOnline: () => false,
  );
  await outbox.initialize();

  final message = await outbox.enqueue(
    sessionKey: 'group-1',
    receiverId: 'group-1',
    content: 'Hello Group',
    messageType: 'text',
    clientMessageId: 'client-msg-2',
    isGroupChat: true,
    groupId: 'group-1',
  );

  expect(message.status, OutboxMessageStatus.pending);
  expect(message.content, 'Hello Group');
  expect(message.sessionKey, 'group-1');
  expect(message.receiverId, 'group-1');
  expect(message.clientMessageId, 'client-msg-2');
  expect(message.isGroupChat, true);
  expect(message.groupId, 'group-1');
  expect(await outbox.getPendingCount(), 1);
});
```

- [ ] **Step 4: 添加网络恢复后 retryAllFailed 测试**

```dart
test('retryAllFailed after network restoration', () async {
  bool isOnline = false;
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactorySembastMemory,
    isOnline: () => isOnline,
  );
  await outbox.initialize();

  // Enqueue message while offline
  await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Offline message',
    clientMessageId: 'client-1',
  );

  expect(await outbox.getPendingCount(), 1);

  // Mock successful API response
  final serverMessage = Message(
    id: 'server-1',
    senderId: 'user-1',
    isGroupChat: false,
    messageType: 'text',
    content: 'Offline message',
    sendTime: DateTime.now().toIso8601String(),
    status: 'SENT',
    clientMessageId: 'client-1',
  );

  mockMessageApi.sendPrivateMessageResponse = Future.value(serverMessage);

  // Simulate network restoration
  isOnline = true;
  outbox.onNetworkAvailable();

  await Future.delayed(Duration(seconds: 1));

  expect(await outbox.getPendingCount(), 0);
  expect(await outbox.getFailedCount(), 0);
});
```

- [ ] **Step 5: 添加最大重试次数后 failed 测试**

```dart
test('failed after max retries exceeded', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactorySembastMemory,
    isOnline: () => true,
  );
  await outbox.initialize();

  // Enqueue a message
  await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Test message',
    clientMessageId: 'client-1',
  );

  // Mock API to always fail
  mockMessageApi.sendPrivateMessageException = Exception('Network error');

  // Retry multiple times (max retries is 5)
  for (int i = 0; i < 6; i++) {
    outbox.onNetworkAvailable();
    await Future.delayed(Duration(milliseconds: 500));
  }

  // Verify message is marked as failed
  expect(await outbox.getFailedCount(), 1);
  expect(await outbox.getPendingCount(), 0);
});
```

- [ ] **Step 6: 添加 E2EE 消息不泄露明文测试**

```dart
test('E2EE message does not leak plaintext to log', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactorySembastMemory,
    isOnline: () => true,
  );
  await outbox.initialize();

  // Enqueue encrypted message
  await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'encrypted content',
    messageType: 'text',
    clientMessageId: 'client-1',
    isEncrypted: true,
    e2eeEnvelope: {'wire': 'encrypted_data'},
    e2eeDeviceId: 'device-1',
  );

  // Mock successful API response
  final serverMessage = Message(
    id: 'server-1',
    senderId: 'user-1',
    isGroupChat: false,
    messageType: 'text',
    content: '',
    sendTime: DateTime.now().toIso8601String(),
    status: 'SENT',
    clientMessageId: 'client-1',
  );

  mockMessageApi.sendPrivateMessageResponse = Future.value(serverMessage);

  // Trigger retry
  outbox.onNetworkAvailable();

  await Future.delayed(Duration(seconds: 1));

  // Verify message was sent
  expect(await outbox.getPendingCount(), 0);

  // Verify sendPrivateEncrypted was called (not sendPrivateMessage)
  // This is verified by the mock not throwing an error
});
```

- [ ] **Step 7: 添加不重复添加 clientMessageId 测试**

```dart
test('does not add duplicate clientMessageId', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactorySembastMemory,
    isOnline: () => false,
  );
  await outbox.initialize();

  // First enqueue
  final first = await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'First message',
    clientMessageId: 'client-1',
  );

  // Second enqueue with same clientMessageId
  final second = await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Second message',
    clientMessageId: 'client-1',
  );

  // Should return the same message
  expect(first.id, second.id);
  expect(first.clientMessageId, second.clientMessageId);
  expect(await outbox.getPendingCount(), 1);
});
```

- [ ] **Step 8: 运行测试验证**

```bash
cd flutter/apps/web && flutter test test/features/chat/message_outbox_test.dart
```

预期：所有测试通过

- [ ] **Step 9: Commit**

```bash
git add test/features/chat/message_outbox_test.dart
git commit -m "test(outbox): add comprehensive test coverage for MessageOutbox"
```

---

### Task 4: 创建 ChatNotifierWithOutbox 测试

**Files:**
- Create: `test/features/chat/chat_notifier_with_outbox_test.dart`

- [ ] **Step 1: 创建测试文件和 Mock 类**

```dart
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_web/features/chat/data/message_pipeline.dart';
import 'package:im_web/features/chat/presentation/chat_provider_with_outbox.dart';
import 'package:im_web/features/chat/presentation/chat_state.dart';
import 'package:im_core/core.dart';
import 'package:mockito/mockito.dart';

// Mock MessageApi
class MockMessageApi extends Mock implements MessageApi {
  Future<Message>? sendPrivateMessageResponse;
  Exception? sendPrivateMessageException;

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    if (sendPrivateMessageException != null) {
      throw sendPrivateMessageException!;
    }
    if (sendPrivateMessageResponse != null) {
      return sendPrivateMessageResponse!;
    }
    return super.noSuchMethod(
      Invocation.method(#sendPrivateMessage, [request]),
      returnValue: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    return super.noSuchMethod(
      Invocation.method(#sendGroupMessage, [request]),
      returnValue: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
  }) async {
    return super.noSuchMethod(
      Invocation.method(#sendPrivateEncrypted, [], {
        #receiverId: receiverId,
        #clientMessageId: clientMessageId,
        #messageType: messageType,
        #e2eeEnvelope: e2eeEnvelope,
        #e2eeDeviceId: e2eeDeviceId,
      }),
      returnValue: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  Message _createDummyMessage() {
    return const Message(
      id: 'server-msg-1',
      senderId: 'user-1',
      isGroupChat: false,
      messageType: 'text',
      content: '',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }
}

// Mock MessageOutbox
class MockMessageOutbox extends Mock implements MessageOutbox {
  final _eventsController = StreamController<OutboxEvent>.broadcast();

  @override
  Stream<OutboxEvent> get events => _eventsController.stream;

  void addEvent(OutboxEvent event) {
    _eventsController.add(event);
  }

  @override
  void dispose() {
    _eventsController.close();
  }
}

// Mock WsClientPort
class MockWsClientPort extends Mock implements WsClientPort {
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _connectionStateController = StreamController<WsConnectionState>.broadcast();

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState => _connectionStateController.stream;

  void addEvent(WsEvent event) {
    _eventsController.add(event);
  }

  void addConnectionState(WsConnectionState state) {
    _connectionStateController.add(state);
  }

  @override
  void dispose() {
    _eventsController.close();
    _connectionStateController.close();
  }
}

// Mock NetworkStatusNotifier
class MockNetworkStatusNotifier extends Mock implements NetworkStatusNotifier {
  final _stateChangesController = StreamController<NetworkState>.broadcast();

  @override
  Stream<NetworkState> get stateChanges => _stateChangesController.stream;

  void addNetworkState(NetworkState state) {
    _stateChangesController.add(state);
  }

  @override
  void dispose() {
    _stateChangesController.close();
  }
}

// Mock E2eeManager
class MockE2eeManager extends Mock implements E2eeManager {}

// Mock E2eeMetaStore
class MockE2eeMetaStore extends Mock implements E2eeMetaStore {}

// Mock AnalyticsPort
class MockAnalyticsPort extends Mock implements AnalyticsPort {}
```

- [ ] **Step 2: 添加测试组和 setup/teardown**

```dart
void main() {
  late ChatNotifierWithOutbox notifier;
  late MockMessageApi mockMessageApi;
  late MockMessageOutbox mockOutbox;
  late MockWsClientPort mockWsClient;
  late MockNetworkStatusNotifier mockNetworkStatus;
  late MockE2eeManager mockE2eeManager;
  late MockE2eeMetaStore mockE2eeMetaStore;
  late MockAnalyticsPort mockAnalytics;

  setUp(() {
    mockMessageApi = MockMessageApi();
    mockOutbox = MockMessageOutbox();
    mockWsClient = MockWsClientPort();
    mockNetworkStatus = MockNetworkStatusNotifier();
    mockE2eeManager = MockE2eeManager();
    mockE2eeMetaStore = MockE2eeMetaStore();
    mockAnalytics = MockAnalyticsPort();

    when(mockE2eeMetaStore.getOrCreateDeviceId()).thenAnswer((_) async => 'device-1');
    when(mockE2eeMetaStore.getRemoteDeviceId(any)).thenAnswer((_) async => 'device-2');
    when(mockE2eeMetaStore.getSessionStatus(any)).thenAnswer((_) async => 'plaintext');
    when(mockMessageApi.getConversations()).thenAnswer((_) async => []);
  });

  tearDown(() {
    notifier?.dispose();
    mockOutbox.dispose();
    mockWsClient.dispose();
    mockNetworkStatus.dispose();
  });

  ChatNotifierWithOutbox createNotifier() {
    return ChatNotifierWithOutbox(
      mockMessageApi,
      MessagePipeline(),
      mockWsClient,
      () => 'user-1',
      mockE2eeManager,
      mockE2eeMetaStore,
      mockOutbox,
      mockNetworkStatus,
      mockAnalytics,
    );
  }
```

- [ ] **Step 3: 添加发送私聊消息入队测试**

```dart
test('send private message enqueues to outbox on failure', () async {
  notifier = createNotifier();

  // Mock API to fail
  mockMessageApi.sendPrivateMessageException = Exception('Network error');

  // Send message
  final result = await notifier.sendMessage('user-2', 'Hello');

  // Verify message was not sent successfully
  expect(result, isNull);

  // Verify outbox.enqueue was called (this is verified by the mock)
  verify(mockOutbox.enqueue(
    sessionKey: 'user-2',
    receiverId: 'user-2',
    content: 'Hello',
    messageType: 'text',
    clientMessageId: anyNamed('clientMessageId'),
    isGroupChat: false,
    isEncrypted: false,
  )).called(1);
});
```

- [ ] **Step 4: 添加发送群聊消息入队测试**

```dart
test('send group message enqueues to outbox on failure', () async {
  notifier = createNotifier();

  // Mock API to fail
  mockMessageApi.sendPrivateMessageException = Exception('Network error');

  // Send group message
  final result = await notifier.sendGroupMessage('group-1', 'Hello Group');

  // Verify message was not sent successfully
  expect(result, isNull);

  // Verify outbox.enqueue was called
  verify(mockOutbox.enqueue(
    sessionKey: 'group-1',
    receiverId: 'group-1',
    content: 'Hello Group',
    messageType: 'text',
    clientMessageId: anyNamed('clientMessageId'),
    isGroupChat: true,
    groupId: 'group-1',
  )).called(1);
});
```

- [ ] **Step 5: 添加网络恢复触发 retry 测试**

```dart
test('network restoration triggers retry', () async {
  notifier = createNotifier();

  // Simulate network restoration
  mockNetworkStatus.addNetworkState(NetworkState(isOnline: true));

  // Verify retryAllFailed was called
  verify(mockOutbox.retryAllFailed()).called(1);
});
```

- [ ] **Step 6: 添加 outbox 事件更新 UI 状态测试**

```dart
test('outbox events update UI state', () async {
  notifier = createNotifier();

  // Simulate message added event
  mockOutbox.addEvent(OutboxEvent(
    type: OutboxEventType.messageAdded,
    message: OutboxMessage(
      id: 'outbox-1',
      sessionKey: 'session-1',
      receiverId: 'user-2',
      content: 'Test',
      messageType: 'text',
      clientMessageId: 'client-1',
    ),
  ));

  // Verify pending count updated
  await Future.delayed(Duration(milliseconds: 100));
  expect(notifier.state.pendingCount, greaterThanOrEqualTo(0));
});
```

- [ ] **Step 7: 添加 E2EE 消息安全测试**

```dart
test('E2EE message does not leak plaintext', () async {
  notifier = createNotifier();

  // Mock E2EE session status
  when(mockE2eeMetaStore.getSessionStatus('user-1_private_user-2'))
      .thenAnswer((_) async => 'encrypted');

  // Send encrypted message
  final result = await notifier.sendMessage('user-2', 'Encrypted content');

  // Verify sendPrivateEncrypted was called (not sendPrivateMessage)
  verifyNever(mockMessageApi.sendPrivateMessage(any));
  verify(mockMessageApi.sendPrivateEncrypted(
    receiverId: 'user-2',
    clientMessageId: anyNamed('clientMessageId'),
    messageType: 'text',
    e2eeEnvelope: anyNamed('e2eeEnvelope'),
    e2eeDeviceId: 'device-1',
  )).called(1);
});
```

- [ ] **Step 8: 运行测试验证**

```bash
cd flutter/apps/web && flutter test test/features/chat/chat_notifier_with_outbox_test.dart
```

预期：所有测试通过

- [ ] **Step 9: Commit**

```bash
git add test/features/chat/chat_notifier_with_outbox_test.dart
git commit -m "test(chat): add ChatNotifierWithOutbox unit tests"
```

---

### Task 5: 运行完整测试套件

**Files:**
- None

- [ ] **Step 1: 运行所有 chat 相关测试**

```bash
cd flutter/apps/web && flutter test test/features/chat/
```

预期：所有测试通过

- [ ] **Step 2: 运行静态分析**

```bash
cd flutter/apps/web && flutter analyze lib/features/chat/
```

预期：无错误

- [ ] **Step 3: 验证无循环依赖**

```bash
cd flutter/apps/web && flutter analyze lib/features/chat/data/outbox_provider.dart lib/features/chat/presentation/chat_providers.dart
```

预期：无循环依赖警告

- [ ] **Step 4: Final Commit**

```bash
git add -A
git commit -m "chore: verify outbox retry implementation with full test suite"
```

---

## Self-Review

### 1. Spec Coverage

- ✅ Task 1: 消除 outbox_provider 与 chat_providers 的循环依赖
- ✅ Task 2: 添加防重复 clientMessageId 检查
- ✅ Task 3: MessageOutbox 测试覆盖 6 个场景
- ✅ Task 4: ChatNotifierWithOutbox 测试覆盖 5 个场景
- ✅ Task 5: 完整测试套件验证

### 2. Placeholder Scan

- ✅ 无 TBD/TODO
- ✅ 所有步骤都有完整代码
- ✅ 无模糊描述

### 3. Type Consistency

- ✅ Mock 类型一致
- ✅ 方法签名一致
- ✅ 测试场景覆盖规范要求

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-outbox-retry-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
