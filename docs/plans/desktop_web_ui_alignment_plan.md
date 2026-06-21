# Desktop 与 Web 端 UI 对齐方案规划

> 配套报告：《Desktop 与 Web 端 UI 对齐差异分析报告》
> 规划日期：2026-06-19

---

## 1. 目标

1. **视觉与体验一致**：Desktop 端达到与 Web 端同等的 UI 完成度（主题、布局、动画、空状态、加载状态、国际化）。
2. **代码复用最大化**：将 Web 端成熟的页面与组件下沉为共享实现，消除 Desktop / Web 重复造轮子。
3. **可维护性**：建立清晰的分层——`im_ui`（纯 UI 组件）、`im_shared_features`（业务页面）、`im_web`/`im_desktop`（平台壳层与适配）。
4. **不破坏 Mobile**：架构决策需考虑 Mobile 端未来可复用共享层（本次不实施 Mobile，但避免引入仅适用于 Desktop 的假设）。

---

## 2. 核心原则

| 原则 | 说明 |
|------|------|
| **Web 端为基准** | Web 端已实现更完整的视觉、交互、响应式，以其为蓝本进行抽象。 |
| **先基础设施，后业务页面** | 先对齐主题、l10n、断点、Shell，再迁移具体页面。 |
| **组件优先下沉** | 先把可复用 widget 沉淀到 `im_ui`，再重构页面引用它们。 |
| **状态层保持去中心化** | 共享页面只依赖 `im_shared_features` 的 provider；Web 端可继续用 overrides 包装。 |
| **渐进式重构** | 分阶段交付，每阶段可独立运行、测试、回滚。 |

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层 (Apps)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   im_web    │  │ im_desktop  │  │     im_mobile       │  │
│  │ 平台壳层     │  │ 平台壳层     │  │   （未来复用）       │  │
│  │ • Web Meta  │  │ • Window    │  │                     │  │
│  │ • Deep Link │  │   Title Bar │  │                     │  │
│  │ • Web 适配器 │  │ • Desktop   │  │                     │  │
│  │             │  │   适配器     │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │  im_shared_features   │                       │
│              │  业务页面 + 业务组件   │                       │
│              │ • ChatPage            │                       │
│              │ • ContactsPage        │                       │
│              │ • GroupListPage       │                       │
│              │ • MomentsMainPage     │                       │
│              │ • SettingsPage        │                       │
│              │ • 业务 Provider       │                       │
│              └───────────┬───────────┘                       │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │        im_ui          │                       │
│              │  纯展示/布局组件       │                       │
│              │ • ImTheme / ImTokens  │                       │
│              │ • GlassTheme          │                       │
│              │ • ImMessageBubble     │                       │
│              │ • ImSessionTile       │                       │
│              │ • ImChatHeader        │                       │
│              │ • ImMessageInput      │                       │
│              │ • ImSettingsSection   │                       │
│              │ • ImEmptyState / ...  │                       │
│              └───────────┬───────────┘                       │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │        im_l10n        │                       │
│              │  统一国际化资源        │                       │
│              └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 关键技术决策

### 4.1 l10n：新建 `im_l10n` 包（推荐）

**决策理由**：
- 当前 Web 和 Desktop 各维护一份几乎相同的 `app_localizations*.dart`，重复且容易遗漏。
- `im_shared_features` 中的页面也需要访问翻译，但它目前没有 `flutter_localizations` 依赖。
- 新建独立 `im_l10n` 包可被所有 app 和 `im_shared_features` 共同依赖。

**实施方式**：
1. 新建 `flutter/packages/l10n/` 包（`name: im_l10n`）。
2. 将现有 Web 端的 `app_en.arb` / `app_zh.arb`（或 Desktop 的等价 arb）迁移到 `im_l10n/l10n/`。
3. 配置 `im_l10n/l10n.yaml`，让 gen-l10n 输出到 `im_l10n/lib/l10n/`。
4. `im_shared_features`、`im_web`、`im_desktop`、`im_mobile` 都依赖 `im_l10n`。
5. 所有 app 的 `MaterialApp` 注册 `ImLocalizations.localizationsDelegates`。

**替代方案**：直接在 `im_shared_features` 中放 l10n。
- 缺点：`im_web` 等应用若想覆盖某些文案会更困难；包职责不如 `im_l10n` 清晰。

### 4.2 主题：`GlassTheme` 上移到 `im_ui`

**决策理由**：
- Web 端大量页面依赖 `GlassTheme` 扩展。
- Desktop 端没有该扩展，若复用 Web 页面会运行时取不到扩展。

**实施方式**：
1. 将 `flutter/apps/web/lib/core/theme/glass_theme.dart` 迁移到 `flutter/packages/ui/lib/src/theme/glass_theme.dart`。
2. 更新 `im_ui/im_ui.dart` export `GlassTheme`。
3. 修改 `ImTheme.light()` / `ImTheme.dark()` 默认注入 `GlassTheme.light` / `GlassTheme.dark`。
4. Web 端 `core/theme/glass_theme.dart` 改为 `export 'package:im_ui/im_ui.dart' show GlassTheme;` 或删除。
5. Desktop / Mobile 主题直接基于 `ImTheme` 即可获得 GlassTheme。

### 4.3 响应式：全局包裹 `BreakpointScope`

**决策理由**：
- Web 端依赖 `context.isCompact / isMobile / isLarge` 做响应式。
- Desktop 端未包裹 `BreakpointScope`，这些扩展方法无法使用。

**实施方式**：
1. 在 Desktop `app.dart` 的 `MaterialApp.builder` 中包裹 `BreakpointScope`。
2. Mobile 端同样包裹（为后续响应式做准备）。
3. 共享页面统一使用 `BreakpointScope.of(context)` 或 `context.isCompact` 等扩展。

### 4.4 导航 Shell：统一或扩展 `ResponsiveScaffold`

**决策理由**：
- Web 端使用 `im_ui.ResponsiveScaffold`（桌面侧栏 + 移动端底部导航）。
- Desktop 使用自定义 `MainShell`（72px 侧栏），视觉不一致。

**推荐方案**：
- **默认复用 `ResponsiveScaffold`**：若 Desktop 对侧栏宽度/样式无强需求，直接替换 `MainShell`。
- **若需保留 Desktop 特有侧边栏**：让 `MainShell` 内部复用 `ResponsiveScaffold` 的桌面布局逻辑，或扩展 `ResponsiveScaffold` 支持自定义侧栏宽度/标题。

**建议**：先复用 `ResponsiveScaffold`，后续再按需定制。

### 4.5 状态层：保持当前 override 模式

**现状**：
- `im_shared_features` 提供基础 `chatStateProvider`。
- Web 端 `main.dart` 通过 `ProviderScope.overrides` 注入带 E2EE、network status、outbox 的包装版本。
- Desktop 端直接使用 shared provider。

**继续保持**：共享页面只依赖 `im_shared_features` 的 provider 接口，Web 端在入口处 override。

---

## 5. 分阶段实施计划

### 阶段 0：基础设施对齐（预计 2-3 天）

**目标**：让 Desktop 端具备复用 Web 页面的基础能力。

| 任务 | 具体工作 | 验收标准 |
|------|---------|---------|
| 0.1 迁移 `GlassTheme` | 从 `im_web` 移到 `im_ui`，并让 `ImTheme` 默认注入 | Desktop `Theme.of(ctx).extension<GlassTheme>()` 不为 null |
| 0.2 新建 `im_l10n` 包 | 迁移 arb 文件，配置 gen-l10n；所有 app 和 shared_features 依赖它 | `im_shared_features` 能 `import 'package:im_l10n/l10n.dart'` |
| 0.3 Desktop 启用 l10n | 在 `app.dart` 配置 `localizationsDelegates` 和 `supportedLocales` | Desktop 切换语言后界面文案变化 |
| 0.4 Desktop 接入 `BreakpointScope` | 在 `MaterialApp.builder` 中包裹 | `context.isCompact` 在 Desktop 可用 |
| 0.5 统一主题入口 | Desktop / Web 均使用 `ImTheme` + `GlassTheme` | 两端主题扩展一致 |

**注意**：阶段 0 完成后，Desktop 端旧页面可能立即出现部分样式变化（例如颜色），需确认可接受。

---

### 阶段 1：通用组件下沉到 `im_ui`（预计 4-6 天）

**目标**：把 Web 端和 shared_features 中重复或缺失的通用组件沉淀到 `im_ui`。

**第一批：Glass / 布局类**
- `GlassCard` → 增强真实毛玻璃支持（当前只是普通卡片），或重命名为 `ImGlassPanel`
- `GradientBackground`
- `HoverLiftCard`
- `AnimatedEntrance`
- `AdaptivePane`

**第二批：按钮 / 表单类**
- 统一 `PrimarySolidButton` 和 `GradientButton` 为 `ImPrimaryButton`
- `ImGradientButton`
- `ImSegmentedControl`（Web 设置页中的自定义实现）

**第三批：IM 业务通用展示组件**
- `ImAvatar`：带在线状态点、缺省首字母
- `ImBadge`
- `ImEmptyState`
- `ImErrorState`
- `ImSkeleton` / `ImShimmer`

**第四批：聊天业务组件（放 `im_shared_features` 更合适，因其依赖 chatStateProvider）**
- `MessageBubble`
- `SessionTile`
- `ChatHeader`
- `MessageInput`
- `NetworkStatusBanner`
- `FileBubble` / `ImageBubble` / `VoiceBubble` / `VideoBubble`

> 注：第四批组件是否放 `im_ui` 取决于是否希望它们完全无业务依赖。若要保持简单，先放 `im_shared_features/src/chat/presentation/widgets/`；待抽象度足够高后再考虑上提到 `im_ui`。

**验收标准**：
- Web 端和 Desktop / shared_features 均引用新组件。
- 删除重复实现。
- 组件测试通过。

---

### 阶段 2：聊天页对齐（预计 3-5 天）

**目标**：让 Desktop 拥有与 Web 端一致的聊天体验。

| 任务 | 说明 |
|------|------|
| 2.1 重构 Web `chat_page.dart` 为可共享 | 提取 `ChatPage` 到 `im_shared_features/src/chat/presentation/chat_page.dart` |
| 2.2 保留 Web 特有 deep link | Web 路由解析 `/chat/:sessionId` 后传给 `ChatPage(sessionId: ...)` |
| 2.3 Desktop 路由改用 shared `ChatPage` | 删除 Desktop 对旧 shared chat_page 的引用 |
| 2.4 删除旧 `shared_features/src/chat/presentation/chat_page.dart` | 用新共享版本替代 |
| 2.5 迁移聊天相关组件 | `MessageBubble`、`SessionTile`、`MessageInput`、`NetworkStatusBanner` 等使用阶段 1 产物 |
| 2.6 补齐 E2EE UI | Desktop 端也展示 E2EE 协商横幅（依赖 shared E2EE provider） |

**验收标准**：
- Desktop 聊天页视觉与 Web 一致。
- 支持响应式：窄窗口自动切换单栏。
- 支持搜索、加载骨架、错误重试。

---

### 阶段 3：联系人、群组、朋友圈、设置对齐（每个 feature 2-4 天）

按同样模式逐个下沉：

1. **ContactsPage** + `AddFriendPage`
2. **GroupListPage** + `CreateGroupPage`
3. **MomentsMainPage** + `MomentsComposerPage` + `MomentsNotificationsPage`
4. **SettingsPage** + `ProfilePage` + `AiSettingsPage`

**每个 feature 的标准流程**：
1. 将 Web 端页面代码迁移到 `im_shared_features/src/<feature>/presentation/`。
2. 替换硬编码字符串为 `ImLocalizations`。
3. 使用阶段 1 的通用组件替换旧 widget。
4. 在 Web 和 Desktop 路由中改为引用共享页面。
5. 删除旧的简陋实现和重复实现。
6. 运行两端 widget test。

**特殊注意**：
- `SettingsPage`：Desktop 当前有自己的简陋实现，需完全替换为共享版本。
- `AiSettingsPage` / `ProfilePage`：Desktop 设置页当前未接入入口，需补齐导航。

---

### 阶段 4：导航 Shell 统一（预计 1-2 天）

**方案**：
1. 评估 `ResponsiveScaffold` 是否满足 Desktop 需求。
2. 若满足，将 Desktop `MainShell` 替换为 `ResponsiveScaffold`，或让 `MainShell` 内部委托给 `ResponsiveScaffold`。
3. 确保侧栏标签从 `ImLocalizations` 读取。
4. 保留 Desktop 需要的窗口级行为（如标题栏、系统托盘）在 `MainShell` 外层。

**验收标准**：
- Desktop 导航视觉与 Web 一致。
- 切换语言后导航标签同步更新。

---

### 阶段 5：清理、国际化补全与测试（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| 5.1 清理硬编码中文 | 移除 `hardcoded_strings_test.dart` 中的 TODO 白名单条目；修复所有违规 |
| 5.2 清理重复文件 | 删除 Web / shared_features 中因下沉而废弃的实现 |
| 5.3 更新测试 | 迁移/新增 Desktop widget test；更新 Web 端 golden test |
| 5.4 暗色模式验证 | 两端切换暗色模式后无硬编码颜色失效问题 |
| 5.5 端到端冒烟 | Desktop 和 Web 均跑通登录 → 聊天 → 联系人 → 设置流程 |

---

## 6. 任务优先级与建议执行顺序

若资源有限，建议按以下顺序执行，每完成一个阶段即可看到明显收益：

```
阶段 0（基础设施） → 阶段 1（组件下沉） → 阶段 2（聊天页） → 阶段 4（Shell） → 阶段 3（其他页面） → 阶段 5（清理测试）
```

**理由**：
- 聊天页是用户最高频页面，优先对齐收益最大。
- 完成聊天页后即可验证主题、l10n、响应式、组件下沉是否正确。
- 其他页面按同样模式批量迁移，风险可控。

---

## 7. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| 重构范围大，引入回归 | 高 | 分阶段 PR；保留旧实现直到新实现通过测试；每阶段跑全量 widget test |
| Mobile 端受影响 | 中 | `im_shared_features` 变更需同步验证 Mobile 编译；若 Mobile 暂时无法对齐，可用条件编译或单独保留旧实现 |
| Web 端测试大量失效 | 中 | 同步更新 golden / widget test；路径变更需同步修正 import |
| l10n 包拆分导致 gen-l10n 输出冲突 | 低 | 统一在 `im_l10n` 中生成；各 app 不再单独生成 |
| GlassTheme 上移影响现有 Mobile 主题 | 低 | `GlassTheme` 默认值与当前 `ImTheme` 兼容；Mobile 若未使用该扩展则无影响 |
| Desktop 编译受 web-only 依赖影响 | 低 | 不直接依赖 `im_web`；所有共享代码保持平台无关 |

---

## 8. 回滚策略

- 每个阶段使用独立 Git 分支 / PR。
- 阶段内保留旧文件为 `_legacy` 后缀，新文件稳定后再删除。
- 关键页面（如 ChatPage）先通过 `feature flag` 或 provider override 方式灰度切换到新实现，观察后再默认启用。

---

## 9. 验收标准

### 9.1 功能验收

| 检查项 | 标准 |
|--------|------|
| 登录页 | Desktop 与 Web 视觉一致，支持中英文切换、表单验证、记住我 |
| 聊天页 | 会话列表、消息气泡、输入框、搜索、E2EE 横幅、网络状态一致；响应式正常 |
| 联系人页 | 列表、详情、好友请求、编辑备注、删除好友一致 |
| 群组页 | 列表、创建群组、成员选择一致 |
| 朋友圈 | Feed、发布、评论、点赞、通知一致 |
| 设置页 | 分类导航、个人资料、AI 设置、语言/主题切换一致 |

### 9.2 代码验收

| 检查项 | 标准 |
|--------|------|
| 无硬编码中文 | `hardcoded_strings_test.dart` 白名单清空，测试通过 |
| 无重复实现 | Web 和 shared_features 中不存在功能相同的两个组件/页面 |
| 组件下沉 | 通用组件位于 `im_ui` 或 `im_shared_features` 的合理位置 |
| l10n 统一 | 所有 app 和 shared_features 通过 `im_l10n` 访问翻译 |
| 主题统一 | 所有页面使用 `ImTheme` + `GlassTheme`，无 `Colors.blue` 等硬编码 |

### 9.3 测试验收

| 检查项 | 标准 |
|--------|------|
| Web widget test | `melos run test:web` 通过 |
| Desktop widget test | `flutter test` 在 `im_desktop` 通过 |
| 暗色模式测试 | 两端暗色模式无视觉异常 |
| 国际化测试 | 切换语言后所有页面文案正确更新 |
| 响应式测试 | 桌面窗口从宽到窄切换时布局正确回退 |

---

## 10. 建议的下一步行动

1. **确认方案**：与本方案的关键决策（`im_l10n` 包、`GlassTheme` 上移、共享页面下沉）对齐。
2. **创建阶段 0 分支**：先完成基础设施对齐，验证 Desktop 能正确加载 `GlassTheme` 和 `ImLocalizations`。
3. **拆分任务**：按阶段 0 → 阶段 1 → 阶段 2 → 阶段 4 → 阶段 3 → 阶段 5 创建具体 Issue / PR。
4. **约定组件命名**：如 `ImXxx` 前缀、`im_` 包名前缀，避免未来命名冲突。

---

## 11. 附录：待创建/迁移文件清单（初稿）

### 11.1 新建包

- `flutter/packages/l10n/pubspec.yaml`
- `flutter/packages/l10n/l10n.yaml`
- `flutter/packages/l10n/lib/l10n/app_en.arb`
- `flutter/packages/l10n/lib/l10n/app_zh.arb`
- `flutter/packages/l10n/lib/im_l10n.dart`

### 11.2 迁移/新增到 `im_ui`

- `flutter/packages/ui/lib/src/theme/glass_theme.dart`（从 im_web 迁移）
- `flutter/packages/ui/lib/src/widgets/im_glass_panel.dart`
- `flutter/packages/ui/lib/src/widgets/im_gradient_background.dart`
- `flutter/packages/ui/lib/src/widgets/im_hover_lift_card.dart`
- `flutter/packages/ui/lib/src/widgets/im_primary_button.dart`
- `flutter/packages/ui/lib/src/widgets/im_segmented_control.dart`
- `flutter/packages/ui/lib/src/widgets/im_avatar.dart`
- `flutter/packages/ui/lib/src/widgets/im_empty_state.dart`
- `flutter/packages/ui/lib/src/widgets/im_error_state.dart`
- `flutter/packages/ui/lib/src/widgets/im_skeleton.dart`

### 11.3 迁移/新增到 `im_shared_features`

- `flutter/packages/shared_features/lib/src/chat/presentation/chat_page.dart`（从 im_web 迁移，替换旧版）
- `flutter/packages/shared_features/lib/src/contacts/presentation/contacts_page.dart`（从 im_web 迁移）
- `flutter/packages/shared_features/lib/src/group/presentation/group_list_page.dart`（从 im_web 迁移）
- `flutter/packages/shared_features/lib/src/group/presentation/create_group_page.dart`（从 im_web 迁移）
- `flutter/packages/shared_features/lib/src/moments/presentation/moments_main_page.dart`（从 im_web 迁移）
- `flutter/packages/shared_features/lib/src/settings/presentation/settings_page.dart`（从 im_web 迁移）
- `flutter/packages/shared_features/lib/src/settings/presentation/profile_page.dart`（从 im_web 迁移）
- `flutter/packages/shared_features/lib/src/settings/presentation/ai_settings_page.dart`（从 im_web 迁移）

### 11.4 Desktop 端修改

- `flutter/apps/desktop/lib/app.dart`：启用 l10n、BreakpointScope
- `flutter/apps/desktop/lib/core/theme/app_theme.dart`：使用带 GlassTheme 的 ImTheme
- `flutter/apps/desktop/lib/core/shell/main_shell.dart`：复用 ResponsiveScaffold 或统一视觉
- `flutter/apps/desktop/lib/core/router/app_router.dart`：引用 shared 页面
- `flutter/apps/desktop/pubspec.yaml`：添加 `im_l10n` 依赖

### 11.5 Web 端修改

- `flutter/apps/web/lib/core/theme/glass_theme.dart`：删除或改为 re-export
- `flutter/apps/web/lib/features/*`：逐步删除已下沉的页面/组件
- `flutter/apps/web/lib/app.dart`：确认继续使用共享主题和 l10n
- `flutter/apps/web/pubspec.yaml`：添加 `im_l10n` 依赖
