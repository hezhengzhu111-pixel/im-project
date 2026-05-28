# Flutter Web 改造 — 系统级验收报告

> 日期：2026-05-28
> 分支：main
> 检查范围：`flutter/` 目录全部源码（apps/web、packages/core、packages/ui）

---

## A. 总体验收结论

**需要修复后合并**

| 理由 | 说明 |
|------|------|
| 架构整体清晰 | 三大包（im_core / im_ui / im_web）职责分明，依赖方向正确 |
| 核心能力已落地 | 路由、状态管理、PWA、离线消息 outbox、E2EE 等完整实现 |
| 存在 P0 编译风险 | 重复 validators 文件、22 处 print 可能泄露敏感信息 |
| i18n 覆盖不全 | 约 10 个源文件硬编码中文，未走 l10n |
| 存在死代码 | ChatNotifier（旧版）未被 provider 使用但被多处 import |

---

## B. 阻塞问题

### P0：影响编译或主流程

| # | 问题 | 影响 |
|---|------|------|
| 1 | `core/utils/validators.dart` 仍存在且被测试引用，与 `core/forms/validators.dart` 重复 | 静态分析可能报 duplicate class，测试依赖废弃文件 |
| 2 | 22 处 `print()` 语句在生产代码中，部分可能输出 token、错误详情等敏感信息 | 安全合规风险 |
| 3 | `chat_provider.dart` 中 `ChatNotifier` 类未被任何 provider 使用（实际 wiring 用的是 `ChatNotifierWithOutbox`），但被多个文件 import | 死代码，增加维护负担 |

### P1：核心能力缺失或架构冲突

| # | 问题 | 影响 |
|---|------|------|
| 4 | 约 10 个文件存在硬编码中文字符串，未走 i10n | 国际化不完整 |
| 5 | `route_observer.dart` 未挂载到 GoRouter.observers，仅挂在外层 Navigator | 路由分析/埋点数据不完整 |
| 6 | 双重权限系统：`AuthState.permissions` 与 `permissionProvider`（EmptyPermissionApi）并存 | 权限逻辑混乱 |
| 7 | `/debug/gallery` 路由无鉴权保护，生产环境可直接访问 | 安全风险 |

### P2：体验、测试、可维护性

| # | 问题 |
|---|------|
| 8 | chat_page、settings_page 大量硬编码 spacing（12/16/8/14/340），未使用 ImTokens |
| 9 | `login_page.dart:200` 使用 `.contains('注册')` 做 locale 判断，脆弱的反模式 |
| 10 | `web_meta_defaults.dart` SEO meta 全部硬编码中文 |
| 11 | `index.html` canonical URL 硬编码 `localhost:3000` |
| 12 | `FormController.formError` 被设置但从未被任何 widget 消费 |
| 13 | `RouteMeta` 与 `PageMeta` 双系统独立维护，新增路由需改两处 |
| 14 | 5 处 TODO 占位（voice/file/video playback, image viewer, URL launch） |
| 15 | `im_ui` 废弃的 `AppTheme` 和旧 widgets 仍存在，标记 `@Deprecated` 但未删除 |

---

## C. 文件级修复清单

### P0 修复

| 文件路径 | 问题 | 建议修改 | 必须修复 |
|----------|------|----------|----------|
| `lib/core/utils/validators.dart` | 废弃文件，含硬编码中文，被测试引用 | 删除此文件，将测试改为引用 `core/forms/validators.dart` | 是 |
| `test/core/utils/validators_test.dart` | 引用废弃的 `core/utils/validators.dart` | 重写为测试 `FormValidators`，或删除 | 是 |
| `lib/features/chat/presentation/chat_provider_with_outbox.dart` | 8 处 `print()`（行 233/268/303/332/343/380/507/558），部分含错误详情 | 替换为 `debugPrint`，异常对象改为类型名不输出内容 | 是 |
| `lib/features/chat/presentation/chat_provider.dart` | 7 处 `print()` + `ChatNotifier` 类为死代码 | 移除 `print()`；标记 `ChatNotifier` `@Deprecated` 或删除（保留 `ChatState`） | 是 |
| `lib/adapters/web_ws_adapter_web.dart` | 2 处 `print()`（行 112/132） | 替换为 `debugPrint` | 是 |
| `lib/features/auth/presentation/auth_provider.dart` | `print('WS ticket fetch failed...')` (行 158) | 替换为 `debugPrint` | 是 |
| `lib/features/contacts/presentation/contacts_provider.dart` | `print('Failed to handle online status...')` (行 69) | 替换为 `debugPrint` | 是 |
| `lib/features/chat/data/message_outbox.dart` | `debugPrint('Outbox retry failed: $e')` (行 376)，`$e` 可能含敏感信息 | 改为 `debugPrint('Outbox retry failed')` 不输出异常详情 | 是 |

### P1 修复

| 文件路径 | 问题 | 建议修改 | 必须修复 |
|----------|------|----------|----------|
| `lib/features/contacts/presentation/add_friend_page.dart` | 整个页面硬编码中文（8+ 处） | 全部替换为 `AppLocalizations.of(context)!` 调用，ARB 补充 key | 是 |
| `lib/features/contacts/presentation/contacts_page.dart` | 5 处硬编码中文 | 替换为 i18n | 是 |
| `lib/features/e2ee/presentation/encryption_dialog.dart` | 整个对话框硬编码中文 | 替换为 i18n | 是 |
| `lib/features/e2ee/presentation/encryption_badge.dart` | `'正在协商加密'` 硬编码 | 替换为 i18n | 是 |
| `lib/core/router/deferred_route_page.dart` | `'加载中...'`、`'加载失败'`、`'重试'` 硬编码 | 替换为 i18n | 是 |
| `lib/core/router/not_found_page.dart` | 404 页面硬编码中文 | 替换为 i18n | 是 |
| `lib/core/web_meta/web_meta_defaults.dart` | 全部 SEO meta 硬编码中文 | 至少 title/description 走 i18n，或接受中文默认值 | 否 |
| `lib/core/router/app_router.dart` | `/debug/gallery` 无鉴权保护 | 用 `kDebugMode` 条件包裹，或添加 `requiresAuth: true` | 是 |
| `lib/core/router/app_router.dart` | `routeObserver` 未挂载到 GoRouter.observers | 在 GoRouter 构造时添加 `observers: [routeObserver]` | 是 |
| `lib/core/router/permission_provider.dart` + `auth_provider.dart` | 双重权限系统 | 统一到 `AuthState.permissions`，废弃 `permissionProvider` 独立实现 | 是 |

### P2 修复

| 文件路径 | 问题 | 建议修改 | 必须修复 |
|----------|------|----------|----------|
| `lib/features/chat/presentation/chat_page.dart` | 10+ 处硬编码 spacing | 替换为 `ImTokens.space*` | 否 |
| `lib/features/settings/presentation/settings_page.dart` | 15+ 处硬编码 spacing | 替换为 `ImTokens.space*` | 否 |
| `lib/features/auth/presentation/login_page.dart:200` | `.contains('注册')` locale 反模式 | 改为基于 `Localizations.localeOf(context).languageCode` 判断 | 否 |
| `web/index.html` | canonical URL 硬编码 `localhost:3000` | 改为相对路径或环境变量注入 | 否 |
| `lib/features/moments/presentation/` 多个文件 | feed/composer/notifications 多处硬编码中文 | 批量替换为 i18n | 否 |
| `lib/features/group/presentation/group_list_page.dart:46` | `'暂无群组'` 硬编码 | 替换为 i18n | 否 |
| `lib/features/chat/presentation/widgets/network_status_banner.dart:56` | `'正在重试发送消息...'` 硬编码 | 替换为 i18n | 否 |
| `lib/adapters/web_audio_recorder_adapter.dart:10` | `'已在录音中'` 硬编码 | 替换为 i18n 或改为日志消息 | 否 |

---

## D. 回归测试清单

| # | 测试步骤 | 预期结果 |
|---|---------|---------|
| 1 | 打开 `/login`，输入正确账号密码登录 | 跳转到 `/chat`，token 存入 secure storage |
| 2 | 未登录直接访问 `/chat` 或 `/settings` | 重定向到 `/login?redirect=...` |
| 3 | 登录后访问 `/login` | 重定向到 `/chat` |
| 4 | 访问不存在的路径 `/xyz` | 显示 404 页面 |
| 5 | 直接访问 `/chat/abc123`（深链） | 正确加载 ChatPage，sessionId=abc123 |
| 6 | 在设置页切换语言（中英） | UI 立即刷新，刷新页面后语言保持 |
| 7 | 在设置页切换主题（亮暗系统） | UI 立即切换，刷新后主题保持 |
| 8 | 在聊天页发送一条消息 | 消息出现在列表中 |
| 9 | 断网后发送消息 | 消息进入 outbox，显示 pending 状态 |
| 10 | 恢复网络 | outbox 自动重试，消息发送成功 |
| 11 | 选择文件/图片 | 文件选择器正常弹出 |
| 12 | 移动端宽度（<600px） | 底部导航栏，单列布局 |
| 13 | 桌面端宽度（>=1200px） | 左侧 NavigationRail，双列布局 |
| 14 | PWA 安装提示 | manifest.json 有效，可安装 |
| 15 | 离线刷新 | Service Worker 缓存 index.html，可加载 |

---

## E. 最小修复补丁建议

### 补丁 1：修复 P0 print() 泄露（影响 6 个文件）

将所有 `print()` 替换为 `debugPrint()` 或移除。对于异常日志，不输出异常对象（可能含 token/消息内容），只输出错误类型。

**关键修改点：**
- `chat_provider_with_outbox.dart`: 8 处 print -> debugPrint，异常对象改为类型名
- `chat_provider.dart`: 7 处 print -> debugPrint，同上
- `web_ws_adapter_web.dart`: 2 处 print -> debugPrint
- `auth_provider.dart`: 1 处 print -> debugPrint
- `contacts_provider.dart`: 1 处 print -> debugPrint
- `message_outbox.dart`: debugPrint 已用，但 `$e` -> 类型名

### 补丁 2：删除废弃 validators（影响 2 个文件）

1. 删除 `flutter/apps/web/lib/core/utils/validators.dart`
2. 重写 `flutter/apps/web/test/core/utils/validators_test.dart` 改为测试 `core/forms/validators.dart`

### 补丁 3：保护 debug 路由（影响 1 个文件）

在 `app_router.dart` 中用条件判断包裹 `/debug/gallery` 路由：

```dart
if (kDebugMode)
  GoRoute(
    path: '/debug/gallery',
    builder: (_, __) => const ComponentGalleryPage(),
  ),
```

### 补丁 4：挂载 RouteObserver（影响 1 个文件）

在 `app_router.dart` 的 `GoRouter()` 构造中添加：

```dart
observers: [routeObserver],
```

---

## F. 各模块验收详情

### 1. 代码结构

| 检查项 | 结果 | 说明 |
|--------|------|------|
| im_core 职责 | 通过 | 纯数据模型、业务逻辑、Rust bridge，无 UI 依赖 |
| im_ui 职责 | 通过 | tokens、theme、widgets、layouts，仅依赖 flutter + google_fonts |
| im_web 职责 | 通过 | 所有 Web 专用 adapter 在 `apps/web/lib/adapters/` |
| 依赖方向 | 通过 | im_web -> im_ui / im_core，无反向依赖 |
| Web-only 代码隔离 | 通过 | packages/core 无 dart:html、browser API 引用 |

### 2. 路由

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 登录态重定向 | 通过 | GoRouter.redirect 支持 requiresAuth / hideForAuth / permission 三级守卫 |
| 404 处理 | 通过 | catch-all route 渲染 NotFoundPage |
| /chat/:sessionId 深链 | 通过 | 路径参数正确提取并传入 ChatPage |
| ShellRoute 导航 | 通过 | ResponsiveScaffold 桌面 NavigationRail / 移动端 NavigationBar |
| SEO meta | 通过 | 双层系统：RouteMeta（路由守卫）+ PageMeta（DOM 操作） |
| 死路由 | 通过 | 无重复路由，无未使用页面 |
| debug 路由 | **待修复** | `/debug/gallery` 无鉴权 |

### 3. 状态管理

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Provider 按 feature 拆分 | 通过 | auth/chat/settings/contacts/group/e2ee/moments 各自独立 |
| 循环依赖 | **注意** | outbox_provider <-> chat_providers 存在循环 import（Dart 可处理，但不理想） |
| Token 持久化 | 通过 | flutter_secure_storage |
| 语言持久化 | 通过 | localStorage，settings_page 中写入 |
| 主题持久化 | 通过 | localStorage，settings_page 中写入 |
| 离线队列 | 通过 | IndexedDB，指数退避重试，E2EE 感知 |
| 敏感信息日志 | **待修复** | 22 处 print()，部分输出异常详情 |
| 敏感 Provider 过滤 | 通过 | AppProviderObserver 过滤 auth/token/secure/wsclient |

### 4. UI 与响应式

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Design Tokens | 通过 | ImTokens 提供 spacing/radius/typography/elevation/breakpoints |
| 主题系统 | 通过 | ImTheme.light()/dark() 从 tokens 构建 ThemeData |
| 基础组件 | 通过 | ImButton/Card/TextField/Avatar/Badge/Dialog/NavItem/Empty |
| 统一断点 | 通过 | BreakpointScope + ResponsiveContext，600/900/1200 三级 |
| 硬编码颜色 | 通过 | 页面使用 Theme.of(context).colorScheme 或 ImColors |
| 硬编码 spacing | **注意** | chat_page/settings_page 仍有多处原始数值 |
| 可访问性 | 部分通过 | 存在 semantics_test 和 keyboard_test |

### 5. i18n

| 检查项 | 结果 | 说明 |
|--------|------|------|
| MaterialApp.locale 绑定 | 通过 | ref.watch(languageProvider) 驱动 locale |
| 语言切换即时刷新 | 通过 | SynchronousFuture 加载，MaterialApp.router rebuild |
| ARB 文件一致性 | 通过 | app_en.arb / app_zh.arb 各 202 key，完全匹配 |
| 登录/注册页 | 通过 | 全部使用 loc.* |
| 聊天 MessageInput | 通过 | 全部使用 loc.* |
| 设置页 | 通过 | 全部使用 loc.* |
| 硬编码中文 | **待修复** | contacts/e2ee/moments/group/deferred_route/not_found 约 10 个文件 |

### 6. 表单验证

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 统一表单体系 | 通过 | FormController + FormSchema + ValidatedForm + ValidatedFormField |
| 登录/注册接入 | 通过 | 使用 FormValidators + loc.* 错误消息 |
| 字段错误展示 | 通过 | touched && error 时显示，一致性好 |
| 服务端错误映射 | 通过 | ServerErrorMapper 提取 field-level 和 form-level 错误 |
| 全局错误展示 | **注意** | FormController.formError 被设置但未被 widget 消费 |
| 废弃 validators | **待修复** | core/utils/validators.dart 仍存在，硬编码中文 |

### 7. PWA / 离线

| 检查项 | 结果 | 说明 |
|--------|------|------|
| manifest.json | 通过 | 完整：name/icons/theme/display/scope |
| Service Worker | 通过 | 4 层缓存策略，离线 fallback |
| PWA meta tags | 通过 | OG/Twitter/Apple/theme-color |
| canonical URL | **注意** | 硬编码 localhost:3000 |
| 离线/在线状态 | 通过 | 三态模型：online/limited/offline，定期健康检查 |
| 消息 outbox | 通过 | IndexedDB，指数退避（5s/10s/20s/40s/80s），最大 5 次重试 |
| Deferred imports | 通过 | 5 个低频路由延迟加载 |
| 构建体积策略 | 部分通过 | 有 deferred imports；无显式 feature flags |

### 8. 设备能力与第三方服务

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Port/Adapter 架构 | 通过 | 6 个设备能力 + 4 个基础设施全部抽象 |
| 第三方服务 Noop | 通过 | analytics/error/push/payment/map/file_preview 均有 Noop 实现 |
| Noop 不污染业务 | 通过 | 注入在 composition root，业务页面不直接 import |
| 事件埋点无敏感数据 | 通过 | 接口文档约束，无编译时强制 |

### 9. 测试覆盖

| 测试目录 | 文件数 | 覆盖范围 |
|----------|--------|----------|
| `test/core/router/` | 3 | app_router, not_found_page, permission_provider |
| `test/core/forms/` | 4 | form_controller, form_field_state, server_error_mapper, validators |
| `test/core/network/` | 1 | network_status_provider |
| `test/features/auth/` | 3 | auth_provider, auth_card, gradient_button |
| `test/features/chat/` | 5 | chat_page, chat_provider, message_input, outbox, outbox_integration |
| `test/features/i18n/` | 2 | language_switch, theme_switch |
| `test/features/settings/` | 1 | settings_page |
| `test/a11y/` | 2 | keyboard, semantics |
| `test/widgets/` | 3 | message_input, validated_form, validated_form_field |
| `packages/core/test/` | 10 | models, contracts, config, services |
| `packages/ui/test/` | 9 | responsive, theme, widgets |
| **合计** | **43** | 覆盖 router, auth, chat, settings, form, i18n, outbox |

---

## G. 架构亮点

以下实现值得肯定，在后续开发中应保持：

1. **Port/Adapter 模式**：所有平台能力（文件选择、剪贴板、通知、网络状态、录音、分享）通过抽象端口隔离，Web 实现全部在 `apps/web/lib/adapters/`，packages/core 保持平台无关
2. **消息 Outbox**：IndexedDB 持久化 + 指数退避重试 + 网络恢复自动处理 + E2EE 感知，生产级实现
3. **Service Worker**：4 层缓存策略（App Shell / Static / Images / API），离线 fallback 完整
4. **Design Token 体系**：ImTokens + ImColors + ImTheme 完整链路，legacy widgets 已标记废弃
5. **响应式布局**：统一断点系统，NavigationRail/NavigationBar 自动切换
6. **表单验证**：自定义 FormController 体系，支持 sync/async 验证、服务端错误映射

---

## H. 后续建议

1. **优先完成 P0 修复**（补丁 1-4），解除编译和安全风险
2. **批量处理 i18n**：为 contacts/e2ee/moments/group 补充 ARB key，替换硬编码中文
3. **清理死代码**：移除废弃的 `ChatNotifier`（保留 `ChatState`）、`core/utils/validators.dart`
4. **统一权限系统**：合并 `AuthState.permissions` 和 `permissionProvider`
5. **渐进式 token 化**：chat_page / settings_page 的硬编码 spacing 逐步替换为 ImTokens
6. **补充集成测试**：目前 integration_test 仅覆盖 auth 和 chat，建议补充 settings/contacts/moments
