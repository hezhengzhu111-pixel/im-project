# Flutter 全量测试修复与代码质量提升 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 465 个测试全部通过，修复 39 个分析问题，实现 0 issues。

**Architecture:** 分类批量修复：先修复 flaky test（测试隔离）和 integration_test 依赖错误，再批量清理 warnings（未使用 import、null 比较、类型转换等），最后验证全部通过。

**Tech Stack:** Flutter Web, Dart, Riverpod, idb_shim, go_router

---

## Task 1: 添加 integration_test 依赖

**Files:**
- Modify: `flutter/apps/web/pubspec.yaml`

- [ ] **Step 1: 在 dev_dependencies 中添加 integration_test**

在 `flutter/apps/web/pubspec.yaml` 的 `dev_dependencies` 部分添加：

```yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  integration_test:
    sdk: flutter
  build_runner: ^2.4.8
  freezed: ^2.4.5
  json_serializable: ^6.7.1
  mockito: ^5.4.4
  very_good_analysis: ^5.1.0
```

- [ ] **Step 2: 验证 4 个 error 消失**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze 2>&1 | grep error`
Expected: 无 error 输出

- [ ] **Step 3: Commit**

```bash
cd flutter/apps/web && git add pubspec.yaml && git commit -m "fix: add integration_test dependency to resolve 4 analyzer errors"
```

---

## Task 2: 修复 flaky test（测试隔离）

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/data/message_outbox.dart`
- Modify: `flutter/apps/web/test/features/chat/message_outbox_integration_test.dart`

- [ ] **Step 1: 为 MessageOutbox 添加可选 dbName 参数**

在 `flutter/apps/web/lib/features/chat/data/message_outbox.dart` 中修改构造函数：

```dart
class MessageOutbox {
  MessageOutbox({
    required MessageApi messageApi,
    required IdbFactory idbFactory,
    required bool Function() isOnline,
    String dbName = 'im_outbox',
  })  : _messageApi = messageApi,
        _idbFactory = idbFactory,
        _isOnline = isOnline,
        _dbName = dbName;
```

同时将 `static const _dbName = 'im_outbox';` 改为 `final String _dbName;`。

- [ ] **Step 2: 修复 tearDown 中的 null 安全问题**

在 `flutter/apps/web/test/features/chat/message_outbox_integration_test.dart` 中修改 tearDown：

```dart
tearDown(() async {
  if (outbox != null) {
    await outbox!.clearAll();
    outbox!.dispose();
  }
});
```

改为：

```dart
MessageOutbox? outbox;

tearDown(() async {
  final ob = outbox;
  if (ob != null) {
    await ob.clearAll();
    ob.dispose();
  }
});
```

- [ ] **Step 3: 为每个测试用例使用独立数据库名**

在 `message_outbox_integration_test.dart` 中，为每个创建 `MessageOutbox` 的地方添加唯一 `dbName` 参数：

```dart
outbox = MessageOutbox(
  messageApi: mockMessageApi,
  idbFactory: idbFactorySembastMemory,
  isOnline: () => false,
  dbName: 'test_outbox_enqueue_${DateTime.now().millisecondsSinceEpoch}',
);
```

对所有 12 个测试用例都做类似修改，确保数据库名唯一。

- [ ] **Step 4: 验证 flaky test 通过**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat test test/features/chat/message_outbox_integration_test.dart`
Expected: All tests passed

- [ ] **Step 5: 验证完整测试套件通过**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat test 2>&1 | tail -5`
Expected: `+465 -0: All tests passed.`

- [ ] **Step 6: Commit**

```bash
cd flutter/apps/web && git add lib/features/chat/data/message_outbox.dart test/features/chat/message_outbox_integration_test.dart && git commit -m "fix: add dbName parameter to MessageOutbox for test isolation"
```

---

## Task 3: 修复 lib/ 中的 warnings — 未使用的 import

**Files:**
- Modify: `flutter/apps/web/lib/core/network/network_providers.dart`
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`
- Modify: `flutter/apps/web/lib/core/web_meta/web_meta_service.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/network_status_banner.dart`
- Modify: `flutter/apps/web/lib/main.dart`

- [ ] **Step 1: 移除 network_providers.dart 中未使用的 import**

在 `lib/core/network/network_providers.dart` 中删除第 3 行：

```dart
// 删除这行
import '../config/app_config_provider.dart';
```

- [ ] **Step 2: 移除 app_router.dart 中未使用的 import**

在 `lib/core/router/app_router.dart` 中删除第 30 行：

```dart
// 删除这行
import 'route_meta.dart';
```

- [ ] **Step 3: 移除 web_meta_service.dart 中未使用的 import**

在 `lib/core/web_meta/web_meta_service.dart` 中删除第 5-6 行：

```dart
// 删除这两行
import 'web_meta_service_stub.dart'
    if (dart.library.js_interop) 'web_meta_service_web.dart';
```

- [ ] **Step 4: 移除 network_status_banner.dart 中未使用的 import**

在 `lib/features/chat/presentation/widgets/network_status_banner.dart` 中删除第 5-7 行：

```dart
// 删除这三行
import '../../../../core/network/network_status_provider.dart';
import '../../data/outbox_provider.dart';
import '../chat_providers.dart';
```

- [ ] **Step 5: 移除 main.dart 中未使用的 import**

在 `lib/main.dart` 中删除第 18 行：

```dart
// 删除这行
import 'core/config/app_config_provider.dart';
```

- [ ] **Step 6: 验证无未使用 import 警告**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze 2>&1 | grep unused_import`
Expected: 无输出

- [ ] **Step 7: Commit**

```bash
cd flutter/apps/web && git add lib/core/network/network_providers.dart lib/core/router/app_router.dart lib/core/web_meta/web_meta_service.dart lib/features/chat/presentation/widgets/network_status_banner.dart lib/main.dart && git commit -m "fix: remove unused imports from lib/"
```

---

## Task 4: 修复 lib/ 中的 warnings — 不必要的 null 比较和类型转换

**Files:**
- Modify: `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart`
- Modify: `flutter/apps/web/lib/features/chat/data/file_api.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 修复 web_audio_recorder_adapter.dart 中的 null 比较**

在 `lib/adapters/web_audio_recorder_adapter.dart` 第 34 行，将：

```dart
if (blob != null && blob.size > 0) {
```

改为：

```dart
if (blob.size > 0) {
```

- [ ] **Step 2: 修复 file_api.dart 中 4 处不必要的类型转换**

在 `lib/features/chat/data/file_api.dart` 中，将所有 `fromJson: (json) => json as Map<String, dynamic>` 改为 `fromJson: (json) => json`。共 4 处（第 40、59、78、97 行）。

- [ ] **Step 3: 修复 chat_page.dart 中 4 处不必要的 null 比较**

在 `lib/features/chat/presentation/chat_page.dart` 中，删除第 392、408、432、456 行的 `if (session == null) return;`。因为 `session` 在第 325 行已经通过 null 检查并返回，后续代码中 `session` 已经是非 null 的。

- [ ] **Step 4: 验证相关警告消失**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze 2>&1 | grep -E "unnecessary_null_comparison|unnecessary_cast"`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
cd flutter/apps/web && git add lib/adapters/web_audio_recorder_adapter.dart lib/features/chat/data/file_api.dart lib/features/chat/presentation/chat_page.dart && git commit -m "fix: remove unnecessary null comparisons and type casts"
```

---

## Task 5: 修复 lib/ 中的 warnings — 未使用变量和 protected member

**Files:**
- Modify: `flutter/apps/web/lib/core/observer/app_provider_observer.dart`
- Modify: `flutter/apps/web/lib/features/chat/data/outbox_provider.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart`
- Modify: `flutter/apps/web/lib/features/moments/presentation/widgets/moments_sidebar.dart`

- [ ] **Step 1: 修复 app_provider_observer.dart 中的 protected member 访问**

在 `lib/core/observer/app_provider_observer.dart` 第 47 行，将：

```dart
if (value is StateNotifier) {
  return value.state.runtimeType.toString();
}
```

改为：

```dart
return value.runtimeType.toString();
```

- [ ] **Step 2: 移除 outbox_provider.dart 中未使用的变量**

在 `lib/features/chat/data/outbox_provider.dart` 第 10 行，删除：

```dart
final networkStatus = ref.watch(networkStatusProvider.notifier);
```

- [ ] **Step 3: 移除 message_bubble.dart 中未使用的变量**

在 `lib/features/chat/presentation/widgets/message_bubble.dart` 第 20 行，删除：

```dart
final theme = Theme.of(context);
```

（注意：`_buildMessageContent` 方法中已有自己的 `theme` 变量，第 20 行的是未使用的。）

- [ ] **Step 4: 移除 moments_sidebar.dart 中未使用的变量**

在 `lib/features/moments/presentation/widgets/moments_sidebar.dart` 第 16 行，删除：

```dart
final loc = AppLocalizations.of(context)!;
```

（注意：`build` 方法中的 `loc` 未被使用，但 `_buildProfileCard` 等子方法中有自己的 `loc`。）

- [ ] **Step 5: 验证相关警告消失**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze 2>&1 | grep -E "unused_local_variable|invalid_use_of_protected_member|invalid_use_of_visible_for_testing"`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
cd flutter/apps/web && git add lib/core/observer/app_provider_observer.dart lib/features/chat/data/outbox_provider.dart lib/features/chat/presentation/widgets/message_bubble.dart lib/features/moments/presentation/widgets/moments_sidebar.dart && git commit -m "fix: remove unused variables and fix protected member access"
```

---

## Task 6: 修复 lib/ 中的 info — 冗余 import

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/network_status_banner.dart`
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`

- [ ] **Step 1: 移除 network_status_banner.dart 中的冗余 import**

在 `lib/features/chat/presentation/widgets/network_status_banner.dart` 中，删除第 4 行（已在 Task 3 中删除了第 5-7 行，这里检查是否还有冗余的 `../../../../core/di/providers.dart`）：

```dart
// 如果删除了 network_status_provider.dart 和 chat_providers.dart 的 import，
// 保留 providers.dart 即可（它已经提供了所有需要的元素）
```

- [ ] **Step 2: 移除 contacts_page.dart 中的冗余 import**

在 `lib/features/contacts/presentation/contacts_page.dart` 第 8 行，删除：

```dart
import '../../chat/presentation/chat_providers.dart';
```

- [ ] **Step 3: 验证 info 消失**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze 2>&1 | grep unnecessary_import`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
cd flutter/apps/web && git add lib/features/contacts/presentation/contacts_page.dart && git commit -m "fix: remove redundant imports"
```

---

## Task 7: 修复 test/ 中的 warnings

**Files:**
- Modify: `flutter/apps/web/test/a11y/semantics_test.dart`
- Modify: `flutter/apps/web/test/core/debug/debug_panel_test.dart`
- Modify: `flutter/apps/web/test/core/network/network_status_outbox_test.dart`
- Modify: `flutter/apps/web/test/core/router/app_router_test.dart`
- Modify: `flutter/apps/web/test/features/settings/settings_page_test.dart`
- Modify: `flutter/apps/web/test/ports/audio_recorder_port_test.dart`
- Modify: `flutter/apps/web/test/widgets/message_input_test.dart`
- Modify: `flutter/apps/web/test/features/chat/presentation/message_input_test.dart`

- [ ] **Step 1: 修复 semantics_test.dart — 移除 2 个未使用 import**

在 `test/a11y/semantics_test.dart` 中删除第 2-3 行：

```dart
import 'package:flutter/semantics.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
```

- [ ] **Step 2: 修复 debug_panel_test.dart — 移除冗余 import**

在 `test/core/debug/debug_panel_test.dart` 第 7 行，删除：

```dart
import 'package:im_core/src/network/ws_connection_state.dart';
```

- [ ] **Step 3: 修复 network_status_outbox_test.dart — 移除冗余 import**

在 `test/core/network/network_status_outbox_test.dart` 第 3 行，删除：

```dart
import 'package:idb_shim/idb_shim.dart';
```

- [ ] **Step 4: 修复 app_router_test.dart — 移除未使用 import**

在 `test/core/router/app_router_test.dart` 第 8 行，删除：

```dart
import '../../helpers/fakes.dart';
```

- [ ] **Step 5: 修复 settings_page_test.dart — 移除未使用 import**

在 `test/features/settings/settings_page_test.dart` 第 5 行，删除：

```dart
import '../../helpers/fakes.dart';
```

- [ ] **Step 6: 修复 audio_recorder_port_test.dart — 移除不必要的类型转换**

在 `test/ports/audio_recorder_port_test.dart` 第 28 行，将：

```dart
expect(
  ((result as Failure).error as UnknownError).message,
```

改为：

```dart
expect(
  (result.error as UnknownError).message,
```

- [ ] **Step 7: 修复 message_input_test.dart — 移除未使用 import**

在 `test/widgets/message_input_test.dart` 第 3 行，删除：

```dart
import 'package:flutter_localizations/flutter_localizations.dart';
```

- [ ] **Step 8: 修复 message_input_test.dart (presentation) — 移除未使用变量**

在 `test/features/chat/presentation/message_input_test.dart` 第 212 行，删除未使用的 `voiceSent` 变量。

- [ ] **Step 9: 验证 test/ 中的 warnings 消失**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze 2>&1 | grep -E "test/" | grep -E "warning|info"`
Expected: 无输出

- [ ] **Step 10: Commit**

```bash
cd flutter/apps/web && git add test/a11y/semantics_test.dart test/core/debug/debug_panel_test.dart test/core/network/network_status_outbox_test.dart test/core/router/app_router_test.dart test/features/settings/settings_page_test.dart test/ports/audio_recorder_port_test.dart test/widgets/message_input_test.dart test/features/chat/presentation/message_input_test.dart && git commit -m "fix: clean up test warnings — unused imports, casts, variables"
```

---

## Task 8: 最终验证

- [ ] **Step 1: 运行完整分析**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat analyze`
Expected: `No issues found!`

- [ ] **Step 2: 运行完整测试套件**

Run: `cd flutter/apps/web && /c/Users/10954/flutter/bin/flutter.bat test 2>&1 | tail -5`
Expected: `+465 -0: All tests passed.`

- [ ] **Step 3: 验证无回归**

确认所有 465 个测试通过，无新增 warning 或 error。

- [ ] **Step 4: 最终 Commit（如有遗漏）**

如果有任何遗漏的修复，在此步骤补充 commit。
