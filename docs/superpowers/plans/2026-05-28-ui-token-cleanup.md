# UI Token 化收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理 im_ui deprecated 组件，将 4 个页面的硬编码 spacing/radius/尺寸替换为 ImTokens 常量，修复语义色硬编码。

**Architecture:** 在 ImTokens 中增加 5 个布局维度常量，删除 im_ui 中 deprecated AppTheme 和 7 个无引用 legacy widgets，批量替换 chat_page/settings_page/contacts_page/add_friend_page 中的硬编码值。

**Tech Stack:** Flutter, Dart, ImTokens/ImColors/ImTheme (im_ui package)

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `flutter/packages/ui/lib/src/theme/im_tokens.dart` | 增加 5 个 layout 常量 |
| Delete | `flutter/packages/ui/lib/src/theme/app_theme.dart` | 移除 deprecated AppTheme |
| Delete | `flutter/packages/ui/lib/src/widgets/widgets.dart` | 移除 7 个无引用 legacy widgets |
| Modify | `flutter/packages/ui/lib/im_ui.dart` | 移除 app_theme.dart / widgets.dart export |
| Modify | `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | Token 替换 11 处硬编码 |
| Modify | `flutter/apps/web/lib/features/settings/presentation/settings_page.dart` | Token 替换 20 处硬编码 |
| Modify | `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart` | Token 替换 + Colors.green 修复 |
| Modify | `flutter/apps/web/lib/features/contacts/presentation/add_friend_page.dart` | Token 替换 + Colors.grey 修复 |

---

### Task 1: 增加 ImTokens 布局常量

**Files:**
- Modify: `flutter/packages/ui/lib/src/theme/im_tokens.dart:47-51`

- [ ] **Step 1: 在 ImTokens 中增加 Layout Dimensions 段**

在 `flutter/packages/ui/lib/src/theme/im_tokens.dart` 的 `// ── Breakpoints ──` 段之前，添加：

```dart
  // ── Layout Dimensions ──
  static const double layoutChatSidebarWidth = 320;
  static const double layoutSettingsAsideWidth = 340;
  static const double layoutSectionGap = 12;
  static const double layoutPanelPadding = 16;
  static const double layoutItemGap = 8;
```

- [ ] **Step 2: 验证编译通过**

Run: `cd flutter/packages/ui && flutter analyze`
Expected: No issues found

- [ ] **Step 3: Commit**

```bash
git add flutter/packages/ui/lib/src/theme/im_tokens.dart
git commit -m "feat(ui): add layout dimension tokens to ImTokens

Add layoutChatSidebarWidth, layoutSettingsAsideWidth,
layoutSectionGap, layoutPanelPadding, layoutItemGap constants."
```

---

### Task 2: 删除 deprecated AppTheme

**Files:**
- Delete: `flutter/packages/ui/lib/src/theme/app_theme.dart`
- Modify: `flutter/packages/ui/lib/im_ui.dart:5`

- [ ] **Step 1: 确认无引用**

Run: `cd flutter && grep -r "import.*app_theme" packages/ui/lib/ apps/web/lib/ --include="*.dart" | grep -v "core/theme/app_theme"`
Expected: Only `im_ui.dart` line 5 (`export 'src/theme/app_theme.dart'`)

- [ ] **Step 2: 删除 app_theme.dart**

```bash
rm flutter/packages/ui/lib/src/theme/app_theme.dart
```

- [ ] **Step 3: 从 im_ui.dart barrel export 中移除**

Edit `flutter/packages/ui/lib/im_ui.dart`, remove line:
```
export 'src/theme/app_theme.dart';
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/packages/ui && flutter analyze`
Expected: No issues found

- [ ] **Step 5: Commit**

```bash
git add flutter/packages/ui/lib/src/theme/app_theme.dart flutter/packages/ui/lib/im_ui.dart
git commit -m "feat(ui): remove deprecated AppTheme from im_ui

AppTheme is replaced by ImTheme.light() / ImTheme.dark() + ImTokens."
```

---

### Task 3: 删除 legacy widgets

**Files:**
- Delete: `flutter/packages/ui/lib/src/widgets/widgets.dart`
- Modify: `flutter/packages/ui/lib/im_ui.dart:14`

- [ ] **Step 1: 确认无引用**

Run: `cd flutter && grep -r "UserAvatar\|UnreadBadge\|EmptyState\|SearchInput\|ConfirmDialog\|LoadingIndicator\|TimeFormatter" apps/web/lib/ --include="*.dart"`
Expected: No matches

- [ ] **Step 2: 删除 widgets.dart**

```bash
rm flutter/packages/ui/lib/src/widgets/widgets.dart
```

- [ ] **Step 3: 从 im_ui.dart barrel export 中移除**

Edit `flutter/packages/ui/lib/im_ui.dart`, remove line:
```
export 'src/widgets/widgets.dart';
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/packages/ui && flutter analyze`
Expected: No issues found

- [ ] **Step 5: Commit**

```bash
git add flutter/packages/ui/lib/src/widgets/widgets.dart flutter/packages/ui/lib/im_ui.dart
git commit -m "feat(ui): remove legacy widgets from im_ui

Remove UserAvatar, UnreadBadge, EmptyState, SearchInput,
ConfirmDialog, LoadingIndicator, TimeFormatter (all unused).
Replacements: ImAvatar, ImBadge, ImEmpty, ImTextField, ImDialog."
```

---

### Task 4: Token 替换 chat_page.dart

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 添加 ImTokens import**

在 `chat_page.dart` 的 import 区域，确保有：
```dart
import 'package:im_ui/im_ui.dart';
```
（已有，无需额外添加 — ImTokens 通过 im_ui.dart 导出）

- [ ] **Step 2: 替换会话面板宽度 (line 78)**

将：
```dart
                  width: context.breakpoint.value(
                    compact: 0, medium: 0, expanded: 320, large: 320,
                  ).toDouble(),
```
替换为：
```dart
                  width: context.breakpoint.value(
                    compact: 0, medium: 0,
                    expanded: ImTokens.layoutChatSidebarWidth,
                    large: ImTokens.layoutChatSidebarWidth,
                  ).toDouble(),
```

- [ ] **Step 3: 替换搜索框 padding (line 99)**

将：
```dart
          padding: const EdgeInsets.all(12),
```
替换为：
```dart
          padding: const EdgeInsets.all(ImTokens.layoutSectionGap),
```

- [ ] **Step 4: 替换搜索图标 size (line 104)**

将：
```dart
              prefixIcon: const Icon(Icons.search, size: 20),
```
替换为：
```dart
              prefixIcon: const Icon(Icons.search, size: ImTokens.textXl),
```

- [ ] **Step 5: 替换搜索框 borderRadius (line 106)**

将：
```dart
                borderRadius: BorderRadius.circular(24),
```
替换为：
```dart
                borderRadius: BorderRadius.circular(ImTokens.radiusFull),
```

- [ ] **Step 6: 替换搜索框 contentPadding (line 108-109)**

将：
```dart
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 10,
              ),
```
替换为：
```dart
              contentPadding: const EdgeInsets.symmetric(
                horizontal: ImTokens.space4,
                vertical: 10,
              ),
```

- [ ] **Step 7: 替换 header padding (line 192)**

将：
```dart
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
```
替换为：
```dart
          padding: const EdgeInsets.symmetric(
            horizontal: ImTokens.space4,
            vertical: ImTokens.space3,
          ),
```

- [ ] **Step 8: 替换 member badge gap (line 214)**

将：
```dart
                const SizedBox(width: 8),
```
替换为：
```dart
                const SizedBox(width: ImTokens.layoutItemGap),
```

- [ ] **Step 9: 替换 member badge borderRadius (line 225)**

将：
```dart
                    borderRadius: BorderRadius.circular(10),
```
替换为：
```dart
                    borderRadius: BorderRadius.circular(ImTokens.radiusMd),
```

- [ ] **Step 10: 替换 message list padding (line 265)**

将：
```dart
                  padding: const EdgeInsets.symmetric(vertical: 8),
```
替换为：
```dart
                  padding: const EdgeInsets.symmetric(vertical: ImTokens.space2),
```

- [ ] **Step 11: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found

- [ ] **Step 12: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "refactor(chat): replace hardcoded spacing with ImTokens

Replace 10 hardcoded values in chat_page with ImTokens constants."
```

---

### Task 5: Token 替换 settings_page.dart

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart`

- [ ] **Step 1: 添加 ImTokens import**

确保有：
```dart
import 'package:im_ui/im_ui.dart';
```
（已有）

- [ ] **Step 2: 替换 outer page padding (line 41)**

将：
```dart
      padding: const EdgeInsets.all(16),
```
替换为：
```dart
      padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
```

- [ ] **Step 3: 替换 nav-content gap (line 46)**

将：
```dart
          const SizedBox(width: 16),
```
替换为：
```dart
          const SizedBox(width: ImTokens.layoutPanelPadding),
```

- [ ] **Step 4: 替换 primary-secondary gap (line 55)**

将：
```dart
                  const SizedBox(width: 16),
```
替换为：
```dart
                  const SizedBox(width: ImTokens.layoutPanelPadding),
```

- [ ] **Step 5: 替换 secondary column width (line 57)**

将：
```dart
                    width: 340,
```
替换为：
```dart
                    width: ImTokens.layoutSettingsAsideWidth,
```

- [ ] **Step 6: 替换 mobile layout padding (line 76)**

将：
```dart
      padding: const EdgeInsets.all(16),
```
替换为：
```dart
      padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
```

- [ ] **Step 7: 替换 mobile section gaps (lines 80, 82, 84, 86)**

将 4 处：
```dart
        const SizedBox(height: 12),
```
替换为：
```dart
        const SizedBox(height: ImTokens.layoutSectionGap),
```

- [ ] **Step 8: 替换 primary column section gaps (lines 102, 104, 106)**

将 3 处：
```dart
        const SizedBox(height: 12),
```
替换为：
```dart
        const SizedBox(height: ImTokens.layoutSectionGap),
```

- [ ] **Step 9: 替换 hero bottom padding (line 114)**

将：
```dart
      padding: const EdgeInsets.only(bottom: 12),
```
替换为：
```dart
      padding: const EdgeInsets.only(bottom: ImTokens.layoutSectionGap),
```

- [ ] **Step 10: 替换 back icon size (line 119)**

将：
```dart
            icon: const Icon(Icons.arrow_back_ios_new, size: 18),
```
替换为：
```dart
            icon: const Icon(Icons.arrow_back_ios_new, size: ImTokens.textLg),
```

- [ ] **Step 11: 替换 back-title gap (line 121)**

将：
```dart
          const SizedBox(width: 8),
```
替换为：
```dart
          const SizedBox(width: ImTokens.layoutItemGap),
```

- [ ] **Step 12: 替换 account tile padding (line 157)**

将：
```dart
              padding: const EdgeInsets.all(16),
```
替换为：
```dart
              padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
```

- [ ] **Step 13: 替换 secondary column card gap (line 336)**

将：
```dart
            const SizedBox(width: 12),
```
替换为：
```dart
            const SizedBox(width: ImTokens.layoutSectionGap),
```

- [ ] **Step 14: 替换 secondary column row gap (line 360)**

将：
```dart
        const SizedBox(height: 12),
```
替换为：
```dart
        const SizedBox(height: ImTokens.layoutSectionGap),
```

- [ ] **Step 15: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found

- [ ] **Step 16: Commit**

```bash
git add flutter/apps/web/lib/features/settings/presentation/settings_page.dart
git commit -m "refactor(settings): replace hardcoded spacing with ImTokens

Replace 20 hardcoded values in settings_page with ImTokens constants."
```

---

### Task 6: Token 替换 contacts_page.dart + 修复 Colors.green

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`

- [ ] **Step 1: 添加 ImTokens/ImColors import**

确保有：
```dart
import 'package:im_ui/im_ui.dart';
```
（需检查是否已有，若无则添加）

- [ ] **Step 2: 替换 add-friend gap (line 57)**

将：
```dart
            const SizedBox(width: 8),
```
替换为：
```dart
            const SizedBox(width: ImTokens.layoutItemGap),
```

- [ ] **Step 3: 替换 fallback avatar fontSize (lines 161, 229)**

将 2 处：
```dart
                    style: const TextStyle(fontSize: 16),
```
替换为：
```dart
                    style: const TextStyle(fontSize: ImTokens.textBase),
```

- [ ] **Step 4: 修复 Colors.green (line 173)**

将：
```dart
                  color: Colors.green,
```
替换为：
```dart
                  color: Theme.of(context).colorScheme.primary,
```

- [ ] **Step 5: 替换 subtitle fontSize (lines 192, 240, 263)**

将 3 处 `fontSize: 13` 替换为 `fontSize: ImTokens.textSm`：
```dart
          fontSize: 13,
```
→
```dart
          fontSize: ImTokens.textSm,
```

- [ ] **Step 6: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found

- [ ] **Step 7: Commit**

```bash
git add flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart
git commit -m "refactor(contacts): replace hardcoded spacing with ImTokens, fix Colors.green

Replace 6 hardcoded values, fix semantic color."
```

---

### Task 7: Token 替换 add_friend_page.dart + 修复 Colors.grey

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/add_friend_page.dart`

- [ ] **Step 1: 添加 ImTokens import**

确保有：
```dart
import 'package:im_ui/im_ui.dart';
```
（需检查是否已有，若无则添加）

- [ ] **Step 2: 替换 search field padding (line 96)**

将：
```dart
            padding: const EdgeInsets.all(16),
```
替换为：
```dart
            padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
```

- [ ] **Step 3: 替换 loading indicator padding (line 121)**

将：
```dart
              padding: EdgeInsets.all(16),
```
替换为：
```dart
              padding: EdgeInsets.all(ImTokens.layoutPanelPadding),
```

- [ ] **Step 4: 替换 error text padding (line 126)**

将：
```dart
              padding: const EdgeInsets.all(16),
```
替换为：
```dart
              padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
```

- [ ] **Step 5: 替换 empty-state padding (lines 137, 142)**

将 2 处：
```dart
              padding: const EdgeInsets.all(32),
```
替换为：
```dart
              padding: const EdgeInsets.all(ImTokens.space8),
```

- [ ] **Step 6: 修复 Colors.grey (lines 138, 143)**

将 2 处：
```dart
style: const TextStyle(color: Colors.grey)),
```
替换为：
```dart
style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
```

- [ ] **Step 7: 替换 fallback avatar fontSize (line 161)**

将：
```dart
                            style: const TextStyle(fontSize: 16),
```
替换为：
```dart
                            style: const TextStyle(fontSize: ImTokens.textBase),
```

- [ ] **Step 8: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found

- [ ] **Step 9: Commit**

```bash
git add flutter/apps/web/lib/features/contacts/presentation/add_friend_page.dart
git commit -m "refactor(add-friend): replace hardcoded spacing with ImTokens, fix Colors.grey

Replace 6 hardcoded values, fix semantic color."
```

---

### Task 8: 全量验证

**Files:**
- No file changes — verification only

- [ ] **Step 1: 静态分析**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No issues found

- [ ] **Step 2: 运行现有测试**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass

- [ ] **Step 3: grep 验证无残留硬编码**

Run: `cd flutter/apps/web/lib/features && grep -n "EdgeInsets\.all(16)\|EdgeInsets\.all(12)\|SizedBox(height: 12)\|SizedBox(width: 12)\|SizedBox(width: 16)\|BorderRadius\.circular(8)\|BorderRadius\.circular(12)\|Colors\.green\|Colors\.grey" chat/presentation/chat_page.dart settings/presentation/settings_page.dart contacts/presentation/contacts_page.dart contacts/presentation/add_friend_page.dart`
Expected: No matches (or only expected保留项如 CircleAvatar radius: 22)

- [ ] **Step 4: grep 验证 im_ui barrel export 清洁**

Run: `cd flutter/packages/ui/lib && grep -n "app_theme\|widgets\.dart" im_ui.dart`
Expected: No matches

- [ ] **Step 5: 最终 Commit（如有遗漏修复）**

如果 grep 发现残留，修复后 commit。
