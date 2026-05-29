# Chat Header Widget 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Flutter Web 聊天页面的头部提取为独立的 ChatHeader widget，补齐头像和 E2EE 状态徽章

**Architecture:** 新建 ChatHeader widget 封装头部 UI 逻辑，在 chat_page.dart 中替换现有头部代码，复用 EncryptionBadge 显示 E2EE 状态

**Tech Stack:** Flutter, Riverpod, im_core models

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `flutter/apps/web/lib/features/chat/presentation/widgets/chat_header.dart` | 新建 - ChatHeader widget，封装头部 UI |
| `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | 修改 - 使用 ChatHeader 替代现有头部 |

---

### Task 1: 创建 ChatHeader widget 基础结构

**Files:**
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/chat_header.dart`

- [ ] **Step 1: 创建 ChatHeader widget 文件**

```dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';
import '../../../e2ee/presentation/encryption_badge.dart';

class ChatHeader extends StatelessWidget {
  const ChatHeader({
    required this.session,
    required this.isMobile,
    required this.onBackPressed,
    this.e2eeStatus,
    super.key,
  });

  final ChatSession session;
  final bool isMobile;
  final VoidCallback onBackPressed;
  final E2eeSessionStatus? e2eeStatus;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final sessionName =
        session.conversationName ?? session.targetName ?? session.id;
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    final memberCount = session.memberCount;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: Row(
        children: [
          if (isMobile)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: onBackPressed,
            ),
          _buildAvatar(context),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  sessionName,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (isGroup && memberCount != null)
                  Text(
                    loc.chatMemberCount(memberCount),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          if (!isGroup && e2eeStatus != null)
            EncryptionBadge(status: e2eeStatus!),
        ],
      ),
    );
  }

  Widget _buildAvatar(BuildContext context) {
    return CircleAvatar(
      radius: 18,
      backgroundImage: session.targetAvatar != null
          ? NetworkImage(session.targetAvatar!)
          : null,
      child: session.targetAvatar == null
          ? Text(
              session.targetName.isNotEmpty
                  ? session.targetName[0].toUpperCase()
                  : '?',
              style: const TextStyle(fontSize: 16),
            )
          : null,
    );
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `flutter analyze flutter/apps/web/lib/features/chat/presentation/widgets/chat_header.dart`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/chat_header.dart
git commit -m "feat(chat): add ChatHeader widget with avatar and E2EE badge"
```

---

### Task 2: 在 chat_page.dart 中集成 ChatHeader

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart:205-298`

- [ ] **Step 1: 添加 ChatHeader 导入**

在 `chat_page.dart` 文件顶部的导入部分添加：

```dart
import 'widgets/chat_header.dart';
```

- [ ] **Step 2: 替换现有头部代码**

在 `_buildChatView` 方法中，找到 `// Header` 注释后的 Container（第 241-298 行），替换为：

```dart
// Header
ChatHeader(
  session: session!,
  isMobile: isMobile,
  onBackPressed: () {
    ref.read(chatStateProvider.notifier).setActiveSession(null);
  },
  e2eeStatus: !isGroup
      ? ref.watch(e2eeSessionStatusProvider(sessionId)).whenOrNull(
          data: (statusStr) => E2eeSessionStatus.fromString(statusStr),
        )
      : null,
),
```

- [ ] **Step 3: 验证代码编译**

Run: `cd flutter/apps/web && flutter analyze`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(chat): integrate ChatHeader into ChatPage"
```

---

### Task 3: 运行完整测试验证

**Files:**
- Test: `flutter/apps/web/test/`

- [ ] **Step 1: 运行静态分析**

Run: `cd flutter/apps/web && flutter analyze`
Expected: 无错误

- [ ] **Step 2: 运行单元测试**

Run: `cd flutter/apps/web && flutter test`
Expected: 所有测试通过

- [ ] **Step 3: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix(chat): resolve ChatHeader integration issues"
```

---

## 验证清单

完成所有任务后，验证以下内容：

1. ✅ 新增文件：`widgets/chat_header.dart`
2. ✅ 修改文件：`chat_page.dart`
3. ✅ 头像显示：有头像显示图片，无头像显示首字母
4. ✅ 名称显示：显示会话名称
5. ✅ E2EE 徽章：私聊显示加密状态徽章
6. ✅ 移动端：显示返回按钮
7. ✅ 群聊：显示成员数，无 E2EE 徽章
8. ✅ 无 provider 修改
9. ✅ 无路由修改
10. ✅ 无 E2EE 逻辑修改

---

## 冲突记录

无
