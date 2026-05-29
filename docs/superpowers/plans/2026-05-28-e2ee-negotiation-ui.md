# E2EE 协商弹窗 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Flutter Web ChatPage 中补齐 E2EE 协商弹窗，当收到对方的加密协商请求时展示弹窗让用户接受或拒绝。

**Architecture:** 复用已有的 `ChatNotifierWithOutbox` 状态管理和 `NegotiationDialog` 组件，仅在 ChatPage 中添加监听和弹窗展示逻辑。`NegotiationDialog` 微调添加 loading/error 状态。

**Tech Stack:** Flutter, Riverpod, im_core (E2eeNegotiationEvent, E2eeNegotiationAction)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `flutter/apps/web/lib/features/e2ee/presentation/negotiation_dialog.dart` | 修改 | 添加 loading/error 状态支持 |
| `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | 修改 | 添加协商弹窗监听和展示逻辑 |
| `flutter/apps/web/lib/l10n/app_en.arb` | 修改 | 添加协商中/失败的本地化字符串 |
| `flutter/apps/web/lib/l10n/app_zh.arb` | 修改 | 添加中文本地化字符串 |

---

## Task 1: 更新 NegotiationDialog 支持 loading/error 状态

**Files:**
- Modify: `flutter/apps/web/lib/features/e2ee/presentation/negotiation_dialog.dart`

- [ ] **Step 1: 读取当前 NegotiationDialog 代码**

```dart
// 当前代码 (negotiation_dialog.dart:1-41)
import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class NegotiationDialog extends StatelessWidget {
  const NegotiationDialog({required this.requesterName, required this.onAccept, required this.onReject, super.key});
  final String requesterName;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Row(children: [const Icon(Icons.lock, color: Colors.green), const SizedBox(width: 8), Text(loc.e2eeRequestTitle)]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(loc.e2eeRequestDescription(requesterName)),
        const SizedBox(height: 12),
        Text(loc.e2eeSignalProtocol, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(loc.e2eeSignalBullet1),
        Text(loc.e2eeSignalBullet2),
        Text(loc.e2eeSignalBullet3),
      ]),
      actions: [
        TextButton(onPressed: onReject, child: Text(loc.e2eeReject)),
        FilledButton(onPressed: onAccept, child: Text(loc.e2eeAccept)),
      ],
    );
  }

  static Future<bool?> show(BuildContext context, String requesterName) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => NegotiationDialog(
        requesterName: requesterName,
        onAccept: () => Navigator.of(ctx).pop(true),
        onReject: () => Navigator.of(ctx).pop(false),
      ),
    );
  }
}
```

- [ ] **Step 2: 修改 NegotiationDialog 添加 loading/error 状态**

```dart
import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class NegotiationDialog extends StatefulWidget {
  const NegotiationDialog({
    required this.requesterName,
    required this.onAccept,
    required this.onReject,
    super.key,
  });

  final String requesterName;
  final Future<void> Function() onAccept;
  final Future<void> Function() onReject;

  @override
  State<NegotiationDialog> createState() => _NegotiationDialogState();
}

class _NegotiationDialogState extends State<NegotiationDialog> {
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _handleAccept() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await widget.onAccept();
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _handleReject() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await widget.onReject();
      if (mounted) Navigator.of(context).pop(false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.lock, color: Colors.green),
          const SizedBox(width: 8),
          Text(loc.e2eeRequestTitle),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(loc.e2eeRequestDescription(widget.requesterName)),
          const SizedBox(height: 12),
          Text(
            loc.e2eeSignalProtocol,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(loc.e2eeSignalBullet1),
          Text(loc.e2eeSignalBullet2),
          Text(loc.e2eeSignalBullet3),
          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : _handleReject,
          child: Text(loc.e2eeReject),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _handleAccept,
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(loc.e2eeAccept),
        ),
      ],
    );
  }
}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze lib/features/e2ee/presentation/negotiation_dialog.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/e2ee/presentation/negotiation_dialog.dart
git commit -m "feat(e2ee): add loading/error state to NegotiationDialog"
```

---

## Task 2: 在 ChatPage 中添加协商弹窗监听

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 添加 import**

在 `chat_page.dart` 顶部添加：

```dart
import 'package:im_core/core.dart';
import '../../e2ee/presentation/negotiation_dialog.dart';
```

注意：`package:im_core/core.dart` 已存在，只需添加 `negotiation_dialog.dart` 的 import。

- [ ] **Step 2: 添加协商弹窗展示方法**

在 `_ChatPageState` 类中，在 `_scrollToBottom()` 方法之后添加：

```dart
void _showNegotiationDialog(E2eeNegotiationEvent event) {
  final requesterName = event.requesterName ?? event.requesterId;
  showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => NegotiationDialog(
      requesterName: requesterName,
      onAccept: () async {
        final accepted = await ref
            .read(chatStateProvider.notifier)
            .acceptPendingNegotiation(event.sessionId);
        if (!accepted) {
          throw Exception('Failed to accept encryption negotiation');
        }
        ref.invalidate(e2eeSessionStatusProvider(event.sessionId));
      },
      onReject: () async {
        await ref
            .read(chatStateProvider.notifier)
            .rejectPendingNegotiation(event.sessionId);
        ref.invalidate(e2eeSessionStatusProvider(event.sessionId));
      },
    ),
  );
}
```

- [ ] **Step 3: 在 _buildChatView 中添加协商状态监听**

在 `_buildChatView` 方法中，在现有的 `ref.listen` 之后添加：

```dart
// Listen for pending E2EE negotiation requests
ref.listen(
  chatStateProvider.select((s) => s.activePendingNegotiation),
  (prev, next) {
    if (next != null && next.action == E2eeNegotiationAction.request) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _showNegotiationDialog(next);
        }
      });
    }
  },
);
```

- [ ] **Step 4: 添加非当前会话通知**

在 `_buildSessionList` 方法的 `onTap` 回调中，切换会话后检查是否有缓存的协商请求。在 `_selectSession` 方法中添加：

```dart
Future<void> _selectSession(dynamic session) async {
  final notifier = ref.read(chatStateProvider.notifier);
  notifier.setActiveSession(session.id);
  final isGroup =
      session.conversationType == 'group' || session.type == 'group';
  if (isGroup) {
    await notifier.loadGroupMessages(session.targetId);
  } else {
    await notifier.loadMessages(session.targetId);
  }

  // Check for cached negotiation request after switching session
  if (!isGroup && mounted) {
    final pending = notifier.pendingNegotiationForSession(session.id);
    if (pending != null && pending.action == E2eeNegotiationAction.request) {
      _showNegotiationDialog(pending);
    }
  }
}
```

- [ ] **Step 5: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze lib/features/chat/presentation/chat_page.dart`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(e2ee): wire negotiation dialog in ChatPage"
```

---

## Task 3: 添加非当前会话的 SnackBar 通知

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 添加协商事件通知监听**

在 `_buildChatView` 方法中，添加对所有协商事件的监听（不仅是当前会话）：

```dart
// Listen for all E2EE negotiation events for notifications
ref.listen(
  chatStateProvider.select((s) => s.pendingNegotiations),
  (prev, next) {
    if (next.length > (prev?.length ?? 0)) {
      // New negotiation request arrived
      final newEntries = next.entries.where(
        (e) => prev == null || !prev.containsKey(e.key),
      );
      for (final entry in newEntries) {
        final event = entry.value;
        if (event.action == E2eeNegotiationAction.request) {
          final activeId = ref.read(chatStateProvider).activeSessionId;
          final isCurrentSession = event.sessionId == activeId ||
              _normalizeSessionKey(event.sessionId) == activeId;
          if (!isCurrentSession && mounted) {
            final name = event.requesterName ?? event.requesterId;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('E2EE negotiation request from $name'),
                duration: const Duration(seconds: 5),
                action: SnackBarAction(
                  label: 'View',
                  onPressed: () {
                    // Switch to the session with the pending negotiation
                    ref
                        .read(chatStateProvider.notifier)
                        .setActiveSession(event.sessionId);
                  },
                ),
              ),
            );
          }
        }
      }
    }
  },
);
```

注意：需要添加辅助方法 `_normalizeSessionKey`，或者直接使用 `ChatNotifierWithOutbox` 的 `pendingNegotiationForSession` 方法。

- [ ] **Step 2: 简化实现 - 直接在 _handleE2eeNegotiation 中通知**

由于 `pendingNegotiations` 的监听可能过于复杂，更简单的方案是在 `ChatNotifierWithOutbox._handleE2eeNegotiation` 中添加回调。但根据约束，我们不修改 `ChatNotifierWithOutbox`。

替代方案：在 `_buildChatView` 中监听 `pendingNegotiations` 的变化，检测新增的请求。

```dart
// 在 _buildChatView 中添加
ref.listen(
  chatStateProvider.select((s) => s.pendingNegotiations),
  (prev, next) {
    if (next.length > (prev?.length ?? 0)) {
      for (final entry in next.entries) {
        if (prev == null || !prev.containsKey(entry.key)) {
          final event = entry.value;
          if (event.action == E2eeNegotiationAction.request) {
            final activeId = ref.read(chatStateProvider).activeSessionId;
            // Only show notification if not the current session
            if (event.sessionId != activeId && mounted) {
              final name = event.requesterName ?? event.requesterId;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(loc.e2eeNegotiationNotification(name)),
                  duration: const Duration(seconds: 5),
                ),
              );
            }
          }
        }
      }
    }
  },
);
```

- [ ] **Step 3: 添加本地化字符串**

在 `app_en.arb` 中添加：
```json
"e2eeNegotiationNotification": "{name} requests to enable end-to-end encryption"
```

在 `app_zh.arb` 中添加：
```json
"e2eeNegotiationNotification": "{name} 请求与你开启端到端加密"
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git add flutter/apps/web/lib/l10n/app_en.arb
git add flutter/apps/web/lib/l10n/app_zh.arb
git commit -m "feat(e2ee): add SnackBar notification for non-current session negotiation"
```

---

## Task 4: 运行测试验证

**Files:**
- Test: `flutter/apps/web/test/features/chat/chat_page_test.dart` (if exists)

- [ ] **Step 1: 检查现有测试**

Run: `ls flutter/apps/web/test/features/chat/`
Expected: 查看是否有相关测试文件

- [ ] **Step 2: 运行现有测试**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass

- [ ] **Step 3: 验证应用启动**

Run: `cd flutter/apps/web && flutter run -d chrome --web-port=8080`
Expected: 应用启动成功，无编译错误

- [ ] **Step 4: Commit (if test fixes needed)**

```bash
git add -A
git commit -m "test: update tests for E2EE negotiation dialog"
```

---

## 验证清单

- [ ] NegotiationDialog 显示 loading 状态（接受/拒绝时）
- [ ] NegotiationDialog 显示错误信息（失败时）
- [ ] 当前会话收到协商请求时自动弹窗
- [ ] 非当前会话收到协商请求时显示 SnackBar
- [ ] 切换到有缓存请求的会话时自动弹窗
- [ ] 接受协商后会话状态变为 encrypted
- [ ] 拒绝协商后会话状态变为 plaintext
- [ ] 所有现有测试通过
