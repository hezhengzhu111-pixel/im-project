# 群组会话 Key 一致性修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Flutter Web 群组列表点击群组后 activeSessionId 与消息加载 key 不一致的问题

**Architecture:** 在 ChatNotifierWithOutbox 中添加公开方法获取 canonical session key，修改 group_list_page.dart 使用该方法确保一致性

**Tech Stack:** Flutter, Riverpod, Dart

---

### Task 1: 添加 getGroupSessionKey 公开方法

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart:777-787`

- [ ] **Step 1: 读取当前文件确认代码位置**

Run: `cat -n flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart | grep -A 10 "_sessionKeyForGroupTarget"`

Expected: 显示 `_sessionKeyForGroupTarget` 方法定义

- [ ] **Step 2: 添加 getGroupSessionKey 公开方法**

在 `_sessionKeyForGroupTarget` 方法之后添加公开方法：

```dart
  /// 获取群组的 canonical session key
  String getGroupSessionKey(String groupId) {
    return _sessionKeyForGroupTarget(groupId);
  }
```

修改文件：`flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart`

在第 787 行后（`_sessionKeyForGroupTarget` 方法结束的大括号后）添加：

```dart

  /// 获取群组的 canonical session key
  String getGroupSessionKey(String groupId) {
    return _sessionKeyForGroupTarget(groupId);
  }
```

- [ ] **Step 3: 验证代码语法正确**

Run: `cd flutter/apps/web && dart analyze lib/features/chat/presentation/chat_provider_with_outbox.dart`

Expected: 无错误

- [ ] **Step 4: 提交修改**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart
git commit -m "feat(chat): add getGroupSessionKey public method for canonical key access"
```

---

### Task 2: 修改 group_list_page.dart 使用 canonical key

**Files:**
- Modify: `flutter/apps/web/lib/features/group/presentation/group_list_page.dart:53-61`

- [ ] **Step 1: 读取当前文件确认代码位置**

Run: `cat -n flutter/apps/web/lib/features/group/presentation/group_list_page.dart | grep -A 10 "onTap:"`

Expected: 显示 `onTap` 回调代码

- [ ] **Step 2: 修改 onTap 回调使用 canonical key**

修改文件：`flutter/apps/web/lib/features/group/presentation/group_list_page.dart`

将第 53-61 行：

```dart
                    onTap: () {
                        ref
                            .read(chatStateProvider.notifier)
                            .setActiveSession('group_${group.id}');
                        ref
                            .read(chatStateProvider.notifier)
                            .loadGroupMessages(group.id);
                        context.go('/chat');
                      },
```

修改为：

```dart
                    onTap: () {
                        final sessionKey = ref
                            .read(chatStateProvider.notifier)
                            .getGroupSessionKey(group.id);
                        ref
                            .read(chatStateProvider.notifier)
                            .setActiveSession(sessionKey);
                        ref
                            .read(chatStateProvider.notifier)
                            .loadGroupMessages(group.id);
                        context.go('/chat');
                      },
```

- [ ] **Step 3: 验证代码语法正确**

Run: `cd flutter/apps/web && dart analyze lib/features/group/presentation/group_list_page.dart`

Expected: 无错误

- [ ] **Step 4: 提交修改**

```bash
git add flutter/apps/web/lib/features/group/presentation/group_list_page.dart
git commit -m "fix(group): use canonical session key when entering group chat"
```

---

### Task 3: 运行测试验证修复

**Files:**
- Test: `flutter/apps/web/test/features/chat/chat_provider_test.dart`

- [ ] **Step 1: 运行现有测试确保无回归**

Run: `cd flutter/apps/web && flutter test test/features/chat/chat_provider_test.dart`

Expected: 所有测试通过

- [ ] **Step 2: 运行群组相关测试**

Run: `cd flutter/apps/web && flutter test test/features/group/`

Expected: 所有测试通过

- [ ] **Step 3: 运行完整测试套件**

Run: `cd flutter/apps/web && flutter test`

Expected: 所有测试通过，无失败

- [ ] **Step 4: 提交测试结果记录**

```bash
git add -A
git commit -m "test: verify group session key fix with existing tests"
```
