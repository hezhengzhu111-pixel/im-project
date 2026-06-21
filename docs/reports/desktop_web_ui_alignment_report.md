# Desktop 与 Web 端 UI 对齐差异分析报告

> 分析范围：`flutter/apps/web`（Web 端） vs `flutter/apps/desktop` + `flutter/packages/shared_features`（Desktop 端）
> 分析日期：2026-06-19

---

## 1. 顶层结论

当前 Desktop 端与 Web 端虽然共享同一套 Rust 后端、`im_core` 业务模型和部分 Riverpod Provider，但 **UI 实现基本分裂**：

- **Web 端** 拥有完整、精致、响应式的 UI：微信绿主题、Glass 面板、国际化、加载骨架、E2EE 状态横幅、朋友圈、完整设置页等。
- **Desktop 端** 的 UI 层非常薄（仅 30 个 Dart 文件），主要依赖 `im_shared_features` 中的基础实现；而 `im_shared_features` 中的页面大量使用硬编码中文/英文、默认 Material 样式、固定宽度布局，视觉与交互明显落后于 Web 端。

结果：同一产品在不同平台上呈现出“两个 App”的体验。

---

## 2. 代码体量与模块分布对比

| 维度 | Web 端 (`im_web`) | Desktop 端 (`im_desktop`) | 说明 |
|------|------------------|--------------------------|------|
| lib 下 Dart 文件数 | ~178 | ~30 | Web 端几乎是 Desktop 的 6 倍 |
| 页面实现位置 | 全部在 `im_web/features/*` | 大部分在 `im_shared_features` | Desktop 自身只有 Shell 和设置页 |
| 数据/状态层 | 每个 feature 独立封装 | 直接复用 `im_shared_features` 的 Provider | Provider 接口基本兼容 |
| 适配器层 | Web 专属适配器完整 | Desktop 专属适配器完整 | 两者对等 |

> 注：Mobile 端当前与 Desktop 端共用 `im_shared_features`，因此本报告中提到的 `shared_features` 问题同样影响 Mobile。但本次对齐范围限定为 Desktop ↔ Web。

---

## 3. 架构层差异

### 3.1 应用入口与 Global UI 配置

| 项目 | Web 端 | Desktop 端 | 影响 |
|------|--------|-----------|------|
| `localizationsDelegates` | ✅ 已配置 `AppLocalizations.localizationsDelegates` | ❌ 未配置 | Desktop 的 l10n 文件实际未生效 |
| `BreakpointScope` | ✅ 包裹整棵 Widget 树 | ❌ 未包裹 | Desktop 无法使用响应式断点工具 |
| `builder` 注入全局环境 | ✅ 有 | ❌ 无 | Desktop 缺少全局 Context 能力注入点 |
| 应用标题 | `'IM'` | `'IM Desktop'` |  minor |

### 3.2 导航 Shell

| 项目 | Web 端 | Desktop 端 |
|------|--------|-----------|
| 组件来源 | `im_ui.ResponsiveScaffold` | 自定义 `MainShell` |
| 桌面布局 | 左侧 64px 深色 NavigationRail | 左侧 72px 浅色/主题色 Sidebar |
| 移动端布局 | 底部 `NavigationBar` | 同 `ResponsiveScaffold`（因为 Desktop 也使用该组件？实际 Desktop 路由使用 `MainShell`，Mobile 路由使用 `ResponsiveScaffold`） |
| 选中态 | 图标+文字，选中高亮品牌绿 | 图标+文字，背景色 `primaryContainer` |
| 语言 | 从 l10n 读取 | 硬编码中文 `'聊天'`、`'联系人'` 等 |

> 实际观察：`im_desktop/core/router/app_router.dart` 使用 `MainShell`；`im_mobile/core/router/app_router.dart` 使用 `ResponsiveScaffold`。Desktop 与 Web 的导航视觉不一致。

### 3.3 主题系统

| 项目 | Web 端 | Desktop 端 |
|------|--------|-----------|
| 基础主题 | `ImTheme.light()` + `GlassTheme` 扩展 | 仅 `ImTheme.light()` |
| 暗色主题 | `ImTheme.dark()` + `GlassTheme` 扩展 | 仅 `ImTheme.dark()` |
| Glass 面板/渐变背景 | ✅ 大量使用 `GlassTheme`/`GradientBackground` | ❌ 无扩展，若直接复用 Web 页面会取不到 `GlassTheme` |
| 颜色使用 | 统一走 `ImTokens`/`GlassTheme` | `shared_features` 中仍有 `Colors.blue`、`Colors.green` 等硬编码 |

**风险点**：若直接将 Web 页面下沉给 Desktop 使用，`Theme.of(context).extension<GlassTheme>()` 会返回 `null`，导致样式异常或运行时错误。

---

## 4. 功能页面对比

### 4.1 登录页 (`LoginPage`)

| 维度 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| 视觉 | 渐变背景 + 品牌展示区 + 卡片动画 + 语言切换 | 居中的简单白色卡片，蓝色默认图标 |
| 表单验证 | `FormController` + `ValidatedFormField` | 仅非空检查 |
| 错误提示 | 错误码映射到 l10n | 硬编码 `'登录失败'` |
| 记住我 | ✅ | ❌ |
| 语言切换 | ✅ 右上角 | ❌ |
| 国际化 | 完整 | 硬编码中文 |

### 4.2 聊天页 (`ChatPage`)

| 维度 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| 布局 | `AdaptivePane`：手机/平板单栏，桌面左侧会话列表 + 右侧聊天视图 | 固定 `SizedBox(width: 320)` 会话列表 + Expanded 聊天区，无移动端回退 |
| 搜索 | ✅ 带图标的搜索框，实时过滤 | ✅ 基础搜索框 |
| 加载状态 | ✅ `_SessionListSkeleton` 骨架屏 | ❌ 简单 `CircularProgressIndicator` |
| 空状态 | ✅ 多语言空状态文本 | ❌ 硬编码 `'暂无会话'` / `'暂无消息'` |
| 错误重试 | ✅ `_SessionListError` 带重试按钮 | ❌ 未处理 |
| 消息气泡 | 自定义 `_BubbleWithArrow`、状态图标、时间、E2EE badge | `shared_features` 的 `MessageBubble` 较简单 |
| 输入框 | Emoji 面板、@提及、图片发送、禁用语音/文件提示 | 仅基础文本输入 |
| E2EE 横幅 | ✅ 完整的协商/启用/禁用流程 UI | ❌ 无 |
| 网络状态 | ✅ `NetworkStatusBanner` | ❌ 无 |
| Deep Link | ✅ `/chat/:sessionId` | ❌ 仅 `/chat` |

### 4.3 联系人页 (`ContactsPage`)

| 维度 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| 布局 | 三栏：列表 + 详情 + 概览（桌面），响应式折叠 | 单列表，无详情面板 |
| 好友请求 | 在 Tab 中展示，带接受/拒绝按钮 | 列表顶部展示，但可交互 |
| 详情面板 | ✅ 完整：头像、在线状态、备注、来源、朋友圈预览 | ❌ 无 |
| 操作菜单 | ✅ 编辑备注、删除好友 | ❌ 添加好友入口是 TODO |
| 排序/搜索 | ✅ 可按名称/在线/时间排序 | ❌ 无 |
| 国际化 | 完整 | 硬编码中文 |

### 4.4 群组页 (`GroupListPage` / `CreateGroupPage`)

| 维度 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| 列表页 | 响应式三栏，空状态插图，HoverLiftCard | 单列表，创建按钮是 TODO |
| 创建页 | 表单验证、从联系人选择成员、头像 URL | 基础表单，成员通过文本输入逗号 ID |
| 国际化 | 基本完整（少量硬编码中文残留） | 硬编码英文/中文 |

### 4.5 朋友圈 (`MomentsMainPage`)

| 维度 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| Feed | 完整 PostCard、媒体网格、评论、点赞 | 基础列表 |
| 发布 | ✅ `MomentsComposerPage`（弹窗/全屏） | ❌ 发布入口是 TODO |
| 通知 | ✅ `MomentsNotificationsPage` | ✅ 有 |
| 国际化 | 完整 | 硬编码 |

### 4.6 设置 (`SettingsPage` / `ProfilePage` / `AiSettingsPage`)

| 维度 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| 设置主页 | 桌面左右分栏 + 移动端 ListView，GlassPanel | Desktop 自身实现：基础 Card + DropdownButton |
| 个人资料 | ✅ 完整 ProfilePage：头像、基础信息、安全、隐私 | `shared_features` 有 `ProfileSettingsPage`，但 Desktop 未引用 |
| AI 设置 | ✅ 完整 API Key 管理、自动回复、人设 | `shared_features` 有 `AiSettingsPage`，但 Desktop 设置页未接入 |
| 国际化 | 完整 | Desktop 设置页硬编码中文 |

> 注：`im_desktop/features/settings/settings.dart` 实际 export 了 `im_shared_features/settings.dart` 和本地 `settings_page.dart`，但本地实现非常简陋，且未接入 Profile / AI 入口。

---

## 5. 组件库与共享 UI 包 (`im_ui`) 使用情况

| 组件 | `im_ui` 中是否存在 | Web 端使用情况 | Desktop / shared_features 使用情况 |
|------|------------------|---------------|----------------------------------|
| `ImTheme` / `ImTokens` | ✅ | 大量使用 | 少量使用 |
| `GlassCard` / `GlassPanel` | ✅ | 大量使用 | Desktop 无 `GlassTheme`，无法直接使用 |
| `GradientBackground` | ✅ | 登录页、部分页面背景 | 未使用 |
| `ImButton` | ✅ | 少量使用（更多用 `PrimarySolidButton`） | 未使用 |
| `ResponsiveScaffold` / `AdaptivePane` | ✅ | Web 路由核心 | Desktop 用自定义 `MainShell` |
| `MessageBubble` / `SessionTile` / 聊天相关 | ❌ | Web 端自己实现了一套 | `shared_features` 自己实现了一套 |
| `HoverLiftCard` | ❌ | Web 端自己实现 | 未使用 |
| `PrimarySolidButton` / `GradientButton` | ❌ | Web 端自己实现 | 未使用 |

**核心问题**：`im_ui` 只提供了非常基础的组件，大量 IM 业务组件（消息气泡、会话列表项、头像状态、文件/图片/语音气泡、设置面板、Glass 风格按钮等）都没有下沉。Web 端和 `shared_features` 各自重复实现。

---

## 6. 国际化（l10n）差异

| 项目 | Web 端 | Desktop 端 | shared_features |
|------|--------|-----------|-----------------|
| l10n 文件 | `app_localizations*.dart`，~2455 行抽象类 | 同名文件，内容基本与 Web 一致 | 无 l10n 文件 |
| 是否接入 `MaterialApp` | ✅ | ❌ | N/A |
| 页面内字符串来源 | `AppLocalizations.of(context)` | 未生效；实际显示的是 `shared_features` 中的硬编码 | 硬编码中文/英文 |
| 已知债务 | `hardcoded_strings_test.dart` 白名单中仍有 11 个文件待迁移 | 整个 `shared_features` 都需要迁移 | 全部待迁移 |

**关键发现**：Desktop 工程已经包含 `flutter_localizations` 依赖并生成了 `app_localizations*.dart`，但 `app.dart` 没有配置 `localizationsDelegates`，导致这些翻译文件完全没生效。

---

## 7. 响应式与布局差异

| 项目 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| 断点工具 | `BreakpointScope` + `context.isCompact/isMobile/isLarge` | 未接入 |
| 聊天页 | `AdaptivePane` 自动切换单栏/双栏 | 固定 320px 侧边栏，移动端会溢出 |
| 联系人/群组/朋友圈 | 均使用 `context.isCompact/isLarge` 做响应式 | 无响应式处理 |
| 设置页 | 桌面双栏，移动端 ListView | Desktop 仅简单 ListView |

---

## 8. 可访问性与交互细节

| 项目 | Web 端 | Desktop / shared_features |
|------|--------|--------------------------|
| Semantics / Tooltip | 较完善（发送、附件、语音等） | 较少 |
| 空状态/错误状态 | 有专门的 empty/error widget | 仅简单 `Text` |
| 加载骨架 | 会话列表、部分页面有 | 无 |
| 动画 | 登录页淡入、消息气泡 `AnimatedEntrance` | 无 |
| 键盘快捷键 | ESC 取消会话、Enter 发送 | 无 |

---

## 9. 数据层状态：两端能否共享同一套 UI？

**结论：可以，但需要适配层。**

- Web 端的状态 notifier 实际上是对 `im_shared_features` 中 `ChatNotifier`/`ContactsNotifier` 等的包装（例如添加 E2EE、network status、outbox）。
- Provider 名称在 Web 端和 `shared_features` 中都是 `chatStateProvider`、`contactsStateProvider` 等。
- 若将页面下沉到 `shared_features`，Web 端可以继续用自己的 Provider 覆盖，Desktop 端也可以直接读取 shared 的 Provider。

因此，**UI 层可以统一，状态层可以保持现状或做少量桥接**。

---

## 10. 主要问题清单（按影响排序）

1. **Desktop 未启用 l10n**：`app_localizations` 已生成但 `MaterialApp` 未注册 delegates。
2. **Desktop 缺少 `GlassTheme` 扩展**：无法直接复用 Web 的 Glass 风格页面。
3. **大量 UI 组件未下沉到 `im_ui`**：Web 和 shared_features 重复造轮子。
4. **Desktop 使用 `shared_features` 简陋页面**：功能、视觉、交互全面落后。
5. **Desktop 导航 Shell 与 Web 不一致**：自定义 `MainShell` 与 `ResponsiveScaffold` 视觉不同。
6. **`shared_features` 中大量硬编码中文和 TODO**：联系人添加、创建群组、朋友圈发布等入口未实现。
7. **响应式布局缺失**：固定宽度在桌面窄窗口或未来移动端适配时会出问题。
8. **Web 端自身也有少量硬编码中文**：如群组页“今日概览”、“最近互动”等。

---

## 11. 建议的后续动作

详见配套文档：《Desktop 与 Web 端 UI 对齐方案规划》。
