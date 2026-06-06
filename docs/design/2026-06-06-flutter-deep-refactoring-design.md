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
7. 迁移 feature 时先保留 shim，后删旧目录（见"Shim 过渡策略"）
8. settings_page 暂留 apps，settings.dart barrel 单独处理（见"Settings 迁移策略"）

## shared_features 内部 import 分层规则

```
shared_features/**/data/
  ✅ import im_core
  🚫 import flutter / riverpod / im_core_flutter / im_ui

shared_features/**/domain/
  ✅ import im_core
  🚫 import flutter / riverpod / im_core_flutter / im_ui

shared_features/**/presentation/
  ✅ import flutter / riverpod / im_core_flutter / im_ui
  🚫 import apps
```

shared_features 任何位置禁止出现：
- `package:im_desktop`
- `package:im_mobile`

每个迁移子阶段后都要 grep 检查。

## im_core_flutter 包内容

从 apps 中提取的 Flutter 基础设施：

| 文件 | 来源 | 说明 |
|------|------|------|
| `platform_capability_providers.dart` | desktop/core/di/ | 拆分自 platform_providers.dart |
| `infrastructure_providers.dart` | desktop/core/di/ | 拆分自 platform_providers.dart |
| `app_settings_providers.dart` | desktop/core/di/ | 拆分自 platform_providers.dart |
| `app_logger.dart` | desktop/core/logging/ | 超集签名 + 参数化 tag |
| `error_sanitizer.dart` | desktop/core/logging/ | 已相同，直接迁移 |
| `route_names.dart` | mobile/core/router/ | 统一路由常量 |
| `route_meta.dart` | mobile/core/router/ | auth guard 元数据 |
| `router_guard.dart` | desktop/mobile router | auth redirect helper |
| `router_refresh.dart` | — | RouterRefreshListenable |
| `language_provider.dart` | desktop/core/di/ | 统一用 StateProvider |
| `theme_mode_provider.dart` | desktop/core/di/ | 统一用 StateProvider |

不放的内容：
- ShellRoute builder（平台特定的 shell 布局）
- GoRouter 实例化（由 apps 组装）
- app_theme.dart（base theme 留 im_ui）

### AppLogger 签名

采用 desktop 的超集签名：

```dart
void warn(String message, [Object? error, StackTrace? stackTrace])
void error(String message, Object error, [StackTrace? stackTrace, String? category])
```

支持参数化 tag，不硬编码平台名：

```dart
AppLogger.init(
  tag: 'im',
  errorReporter: NoopErrorReporterAdapter(),
);
```

### languageProvider / themeModeProvider

统一用 StateProvider（不改 StateNotifierProvider，避免引入额外调用点改造）：

```dart
final languageProvider = StateProvider<String>((ref) => 'zh');
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```

## im_shared_features 包内容

整模块迁移的 feature：

| Feature | 文件数 | 迁移方式 |
|---------|--------|----------|
| auth | ~13 | 整模块迁移（login_page 用参数化 appName） |
| chat | ~29 | 整模块迁移（message_bubble 统一为 ConsumerWidget） |
| contacts | ~6 | 整模块迁移（以 desktop 为 canonical，有 displayName 空值防御） |
| group | ~7 | 整模块迁移 |
| moments | ~22 | 整模块迁移（post_card 统一布局） |
| settings | ~19 | data/provider/state 迁移，settings_page 暂留 apps |
| e2ee | ~16 | manager/API/provider/key_store 接口/session_store 接口/meta_store 迁移 |

## Shim 过渡策略

每迁移一个 feature 后，不立即删除 apps/features/<feature>。保留薄 shim 过渡层：

```dart
// apps/desktop/lib/features/auth/auth.dart
export 'package:im_shared_features/auth/auth.dart';

// apps/mobile/lib/features/auth/auth.dart
export 'package:im_shared_features/auth/auth.dart';
```

其他 feature 同理：chat.dart、contacts.dart、group.dart、moments.dart。

这样 Phase 2/3 可以逐个 feature 编译验证，不需要等 Phase 5 一次性改 router。
Phase 5 再把 router import 改成直接引用 im_shared_features，验证通过后删除 shim。

## Settings 迁移策略

settings_page.dart 暂留 apps（i18n 问题），但 settings.dart barrel 目前会 export settings_page.dart。
所以 Phase 3.5 不直接迁移原 settings.dart。

shared_features 新建自己的 settings.dart，只导出 data/provider/state：

```dart
// packages/shared_features/lib/settings.dart
export 'src/settings/data/settings_api.dart';
export 'src/settings/data/ai_api.dart';
export 'src/settings/presentation/settings_provider.dart';
export 'src/settings/presentation/settings_providers.dart';
export 'src/settings/presentation/profile_provider.dart';
export 'src/settings/presentation/ai_settings_provider.dart';
```

apps 侧保留自己的 settings.dart：

```dart
// apps/desktop/lib/features/settings/settings.dart
export 'package:im_shared_features/settings.dart';
export 'presentation/settings_page.dart';

// apps/mobile/lib/features/settings/settings.dart
export 'package:im_shared_features/settings.dart';
export 'presentation/settings_page.dart';
```

## E2EE 分层

### 执行顺序

1. 先把 e2ee_providers.dart 改成抽象注入
2. 再迁移 e2ee_api / e2ee_manager / e2ee_meta_store / key_store interface / session_store interface
3. 再移动 presentation 层 E2EE 组件
4. 最后移动 apps 侧具体实现

### e2ee_providers.dart（shared_features）

```dart
final e2eeKeyStoreProvider = Provider<E2eeKeyStore>((ref) {
  throw UnimplementedError('e2eeKeyStoreProvider must be overridden');
});

final e2eeSessionStoreProvider = Provider<E2eeSessionStore>((ref) {
  throw UnimplementedError('e2eeSessionStoreProvider must be overridden');
});

final e2eeMetaStoreProvider = Provider<E2eeMetaStore>((ref) {
  return E2eeMetaStore(ref.watch(secureStorageProvider));
});

final e2eeManagerProvider = Provider<E2eeManager>((ref) {
  return E2eeManager(
    adapter: ref.watch(e2eeAdapterProvider),
    api: ref.watch(e2eeApiProvider),
    keyStore: ref.watch(e2eeKeyStoreProvider),
    sessionStore: ref.watch(e2eeSessionStoreProvider),
    metaStore: ref.watch(e2eeMetaStoreProvider),
    currentUserId: ref.watch(currentUserIdProvider),
  );
});
```

apps 通过 ProviderScope overrides 注入具体实现。

### 文件归属

```
shared_features/e2ee/
├── data/
│   ├── e2ee_api.dart              # ✅ 迁移
│   ├── e2ee_manager.dart          # ✅ 迁移
│   ├── e2ee_key_store.dart        # ✅ 迁移（接口）
│   ├── e2ee_session_store.dart    # ✅ 迁移（接口）
│   ├── e2ee_meta_store.dart       # ✅ 迁移（只依赖 SecureStoragePort）
│   └── e2ee_providers.dart        # ✅ 迁移（抽象注入）
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
├── mobile_key_store.dart          # 保留（从 DesktopKeyStore 改名）
└── mobile_session_store.dart      # 保留（从 desktop_session_store 改名）
```

## apps 最终结构

```
apps/desktop/
├── main.dart                    # 入口 + ProviderScope overrides
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
└── features/
    └── settings/
        ├── settings.dart        # export shim + settings_page.dart
        └── presentation/
            └── settings_page.dart
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
| `app_logger.dart` | tag 10 行 | 参数化 tag + 超集签名 |

## 执行计划

### Phase 0: Baseline Audit
- 记录当前 flutter analyze / flutter test / build 状态
- 记录 desktop/mobile feature 文件清单和 SHA/diff 分类
- 新建重构分支
- 明确 Web 本轮不迁移，只作为行为参考
- 记录当前 router import、barrel export、E2EE provider 依赖情况

### Phase 1: im_core_flutter 基础设施
- 新建 `packages/core_flutter` (im_core_flutter)
- 迁移并拆分：platform_capability_providers / infrastructure_providers / app_settings_providers
- 迁移：app_logger（超集签名 + 参数化 tag）/ error_sanitizer / route_names / route_meta / router_guard / router_refresh
- languageProvider / themeModeProvider 统一用 StateProvider
- 输出 im_core_flutter.dart barrel
- apps 改 import，仍保持业务代码不动
- 验证: flutter pub get + flutter analyze

### Phase 2: shared_features 创建 + auth 最小闭环
- 新建 `packages/shared_features` (im_shared_features)
- 迁移 auth 模块
- 修正 auth 内部 import，禁止 package:im_desktop / package:im_mobile
- apps/features/auth/auth.dart 改为 export shim
- router 暂时不必改
- 验证: desktop/mobile 编译通过 + flutter analyze 通过

### Phase 3: 按 feature 批量迁移，逐批保留 shim

Phase 3.1 chat
- 迁移 chat 相关文件到 shared_features
- chat_notifier 使用 im_core_flutter AppLogger
- apps/features/chat/chat.dart 改为 export shim
- 验证 pub get + analyze

Phase 3.2 contacts
- 以 desktop 版本为 canonical
- 保留 displayName 空值防御
- apps/features/contacts/contacts.dart 改为 export shim
- 验证 pub get + analyze

Phase 3.3 group
- 整模块迁移
- apps/features/group/group.dart 改为 export shim
- 验证 pub get + analyze

Phase 3.4 moments
- 整模块迁移
- apps/features/moments/moments.dart 改为 export shim
- 验证 pub get + analyze

Phase 3.5 settings data/provider/state
- 只迁移：settings_api / ai_api / settings_provider / settings_providers / profile_provider / ai_settings_provider
- 不迁移 settings_page.dart
- 不直接迁移原 settings.dart barrel
- shared_features 新建自己的 settings.dart，只导出 data/provider/state
- apps 保留 settings_page.dart 和 apps 侧 settings.dart
- 验证 pub get + analyze

### Phase 4: E2EE 分层 + 接口提取（Codex 主导）
- 执行顺序必须是：
  1. 先把 e2ee_providers.dart 改成抽象注入
  2. 再迁移 e2ee_api / e2ee_manager / e2ee_meta_store / key_store interface / session_store interface
  3. 再移动 presentation 层 E2EE 组件
  4. 最后移动 apps 侧具体实现
- shared_features 只依赖接口，不能 new desktop/mobile 实现
- shared_features 不能 import apps
- mobile: desktop_key_store 改名为 mobile_key_store / MobileKeyStore
- apps 通过 ProviderScope overrides 注入 e2eeKeyStoreProvider / e2eeSessionStoreProvider
- 验证: apps 编译 + 测试通过

### Phase 5: apps router 组装 + 旧 features 延迟删除

Phase 5a: router import 切换
- desktop/mobile app_router.dart 从 shim 切到 im_shared_features
- ShellRoute builder 继续留 apps
- GoRouter 实例化继续留 apps
- 页面 builder 引用 shared_features 页面
- 旧 apps/features 目录暂不删除
- analyze/build 通过

Phase 5b: 删除旧 features
- 仅在 5a 验证通过后删除已迁移旧文件
- 保留 settings_page.dart
- 保留必要 shim 或 app-only 页面
- 不要把"router 切换"和"删除旧目录"放在同一次提交

Phase 5c: 清理
- 删除 dead import
- 删除 dead barrel export
- 删除空目录
- 确认 apps 不再有重复 feature 实现

### Phase 6: 测试、验证、清理、文档更新
- flutter test 全量通过
- flutter analyze 零 warning
- flutter build web
- flutter build windows
- flutter build apk
- grep 检查 shared_features 中没有 apps/desktop、apps/mobile、package:im_desktop、package:im_mobile
- 验证 Desktop WebSocket 登录/登出连接行为：
  - 未登录时不应误连业务 WS
  - 登录后只保留一个有效 WS 连接
  - logout 后 WS 正确断开
  - 重复登录/恢复会话不会重复订阅消息流
- 更新 melos.yaml 或 workspace 包列表
- 更新 CI workflow
- 更新架构文档

## 每阶段强制检查命令

```bash
flutter pub get
flutter analyze
flutter test

# 依赖方向检查
grep -R "package:im_desktop" packages/shared_features/lib packages/core_flutter/lib || true
grep -R "package:im_mobile" packages/shared_features/lib packages/core_flutter/lib || true
grep -R "apps/desktop" packages/shared_features/lib packages/core_flutter/lib || true
grep -R "apps/mobile" packages/shared_features/lib packages/core_flutter/lib || true
```

## 验收标准

1. packages/core 仍然无 Flutter / Riverpod / go_router 依赖
2. im_core_flutter 不依赖 im_shared_features
3. im_shared_features 不依赖 apps
4. apps/features 基本清空，仅保留 settings_page 或临时 shim
5. E2EE key/session store 由 apps 注入，不在 shared_features 直接实例化
6. desktop/mobile router 能正常进入 auth/chat/contacts/group/moments/settings
7. analyze/test/build 全部通过

## 风险控制

| 风险 | 措施 |
|------|------|
| import 路径批量替换出错 | 每个子批次独立 analyze，出错立即回滚 |
| E2EE 接口边界不清 | Phase 4 由 Codex 主导，严格检查依赖方向 |
| settings_page i18n | 暂留 apps，不强行迁移 |
| mobile E2EE 命名错误 | Phase 4 统一改名 desktop_key_store → mobile_key_store |
| apps 删除旧代码引入回归 | Phase 5 分两步：先引用新代码，验证通过后再删旧代码 |
