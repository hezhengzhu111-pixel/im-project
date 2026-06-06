# Flutter 前端深度重构设计方案

**日期**: 2026-06-06
**状态**: 已批准
**范围**: Desktop + Mobile 代码去重，Web 本轮不迁移

## 背景

Desktop（91 文件）和 Mobile（90 文件）的 feature 代码 73% 完全相同，仅 import 路径或行尾符不同。加上 core/adapters 层重复，两个 app 共 181 个文件中有 ~120 个重复。维护成本翻倍，且容易出现两端不一致。

## 目标

- Desktop/Mobile 的 features/ 目录基本清空
- apps 总 Dart 文件预计降到 15～25 个
- 新增 `packages/core_flutter` 和 `packages/shared_features`
- 保持 `packages/core` 纯 Dart 不变

## 包依赖层级

```
Layer 4: apps/desktop · apps/mobile
  └─ 依赖: im_core + im_core_flutter + im_ui + im_shared_features

Layer 3: im_shared_features (NEW)
  └─ auth/ · chat/ · contacts/ · group/ · moments/ · settings/ · e2ee(manager+API+interfaces)
  └─ 依赖: im_core + im_core_flutter + im_ui
  └─ 禁止反向依赖 apps/

Layer 2a: im_ui
  └─ widgets/ · layouts/ · base theme
  └─ 依赖: Flutter SDK

Layer 2b: im_core_flutter (NEW)
  └─ platform_providers(拆3) · app_logger · route_names/meta/guard/refresh · themeModeProvider
  └─ 依赖: im_core + Flutter + Riverpod + go_router
  └─ 禁止依赖 shared_features

Layer 1: im_core (纯 Dart，不变)
  └─ models/ · contracts/ · ports/ · endpoints/ · config/ · result/ · errors/ · validators/
  └─ 禁止: Flutter · Riverpod · go_router · ThemeData
```

## 关键约束

1. `core` → 纯 Dart，零 Flutter 依赖
2. `core_flutter` → 可依赖 core，不可依赖 shared_features
3. `shared_features` → 可依赖 core + core_flutter + ui
4. `apps` → 依赖所有包，只做平台装配
5. `shared_features` 只 import `im_core_flutter`，不 import `apps/core/logging`
6. `e2ee_providers.dart` 只依赖抽象接口，不能 new desktop/mobile 实现

## im_core_flutter 包内容

从 apps 中提取的 Flutter 基础设施：

| 文件 | 来源 | 说明 |
|------|------|------|
| `platform_capability_providers.dart` | desktop/core/di/ | 拆分自 platform_providers.dart |
| `infrastructure_providers.dart` | desktop/core/di/ | 拆分自 platform_providers.dart |
| `app_settings_providers.dart` | desktop/core/di/ | 拆分自 platform_providers.dart |
| `app_logger.dart` | desktop/core/logging/ | 参数化 tag，不硬编码 |
| `error_sanitizer.dart` | desktop/core/logging/ | 已相同，直接迁移 |
| `route_names.dart` | mobile/core/router/ | 统一路由常量 |
| `route_meta.dart` | mobile/core/router/ | auth guard 元数据 |
| `router_guard.dart` | desktop/mobile router | auth redirect helper |
| `router_refresh.dart` | — | RouterRefreshListenable |
| `language_provider.dart` | desktop/core/di/ | 语言状态 |
| `theme_mode_provider.dart` | desktop/core/di/ | 主题模式状态 |

不放的内容：
- ShellRoute builder（平台特定的 shell 布局）
- GoRouter 实例化（由 apps 组装）
- app_theme.dart（base theme 留 im_ui）

## im_shared_features 包内容

整模块迁移的 feature：

| Feature | 文件数 | 迁移方式 |
|---------|--------|----------|
| auth | ~13 | 整模块迁移（login_page 用参数化 appName） |
| chat | ~29 | 整模块迁移（message_bubble 统一为 ConsumerWidget） |
| contacts | ~6 | 整模块迁移（以 desktop 为 canonical，有 displayName 空值防御） |
| group | ~7 | 整模块迁移 |
| moments | ~22 | 整模块迁移（post_card 统一布局） |
| settings | ~19 | data/provider/state 迁移，settings_page 暂留 apps（i18n 问题） |
| e2ee | ~16 | manager/API/provider/key_store 接口/session_store 接口/meta_store 迁移 |

## E2EE 分层

```
shared_features/e2ee/
├── data/
│   ├── e2ee_api.dart              # ✅ 迁移
│   ├── e2ee_manager.dart          # ✅ 迁移
│   ├── e2ee_key_store.dart        # ✅ 迁移（接口）
│   ├── e2ee_session_store.dart    # ✅ 迁移（接口）
│   ├── e2ee_meta_store.dart       # ✅ 迁移（只依赖 SecureStoragePort）
│   └── e2ee_providers.dart        # ✅ 迁移（只依赖抽象接口）
├── presentation/
│   ├── e2ee_provider.dart         # ✅ 迁移
│   ├── encryption_badge.dart      # ✅ 迁移
│   ├── encryption_banner.dart     # ✅ 迁移
│   └── negotiation_dialog.dart    # ✅ 迁移
└── e2ee.dart                      # ✅ 迁移（barrel file）

apps/desktop/adapters/e2ee/
├── desktop_e2ee_adapter.dart      # 保留
├── desktop_key_store.dart         # 保留（implements E2eeKeyStore）
└── desktop_session_store.dart     # 保留（implements E2eeSessionStore）

apps/mobile/adapters/e2ee/
├── mobile_e2ee_adapter.dart       # 保留
├── mobile_key_store.dart          # 保留（从 desktop_key_store 改名）
└── mobile_session_store.dart      # 保留（从 desktop_session_store 改名）
```

## apps 最终结构

```
apps/desktop/
├── main.dart                    # 入口 + ProviderScope
├── app.dart                     # MaterialApp + Router 组装
├── adapters/                    # 平台适配器（不变）
│   ├── adapters.dart
│   ├── desktop_e2ee_adapter.dart
│   ├── desktop_key_store.dart
│   ├── desktop_session_store.dart
│   ├── desktop_file_picker_adapter.dart
│   ├── desktop_network_adapter.dart
│   ├── desktop_notification_adapter.dart
│   ├── desktop_clipboard_adapter.dart
│   ├── desktop_share_adapter.dart
│   ├── desktop_audio_recorder_adapter.dart
│   ├── desktop_storage_adapter.dart
│   └── services/
├── core/
│   ├── router/
│   │   └── app_router.dart      # GoRouter + ShellRoute 组装
│   └── theme/
│       └── app_theme.dart       # 平台主题扩展
└── features/                    # 基本清空
```

## 小差异文件统一方案

| 文件 | 差异 | 统一方案 |
|------|------|----------|
| `chat_notifier.dart` | 错误处理 8 行 | 统一为用 core_flutter AppLogger 记日志 |
| `ai_settings_provider.dart` | 错误处理 5 行 | 同上 |
| `settings_provider.dart` | 错误处理 5 行 | 同上 |
| `e2ee_manager.dart` | import 路径 8 行 | 统一 import |
| `settings_page.dart` | i18n 69 行 | 暂留 apps，等共享 l10n 包 |
| `platform_providers.dart` | 格式 181 行 | 合并到 core_flutter 并拆分 |
| `app_logger.dart` | tag 10 行 | 参数化 tag |

## 执行计划

### Phase 0: Baseline Audit
- 记录当前 flutter analyze / flutter test / build 状态
- 记录 desktop/mobile feature 文件清单和 SHA/diff 分类
- 新建重构分支
- 明确 Web 本轮不迁移，只作为参考

### Phase 1: im_core_flutter 基础设施
- 新建 `packages/core_flutter` (im_core_flutter)
- 迁移 platform_providers（拆3）/ app_logger / error_sanitizer / route_names / route_meta / router_guard / router_refresh / language_provider / theme_mode_provider
- 验证: flutter pub get + flutter analyze 通过

### Phase 2: shared_features 创建 + auth 最小闭环
- 新建 `packages/shared_features` (im_shared_features)
- 迁移 auth 模块（13 个文件）
- 验证: apps/desktop + apps/mobile 引用 shared_features/auth 正常编译

### Phase 3: 按 feature 批量迁移（拆成 5 个子批次）
- 3.1 chat（29 个文件）
- 3.2 contacts（6 个文件，以 desktop 为 canonical）
- 3.3 group（7 个文件）
- 3.4 moments（22 个文件）
- 3.5 settings（settings_api.dart / settings_provider.dart / ai_api.dart / ai_settings_provider.dart / settings_providers.dart / profile_provider.dart / settings.dart）
- 每个子阶段单独跑 pub get + analyze

### Phase 4: E2EE 分层 + 接口提取（Codex 主导）
- shared_features: e2ee_api / e2ee_manager / e2ee_providers / key_store 接口 / session_store 接口 / meta_store
- apps: key_store/session_store 具体实现
- mobile: desktop_key_store 改名为 mobile_key_store
- shared_features 只依赖接口，不能 new desktop/mobile 实现
- 验证: apps 通过 ProviderScope 注入实现，编译+测试通过

### Phase 5: apps router 组装 + 旧 features 延迟删除
- 5a: apps/router 引入 shared_features 的页面 builder（如 `import 'package:im_shared_features/auth/auth.dart'`），保持旧 features 目录不动，analyze/build 通过
- 5b: 确认 shared_features 引用正确后，删除 apps/{platform}/features/ 下已被迁移的旧文件
- 5c: 清理 dead import / dead code / barrel export
- 不要把"替换引用"和"删除旧目录"放在同一次提交

### Phase 6: 测试、验证、清理、文档更新
- flutter test 全量通过
- flutter analyze 零 warning
- 删除空目录、旧 import、dead code
- 更新 melos.yaml 包列表
- 更新 CI workflow（如有）
- 全量构建验证: web / windows / android

## 风险控制

| 风险 | 措施 |
|------|------|
| import 路径批量替换出错 | 每个子批次独立 analyze，出错立即回滚 |
| E2EE 接口边界不清 | Phase 4 由 Codex 主导，严格检查依赖方向 |
| settings_page i18n | 暂留 apps，不强行迁移 |
| mobile E2EE 命名错误 | Phase 4 统一改名 desktop_key_store → mobile_key_store |
| apps 删除旧代码引入回归 | Phase 5 分两步：先引用新代码，验证通过后再删旧代码 |
