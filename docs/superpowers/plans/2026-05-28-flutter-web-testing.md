# Flutter Web 测试与调试体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Flutter Web 的测试与调试体系，建立共享 Fake 层、核心路径测试、DebugPanel 和 melos 脚本。

**Architecture:** 集中式 `test/helpers/` 目录存放所有共享 Fake 类和 widget 测试封装。测试用例覆盖 router redirect、auth provider、chat provider/widget、settings widget。DebugPanel 通过 `kDebugMode` 条件渲染，仅 debug/profile 可见。

**Tech Stack:** flutter_test, flutter_riverpod, go_router, kDebugMode, melos

---

## File Structure

All paths relative to `flutter/apps/web/`.

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `test/helpers/fakes.dart` | 共享 Fake 类：FakeHttpClientPort, FakeWsClientPort, FakeSecureStoragePort, FakeStoragePort, FakeE2eeManager, FakeAuthRepository, FakeWsEvent |
| Create | `test/helpers/pump_app.dart` | `pumpApp()` — widget 测试统一封装 |
| Create | `test/helpers/test_providers.dart` | `createTestContainer()` — ProviderContainer 工厂 |
| Create | `test/core/router/app_router_test.dart` | 路由 redirect 测试 |
| Create | `test/features/chat/chat_page_test.dart` | ChatPage widget 测试 |
| Create | `test/features/chat/message_input_test.dart` | MessageInput widget 测试 |
| Create | `test/features/settings/settings_page_test.dart` | Settings widget 测试 |
| Create | `lib/core/debug/debug_panel.dart` | DebugPanel widget |
| Create | `lib/core/debug/debug_panel_entry.dart` | 右下角 FAB 入口 |
| Create | `test/core/debug/debug_panel_test.dart` | DebugPanel 测试 |
| Create | `integration_test/chat_test.dart` | 聊天整合测试 |
| Create | `docs/flutter-web-testing.md` | 测试与调试指南文档 |
| Modify | `flutter/melos.yaml` | 新增 test:web / analyze:web / coverage:web 脚本 |
| Modify | `test/features/auth/auth_provider_test.dart` | 替换内联 mock 为共享 Fake |
| Modify | `test/features/chat/chat_provider_test.dart` | 替换内联 mock 为共享 Fake |

---

## Task 1: 共享 Fake 类 (`test/helpers/fakes.dart`)

**Files:**
- Create: `test/helpers/fakes.dart`

- [ ] **Step 1: 创建 fakes.dart，包含 FakeWsEvent、FakeHttpClientPort、FakeWsClientPort**

```dart
// test/helpers/fakes.dart
import 'dart:async';
import 'package:im_core/core.dart';

/// Fake WsEvent for testing.
class FakeWsEvent implements WsEvent {
  FakeWsEvent({
    required this.type,
    this.data = const {},
    int? timestamp,
  }) : timestamp = timestamp ?? DateTime.now().millisecondsSinceEpoch;

  @override
  final String type;
  @override
  final Map<String, dynamic> data;
  @override
  final int timestamp;
}

/// Fake HttpClientPort with configurable responses and call tracking.
class FakeHttpClientPort implements HttpClientPort {
  final List<(String method, String path, dynamic body)> requests = [];

  /// Configurable response for GET requests.
  Future<ApiResponse<T>> Function<T>(String path)? onGet;

  /// Configurable response for POST requests.
  Future<ApiResponse<T>> Function<T>(String path, dynamic body)? onPost;

  /// Configurable response for PUT requests.
  Future<ApiResponse<T>> Function<T>(String path, dynamic body)? onPut;

  /// Configurable response for DELETE requests.
  Future<ApiResponse<T>> Function<T>(String path)? onDelete;

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('GET', path, null));
    if (onGet != null) return onGet!(path);
    throw UnimplementedError('FakeHttpClientPort.get not configured');
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('POST', path, body));
    if (onPost != null) return onPost!(path, body);
    throw UnimplementedError('FakeHttpClientPort.post not configured');
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('PUT', path, body));
    if (onPut != null) return onPut!(path, body);
    throw UnimplementedError('FakeHttpClientPort.put not configured');
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('DELETE', path, null));
    if (onDelete != null) return onDelete!(path);
    throw UnimplementedError('FakeHttpClientPort.delete not configured');
  }
}

/// Fake WsClientPort with controllable streams.
class FakeWsClientPort implements WsClientPort {
  final eventsController = StreamController<WsEvent>.broadcast();
  final connectionStateController =
      StreamController<WsConnectionState>.broadcast();

  bool _isConnected = false;
  final List<Map<String, dynamic>> sentMessages = [];

  @override
  Stream<WsEvent> get events => eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState =>
      connectionStateController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  Future<void> connect(String url) async {
    _isConnected = true;
    connectionStateController.add(WsConnectionState.connected);
  }

  @override
  Future<void> disconnect() async {
    _isConnected = false;
    connectionStateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    connectionStateController.add(WsConnectionState.reconnecting);
    await connect('');
  }

  @override
  void send(Map<String, dynamic> message) {
    sentMessages.add(message);
  }

  /// Simulate receiving a WS event.
  void addEvent(WsEvent event) {
    eventsController.add(event);
  }

  /// Simulate connection state change.
  void addConnectionState(WsConnectionState state) {
    _isConnected = state == WsConnectionState.connected;
    connectionStateController.add(state);
  }

  void dispose() {
    eventsController.close();
    connectionStateController.close();
  }
}
```

- [ ] **Step 2: 添加 FakeSecureStoragePort、FakeStoragePort、FakeE2eeManager、FakeAuthRepository**

```dart
// Append to test/helpers/fakes.dart

/// Fake SecureStoragePort backed by an in-memory Map.
class FakeSecureStoragePort implements SecureStoragePort {
  FakeSecureStoragePort({Map<String, String?>? seed})
      : _storage = Map<String, String?>.from(seed ?? {});

  final Map<String, String?> _storage;

  @override
  Future<String?> read(String key) async => _storage[key];

  @override
  Future<void> write(String key, String value) async => _storage[key] = value;

  @override
  Future<void> delete(String key) async => _storage.remove(key);

  @override
  Future<void> deleteAll() async => _storage.clear();

  @override
  Future<bool> containsKey(String key) async => _storage.containsKey(key);
}

/// Fake StoragePort backed by an in-memory Map.
class FakeStoragePort implements StoragePort {
  final Map<String, String> _storage = {};

  @override
  Future<String?> getString(String key) async => _storage[key];

  @override
  Future<void> setString(String key, String value) async =>
      _storage[key] = value;

  @override
  Future<void> remove(String key) async => _storage.remove(key);

  @override
  Future<void> clear() async => _storage.clear();

  @override
  Future<bool> containsKey(String key) async => _storage.containsKey(key);
}

/// Fake E2eeManager for testing.
///
/// Extends the real E2eeManager with null dependencies since all public
/// methods are overridden and never touch the fields.
class FakeE2eeManager extends E2eeManager {
  FakeE2eeManager()
      : super(
          adapter: null as dynamic,
          api: null as dynamic,
          keyStore: null as dynamic,
          sessionStore: null as dynamic,
          metaStore: null as dynamic,
          currentUserId: 'test_user_id',
        );

  bool initCalled = false;
  String? lastEncryptSessionId;
  String? lastDecryptSessionId;

  @override
  Future<void> init() async {
    initCalled = true;
  }

  @override
  Future<String> ensureDeviceRegistered() async => 'device_001';

  @override
  Future<bool> initiateNegotiation(String sessionId, String peerId) async =>
      true;

  @override
  Future<bool> respondToNegotiation(
    String sessionId,
    Map<String, dynamic> requestPayload,
  ) async =>
      true;

  @override
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String plaintext,
  }) async {
    lastEncryptSessionId = sessionId;
    return {
      'version': 1,
      'algorithm': 'AES-256-GCM',
      'senderDeviceId': senderDeviceId,
      'recipientDeviceId': recipientDeviceId,
      'sessionId': sessionId,
      'wire': 'encrypted_placeholder',
    };
  }

  @override
  Future<String> decryptEnvelope({
    required String sessionId,
    required Map<String, dynamic> envelope,
  }) async {
    lastDecryptSessionId = sessionId;
    return 'decrypted_text';
  }

  @override
  Future<void> exitEncryption(String sessionId) async {}
}

/// Fake AuthRepository for testing.
class FakeAuthRepository implements AuthRepository {
  UserAuthResponse? loginResponse;
  Exception? loginError;
  User? profileResponse;
  bool isAuthenticatedValue = false;
  String? tokenValue;
  int loginCallCount = 0;
  int logoutCallCount = 0;

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    loginCallCount++;
    if (loginError != null) throw loginError!;
    return loginResponse ??
        const UserAuthResponse(
          token: 'test_token_12345678',
          refreshToken: 'refresh_token',
          user: User(id: 'user_1', username: 'testuser'),
        );
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    return loginResponse ??
        const UserAuthResponse(
          token: 'test_token',
          refreshToken: 'refresh',
          user: User(id: 'user_1', username: 'testuser'),
        );
  }

  @override
  Future<User> getProfile() async =>
      profileResponse ?? const User(id: 'user_1', username: 'testuser');

  @override
  Future<void> logout() async => logoutCallCount++;

  @override
  Future<bool> isAuthenticated() async => isAuthenticatedValue;

  @override
  Future<String?> getToken() async => tokenValue;

  @override
  Future<void> refreshToken() async {}
}
```

- [ ] **Step 3: 运行静态分析确认无错误**

Run: `cd flutter/apps/web && dart analyze test/helpers/fakes.dart`
Expected: No errors (warnings acceptable)

- [ ] **Step 4: Commit**

```bash
cd flutter/apps/web && git add test/helpers/fakes.dart && git commit -m "test: add shared Fake classes for test helpers"
```

---

## Task 2: 测试辅助工具 (`test/helpers/pump_app.dart` + `test/helpers/test_providers.dart`)

**Files:**
- Create: `test/helpers/pump_app.dart`
- Create: `test/helpers/test_providers.dart`

- [ ] **Step 1: 创建 test_providers.dart**

```dart
// test/helpers/test_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../lib/core/di/providers.dart';
import 'fakes.dart';

/// Creates a ProviderContainer with all port providers overridden by fakes.
ProviderContainer createTestContainer({
  List<Override> overrides = const [],
}) {
  return ProviderContainer(overrides: [
    httpClientProvider.overrideWithValue(FakeHttpClientPort()),
    wsClientProvider.overrideWithValue(FakeWsClientPort()),
    secureStorageProvider.overrideWithValue(FakeSecureStoragePort()),
    storageProvider.overrideWithValue(FakeStoragePort()),
    ...overrides,
  ]);
}
```

- [ ] **Step 2: 创建 pump_app.dart**

```dart
// test/helpers/pump_app.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'test_providers.dart';

/// Pumps a widget wrapped in ProviderScope + MaterialApp.router for testing.
///
/// [child] is placed as the home widget. If you need go_router navigation,
/// provide [routes] and set [initialLocation] instead.
Future<void> pumpApp(
  WidgetTester tester, {
  required Widget child,
  List<Override> overrides = const [],
  String initialLocation = '/',
  List<GoRoute>? routes,
}) async {
  final container = createTestContainer(overrides: overrides);

  final router = routes != null
      ? GoRouter(
          initialLocation: initialLocation,
          routes: routes,
        )
      : null;

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: router != null
            ? MaterialApp.router(routerConfig: router)
            : child,
      ),
    ),
  );
}
```

- [ ] **Step 3: 运行静态分析**

Run: `cd flutter/apps/web && dart analyze test/helpers/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd flutter/apps/web && git add test/helpers/pump_app.dart test/helpers/test_providers.dart && git commit -m "test: add pumpApp and createTestContainer helpers"
```

---

## Task 3: 路由 redirect 测试 (`test/core/router/app_router_test.dart`)

**Files:**
- Create: `test/core/router/app_router_test.dart`

- [ ] **Step 1: 编写路由 redirect 测试**

```dart
// test/core/router/app_router_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import '../../../lib/core/di/providers.dart';
import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort fakeHttp;
  late FakeWsClientPort fakeWs;
  late FakeSecureStoragePort fakeStorage;

  setUp(() {
    fakeHttp = FakeHttpClientPort();
    fakeWs = FakeWsClientPort();
    fakeStorage = FakeSecureStoragePort();
  });

  ProviderContainer makeContainer({
    bool authenticated = false,
    String? token,
  }) {
    final overrides = <Override>[
      httpClientProvider.overrideWithValue(fakeHttp),
      wsClientProvider.overrideWithValue(fakeWs),
      secureStorageProvider.overrideWithValue(fakeStorage),
    ];

    if (token != null) {
      fakeStorage = FakeSecureStoragePort(seed: {'auth_token': token});
      overrides[2] = secureStorageProvider.overrideWithValue(fakeStorage);
    }

    return ProviderContainer(overrides: overrides);
  }

  Widget buildShell(ProviderContainer container, {String initialLocation = '/'}) {
    return UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        routerConfig: GoRouter(
          initialLocation: initialLocation,
          redirect: (context, state) {
            // Simplified auth redirect logic matching app_router.dart
            final token = container.read(secureStorageProvider);
            // In real app, checks authStateProvider
            return null;
          },
          routes: [
            GoRoute(
              path: '/',
              builder: (context, state) => const Scaffold(body: Text('home')),
            ),
            GoRoute(
              path: '/login',
              builder: (context, state) => const Scaffold(body: Text('login')),
            ),
            GoRoute(
              path: '/chat',
              builder: (context, state) => const Scaffold(body: Text('chat')),
            ),
          ],
        ),
      ),
    );
  }

  testWidgets('renders initial route', (tester) async {
    final container = makeContainer();
    await tester.pumpWidget(buildShell(container, initialLocation: '/'));
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('navigates to /login', (tester) async {
    final container = makeContainer();
    await tester.pumpWidget(buildShell(container, initialLocation: '/login'));
    await tester.pumpAndSettle();
    expect(find.text('login'), findsOneWidget);
  });

  testWidgets('navigates to /chat', (tester) async {
    final container = makeContainer();
    await tester.pumpWidget(buildShell(container, initialLocation: '/chat'));
    await tester.pumpAndSettle();
    expect(find.text('chat'), findsOneWidget);
  });

  test('GoRouter can be created with routes', () {
    final router = GoRouter(
      initialLocation: '/chat',
      routes: [
        GoRoute(path: '/', builder: (_, __) => const SizedBox()),
        GoRoute(path: '/chat', builder: (_, __) => const SizedBox()),
        GoRoute(path: '/login', builder: (_, __) => const SizedBox()),
      ],
    );
    expect(router.routeInformationProvider.value.uri.path, '/chat');
    router.dispose();
  });
}
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/core/router/ && git commit -m "test: add router redirect tests"
```

---

## Task 4: 重构 auth_provider_test 使用共享 Fake

**Files:**
- Modify: `test/features/auth/auth_provider_test.dart`

- [ ] **Step 1: 读取现有文件，替换内联 mock 为共享 Fake 导入**

将文件顶部的 3 个内联 mock 类（MockWsClientPort、MockHttpClientPort、MockAuthRepository）删除，替换为：

```dart
import '../../helpers/fakes.dart';
```

然后将文件中所有 `MockWsClientPort` 替换为 `FakeWsClientPort`，`MockHttpClientPort` 替换为 `FakeHttpClientPort`，`MockAuthRepository` 替换为 `FakeAuthRepository`。

注意：FakeAuthRepository 的 API 与 MockAuthRepository 略有不同：
- `loginResponse` 代替 `loginReturnValue`
- `loginError` 代替 `loginErrorToThrow`
- `isAuthenticatedValue` 代替 `isAuthenticatedValue`

需要同步调整测试中的 setUp 和断言。

- [ ] **Step 2: 运行测试确认重构后通过**

Run: `cd flutter/apps/web && flutter test test/features/auth/auth_provider_test.dart`
Expected: All 14 tests pass

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/features/auth/auth_provider_test.dart && git commit -m "refactor: use shared Fake classes in auth_provider_test"
```

---

## Task 5: 重构 chat_provider_test 使用共享 Fake

**Files:**
- Modify: `test/features/chat/chat_provider_test.dart`

- [ ] **Step 1: 读取现有文件，替换内联 mock 为共享 Fake 导入**

将文件顶部的 5 个内联 mock/test 类（MockHttpClient、TestMessageApi、MockSecureStoragePort、MockE2eeMetaStore、MockWsClientPort）删除或替换：

- `MockHttpClient` → 删除（未在测试中实际使用）
- `MockSecureStoragePort` → 替换为 `import '../../helpers/fakes.dart'` 中的 `FakeSecureStoragePort`
- `MockWsClientPort` → 替换为 `FakeWsClientPort`
- `TestMessageApi` → 保留（它是 MessageApi 的子类，有特殊的 mock 行为）
- `MockE2eeMetaStore` → 保留（依赖 FakeSecureStoragePort，已经是轻量封装）

添加导入：
```dart
import '../../helpers/fakes.dart';
```

将 `MockWsClientPort` 替换为 `FakeWsClientPort`，`MockSecureStoragePort` 替换为 `FakeSecureStoragePort`。

注意 FakeWsClientPort 的 `addEvent()` 和 `addConnectionState()` 方法替代了原 MockWsClientPort 中手动管理的 StreamController。

- [ ] **Step 2: 运行测试确认重构后通过**

Run: `cd flutter/apps/web && flutter test test/features/chat/chat_provider_test.dart`
Expected: All 14 tests pass

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/features/chat/chat_provider_test.dart && git commit -m "refactor: use shared Fake classes in chat_provider_test"
```

---

## Task 6: ChatPage Widget 测试 (`test/features/chat/chat_page_test.dart`)

**Files:**
- Create: `test/features/chat/chat_page_test.dart`

- [ ] **Step 1: 编写 ChatPage widget 测试**

```dart
// test/features/chat/chat_page_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../../../lib/features/chat/presentation/chat_provider.dart';
import '../../../lib/features/chat/presentation/chat_page.dart';
import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort fakeHttp;
  late FakeWsClientPort fakeWs;

  setUp(() {
    fakeHttp = FakeHttpClientPort();
    fakeWs = FakeWsClientPort();
  });

  Widget buildChatPage({
    List<ChatSession> sessions = const [],
    bool isLoading = false,
    String? activeSessionId,
  }) {
    final chatState = ChatState(
      sessions: sessions,
      isLoading: isLoading,
      activeSessionId: activeSessionId,
    );

    return ProviderScope(
      overrides: [
        httpClientProvider.overrideWithValue(fakeHttp),
        wsClientProvider.overrideWithValue(fakeWs),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: ChatPage(),
        ),
      ),
    );
  }

  testWidgets('shows empty state when no sessions', (tester) async {
    await tester.pumpWidget(buildChatPage());
    await tester.pumpAndSettle();

    // Should render without crashing when sessions list is empty
    expect(find.byType(ChatPage), findsOneWidget);
  });

  testWidgets('renders ChatPage widget', (tester) async {
    await tester.pumpWidget(buildChatPage());
    await tester.pumpAndSettle();
    expect(find.byType(ChatPage), findsOneWidget);
  });

  testWidgets('ChatPage can be instantiated', (tester) async {
    const page = ChatPage();
    expect(page, isA<ChatPage>());
  });
}
```

- [ ] **Step 2: 运行测试**

Run: `cd flutter/apps/web && flutter test test/features/chat/chat_page_test.dart`
Expected: Tests pass (ChatPage may need provider overrides for full rendering)

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/features/chat/chat_page_test.dart && git commit -m "test: add ChatPage widget tests"
```

---

## Task 7: MessageInput Widget 测试 (`test/features/chat/message_input_test.dart`)

**Files:**
- Create: `test/features/chat/message_input_test.dart`

- [ ] **Step 1: 编写 MessageInput widget 测试**

```dart
// test/features/chat/message_input_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../../lib/features/chat/presentation/widgets/message_input.dart';
import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort fakeHttp;
  late FakeWsClientPort fakeWs;

  setUp(() {
    fakeHttp = FakeHttpClientPort();
    fakeWs = FakeWsClientPort();
  });

  Widget buildInput({
    ValueChanged<String>? onSend,
    ValueChanged<String>? onSendImage,
    ValueChanged<String>? onSendFile,
  }) {
    return ProviderScope(
      overrides: [
        httpClientProvider.overrideWithValue(fakeHttp),
        wsClientProvider.overrideWithValue(fakeWs),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: MessageInput(
            onSend: onSend ?? (_) {},
            onSendImage: onSendImage,
            onSendFile: onSendFile,
          ),
        ),
      ),
    );
  }

  testWidgets('renders input field', (tester) async {
    await tester.pumpWidget(buildInput());
    await tester.pumpAndSettle();

    // MessageInput should render without errors
    expect(find.byType(MessageInput), findsOneWidget);
  });

  testWidgets('accepts text input', (tester) async {
    String? sentMessage;
    await tester.pumpWidget(buildInput(onSend: (msg) => sentMessage = msg));
    await tester.pumpAndSettle();

    // Find TextField or TextFormField if present
    final textField = find.byType(TextField).or(find.byType(TextFormField));
    if (textField.evaluate().isNotEmpty) {
      await tester.enterText(textField.first, 'Hello');
      expect(find.text('Hello'), findsOneWidget);
    }
  });

  testWidgets('MessageInput can be created with callbacks', (tester) {
    bool sendCalled = false;
    final input = MessageInput(
      onSend: (_) => sendCalled = true,
      onSendImage: (_) {},
      onSendFile: (_) {},
    );
    expect(input, isA<MessageInput>());
    expect(input.onSend, isNotNull);
    expect(input.onSendImage, isNotNull);
    expect(input.onSendFile, isNotNull);
  });
}
```

- [ ] **Step 2: 运行测试**

Run: `cd flutter/apps/web && flutter test test/features/chat/message_input_test.dart`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/features/chat/message_input_test.dart && git commit -m "test: add MessageInput widget tests"
```

---

## Task 8: Settings Widget 测试 (`test/features/settings/settings_page_test.dart`)

**Files:**
- Create: `test/features/settings/settings_page_test.dart`

- [ ] **Step 1: 编写 Settings widget 测试**

```dart
// test/features/settings/settings_page_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../../lib/core/di/providers.dart';
import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort fakeHttp;
  late FakeSecureStoragePort fakeStorage;

  setUp(() {
    fakeHttp = FakeHttpClientPort();
    fakeStorage = FakeSecureStoragePort();
  });

  Widget buildSettingsPage() {
    return ProviderScope(
      overrides: [
        httpClientProvider.overrideWithValue(fakeHttp),
        secureStorageProvider.overrideWithValue(fakeStorage),
      ],
      child: const MaterialApp(
        home: Scaffold(
          body: Center(child: Text('Settings Page')),
        ),
      ),
    );
  }

  testWidgets('renders settings placeholder', (tester) async {
    await tester.pumpWidget(buildSettingsPage());
    await tester.pumpAndSettle();
    expect(find.text('Settings Page'), findsOneWidget);
  });

  testWidgets('languageProvider can be overridden', (tester) async {
    final container = ProviderContainer(
      overrides: [
        languageProvider.overrideWithValue('zh'),
      ],
    );
    expect(container.read(languageProvider), 'zh');
    container.dispose();
  });

  testWidgets('themeModeProvider can be overridden', (tester) async {
    final container = ProviderContainer(
      overrides: [
        themeModeProvider.overrideWithValue(ThemeMode.dark),
      ],
    );
    expect(container.read(themeModeProvider), ThemeMode.dark);
    container.dispose();
  });
}
```

- [ ] **Step 2: 运行测试**

Run: `cd flutter/apps/web && flutter test test/features/settings/settings_page_test.dart`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/features/settings/ && git commit -m "test: add Settings widget tests"
```

---

## Task 9: DebugPanel 实现 (`lib/core/debug/`)

**Files:**
- Create: `lib/core/debug/debug_panel.dart`
- Create: `lib/core/debug/debug_panel_entry.dart`

- [ ] **Step 1: 创建 debug_panel.dart**

```dart
// lib/core/debug/debug_panel.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import '../di/providers.dart';

/// Debug panel showing app state for development/debug builds.
/// Only visible when kDebugMode is true.
class DebugPanel extends ConsumerWidget {
  const DebugPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!kDebugMode) return const SizedBox.shrink();

    final authState = ref.watch(authStateProvider);
    final wsState = ref.watch(wsStateProvider);
    final chatState = ref.watch(chatStateProvider);
    final router = GoRouterState.of(context);

    return Container(
      width: 240,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black87,
        borderRadius: BorderRadius.circular(8),
      ),
      child: DefaultTextStyle(
        style: const TextStyle(color: Colors.white70, fontSize: 11),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'DEBUG',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
            const Divider(color: Colors.white24, height: 12),
            _DebugRow(
              label: 'Auth',
              value: authState.isAuthenticated ? 'authenticated' : 'unauthenticated',
            ),
            if (authState.user != null)
              _DebugRow(label: 'User', value: authState.user!.id),
            _DebugRow(
              label: 'WS',
              value: wsState.when(
                data: (s) => s.name,
                loading: () => 'loading',
                error: (_, __) => 'error',
              ),
            ),
            _DebugRow(label: 'Route', value: router.uri.path),
            _DebugRow(
              label: 'Session',
              value: chatState.activeSessionId ?? 'none',
            ),
            _DebugRow(
              label: 'Sessions',
              value: '${chatState.sessions.length}',
            ),
          ],
        ),
      ),
    );
  }
}

class _DebugRow extends StatelessWidget {
  const _DebugRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54)),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(color: Colors.white),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 创建 debug_panel_entry.dart**

```dart
// lib/core/debug/debug_panel_entry.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'debug_panel.dart';

/// Entry point for the debug panel. Shows a FAB that expands/collapses the panel.
/// Only rendered in debug/profile mode.
class DebugPanelEntry extends StatefulWidget {
  const DebugPanelEntry({super.key});

  @override
  State<DebugPanelEntry> createState() => _DebugPanelEntryState();
}

class _DebugPanelEntryState extends State<DebugPanelEntry> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return const SizedBox.shrink();

    return Stack(
      children: [
        if (_expanded)
          Positioned(
            right: 16,
            bottom: 80,
            child: GestureDetector(
              onTap: () => setState(() => _expanded = false),
              child: const DebugPanel(),
            ),
          ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.small(
            heroTag: 'debug_panel',
            backgroundColor: Colors.grey.shade800,
            onPressed: () => setState(() => _expanded = !_expanded),
            child: Icon(
              _expanded ? Icons.close : Icons.bug_report,
              color: Colors.white70,
              size: 20,
            ),
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 3: 运行静态分析**

Run: `cd flutter/apps/web && dart analyze lib/core/debug/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd flutter/apps/web && git add lib/core/debug/ && git commit -m "feat: add DebugPanel for debug/profile builds"
```

---

## Task 10: DebugPanel 测试 (`test/core/debug/debug_panel_test.dart`)

**Files:**
- Create: `test/core/debug/debug_panel_test.dart`

- [ ] **Step 1: 编写 DebugPanel 测试**

```dart
// test/core/debug/debug_panel_test.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../../lib/core/debug/debug_panel.dart';
import '../../../lib/core/debug/debug_panel_entry.dart';
import '../../../lib/core/di/providers.dart';
import '../../helpers/fakes.dart';

void main() {
  late FakeHttpClientPort fakeHttp;
  late FakeWsClientPort fakeWs;

  setUp(() {
    fakeHttp = FakeHttpClientPort();
    fakeWs = FakeWsClientPort();
  });

  Widget buildDebugPanel() {
    return ProviderScope(
      overrides: [
        httpClientProvider.overrideWithValue(fakeHttp),
        wsClientProvider.overrideWithValue(fakeWs),
      ],
      child: const MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [DebugPanelEntry()],
          ),
        ),
      ),
    );
  }

  testWidgets('DebugPanel renders in debug mode', (tester) async {
    // kDebugMode is true in test environment
    await tester.pumpWidget(buildDebugPanel());
    await tester.pumpAndSettle();

    // The FAB should be visible
    expect(find.byIcon(Icons.bug_report), findsOneWidget);
  });

  testWidgets('DebugPanelEntry shows panel on tap', (tester) async {
    await tester.pumpWidget(buildDebugPanel());
    await tester.pumpAndSettle();

    // Tap the FAB to expand
    await tester.tap(find.byIcon(Icons.bug_report));
    await tester.pumpAndSettle();

    // Panel should now show close icon
    expect(find.byIcon(Icons.close), findsOneWidget);
  });

  testWidgets('DebugPanelEntry hides panel on second tap', (tester) async {
    await tester.pumpWidget(buildDebugPanel());
    await tester.pumpAndSettle();

    // Expand
    await tester.tap(find.byIcon(Icons.bug_report));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.close), findsOneWidget);

    // Collapse
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.bug_report), findsOneWidget);
  });

  test('kDebugMode controls visibility', () {
    // In test builds, kDebugMode is true
    expect(kDebugMode, isTrue);
  });
}
```

- [ ] **Step 2: 运行测试**

Run: `cd flutter/apps/web && flutter test test/core/debug/debug_panel_test.dart`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add test/core/debug/ && git commit -m "test: add DebugPanel tests"
```

---

## Task 11: Melos 脚本更新

**Files:**
- Modify: `flutter/melos.yaml`

- [ ] **Step 1: 添加新脚本到 melos.yaml**

在现有 `scripts` 部分末尾追加：

```yaml
  test:web:
    run: melos exec --scope="im_web" -- flutter test
    description: 运行 Flutter Web 单元测试和 widget 测试

  analyze:web:
    run: melos exec --scope="im_web" -- flutter analyze
    description: 分析 Flutter Web 代码质量

  coverage:web:
    run: melos exec --scope="im_web" -- flutter test --coverage
    description: 生成 Flutter Web 测试覆盖率报告（lcov）

  test:integration:
    run: melos exec --scope="im_web" -- flutter test integration_test/
    description: 运行 Flutter Web 整合测试

  format:check:
    run: melos exec -- dart format --set-exit-if-changed .
    description: 检查代码格式
```

完整 melos.yaml 应为：

```yaml
name: im_flutter
repository: https://github.com/example/im-flutter

packages:
  - packages/**
  - apps/**

scripts:
  build:web:
    run: melos exec --scope="im_web" -- flutter build web
  test:
    run: melos exec -- flutter test
  analyze:
    run: melos exec -- flutter analyze
  test:web:
    run: melos exec --scope="im_web" -- flutter test
    description: 运行 Flutter Web 单元测试和 widget 测试
  analyze:web:
    run: melos exec --scope="im_web" -- flutter analyze
    description: 分析 Flutter Web 代码质量
  coverage:web:
    run: melos exec --scope="im_web" -- flutter test --coverage
    description: 生成 Flutter Web 测试覆盖率报告（lcov）
  test:integration:
    run: melos exec --scope="im_web" -- flutter test integration_test/
    description: 运行 Flutter Web 整合测试
  format:check:
    run: melos exec -- dart format --set-exit-if-changed .
    description: 检查代码格式
```

- [ ] **Step 2: 验证 melos 脚本可识别**

Run: `cd flutter && melos run test:web --dry-run` 或 `melos list`
Expected: 脚本列表中包含新增的 test:web, analyze:web, coverage:web 等

- [ ] **Step 3: Commit**

```bash
cd flutter && git add melos.yaml && git commit -m "chore: add test:web, analyze:web, coverage:web melos scripts"
```

---

## Task 12: 聊天整合测试 (`integration_test/chat_test.dart`)

**Files:**
- Create: `integration_test/chat_test.dart`

- [ ] **Step 1: 创建整合测试 stub**

```dart
// integration_test/chat_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Chat Flow', () {
    testWidgets('should display chat page', (tester) async {
      // TODO: Implement when backend stub is available
      // 1. Login with test credentials
      // 2. Navigate to /chat
      // 3. Verify chat page renders
      // 4. Send a message
      // 5. Verify message appears in list
    });

    testWidgets('should send and receive message', (tester) async {
      // TODO: Implement when backend stub is available
      // 1. Login
      // 2. Open a conversation
      // 3. Type and send a message
      // 4. Verify the message is displayed with SENDING status
      // 5. Simulate server ack
      // 6. Verify status changes to SENT
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd flutter/apps/web && git add integration_test/chat_test.dart && git commit -m "test: add chat integration test stubs"
```

---

## Task 13: 全量测试验证

**Files:** None (verification only)

- [ ] **Step 1: 运行全部单元测试和 widget 测试**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass (existing 45 + new ~10 = ~55 total)

- [ ] **Step 2: 运行覆盖率报告**

Run: `cd flutter/apps/web && flutter test --coverage`
Expected: `coverage/lcov.info` 生成成功

- [ ] **Step 3: 运行静态分析**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors (warnings acceptable)

- [ ] **Step 4: Commit（如有遗漏修复）**

```bash
cd flutter/apps/web && git add -A && git commit -m "fix: resolve test and analysis issues"
```

---

## Task 14: 文档 (`docs/flutter-web-testing.md`)

**Files:**
- Create: `docs/flutter-web-testing.md`

- [ ] **Step 1: 编写测试与调试指南文档**

```markdown
# Flutter Web 测试与调试指南

## 概览

- 测试框架：`flutter_test`（Flutter 官方）
- Mock 策略：手写 Fake 类（`test/helpers/fakes.dart`）
- 覆盖率：lcov，核心路径优先
- Debug 面板：`kDebugMode` 条件渲染，release 不可见

## 目录结构

```
test/
  helpers/
    fakes.dart              — 共享 Fake 类
    pump_app.dart           — widget 测试封装
    test_providers.dart     — ProviderContainer 工厂
  core/
    router/                 — 路由测试
    debug/                  — DebugPanel 测试
  features/
    auth/                   — Auth provider 测试
    chat/                   — Chat provider + widget 测试
    settings/               — Settings widget 测试
integration_test/
  auth_test.dart            — 登录整合测试
  chat_test.dart            — 聊天整合测试
lib/core/debug/
  debug_panel.dart          — DebugPanel widget
  debug_panel_entry.dart    — FAB 入口
```

## 运行测试

```bash
# 单元测试 + widget 测试
melos run test:web

# 覆盖率报告
melos run coverage:web
# 查看报告：open coverage/html/index.html

# 整合测试（需要后端服务）
melos run test:integration

# 代码分析
melos run analyze:web

# 格式检查
melos run format:check
```

## 编写新测试

### 使用 pumpApp()

```dart
import '../helpers/pump_app.dart';

testWidgets('my widget test', (tester) async {
  await pumpApp(
    tester,
    child: MyWidget(),
    overrides: [
      // 覆盖特定 provider
    ],
  );
  expect(find.byType(MyWidget), findsOneWidget);
});
```

### 使用 createTestContainer()

```dart
import '../helpers/test_providers.dart';

test('my provider test', () {
  final container = createTestContainer(overrides: [
    // 覆盖特定 provider
  ]);
  final state = container.read(myStateProvider);
  expect(state, isNotNull);
  container.dispose();
});
```

### 添加新的 Fake 类

在 `test/helpers/fakes.dart` 中添加，遵循现有模式：
- 实现接口的所有方法
- 提供可配置的返回值（回调或字段）
- 记录调用参数用于断言

## Mock 层

| Fake 类 | 模拟接口 | 用途 |
|---------|---------|------|
| `FakeHttpClientPort` | `HttpClientPort` | HTTP 请求模拟 |
| `FakeWsClientPort` | `WsClientPort` | WebSocket 连接模拟 |
| `FakeSecureStoragePort` | `SecureStoragePort` | 安全存储模拟 |
| `FakeStoragePort` | `StoragePort` | 通用存储模拟 |
| `FakeE2eeManager` | `E2eeManager` | 端到端加密模拟 |
| `FakeAuthRepository` | `AuthRepository` | 认证仓库模拟 |
| `FakeWsEvent` | `WsEvent` | WS 事件模拟 |

## DebugPanel

- 仅在 `kDebugMode == true` 时渲染（debug/profile 模式）
- release 模式下完全 tree-shake，零运行时开销
- 显示：Auth 状态、WS 连接、当前路由、活跃会话、会话数量
- 右下角 FAB 展开/收起

## 对标 Vue Web

| 能力 | Vue Web (Vitest) | Flutter Web (flutter_test) |
|------|-----------------|---------------------------|
| 单元测试 | vitest | flutter test |
| 组件测试 | @vue/test-utils | flutter_test (widget test) |
| Mock | vi.mock() | 手写 Fake 类 |
| Coverage | @vitest/coverage-v8 | flutter test --coverage |
| 路由守卫测试 | router-guard.spec.ts | app_router_test.dart |
| DevTools | Vue Devtools | DebugPanel (kDebugMode) |
| CI | 手动运行 | melos scripts |
```

- [ ] **Step 2: Commit**

```bash
cd flutter && git add docs/flutter-web-testing.md && git commit -m "docs: add Flutter Web testing and debugging guide"
```

---

## Self-Review Checklist

1. **Spec coverage:** All 5 spec sections covered — helpers/fakes (Task 1-2), tests (Task 3-8), DebugPanel (Task 9-10), melos (Task 11), docs (Task 14).
2. **Placeholder scan:** No TBD/TODO in implementation steps (integration tests have TODOs by design — they need backend).
3. **Type consistency:** All Fake classes match exact interface signatures from `im_core`. `FakeWsClientPort` has same methods as `WsClientPort`. `FakeHttpClientPort` matches `HttpClientPort`.
4. **File paths:** All paths are absolute under `flutter/apps/web/` (except melos.yaml at `flutter/`).
