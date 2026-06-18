# Step 4: 全量测试体系 + 灰度发布 Gate 设计文档

**日期：** 2026-06-17
**作者：** IM Developer
**状态：** 设计完成

---

## 1. 整体架构

### 1.1 核心组件

本系统由以下核心组件组成：

1. **测试清单系统（Manifest System）**
   - `scripts/test_inventory.py`：生成测试清单
   - `scripts/check_test_manifest.py`：验证测试清单
   - `docs/testing/test-manifest.md`：测试清单文档

2. **四层 Gate 系统（Gate System）**
   - Layer 1: PR Fast Gate
   - Layer 2: Main Full Gate
   - Layer 3: Gray Release Gate
   - Layer 4: Manual Diagnostic Gate

3. **覆盖率系统（Coverage System）**
   - `scripts/coverage/rust_coverage.py`：Rust 覆盖率生成
   - `scripts/coverage/flutter_coverage.py`：Flutter 覆盖率生成
   - `scripts/coverage/merge_lcov.py`：LCOV 文件合并
   - `scripts/coverage/check_lcov_thresholds.py`：覆盖率阈值检查

4. **统一测试入口（Unified Test Runner）**
   - `scripts/test.py`：统一测试入口

5. **GitHub Actions 工作流**
   - `.github/workflows/pr-fast-gate.yml`
   - `.github/workflows/main-full-gate.yml`
   - `.github/workflows/gray-release-gate.yml`
   - `.github/workflows/coverage.yml`

### 1.2 数据流

```
代码变更 → PR Fast Gate → Main Full Gate → Gray Release Gate → 生产发布
     ↓           ↓              ↓              ↓
  测试清单   覆盖率报告    SIT 测试      灰度报告
```

### 1.3 错误处理

- 测试清单缺失 → Gate 失败
- 覆盖率低于阈值 → Gate 失败
- 测试失败 → Gate 失败
- web 测试失败 → 修复或 allowlist

---

## 2. 测试清单系统设计

### 2.1 测试清单类型

#### 2.1.1 后端路由清单（Backend Route Manifest）

**来源：** `rust/apps/api-server/src/routes/*.rs`

**输出字段：**
- method
- path
- handler name
- auth required or public
- test file
- test name
- test type: unit / integration / SIT
- status: covered / allowed_missing / missing
- reason if allowed_missing

**验证规则：**
- 所有普通业务 REST route 必须 covered
- internal route 可以 allowed_missing，但必须说明只用于服务间调用
- /health、/ready 可作为 public smoke
- /websocket/:user_id 单独归类为 websocket
- 旧非 /api 路径必须仍有 negative tests
- missing 不允许通过 gate

#### 2.1.2 前端端点清单（Frontend Endpoint Manifest）

**来源：** `flutter/packages/core/lib/src/contracts/api_endpoints.dart`

**输出字段：**
- endpoint class
- constant/builder name
- path
- dynamic params
- encode test name
- API client method
- API client test
- provider/notifier method if applicable
- status

**验证规则：**
- 所有 REST endpoint 以 /api/ 开头，WebSocket 例外
- 所有 dynamic path builder 必须有 encode test
- 所有 API client public method 必须有 path/method/body/error test
- internal endpoint 不暴露普通 UI，但要在 manifest 中标记

#### 2.1.3 前端页面路由清单（Frontend Page Manifest）

**来源：** Web/Mobile/Desktop `app_router.dart`

**输出字段：**
- platform: web/mobile/desktop
- route
- page widget
- auth required
- route test
- widget test
- placeholder status
- critical gray scope: yes/no

**验证规则：**
- Mobile/Desktop 下这些 route 必须 covered：
  - /contacts/add
  - /groups/create
  - /moments/notifications
  - /settings/profile
  - /settings/ai
- Web 现有业务 route 也必须在 manifest 中
- 业务 route 不允许 PlaceholderPage
- 404/fallback 可以是专用 fallback page

#### 2.1.4 公共 API/函数清单（Public API Manifest）

**范围：**
- Flutter public API client methods
- Flutter public providers/notifiers methods
- Rust public functions in crates/im-e2ee-core, im-e2ee-ffi, im-flutter-bridge, im-common
- Rust api-server critical service functions

**输出字段：**
- symbol
- file
- category
- test file
- test name
- status

**验证规则：**
- 不要求每个私有 helper 都有独立测试
- 但每个 public method/function 必须至少被 unit/widget/integration/SIT 覆盖一次
- E2EE public functions 必须高覆盖
- crypto/E2EE 相关函数不能只靠 smoke test

### 2.2 清单生成流程

```
扫描代码 → 提取元数据 → 生成清单 → 验证清单 → 输出报告
```

### 2.3 清单验证规则

- missing 不允许通过 gate
- allowed_missing 必须说明原因
- pending 不能 pass

---

## 3. 四层 Gate 系统设计

### 3.1 Layer 1: PR Fast Gate

**触发条件：**
- 每个 PR
- push to main

**必须包含：**
- Rust fmt
- Rust check
- Rust unit tests
- Rust clippy（路径必须正确，不能因为路径错而跳过）
- Flutter analyze
- Flutter unit/widget tests
- Endpoint contract tests
- Route tests
- API client tests
- Manifest consistency tests
- No legacy path tests
- No Placeholder business route tests
- No hardcoded /api path in UI/provider tests
- No full API key/token leak snapshot/log tests

### 3.2 Layer 2: Main Full Gate

**触发条件：**
- push to main
- 每日定时
- workflow_dispatch

**必须包含：**
- PR Fast Gate 全部内容
- Rust integration tests（能本地启动依赖的就启动依赖）
- Flutter full app tests：core/shared_features/web/mobile/desktop
- Coverage generation
- Coverage threshold check
- Test manifest completeness check

### 3.3 Layer 3: Gray Release Gate

**触发条件：**
- 手动触发

**必须包含：**
- Main Full Gate
- P0/P1 SIT gate
- real api-server + MySQL + Redis
- migrations
- Rust E2EE FFI build
- P0 private text E2EE acceptance
- P1 OPK lifecycle
- P1 private multi-device fanout
- P1 group E2EE
- DB plaintext scan
- Smoke E2E for Web/Mobile/Desktop critical routes if environment supports

### 3.4 Layer 4: Manual Diagnostic Gate

**触发条件：**
- 手动触发

**可以包含：**
- 单独跑某个 app
- 单独跑某个 SIT script
- 生成 html coverage report
- 只跑 failed tests

**但不能替代上面三个正式 gate。**

---

## 4. 覆盖率系统设计

### 4.1 Rust 覆盖率

**工具：** cargo-llvm-cov

**生成流程：**
```bash
cd rust
cargo llvm-cov clean --workspace
cargo llvm-cov --workspace --lcov --output-path ../build/coverage/rust/lcov.info
cargo llvm-cov report --workspace
```

**阈值：**
- im-e2ee-core: >= 95%
- im-e2ee-ffi: >= 95%
- im-flutter-bridge: >= 95%
- im-common: >= 95%
- api-server: >= 95%
- Rust workspace overall: >= 95%

### 4.2 Flutter 覆盖率

**工具：** flutter test --coverage

**生成流程：**
```bash
# 每个 package/app 单独生成
flutter/packages/core/coverage/lcov.info
flutter/packages/core_flutter/coverage/lcov.info
flutter/packages/shared_features/coverage/lcov.info
flutter/apps/web/coverage/lcov.info
flutter/apps/mobile/coverage/lcov.info
flutter/apps/desktop/coverage/lcov.info
```

**阈值：**
- packages/core: >= 95%
- packages/core_flutter: >= 95%
- packages/shared_features: >= 95%
- apps/web: >= 95%
- apps/mobile: >= 95%
- apps/desktop: >= 95%
- Flutter combined overall: >= 95%

### 4.3 聚合脚本

1. `scripts/coverage/merge_lcov.py`：合并所有 lcov.info 文件
2. `scripts/coverage/check_lcov_thresholds.py`：检查阈值

**输出：**
- `build/coverage/flutter/summary.json`
- `build/coverage/flutter/combined_lcov.info`
- `build/coverage/flutter/coverage_summary.md`

### 4.4 排除规则

**从 percentage 统计中排除：**
- generated files
- *.g.dart
- *.freezed.dart
- *.gen.dart
- l10n generated files
- generated FRB bindings
- main.dart bootstrap if无法稳定测
- platform registration glue

**不得排除：**
- API clients
- endpoint contracts
- providers/notifiers
- business pages
- route files
- E2EE manager/session/key store
- security sanitizer/logger

---

## 5. 统一测试入口设计

### 5.1 支持命令

```bash
# 运行 PR Fast Gate
python scripts/test.py pr-fast

# 运行 Main Full Gate
python scripts/test.py main-full

# 运行 Gray Release Gate
python scripts/test.py gray-release

# 运行 Rust 测试
python scripts/test.py rust

# 运行 Flutter 测试
python scripts/test.py flutter

# 运行覆盖率生成
python scripts/test.py coverage

# 运行 manifest 检查
python scripts/test.py manifest

# 运行 SIT 测试
python scripts/test.py sit
```

### 5.2 功能要求

1. **输出清晰**：每个步骤有清晰的输出
2. **退出码**：子命令失败时退出非 0
3. **错误处理**：不要吞掉 stderr
4. **耗时统计**：每个 step 有耗时
5. **JSON 输出**：支持 --json 输出
6. **继续执行**：支持 --continue-on-error 仅用于诊断模式，正式 gate 不允许
7. **Windows 支持**：支持 Windows 本地路径
8. **自动定位**：不要依赖用户当前目录，脚本应自动定位 repo root

### 5.3 命令执行流程

```
解析参数 → 定位 repo root → 执行对应命令 → 收集结果 → 输出报告
```

---

## 6. GitHub Actions 工作流设计

### 6.1 PR Fast Gate 工作流

**文件：** `.github/workflows/pr-fast-gate.yml`

**触发条件：**
- pull_request
- push to main

**Jobs：**
1. `rust-fast`：Rust fmt, check, unit tests, clippy
2. `flutter-core-shared`：Flutter analyze, test for core, core_flutter, shared_features
3. `flutter-apps`：Flutter analyze, test for web, mobile, desktop
4. `manifest-check`：测试清单一致性检查

### 6.2 Main Full Gate 工作流

**文件：** `.github/workflows/main-full-gate.yml`

**触发条件：**
- push to main
- schedule nightly
- workflow_dispatch

**Jobs：**
1. `rust-full`：Rust fmt, check, unit tests, clippy, integration tests
2. `flutter-full`：Flutter analyze, test for all packages/apps
3. `coverage`：覆盖率生成
4. `upload-artifacts`：上传覆盖率报告和清单

### 6.3 Gray Release Gate 工作流

**文件：** `.github/workflows/gray-release-gate.yml`

**触发条件：**
- workflow_dispatch

**Inputs：**
- `base_url`：后端 base URL
- `db_url`：MySQL URL
- `redis_url`：Redis URL
- `run_sit`：true/false
- `upload_artifacts`：true/false

**Jobs：**
1. `gray-gate`：运行 gray_gate.py --mode gray-release
2. `upload-artifacts`：上传覆盖率报告、清单、SIT 报告、灰度报告

### 6.4 Coverage 工作流

**文件：** `.github/workflows/coverage.yml`

**触发条件：**
- push to main
- schedule nightly
- workflow_dispatch

**Jobs：**
1. `rust-coverage`：Rust 覆盖率生成
2. `flutter-coverage`：Flutter 覆盖率生成
3. `merge-coverage`：合并覆盖率报告
4. `check-thresholds`：检查覆盖率阈值
5. `upload-artifacts`：上传覆盖率报告

### 6.5 安全要求

- PR gate 不依赖生产 secrets
- Gray gate 可以通过 manual inputs 使用测试环境 secrets
- 不要把 secrets 打印到日志
- 日志中必须 sanitize token/key/password
- GitHub artifact 不应包含 secrets 或 plaintext message payload

---

## 7. 灰度发布验收报告模板设计

### 7.1 报告文件

- `docs/gray-release/gray-release-checklist.md`
- `docs/gray-release/gray-gate-report-template.md`

### 7.2 报告内容

#### 7.2.1 Build Info
- commit SHA
- branch
- date
- actor
- app version
- rust version
- flutter version

#### 7.2.2 Gate Summary
- PR Fast Gate：PASS/FAIL
- Main Full Gate：PASS/FAIL
- Gray Release Gate：PASS/FAIL

#### 7.2.3 SIT Status
- P0 private E2EE：PASS/FAIL
- P1 OPK：PASS/FAIL
- P1 multi-device：PASS/FAIL
- P1 group E2EE：PASS/FAIL
- DB plaintext scan：PASS/FAIL

#### 7.2.4 Coverage Status
- Rust modules：每个模块的覆盖率
- Flutter packages/apps：每个包的覆盖率
- Deltas from baseline：与 baseline 的差异
- Threshold status：是否达到阈值

#### 7.2.5 Manifest Summary
- Backend routes covered/missing
- Frontend endpoints covered/missing
- Pages covered/missing
- Public methods covered/missing

#### 7.2.6 Known Failures
- Exact test：测试名称
- Allowed until：允许的日期
- Owner：负责人
- Issue link：issue 链接

#### 7.2.7 Gray Release Decision
- GO / NO-GO
- Required manual checks：需要手动检查的项目
- Rollback notes：回滚说明

---

## 8. web 测试失败处理设计

### 8.1 问题 1：semantics_test.dart - voice button has semantic label

**修复方案：**
1. 在 voice button 的代码中添加 semantic label
2. 更新测试，验证 semantic label 存在

### 8.2 问题 2：hardcoded_strings_test.dart - Hardcoded Chinese strings

**修复方案：**
1. 将新增/残留中文迁移到 l10n 或集中常量
2. 让测试通过

### 8.3 处理流程

```
识别失败 → 分析原因 → 修复代码 → 更新测试 → 验证通过
```

### 8.4 验证规则

- 不要为了通过测试扩大排除规则
- 不要把 failing test 改成空断言
- 不要让 pending 测试算 pass

---

## 9. 错误处理和验证规则设计

### 9.1 错误处理

#### 9.1.1 测试清单缺失
- 后端路由 missing → Gate 失败
- 前端端点 missing → Gate 失败
- 前端页面 missing → Gate 失败
- 公共 API missing → Gate 失败

#### 9.1.2 覆盖率低于阈值
- 低于阈值 → Gate 失败
- 记录 baseline，不假装通过

#### 9.1.3 测试失败
- 测试失败 → Gate 失败
- 不允许 pending 算 pass

#### 9.1.4 web 测试失败
- 修复或 allowlist
- allowlist 必须精确匹配，不允许通配符

### 9.2 验证规则

#### 9.2.1 不允许的操作
- 不要新增业务功能
- 不要新增后端业务 route
- 不要改数据库 schema
- 不要改生产密码、JWT secret、Redis 密码、Docker compose 生产配置
- 不要恢复旧 API 路径
- 不要改 E2EE 算法
- 不要重写 Flutter 架构
- 不要大规模重构 UI
- 不要删除测试
- 不要把测试 skip/ignore 来换通过
- 不要把 failing test 改成空断言
- 不要让 pending 测试算 pass
- 不要用"本地没环境"直接跳过 gate
- 不要让 CI 只跑轻量 smoke，却宣称全量通过

#### 9.2.2 允许的操作
- 测试脚本
- GitHub Actions
- Rust 测试
- Flutter 测试
- 覆盖率与测试清单
- 测试工具

---

## 10. 验收标准设计

### 10.1 统一测试入口
- 有统一测试入口 `scripts/test.py`
- 支持 pr-fast, main-full, gray-release, rust, flutter, coverage, manifest, sit 命令

### 10.2 灰度 Gate
- 有灰度 gate `scripts/gray_gate.py`
- 支持 pr-fast, main-full, gray-release 模式

### 10.3 测试清单
- 有 backend route manifest
- 有 frontend endpoint manifest
- 有 frontend page/route manifest
- manifest missing 会导致 gate fail

### 10.4 Rust
- Rust clippy 不再因路径错误跳过
- Rust coverage 可生成

### 10.5 Flutter
- Flutter coverage 可生成
- Coverage summary 可输出 Markdown/JSON

### 10.6 GitHub Actions
- CI workflows 分为 PR Fast、Main Full、Gray Release
- P0/P1 SIT 可以被 Gray Release Gate 调用

### 10.7 测试质量
- pending 不会被算作 pass
- web known failures 口径统一，要么修掉，要么精确 allowlist
- shared_features/mobile/desktop/web analyze 有明确结果
- shared_features/mobile/desktop tests 必须全通过
- web 测试不得新增 failure

### 10.8 报告输出
- 所有报告输出到 build/reports 或 docs

### 10.9 禁止操作
- 没有新增业务功能
- 没有后端业务逻辑改动
- 没有数据库 schema 改动

---

## 11. 任务拆分策略

### 阶段 1：基础框架（1-2 天）
- 创建测试清单生成脚本的基本框架
- 创建四层 Gate 系统的基本框架
- 创建覆盖率生成脚本的基本框架

### 阶段 2：具体实现（2-3 天）
- 实现后端路由清单生成
- 实现前端端点清单生成
- 实现前端页面路由清单生成
- 实现公共 API/函数清单生成

### 阶段 3：Gate 系统集成（1-2 天）
- 集成测试清单到 Gate 系统
- 集成覆盖率到 Gate 系统
- 集成 web 测试失败处理

### 阶段 4：GitHub Actions 和报告（1-2 天）
- 创建 GitHub Actions 工作流
- 创建灰度发布验收报告模板
- 创建统一测试入口

---

## 12. 运行命令

### 12.1 完整验证

```bash
# 运行 PR Fast Gate
python scripts/test.py pr-fast

# 运行 manifest 检查
python scripts/test.py manifest

# 运行覆盖率生成
python scripts/test.py coverage

# 运行 Main Full Gate
python scripts/test.py main-full
```

### 12.2 灰度 Gate（如果 Docker/MySQL/Redis 可用）

```bash
# 运行 Gray Release Gate
python scripts/test.py gray-release
```

### 12.3 单独运行

```bash
# Rust 测试
python scripts/test.py rust

# Flutter 测试
python scripts/test.py flutter

# SIT 测试
python scripts/test.py sit
```

### 12.4 底层命令

```bash
# Rust fmt/check/test/clippy
cd rust && cargo fmt --check && cargo check --workspace && cargo test --workspace

# Rust integration-tests
cd rust && cargo test -p api-server --features integration-tests --tests

# Flutter analyze/test per package/app
cd flutter && flutter analyze && flutter test

# Coverage per package/app
cd flutter && flutter test --coverage

# Manifest check
python scripts/test_inventory.py

# SIT scripts
python scripts/p0_gate.py
python scripts/p1_sit_gate.py
```

---

## 13. 输出报告格式

### 13.1 修改文件清单

- 测试脚本
- GitHub Actions
- Rust 测试
- Flutter 测试
- 覆盖率与测试清单
- 测试工具

### 13.2 新增脚本清单

- `scripts/test_inventory.py`
- `scripts/check_test_manifest.py`
- `scripts/coverage/rust_coverage.py`
- `scripts/coverage/flutter_coverage.py`
- `scripts/coverage/merge_lcov.py`
- `scripts/coverage/check_lcov_thresholds.py`
- `scripts/coverage_gate.py`
- `scripts/gray_gate.py`

### 13.3 新增/修改 workflow 清单

- `.github/workflows/pr-fast-gate.yml`
- `.github/workflows/main-full-gate.yml`
- `.github/workflows/gray-release-gate.yml`
- `.github/workflows/coverage.yml`

### 13.4 新增 manifest 清单

- `docs/testing/test-manifest.md`
- `docs/testing/coverage-policy.md`
- `docs/gray-release/gray-gate.md`
- `docs/gray-release/gray-release-checklist.md`
- `docs/gray-release/gray-gate-report-template.md`
- `docs/testing/known-test-failures.md`（如果需要）

### 13.5 覆盖率阈值和当前结果

- Rust 覆盖率阈值：全部 >= 95%
- Flutter 覆盖率阈值：全部 >= 95%

### 13.6 PR Fast Gate 内容和结果

- Rust fmt/check/test/clippy
- Flutter analyze/test
- 测试清单一致性检查

### 13.7 Main Full Gate 内容和结果

- PR Fast Gate 全部内容
- Rust integration tests
- Flutter full app tests
- Coverage generation
- Coverage threshold check
- Test manifest completeness check

### 13.8 Gray Release Gate 内容和本地/CI 可运行状态

- Main Full Gate 全部内容
- P0/P1 SIT gate
- real api-server + MySQL + Redis
- migrations
- Rust E2EE FFI build
- P0 private text E2EE acceptance
- P1 OPK lifecycle
- P1 private multi-device fanout
- P1 group E2EE
- DB plaintext scan
- Smoke E2E for Web/Mobile/Desktop critical routes

### 13.9 web known failures 处理方式

- 直接修复这两个测试失败
- 不需要建立 allowlist

### 13.10 Rust clippy 路径修复说明

- 修复 clippy 路径问题，确保 clippy 实际执行
- 如果 crate 路径不存在，gate 应 fail，而不是 skip

### 13.11 P0/P1 SIT 串联说明

- Gray Release Gate 会调用 P0/P1 SIT gate
- P0/P1 SIT gate 需要 real api-server + MySQL + Redis

### 13.12 实际运行命令和结果

- 运行 PR Fast Gate
- 运行 manifest 检查
- 运行覆盖率生成
- 运行 Main Full Gate
- 如果 Docker/MySQL/Redis 可用，运行 Gray Release Gate

### 13.13 未运行命令及原因

- 如果 Gray Release Gate 因本地缺 Docker 或测试环境变量无法运行，必须报告为 NOT RUN

### 13.14 是否有新增测试失败

- 检查是否有新增测试失败
- 修复 web 测试失败

### 13.15 遗留问题

- 如果有任何遗留问题，必须记录

---

## 14. 总结

本设计方案建立了完整的全量测试体系和灰度发布 Gate 系统，包括：

1. **测试清单系统**：自动生成和验证测试清单
2. **四层 Gate 系统**：PR Fast、Main Full、Gray Release、Manual Diagnostic
3. **覆盖率系统**：Rust 和 Flutter 的覆盖率生成与聚合
4. **统一测试入口**：支持所有测试命令
5. **GitHub Actions 工作流**：自动化 CI/CD 流程
6. **灰度发布验收报告**：完整的报告模板
7. **web 测试失败处理**：直接修复历史失败
8. **错误处理和验证规则**：确保系统严格性和可靠性

该设计方案遵循渐进式实现策略，按阶段完成，每个阶段都有可验证的输出，确保系统质量和可靠性。
