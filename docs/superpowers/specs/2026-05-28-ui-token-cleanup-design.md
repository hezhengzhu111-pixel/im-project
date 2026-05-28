# UI Token 化收尾设计

**日期：** 2026-05-28
**状态：** 已批准
**范围：** 清理 deprecated 组件 + 4 页面硬编码 token 化

## 背景

验收报告指出 `chat_page`、`settings_page` 仍有大量硬编码 spacing（8/12/16/320/340 等），`im_ui` 中废弃的 `AppTheme` 和旧 widgets 仍存在。当前 `ImTokens` / `ImColors` / `ImTheme` 已就绪，但页面未完全消费。

## 目标

1. 删除 im_ui 中 deprecated `AppTheme` 和 7 个无引用 legacy widgets
2. 4 个页面（chat_page / settings_page / contacts_page / add_friend_page）硬编码全部替换为 ImTokens
3. 增加布局维度常量
4. 修复语义色硬编码（Colors.green / Colors.grey）
5. 编译验证 + 现有测试通过

## 约束

- 不改业务逻辑
- 不改颜色系统（仅修复语义色硬编码）
- im_ui 不得依赖 im_web
- 删除 legacy widgets 前确认无引用

---

## Section 1：清理 deprecated 组件

### 1.1 删除 im_ui 中的 deprecated AppTheme

- 删除 `flutter/packages/ui/lib/src/theme/app_theme.dart`
- 从 `im_ui.dart` barrel export 中移除 `app_theme.dart`
- **不影响** `flutter/apps/web/lib/core/theme/app_theme.dart`（它通过 `im_ui.dart` 间接引用，删除后无 broken import）

### 1.2 清理 widgets.dart 中的 7 个无引用组件

从 `widgets.dart` 中删除：

| 组件 | 状态 | 替代 |
|---|---|---|
| `UserAvatar` | @Deprecated | ImAvatar |
| `UnreadBadge` | @Deprecated | ImBadge |
| `EmptyState` | @Deprecated | ImEmpty |
| `SearchInput` | @Deprecated | ImTextField |
| `ConfirmDialog` | @Deprecated | ImDialog |
| `LoadingIndicator` | 无引用 | Flutter 原生 CircularProgressIndicator |
| `TimeFormatter` | 无引用 | 按需内联 |

删除后 `widgets.dart` 变为空文件，从 `im_ui.dart` barrel export 中移除。

### 1.3 验证

- grep 确认 7 个组件在 im_web 中无残留引用
- `im_ui.dart` export 列表中无 app_theme.dart / widgets.dart

---

## Section 2：ImTokens 布局常量扩展

在 `ImTokens` 中增加：

```dart
// ── Layout Dimensions ──
static const double layoutChatSidebarWidth = 320;
static const double layoutSettingsAsideWidth = 340;
static const double layoutSectionGap = 12;
static const double layoutPanelPadding = 16;
static const double layoutItemGap = 8;
```

**语义：**
- `layoutChatSidebarWidth` — chat 会话列表面板宽度
- `layoutSettingsAsideWidth` — settings 辅助栏宽度
- `layoutSectionGap` — section 之间间距（原硬编码 12）
- `layoutPanelPadding` — 面板/页面内边距（原硬编码 16）
- `layoutItemGap` — 元素间小间距（原硬编码 8）

与已有的 `ImTokens.space0`~`space12`（4px 基础间距系统）互补，语义更清晰。

---

## Section 3：页面硬编码替换

### 3.1 chat_page.dart

| 行 | 原代码 | 替换为 |
|---|---|---|
| 78 | `expanded: 320, large: 320` | `ImTokens.layoutChatSidebarWidth` |
| 99 | `EdgeInsets.all(12)` | `EdgeInsets.all(ImTokens.layoutSectionGap)` |
| 104 | `Icon(Icons.search, size: 20)` | `Icon(Icons.search, size: ImTokens.textXl)` |
| 106 | `BorderRadius.circular(24)` | `BorderRadius.circular(ImTokens.radiusFull)` |
| 108-109 | `horizontal: 16, vertical: 10` | `horizontal: ImTokens.space4, vertical: 10`（10 无精确 token） |
| 192 | `horizontal: 16, vertical: 12` | `horizontal: ImTokens.space4, vertical: ImTokens.space3` |
| 214 | `SizedBox(width: 8)` | `SizedBox(width: ImTokens.layoutItemGap)` |
| 216-217 | `horizontal: 6, vertical: 2` | 保留（badge 小尺寸） |
| 225 | `BorderRadius.circular(10)` | `BorderRadius.circular(ImTokens.radiusMd)` |
| 265 | `EdgeInsets.symmetric(vertical: 8)` | `EdgeInsets.symmetric(vertical: ImTokens.space2)` |

### 3.2 settings_page.dart

| 行 | 原代码 | 替换为 |
|---|---|---|
| 41 | `EdgeInsets.all(16)` | `EdgeInsets.all(ImTokens.layoutPanelPadding)` |
| 46 | `SizedBox(width: 16)` | `SizedBox(width: ImTokens.layoutPanelPadding)` |
| 55 | `SizedBox(width: 16)` | `SizedBox(width: ImTokens.layoutPanelPadding)` |
| 57 | `SizedBox(width: 340)` | `SizedBox(width: ImTokens.layoutSettingsAsideWidth)` |
| 76 | `EdgeInsets.all(16)` | `EdgeInsets.all(ImTokens.layoutPanelPadding)` |
| 80-86 | `SizedBox(height: 12)` x4 | `SizedBox(height: ImTokens.layoutSectionGap)` x4 |
| 102-106 | `SizedBox(height: 12)` x3 | `SizedBox(height: ImTokens.layoutSectionGap)` x3 |
| 114 | `EdgeInsets.only(bottom: 12)` | `EdgeInsets.only(bottom: ImTokens.layoutSectionGap)` |
| 119 | `Icon(..., size: 18)` | `Icon(..., size: ImTokens.textLg)` |
| 121 | `SizedBox(width: 8)` | `SizedBox(width: ImTokens.layoutItemGap)` |
| 157 | `EdgeInsets.all(16)` | `EdgeInsets.all(ImTokens.layoutPanelPadding)` |
| 161 | `CircleAvatar(radius: 22)` | 保留（22 不在 4px 系统中） |
| 173 | `SizedBox(width: 14)` | 保留（介于 space3/space4 之间） |
| 336 | `SizedBox(width: 12)` | `SizedBox(width: ImTokens.layoutSectionGap)` |
| 360 | `SizedBox(height: 12)` | `SizedBox(height: ImTokens.layoutSectionGap)` |

### 3.3 contacts_page.dart

| 行 | 原代码 | 替换为 |
|---|---|---|
| 57 | `SizedBox(width: 8)` | `SizedBox(width: ImTokens.layoutItemGap)` |
| 151, 219 | `CircleAvatar(radius: 22)` | 保留 |
| 161, 229 | `TextStyle(fontSize: 16)` | `TextStyle(fontSize: ImTokens.textBase)` |
| 170 | `Container(width: 12, height: 12)` | 保留（status indicator） |
| 175 | `Border.all(...width: 2)` | 保留 |
| 192, 240, 263 | `fontSize: 13` | `fontSize: ImTokens.textSm`（13→14，微调） |

### 3.4 add_friend_page.dart

| 行 | 原代码 | 替换为 |
|---|---|---|
| 96, 121, 126 | `EdgeInsets.all(16)` | `EdgeInsets.all(ImTokens.layoutPanelPadding)` |
| 137, 142 | `EdgeInsets.all(32)` | `EdgeInsets.all(ImTokens.space8)` |
| 161 | `TextStyle(fontSize: 16)` | `TextStyle(fontSize: ImTokens.textBase)` |

### 3.5 语义色修复

| 文件 | 行 | 原代码 | 替换为 |
|---|---|---|---|
| contacts_page.dart | 173 | `Colors.green` | `ImColors.light.online`（通过 Theme 获取） |
| add_friend_page.dart | 138, 143 | `Colors.grey` | `Theme.of(context).colorScheme.onSurfaceVariant` |

---

## Section 4：测试策略

### 4.1 编译验证

- `flutter analyze` 无 error/warning
- `flutter build web` 成功
- im_ui 包内无 broken import

### 4.2 现有测试

- `flutter test` 全量通过
- 特别关注 `chat_page_test.dart` 和 `settings_page_test.dart`

### 4.3 验收标准

- grep 确认 4 个页面无残留硬编码 EdgeInsets/SizedBox/BorderRadius
- grep 确认无 Colors.green / Colors.grey 残留
- im_ui barrel export 中无 app_theme.dart / widgets.dart

---

## 不做的事

- 不改业务逻辑
- 不改颜色系统（仅修复语义色硬编码）
- 不新增 UI 渲染测试（纯机械替换，视觉无变化）
- 不增加 Extension 方法（YAGNI）
- 不改 i18n（其他任务范围）
