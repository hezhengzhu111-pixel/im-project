# Flutter Web 页面 UI 修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Flutter Web 应用中所有 Material Icons 显示为破损占位符的问题，并修复设置页面右侧辅助列的布局重叠。

**Architecture:** 根本原因是 `pubspec.yaml` 中缺少 `uses-material-design: true`，导致 Web 构建不包含 Material Icons 字体文件。修复分两步：添加缺失配置，然后修复设置页面的布局 bug（辅助列中两个卡片错误地水平排列而非垂直堆叠）。

**Tech Stack:** Flutter Web, Dart, pubspec.yaml 配置

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `flutter/apps/web/pubspec.yaml` | 修改 | 添加 `uses-material-design: true` |
| `flutter/packages/ui/pubspec.yaml` | 修改 | 添加 `uses-material-design: true` |
| `flutter/apps/web/lib/features/settings/presentation/settings_page.dart:316-374` | 修改 | 修复 `_buildSecondaryColumn` 布局：将 Row+Expanded 改为 Column 垂直堆叠 |

---

### Task 1: 修复 Material Icons 字体引入

**Files:**
- Modify: `flutter/apps/web/pubspec.yaml:10-11`
- Modify: `flutter/packages/ui/pubspec.yaml:10` (新增行)

- [ ] **Step 1: 在 im_web 的 pubspec.yaml 中添加 uses-material-design**

在 `flutter/apps/web/pubspec.yaml` 第 11 行（`generate: true` 之后）添加 `uses-material-design: true`：

```yaml
flutter:
  generate: true
  uses-material-design: true
```

- [ ] **Step 2: 在 im_ui 的 pubspec.yaml 中添加 uses-material-design**

在 `flutter/packages/ui/pubspec.yaml` 的 `dependencies:` 段之前（第 9 行之后）添加 `flutter:` 段和 `uses-material-design: true`：

```yaml
environment:
  sdk: '>=3.3.0 <4.0.0'

flutter:
  uses-material-design: true

dependencies:
```

- [ ] **Step 3: 运行 flutter pub get 验证依赖解析**

Run: `cd flutter/apps/web && flutter pub get`
Expected: 成功解析依赖，无错误

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/pubspec.yaml flutter/packages/ui/pubspec.yaml
git commit -m "fix: add uses-material-design: true to fix broken icons in web build

Material Icons were rendering as broken placeholders because the font
files were not included in the web build output. This configuration
tells Flutter to bundle the Material Icons font assets."
```

---

### Task 2: 修复设置页面右侧辅助列布局

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart:316-374`

- [ ] **Step 1: 将 _buildSecondaryColumn 中的 Row+Expanded 改为 Column 垂直堆叠**

当前代码（第 316-374 行）中，"清理本地缓存"和"AI 助手"两个卡片被包裹在一个 `Row` 中，各自使用 `Expanded` 水平排列。在 340px 宽的辅助列中，每个卡片只有约 164px 宽，导致内容重叠。

修改 `_buildSecondaryColumn` 方法，将 `Row` 改为 `Column`，使两个卡片垂直堆叠：

```dart
  Widget _buildSecondaryColumn(AppLocalizations loc, ThemeData theme) {
    return Column(
      children: [
        SettingsSection(
          children: [
            SettingsRow(
              title: loc.settingsClearCache,
              description: loc.settingsClearCacheDesc,
              showDivider: false,
              trailing: FilledButton.tonal(
                onPressed: _confirmClearCache,
                child: Text(loc.settingsClearCache),
              ),
            ),
          ],
        ),
        const SizedBox(height: ImTokens.layoutSectionGap),
        SettingsSection(
          children: [
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => context.push('/settings/ai'),
                child: SettingsRow(
                  title: loc.settingsAiAssistant,
                  description: loc.settingsAiAssistantDesc,
                  showDivider: false,
                  trailing: Icon(
                    Icons.chevron_right,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: ImTokens.layoutSectionGap),
        SettingsSection(
          children: [
            SettingsRow(
              title: loc.settingsLogout,
              showDivider: false,
              trailing: FilledButton.tonal(
                onPressed: _confirmLogout,
                child: Text(loc.settingsLogout),
              ),
            ),
          ],
        ),
      ],
    );
  }
```

关键变更：
- 移除外层 `Row` 和两个 `Expanded` 包裹
- 移除 `Row` 内两个卡片之间的 `SizedBox(width: ImTokens.layoutSectionGap)`
- 改为 `Column` 垂直堆叠，每个卡片之间用 `SizedBox(height: ImTokens.layoutSectionGap)` 分隔
- 三个卡片（缓存、AI、退出登录）各自独立占满辅助列宽度

- [ ] **Step 2: 验证构建通过**

Run: `cd flutter/apps/web && flutter analyze lib/features/settings/presentation/settings_page.dart`
Expected: 无 error 或 warning

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/settings/presentation/settings_page.dart
git commit -m "fix(settings): stack secondary column cards vertically instead of side-by-side

The 'Clear Cache' and 'AI Assistant' cards were in a Row with Expanded,
causing them to overlap in the 340px aside column. Changed to Column
layout so each card takes full width, matching the Vue reference design."
```

---

### Task 3: 端到端验证

- [ ] **Step 1: 构建 Web 版本**

Run: `cd flutter/apps/web && make dev`
Expected: 构建成功，输出到 `build/flutter/web/`

- [ ] **Step 2: 在浏览器中验证以下内容**

启动本地服务器并打开浏览器，逐一检查：

1. **导航栏**：左侧 5 个 Tab 图标（聊天、联系人、群组、朋友圈、设置）全部正常显示，不再有破损占位符
2. **聊天页**：搜索图标、空状态图标正常；左侧"暂无会话"和右侧"选择一个会话开始聊天"文案正确
3. **联系人页**：搜索图标、添加好友图标正常；好友列表为空时显示"暂无好友"；好友请求 Tab 可切换
4. **群组页**：搜索和创建图标正常；空状态显示"暂无群组"
5. **朋友圈页**：发布按钮图标正常；封面区域和"暂无动态"空状态正确
6. **设置页**：
   - 左侧导航面板 6 个图标全部正常
   - 主内容区设置项排列正确
   - 右侧辅助列三个卡片（清理缓存、AI 助手、退出登录）垂直堆叠，无重叠
   - 语言切换、主题切换分段控件正常

- [ ] **Step 3: 如果发现问题，修复并重复 Step 1-2**

根据验证结果，如有额外 UI 问题则修复并重新验证。
