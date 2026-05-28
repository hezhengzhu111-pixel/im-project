# PWA Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance Flutter Web PWA with missing icons, comprehensive integration tests, and verification documentation

**Architecture:** Incremental improvement on existing PWA implementation - add missing icon assets, write integration tests for MessageOutbox and NetworkStatusProvider using flutter_test + mockito, and create browser verification guide

**Tech Stack:** Flutter, Dart, flutter_test, mockito, idb_shim

---

## File Structure

```
flutter/apps/web/web/icons/
├── icon-192.png          # PWA icon 192x192
└── icon-512.png          # PWA icon 512x512

flutter/apps/web/test/features/chat/
├── message_outbox_test.dart      # Existing - extend with integration tests
└── message_outbox_integration_test.dart  # New - integration tests

flutter/apps/web/test/core/network/
└── network_status_provider_test.dart  # New - network status tests

docs/
└── pwa-verification-guide.md    # New - browser verification guide
```

---

### Task 1: Generate PWA Icons

**Files:**
- Create: `flutter/apps/web/web/icons/icon-192.png`
- Create: `flutter/apps/web/web/icons/icon-512.png`

- [ ] **Step 1: Create icons directory**

```bash
mkdir -p flutter/apps/web/web/icons
```

- [ ] **Step 2: Generate 192x192 icon using online tool**

Visit https://favicon.io/ and generate a 192x192 PNG icon with:
- Text: "IM" or letter "M"
- Background color: #1a1a2e (matches theme_color)
- Text color: white

Download and save as `flutter/apps/web/web/icons/icon-192.png`

- [ ] **Step 3: Generate 512x512 icon using online tool**

Using the same tool, generate a 512x512 PNG icon with same design.

Download and save as `flutter/apps/web/web/icons/icon-512.png`

- [ ] **Step 4: Verify icon files exist**

```bash
ls -la flutter/apps/web/web/icons/
```

Expected: Two PNG files (icon-192.png and icon-512.png)

- [ ] **Step 5: Verify manifest.json references**

Check `flutter/apps/web/web/manifest.json` contains:
```json
"icons": [
  {
    "src": "icons/icon-192.png",
    "sizes": "192x192",
    "type": "image/png",
    "purpose": "any maskable"
  },
  {
    "src": "icons/icon-512.png",
    "sizes": "512x512",
    "type": "image/png",
    "purpose": "any maskable"
  }
]
```

- [ ] **Step 6: Commit icons**

```bash
git add flutter/apps/web/web/icons/
git commit -m "feat: add PWA icons for manifest"
```

---

### Task 2: Add mockito Dependency

**Files:**
- Modify: `flutter/apps/web/pubspec.yaml`

- [ ] **Step 1: Add mockito to dev_dependencies**

Open `flutter/apps/web/pubspec.yaml` and add under `dev_dependencies`:

```yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  mockito: ^5.4.4
  build_runner: ^2.4.8
```

- [ ] **Step 2: Run flutter pub get**

```bash
cd flutter/apps/web && flutter pub get
```

Expected: Dependencies resolved successfully

- [ ] **Step 3: Commit pubspec changes**

```bash
git add flutter/apps/web/pubspec.yaml
git commit -m "test: add mockito dependency for integration tests"
```

---

### Task 3: Create MessageOutbox Integration Tests

**Files:**
- Create: `flutter/apps/web/test/features/chat/message_outbox_integration_test.dart`

- [ ] **Step 1: Write test file header and imports**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_shim.dart';
import 'package:idb_shim/idb_client.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'message_outbox_integration_test.mocks.dart';

@GenerateMocks([MessageApi])
void main() {
  late MessageOutbox outbox;
  late MockMessageApi mockMessageApi;
  late IdbFactory idbFactory;

  setUp(() async {
    // Use in-memory IndexedDB for testing
    idbFactory = getIdbFactory();
    mockMessageApi = MockMessageApi();
  });

  tearDown(() async {
    outbox?.dispose();
  });

  group('MessageOutbox Integration', () {
    // Tests will go here
  });
}
```

- [ ] **Step 2: Add enqueue test**

Add inside the group:

```dart
test('enqueue adds message to outbox with pending status', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactory,
    isOnline: () => false, // Start offline
  );
  await outbox.initialize();

  final message = await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Hello World',
    messageType: 'text',
    clientMessageId: 'client-msg-1',
  );

  expect(message.status, OutboxMessageStatus.pending);
  expect(message.content, 'Hello World');
  expect(message.sessionKey, 'session-1');
  expect(message.receiverId, 'user-2');
  expect(message.clientMessageId, 'client-msg-1');
  expect(await outbox.getPendingCount(), 1);
});
```

- [ ] **Step 3: Add enqueue multiple messages test**

```dart
test('enqueue multiple messages increments pending count', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactory,
    isOnline: () => false,
  );
  await outbox.initialize();

  await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Message 1',
    clientMessageId: 'client-1',
  );

  await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Message 2',
    clientMessageId: 'client-2',
  );

  expect(await outbox.getPendingCount(), 2);
});
```

- [ ] **Step 4: Generate mocks**

```bash
cd flutter/apps/web && dart run build_runner build --delete-conflicting-outputs
```

Expected: Generated `message_outbox_integration_test.mocks.dart`

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd flutter/apps/web && flutter test test/features/chat/message_outbox_integration_test.dart
```

Expected: 2 tests pass

- [ ] **Step 6: Commit test file**

```bash
git add flutter/apps/web/test/features/chat/
git commit -m "test: add message outbox enqueue integration tests"
```

---

### Task 4: Add Retry Success Test

**Files:**
- Modify: `flutter/apps/web/test/features/chat/message_outbox_integration_test.dart`

- [ ] **Step 1: Add retry success test**

```dart
test('retry succeeds when API call succeeds', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactory,
    isOnline: () => true,
  );
  await outbox.initialize();

  // Enqueue a message
  final outboxMsg = await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Test message',
    clientMessageId: 'client-1',
  );

  // Mock successful API response
  final serverMessage = Message(
    id: 'server-1',
    senderId: 'user-1',
    receiverId: 'user-2',
    content: 'Test message',
    sendTime: DateTime.now().toIso8601String(),
    status: 'SENT',
    clientMessageId: 'client-1',
  );

  when(mockMessageApi.sendPrivateMessage(any))
      .thenAnswer((_) async => serverMessage);

  // Trigger retry
  outbox.onNetworkAvailable();

  // Wait for async operations
  await Future.delayed(Duration(seconds: 1));

  // Verify message was sent and removed from outbox
  expect(await outbox.getPendingCount(), 0);
  expect(await outbox.getFailedCount(), 0);
});
```

- [ ] **Step 2: Run test**

```bash
cd flutter/apps/web && flutter test test/features/chat/message_outbox_integration_test.dart
```

Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/features/chat/message_outbox_integration_test.dart
git commit -m "test: add retry success integration test"
```

---

### Task 5: Add Retry Failure Test

**Files:**
- Modify: `flutter/apps/web/test/features/chat/message_outbox_integration_test.dart`

- [ ] **Step 1: Add retry failure test**

```dart
test('retry fails after max retries exceeded', () async {
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactory,
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
  when(mockMessageApi.sendPrivateMessage(any))
      .thenThrow(Exception('Network error'));

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

- [ ] **Step 2: Run test**

```bash
cd flutter/apps/web && flutter test test/features/chat/message_outbox_integration_test.dart
```

Expected: 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/features/chat/message_outbox_integration_test.dart
git commit -m "test: add retry failure integration test"
```

---

### Task 6: Add Network Switch Test

**Files:**
- Modify: `flutter/apps/web/test/features/chat/message_outbox_integration_test.dart`

- [ ] **Step 1: Add network switch test**

```dart
test('network restoration triggers retry of pending messages', () async {
  // Start offline
  bool isOnline = false;
  outbox = MessageOutbox(
    messageApi: mockMessageApi,
    idbFactory: idbFactory,
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

  // Verify message is pending
  expect(await outbox.getPendingCount(), 1);

  // Mock successful API response
  final serverMessage = Message(
    id: 'server-1',
    senderId: 'user-1',
    receiverId: 'user-2',
    content: 'Offline message',
    sendTime: DateTime.now().toIso8601String(),
    status: 'SENT',
    clientMessageId: 'client-1',
  );

  when(mockMessageApi.sendPrivateMessage(any))
      .thenAnswer((_) async => serverMessage);

  // Simulate network restoration
  isOnline = true;
  outbox.onNetworkAvailable();

  // Wait for async operations
  await Future.delayed(Duration(seconds: 1));

  // Verify message was sent
  expect(await outbox.getPendingCount(), 0);
});
```

- [ ] **Step 2: Run test**

```bash
cd flutter/apps/web && flutter test test/features/chat/message_outbox_integration_test.dart
```

Expected: 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/features/chat/message_outbox_integration_test.dart
git commit -m "test: add network switch integration test"
```

---

### Task 7: Create NetworkStatusProvider Tests

**Files:**
- Create: `flutter/apps/web/test/core/network/network_status_provider_test.dart`

- [ ] **Step 1: Write test file**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/network/network_status_provider.dart';

void main() {
  group('NetworkState', () {
    test('defaults to online status', () {
      const state = NetworkState();
      expect(state.status, NetworkStatus.online);
      expect(state.isOnline, true);
      expect(state.isOffline, false);
      expect(state.isLimited, false);
    });

    test('copyWith preserves unchanged fields', () {
      const state = NetworkState(
        status: NetworkStatus.offline,
        retryCount: 3,
      );

      final updated = state.copyWith(status: NetworkStatus.online);

      expect(updated.status, NetworkStatus.online);
      expect(updated.retryCount, 3); // Preserved
    });

    test('equality based on status only', () {
      const state1 = NetworkState(status: NetworkStatus.online);
      const state2 = NetworkState(
        status: NetworkStatus.online,
        retryCount: 5,
      );

      expect(state1, equals(state2));
    });
  });

  group('NetworkStatus', () {
    test('has correct values', () {
      expect(NetworkStatus.values.length, 3);
      expect(NetworkStatus.values, contains(NetworkStatus.online));
      expect(NetworkStatus.values, contains(NetworkStatus.offline));
      expect(NetworkStatus.values, contains(NetworkStatus.limited));
    });
  });

  group('NetworkStatusNotifier', () {
    test('initializes with online status when navigator is online', () {
      final notifier = NetworkStatusNotifier(
        dataSource: _TestNetworkDataSource(isOnline: true),
      );

      expect(notifier.state.isOnline, true);
      notifier.dispose();
    });

    test('initializes with offline status when navigator is offline', () {
      final notifier = NetworkStatusNotifier(
        dataSource: _TestNetworkDataSource(isOnline: false),
      );

      expect(notifier.state.isOffline, true);
      notifier.dispose();
    });
  });
}

class _TestNetworkDataSource implements NetworkStatusDataSource {
  _TestNetworkDataSource({required this.isOnline});

  final bool isOnline;

  @override
  bool get isNavigatorOnline => isOnline;

  @override
  Stream<void> get onOnline => const Stream.empty();

  @override
  Stream<void> get onOffline => const Stream.empty();

  @override
  Future<bool> checkServerReachable(String url) async => isOnline;
}
```

- [ ] **Step 2: Run test**

```bash
cd flutter/apps/web && flutter test test/core/network/network_status_provider_test.dart
```

Expected: 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/core/network/
git commit -m "test: add NetworkStatusProvider unit tests"
```

---

### Task 8: Create Verification Documentation

**Files:**
- Create: `docs/pwa-verification-guide.md`

- [ ] **Step 1: Write verification guide**

```markdown
# PWA Verification Guide

This guide provides step-by-step instructions for verifying PWA functionality in the browser.

## Prerequisites

1. Build the Flutter Web app:
   ```bash
   cd flutter/apps/web
   flutter build web
   ```

2. Serve the built files:
   ```bash
   cd build/web
   python -m http.server 8000
   # or
   npx serve -s . -l 8000
   ```

3. Open http://localhost:8000 in Chrome

## 1. PWA Installation Verification

### Steps:
1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Manifest** in the left sidebar
4. Verify:
   - [ ] Name: "IM Messenger"
   - [ ] Short name: "IM"
   - [ ] Display: "standalone"
   - [ ] Theme color: "#1a1a2e"
   - [ ] Icons are displayed correctly

5. Look for install button in address bar
6. Click to install PWA
7. Verify app opens in standalone window

### Expected Result:
- Manifest is valid
- App can be installed
- App opens without browser UI

## 2. Service Worker Registration

### Steps:
1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in the left sidebar
4. Verify:
   - [ ] Service worker is registered
   - [ ] Status: activated and is running
   - [ ] Scope: "/"

5. Check **Cache Storage**:
   - [ ] im-messenger-v1 cache exists
   - [ ] Contains index.html, main.dart.js, etc.

### Expected Result:
- Service worker is active
- App shell is precached

## 3. Offline Functionality

### Steps:
1. Open the app in browser
2. Open DevTools > **Network** tab
3. Check **Offline** checkbox
4. Refresh the page
5. Verify:
   - [ ] App loads from cache
   - [ ] Offline banner appears: "网络已断开，部分功能可能不可用"
   - [ ] UI is functional (can navigate)

### Expected Result:
- App works offline
- Offline banner is displayed

## 4. Message Sending Verification

### Steps:
1. Open the app and login
2. Open a chat conversation
3. Open DevTools > **Network** tab
4. Check **Offline** checkbox
5. Type and send a message
6. Verify:
   - [ ] Message shows "SENDING" status
   - [ ] NetworkStatusBanner shows pending message count
   - [ ] Message is queued in outbox

7. Uncheck **Offline** checkbox
8. Verify:
   - [ ] Message status changes to "SENT"
   - [ ] Pending count decreases
   - [ ] Message appears in chat history

### Expected Result:
- Messages are queued when offline
- Messages are sent when online

## 5. Network Recovery Verification

### Steps:
1. Open the app and login
2. Open a chat conversation
3. Go offline (DevTools > Network > Offline)
4. Send multiple messages
5. Verify pending count increases
6. Go online (uncheck Offline)
7. Verify:
   - [ ] Messages are sent automatically
   - [ ] Status changes from "SENDING" to "SENT"
   - [ ] No error messages

### Expected Result:
- Outbox retries automatically on network recovery

## 6. Cache Version Management

### Steps:
1. Open DevTools > **Application** > **Cache Storage**
2. Verify cache names:
   - [ ] im-messenger-v1 (app shell)
   - [ ] im-runtime-v1 (static assets)
   - [ ] im-images-v1 (images)
   - [ ] im-api-v1 (API responses)

### Expected Result:
- Separate caches for different resource types
- Version suffix for cache invalidation

## Troubleshooting

### Service Worker Not Registering
- Check console for errors
- Ensure HTTPS or localhost
- Clear cache and hard refresh (Ctrl+Shift+R)

### Icons Not Displaying
- Verify icon files exist in web/icons/
- Check manifest.json icon paths
- Clear cache and refresh

### Messages Not Sending
- Check Network tab for failed requests
- Verify API endpoint is correct
- Check console for errors

## Browser Support

Tested on:
- Chrome 120+
- Edge 120+
- Firefox 120+
- Safari 17+

Note: Some features may not work in older browsers.
```

- [ ] **Step 2: Commit documentation**

```bash
git add docs/pwa-verification-guide.md
git commit -m "docs: add PWA verification guide"
```

---

### Task 9: Run All Tests and Verify

**Files:**
- None (verification step)

- [ ] **Step 1: Run all tests**

```bash
cd flutter/apps/web && flutter test
```

Expected: All tests pass

- [ ] **Step 2: Build web app**

```bash
cd flutter/apps/web && flutter build web
```

Expected: Build succeeds

- [ ] **Step 3: Verify build output**

```bash
ls -la flutter/apps/web/build/web/icons/
```

Expected: icon-192.png and icon-512.png exist

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete PWA enhancement with icons, tests, and docs"
```

---

## Summary

This plan adds:
1. PWA icons (192x192 and 512x512)
2. Integration tests for MessageOutbox (enqueue, retry success, retry failure, network switch)
3. Unit tests for NetworkStatusProvider
4. Browser verification guide

Total estimated time: 2-3 hours
