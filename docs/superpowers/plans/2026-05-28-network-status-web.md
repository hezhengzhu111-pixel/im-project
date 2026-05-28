# Network Status Web 激活实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 激活 Flutter Web 真实浏览器 online/offline 检测，使 outbox 离线队列和恢复重试在生产环境中正常工作。

**Architecture:** 通过条件导入在 `main.dart` 安全调用 `initWebNetworkStatus()`，激活已有的 `WebNetworkStatusDataSource`。删除从未使用的核心端口层（`NetworkStatusPort` 及其适配器）。现有 outbox-provider 联动代码已正确实现，激活后自动生效。

**Tech Stack:** Flutter Web, Riverpod, dart:html, idb_shim, flutter_test

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `apps/web/lib/core/network/network_status_initializer.dart` | 条件导入入口 |
| `apps/web/lib/core/network/network_status_initializer_stub.dart` | 非 Web 平台空实现 |
| `apps/web/lib/core/network/network_status_initializer_web.dart` | Web 平台调用 initWebNetworkStatus() |
| `apps/web/test/core/network/network_status_outbox_test.dart` | outbox 网络联动测试 |
| `docs/network-status-regression.md` | 手动回归文档 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `apps/web/lib/main.dart` | 添加 `initNetworkStatus()` 调用 |
| `apps/web/lib/features/chat/data/message_outbox.dart` | 删除 `onNetworkRestored` 参数 |
| `packages/core/lib/core.dart` | 删除 `network_status_port.dart` export |
| `packages/core/lib/src/ports/ports.dart` | 删除 `network_status_port.dart` export |
| `apps/web/lib/core/di/platform_providers.dart` | 删除 `networkStatusPortProvider` |

### 删除文件
| 文件 | 原因 |
|------|------|
| `packages/core/lib/src/ports/network_status_port.dart` | 未使用的空壳端口 |
| `apps/web/lib/adapters/web_network_status_adapter.dart` | 未使用的空壳适配器 |
| `apps/web/test/ports/network_status_port_test.dart` | 测试已删除的端口 |
| `apps/web/test/mocks/mock_network_status_adapter.dart` | Mock 已删除的适配器 |

---

### Task 1: 创建条件导入层

**Files:**
- Create: `flutter/apps/web/lib/core/network/network_status_initializer.dart`
- Create: `flutter/apps/web/lib/core/network/network_status_initializer_stub.dart`
- Create: `flutter/apps/web/lib/core/network/network_status_initializer_web.dart`

- [ ] **Step 1: 创建 stub 实现**

```dart
// flutter/apps/web/lib/core/network/network_status_initializer_stub.dart

/// Non-web platforms: no-op. NetworkStatusNotifier will use _StubNetworkDataSource.
void initNetworkStatus() {
  // Intentionally empty for non-web platforms.
}
```

- [ ] **Step 2: 创建 web 实现**

```dart
// flutter/apps/web/lib/core/network/network_status_initializer_web.dart

import 'network_status_web_init.dart';

/// Web platform: initialize with real browser online/offline events.
void initNetworkStatus() => initWebNetworkStatus();
```

- [ ] **Step 3: 创建条件导入入口**

```dart
// flutter/apps/web/lib/core/network/network_status_initializer.dart

export 'network_status_initializer_stub.dart'
    if (dart.library.html) 'network_status_initializer_web.dart';
```

- [ ] **Step 4: 验证文件创建正确**

Run: `ls flutter/apps/web/lib/core/network/network_status_initializer*.dart`
Expected: 三个文件都存在

- [ ] **Step 5: 提交**

```bash
cd flutter && git add apps/web/lib/core/network/network_status_initializer.dart apps/web/lib/core/network/network_status_initializer_stub.dart apps/web/lib/core/network/network_status_initializer_web.dart && git commit -m "feat(network): add conditional import layer for web network status init"
```

---

### Task 2: 在 main.dart 中激活网络初始化

**Files:**
- Modify: `flutter/apps/web/lib/main.dart`

- [ ] **Step 1: 修改 main.dart**

将 `main.dart` 修改为：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/network/network_status_initializer.dart';
import 'core/observer/app_provider_observer.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  initNetworkStatus();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  runApp(ProviderScope(
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));
}
```

- [ ] **Step 2: 验证 Web 构建不受影响**

Run: `cd flutter/apps/web && flutter analyze lib/main.dart`
Expected: No issues found

- [ ] **Step 3: 提交**

```bash
cd flutter && git add apps/web/lib/main.dart && git commit -m "feat(network): activate real browser network detection in main.dart"
```

---

### Task 3: 清理 MessageOutbox 冗余参数

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/data/message_outbox.dart`

- [ ] **Step 1: 删除 onNetworkRestored 参数**

在 `message_outbox.dart` 中，将 `MessageOutbox` 构造函数从：

```dart
class MessageOutbox {
  MessageOutbox({
    required MessageApi messageApi,
    required IdbFactory idbFactory,
    required bool Function() isOnline,
    void Function()? onNetworkRestored,
  })  : _messageApi = messageApi,
        _idbFactory = idbFactory,
        _isOnline = isOnline,
        _onNetworkRestored = onNetworkRestored;

  final MessageApi _messageApi;
  final IdbFactory _idbFactory;
  final bool Function() _isOnline;
  final void Function()? _onNetworkRestored;
```

修改为：

```dart
class MessageOutbox {
  MessageOutbox({
    required MessageApi messageApi,
    required IdbFactory idbFactory,
    required bool Function() isOnline,
  })  : _messageApi = messageApi,
        _idbFactory = idbFactory,
        _isOnline = isOnline;

  final MessageApi _messageApi;
  final IdbFactory _idbFactory;
  final bool Function() _isOnline;
```

- [ ] **Step 2: 验证无其他引用**

Run: `grep -r "onNetworkRestored" flutter/`
Expected: 无结果

- [ ] **Step 3: 验证分析通过**

Run: `cd flutter/apps/web && flutter analyze lib/features/chat/data/message_outbox.dart`
Expected: No issues found

- [ ] **Step 4: 提交**

```bash
cd flutter && git add apps/web/lib/features/chat/data/message_outbox.dart && git commit -m "refactor(outbox): remove unused onNetworkRestored parameter"
```

---

### Task 4: 删除核心端口层死代码

**Files:**
- Delete: `flutter/packages/core/lib/src/ports/network_status_port.dart`
- Delete: `flutter/apps/web/lib/adapters/web_network_status_adapter.dart`
- Delete: `flutter/apps/web/test/ports/network_status_port_test.dart`
- Delete: `flutter/apps/web/test/mocks/mock_network_status_adapter.dart`
- Modify: `flutter/packages/core/lib/core.dart`
- Modify: `flutter/packages/core/lib/src/ports/ports.dart`
- Modify: `flutter/apps/web/lib/core/di/platform_providers.dart`

- [ ] **Step 1: 确认无其他消费方**

Run: `grep -r "NetworkStatusPort\|WebNetworkStatusAdapter\|networkStatusPortProvider\|mock_network_status_adapter\|network_status_port_test" flutter/ --include="*.dart" | grep -v "\.dart_tool"`
Expected: 仅在待删除文件中出现

- [ ] **Step 2: 删除 network_status_port.dart**

Run: `rm flutter/packages/core/lib/src/ports/network_status_port.dart`

- [ ] **Step 3: 更新 ports.dart barrel**

将 `flutter/packages/core/lib/src/ports/ports.dart` 从：

```dart
export 'file_picker_port.dart';
export 'notification_port.dart';
export 'network_status_port.dart';
export 'clipboard_port.dart';
export 'share_port.dart';
export 'audio_recorder_port.dart';
```

修改为：

```dart
export 'file_picker_port.dart';
export 'notification_port.dart';
export 'clipboard_port.dart';
export 'share_port.dart';
export 'audio_recorder_port.dart';
```

- [ ] **Step 4: 更新 core.dart barrel**

将 `flutter/packages/core/lib/core.dart` 中的：

```dart
export 'src/ports/network_status_port.dart';
```

删除该行。

- [ ] **Step 5: 删除 web_network_status_adapter.dart**

Run: `rm flutter/apps/web/lib/adapters/web_network_status_adapter.dart`

- [ ] **Step 6: 更新 platform_providers.dart**

将 `flutter/apps/web/lib/core/di/platform_providers.dart` 从：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

import '../../adapters/web_file_picker_adapter.dart';
import '../../adapters/web_notification_adapter.dart';
import '../../adapters/web_network_status_adapter.dart';
import '../../adapters/web_clipboard_adapter.dart';
import '../../adapters/web_share_adapter.dart';
import '../../adapters/web_audio_recorder_adapter.dart';

// Platform Capability Providers
final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  return WebFilePickerAdapter();
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  return WebNotificationAdapter();
});

final networkStatusPortProvider = Provider<NetworkStatusPort>((ref) {
  return WebNetworkStatusAdapter();
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  return WebClipboardAdapter();
});

final sharePortProvider = Provider<SharePort>((ref) {
  return WebShareAdapter();
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  return WebAudioRecorderAdapter();
});
```

修改为：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

import '../../adapters/web_file_picker_adapter.dart';
import '../../adapters/web_notification_adapter.dart';
import '../../adapters/web_clipboard_adapter.dart';
import '../../adapters/web_share_adapter.dart';
import '../../adapters/web_audio_recorder_adapter.dart';

// Platform Capability Providers
final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  return WebFilePickerAdapter();
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  return WebNotificationAdapter();
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  return WebClipboardAdapter();
});

final sharePortProvider = Provider<SharePort>((ref) {
  return WebShareAdapter();
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  return WebAudioRecorderAdapter();
});
```

- [ ] **Step 7: 删除测试文件**

Run: `rm flutter/apps/web/test/ports/network_status_port_test.dart flutter/apps/web/test/mocks/mock_network_status_adapter.dart`

- [ ] **Step 8: 检查 ports 目录是否为空**

Run: `ls flutter/apps/web/test/ports/`
Expected: 目录为空或只剩其他文件。如果为空，删除目录：`rmdir flutter/apps/web/test/ports/`

- [ ] **Step 9: 验证 core 包分析通过**

Run: `cd flutter/packages/core && flutter analyze`
Expected: No issues found

- [ ] **Step 10: 验证 web 应用分析通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found

- [ ] **Step 11: 提交**

```bash
cd flutter && git add -A && git commit -m "refactor: remove unused NetworkStatusPort, WebNetworkStatusAdapter, and related tests"
```

---

### Task 5: 补充网络状态单元测试

**Files:**
- Modify: `flutter/apps/web/test/core/network/network_status_provider_test.dart`

现有测试文件已覆盖 `NetworkState`、`NetworkStatus` 枚举和 `NetworkStatusNotifier` 的基本状态转换。需要补充 `limited` 状态相关的测试用例。

- [ ] **Step 1: 添加 limited 状态测试**

在 `flutter/apps/web/test/core/network/network_status_provider_test.dart` 的 `NetworkStatusNotifier` group 末尾（`disposes cleanly` 测试之前）添加：

```dart
    test('online -> limited does not emit online transition', () async {
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      expect(notifier.state.isOnline, isTrue);

      // Simulate: navigator online but server unreachable
      dataSource.setServerReachable(false);
      await notifier.forceCheck();

      expect(notifier.state.isLimited, isTrue);
      // isOnline is false for limited
      expect(notifier.state.isOnline, isFalse);
      notifier.dispose();
    });

    test('limited -> online resets retryCount', () async {
      dataSource.setServerReachable(false);
      final notifier = NetworkStatusNotifier(dataSource: dataSource);

      await notifier.forceCheck();
      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.retryCount, 1);

      dataSource.setServerReachable(true);
      await notifier.forceCheck();
      expect(notifier.state.isOnline, isTrue);
      expect(notifier.state.retryCount, 0);
      notifier.dispose();
    });

    test('offline -> limited keeps offline-like behavior', () async {
      dataSource.setOffline();
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      expect(notifier.state.isOffline, isTrue);

      // Navigator goes online but server unreachable
      dataSource.setOnline();
      dataSource.setServerReachable(false);
      dataSource.emitOnline();
      await Future<void>.delayed(Duration.zero);
      // After online event, notifier calls checkConnectivity
      await notifier.forceCheck();

      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.isOnline, isFalse);
      notifier.dispose();
    });

    test('stateChanges stream emits on every state update', () async {
      final notifier = NetworkStatusNotifier(dataSource: dataSource);
      final states = <NetworkState>[];
      notifier.stateChanges.listen((s) => states.add(s));

      dataSource.emitOffline();
      await Future<void>.delayed(Duration.zero);

      dataSource.setOnline();
      dataSource.emitOnline();
      await Future<void>.delayed(Duration.zero);

      expect(states.length, greaterThanOrEqualTo(2));
      expect(states.any((s) => s.isOffline), isTrue);
      expect(states.any((s) => s.isOnline), isTrue);
      notifier.dispose();
    });
```

- [ ] **Step 2: 运行测试**

Run: `cd flutter/apps/web && flutter test test/core/network/network_status_provider_test.dart`
Expected: All tests pass

- [ ] **Step 3: 提交**

```bash
cd flutter && git add apps/web/test/core/network/network_status_provider_test.dart && git commit -m "test(network): add limited state and stateChanges stream tests"
```

---

### Task 6: 补充 outbox 网络联动测试

**Files:**
- Create: `flutter/apps/web/test/core/network/network_status_outbox_test.dart`

测试 outbox 在网络状态变化时的行为。使用 `FakeNetworkStatusDataSource` 和内存中的 `idb_shim` 工厂。

- [ ] **Step 1: 创建测试文件**

```dart
// flutter/apps/web/test/core/network/network_status_outbox_test.dart

import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_shim.dart';
import 'package:idb_shim/idb_client_memory.dart';
import 'package:im_web/core/network/network_status_provider.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_core/core.dart';

import '../../../helpers/fakes.dart';

/// Fake NetworkStatusDataSource for testing.
class FakeNetworkStatusDataSource implements NetworkStatusDataSource {
  bool _isOnline = true;
  bool _serverReachable = true;

  final _onlineController = StreamController<void>.broadcast();
  final _offlineController = StreamController<void>.broadcast();

  @override
  bool get isNavigatorOnline => _isOnline;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async => _serverReachable;

  void goOnline() {
    _isOnline = true;
    _onlineController.add(null);
  }

  void goOffline() {
    _isOnline = false;
    _offlineController.add(null);
  }

  void setServerReachable(bool value) => _serverReachable = value;

  void dispose() {
    _onlineController.close();
    _offlineController.close();
  }
}

/// Fake MessageApi that tracks send attempts.
class FakeMessageApi extends MessageApi {
  FakeMessageApi() : super(FakeHttpClientPort());

  int sendCount = 0;
  bool shouldFail = false;

  Message _makeMessage(String content, String messageType, String? clientMessageId) {
    return Message(
      id: 'msg_${sendCount}',
      senderId: 'sender1',
      isGroupChat: false,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'sent',
      clientMessageId: clientMessageId,
    );
  }

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendCount++;
    if (shouldFail) throw Exception('Network error');
    return _makeMessage(request.content, request.messageType, request.clientMessageId);
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    sendCount++;
    if (shouldFail) throw Exception('Network error');
    return _makeMessage(request.content, request.messageType, request.clientMessageId);
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
  }) async {
    sendCount++;
    if (shouldFail) throw Exception('Network error');
    return _makeMessage('[encrypted]', messageType, clientMessageId);
  }
}

void main() {
  late FakeNetworkStatusDataSource dataSource;
  late NetworkStatusNotifier notifier;
  late FakeMessageApi messageApi;
  late IdbFactory idbFactory;

  setUp(() {
    dataSource = FakeNetworkStatusDataSource();
    notifier = NetworkStatusNotifier(dataSource: dataSource);
    messageApi = FakeMessageApi();
    idbFactory = idbMemoryFactory;
  });

  tearDown(() {
    notifier.dispose();
    dataSource.dispose();
  });

  group('Outbox network linkage', () {
    test('offline: messages enter outbox without sending', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_001',
      );

      expect(messageApi.sendCount, 0);
      final pending = await outbox.getPendingCount();
      expect(pending, 1);

      outbox.dispose();
    });

    test('offline -> online triggers onNetworkAvailable retry', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_002',
      );
      expect(messageApi.sendCount, 0);

      // Simulate network restoration
      dataSource.goOnline();
      await Future<void>.delayed(Duration.zero);

      // Trigger the same logic as outbox_provider's ref.listen
      outbox.onNetworkAvailable();
      // Allow async processing
      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(messageApi.sendCount, 1);
      final pending = await outbox.getPendingCount();
      expect(pending, 0);

      outbox.dispose();
    });

    test('online -> limited does not clear outbox', () async {
      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      // Start online, enqueue a message (it will try to send)
      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_003',
      );

      // Now go limited (navigator online, server unreachable)
      dataSource.setServerReachable(false);
      await notifier.forceCheck();
      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.isOnline, isFalse);

      // Enqueue another message while limited
      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello2',
        clientMessageId: 'msg_004',
      );

      // Should NOT have triggered onNetworkAvailable
      // (limited means isOnline=false, so new messages queue up)
      final pending = await outbox.getPendingCount();
      expect(pending, greaterThanOrEqualTo(1));

      outbox.dispose();
    });

    test('limited -> online triggers retry once', () async {
      dataSource.setServerReachable(false);
      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_005',
      );
      final sendCountBefore = messageApi.sendCount;

      // Recover to online
      dataSource.setServerReachable(true);
      await notifier.forceCheck();
      expect(notifier.state.isOnline, isTrue);

      outbox.onNetworkAvailable();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      // Should have retried exactly once
      expect(messageApi.sendCount, sendCountBefore + 1);

      outbox.dispose();
    });

    test('offline -> limited does not trigger retry', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_006',
      );
      final sendCountBefore = messageApi.sendCount;

      // Navigator goes online but server unreachable -> limited
      dataSource.setOnline();
      dataSource.setServerReachable(false);
      dataSource.emitOnline();
      await Future<void>.delayed(Duration.zero);
      await notifier.forceCheck();

      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.isOnline, isFalse);

      // Should NOT have retried
      expect(messageApi.sendCount, sendCountBefore);

      outbox.dispose();
    });

    test('rapid offline -> online only triggers one retry cycle', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_007',
      );

      // Rapid transitions: offline -> online -> offline -> online
      dataSource.goOnline();
      await Future<void>.delayed(Duration.zero);
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);
      dataSource.goOnline();
      await Future<void>.delayed(Duration.zero);

      // Call onNetworkAvailable once (as outbox_provider would)
      outbox.onNetworkAvailable();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      // Should have retried, but only one cycle
      expect(messageApi.sendCount, 1);

      outbox.dispose();
    });
  });
}
```

- [ ] **Step 2: 检查 MessageApi 接口**

确认 `FakeMessageApi` 的方法签名与真实 `MessageApi` 一致。如果不一致，调整 stub。

Run: `grep -n "Future<Message> send" flutter/apps/web/lib/features/chat/data/message_api.dart`
Expected: 确认方法签名

- [ ] **Step 3: 运行测试**

Run: `cd flutter/apps/web && flutter test test/core/network/network_status_outbox_test.dart`
Expected: All 6 tests pass

- [ ] **Step 4: 提交**

```bash
cd flutter && git add apps/web/test/core/network/network_status_outbox_test.dart && git commit -m "test(outbox): add network status linkage tests for offline/online/limited transitions"
```

---

### Task 7: 编写手动回归文档

**Files:**
- Create: `flutter/docs/network-status-regression.md`

- [ ] **Step 1: 创建文档**

```markdown
# 网络状态手动回归步骤

## 前置条件

- Flutter Web 应用运行在 development 模式：`cd flutter/apps/web && flutter run -d chrome`
- 浏览器 DevTools 可用

## 测试步骤

### 1. 模拟断网

1. 打开 Chrome DevTools（F12）
2. 切换到 **Network** 标签
3. 勾选 **Offline** 复选框

### 2. 发送私聊消息

1. 在聊天界面选择一个会话
2. 发送一条文本消息

**预期结果：**
- 消息显示 **PENDING** 状态（通常带有时钟图标）
- 顶部 NetworkStatusBanner 显示红色"已断线"提示
- 消息不会消失，留在输入区域或显示为待发送

### 3. 恢复网络

1. DevTools → Network → 取消 **Offline** 勾选
2. 等待几秒

**预期结果：**
- NetworkStatusBanner 消失
- 消息从 PENDING 变为 SENT
- 如果消息发送失败，会显示重试按钮

### 4. 验证 limited 状态（可选）

1. DevTools → Network → 在 **Throttling** 下拉中选择 **Slow 3G**
2. 等待 1-2 分钟（等待 health check 超时）

**预期结果：**
- 顶部显示"连接受限"提示
- 新消息仍然可以输入，但会进入待发送队列
- 不会自动重试已有待发消息

### 5. 恢复正常网络

1. DevTools → Network → Throttling 选择 **No throttling**
2. 等待 health check 通过

**预期结果：**
- 所有待发消息自动重试并发送成功
- "连接受限"提示消失

## 自动化验证

运行单元测试确认核心逻辑：

```bash
cd flutter/apps/web
flutter test test/core/network/network_status_provider_test.dart
flutter test test/core/network/network_status_outbox_test.dart
```
```

- [ ] **Step 2: 提交**

```bash
cd flutter && git add docs/network-status-regression.md && git commit -m "docs: add network status manual regression steps"
```

---

### Task 8: 全量验证

- [ ] **Step 1: 运行所有网络相关测试**

Run: `cd flutter/apps/web && flutter test test/core/network/`
Expected: All tests pass

- [ ] **Step 2: 运行全量分析**

Run: `cd flutter && flutter analyze`
Expected: No issues found

- [ ] **Step 3: 运行全量测试（如果存在）**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass（或只有已知不相关的失败）
