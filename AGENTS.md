# AGENTS.md — IM 项目智能体协作指南

> 本文件面向 AI 编程智能体。如果你刚接触本项目，请先通读本文件，再修改代码。

---

## 1. 项目概览

本项目是一个多平台即时通讯（IM）系统，采用多语言、多运行时架构：

- **Rust 后端服务**：核心 API 网关（`api-server`）、WebSocket 消息服务（`im-server`）以及多个共享 crate（`im-common`、E2EE、Flutter bridge 等）。
- **Flutter 客户端**：统一代码库覆盖 Web、Mobile、Desktop 三端，使用 Melos 管理 monorepo。
- **Spring AI 服务**：基于 Spring Boot 3 + Spring AI 的 AI 任务工作节点（摘要、自动回复、RAG）。
- **Admin Console（本地云端运维管理后台）**：基于 RuoYi-Vue / RuoYi-Vue3-TypeScript，配套独立的 Rust `admin-server` 管理接口服务，仅在本地部署，不常驻云端。

项目强调“源码目录只读构建产物隔离”：所有构建产物、运行时数据、缓存、日志、报告必须落在 `build/` 目录下，禁止污染源码目录。

**强制约定：所有编译、分析、测试必须通过 `scripts/imctl.py` 或 `tests/test.py` 入口执行；禁止在源码目录直接调用 `cargo`、`flutter`、`mvn` 等工具链命令。** 详见第 3 节与第 8 节。

---

## 2. 源码目录不可变性（Source Directory Immutability）

源码目录（`rust/`、`flutter/`、`spring-ai/`、`sql/`、`tests/`）必须保持只读。以下文件/目录**禁止**出现在源码目录中：

| 类别 | 禁止出现的文件/目录 |
| --- | --- |
| Rust | `target/`、`*.pdb`、`.cargo/config.toml.local`（`rust/vendor/` 为已提交的 vendored 源码，除外） |
| Flutter/Dart | `.dart_tool/`、`build/`、`pubspec.lock`、`pubspec_overrides.yaml`、`.flutter-plugins`、`.flutter-plugins-dependencies`、`ephemeral/`、`GeneratedPluginRegistrant.java`、`generated_plugin_registrant.*` |
| Java/Maven | `target/`、`*.class`、`*.jar`、`.mvn/wrapper/maven-wrapper.jar` |
| Python | `__pycache__/`、`*.pyc`、`.pytest_cache/`、`.cache/` |
| Node | `node_modules/` |
| IDE/工具 | `.idea/`、`.vscode/`、`*.iml`、`.DS_Store`、`Thumbs.db` |
| 通用 | `*.log`、`*.tar`、`*.tar.gz`、`*.zip`、`dist/`、`out/` |

所有构建产物、依赖缓存、生成文件只能出现在 `build/` 下的：`build/work/`、`build/cache/`、`build/dist/`、`build/reports/`、`build/logs/`、`build/runtime/`。

`scripts/deploy_system/source_guard.py` 是污染检测的单一来源，`scripts/deploy_system/sync_config.py` 是同步排除规则的单一来源；两者被 `scripts/imctl.py build` 和 `tests/test.py` 共同使用。

---

## 3. 禁止直接调用工具链

以下命令**禁止**在源码目录执行：

```bash
# 错误示例 — 会在 rust/ 下生成 target/
cd rust && cargo build

# 错误示例 — 会在 flutter/apps/web 下生成 .dart_tool/、build/
cd flutter/apps/web && flutter build web

# 错误示例 — 会在 spring-ai/ 下生成 target/
cd spring-ai && ./mvnw package
```

正确做法：统一走脚本入口。

```bash
# 构建所有组件（自动同步源码到 build/work/ 并设置缓存环境变量）
python scripts/imctl.py build

# 运行专项门控（同样使用 build/work/ 隔离副本）
python tests/test.py rust
python tests/test.py flutter
python tests/test.py e2ee-rust
python tests/test.py rust-bridge
python tests/test.py manifest
```

---

## 4. 关键配置文件

| 文件 | 作用 |
|---|---|
| `rust/Cargo.toml` | Rust workspace 根配置，定义所有 members 与共享依赖。 |
| `flutter/pubspec.yaml` | Flutter workspace 根配置（仅依赖 `melos`）。 |
| `flutter/melos.yaml` | Melos monorepo 脚本定义（`build:web`、`test`、`analyze` 等）。 |
| `spring-ai/pom.xml` | Spring AI Maven 构建配置，Spring Boot 3.5.14 / Spring AI 1.1.5 / Java 25。 |
| `admin-console/backend/ruoyi-vue/pom.xml` | RuoYi 后端 Maven 配置，Spring Boot 3 / JDK 17。 |
| `admin-console/frontend/ruoyi-vue3/package.json` | RuoYi 前端 npm 配置，Vue 3 / Vite / TypeScript / Element Plus。 |
| `admin-console/admin-server/Cargo.toml` | Admin Console 的 Rust 管理服务配置。 |
| `deploy/profiles/{local,sit,prod}.yml` | 部署 profile，控制服务、构建、数据库、健康检查等行为。 |
| `.env.example` | 运行时环境变量模板，由 `scripts/imctl.py` 生成到 `build/runtime/env/local.env`。 |
| `scripts/templates/docker-compose.runtime.yml` | 运行时 Docker Compose 模板，会被渲染到 `build/runtime/compose/docker-compose.generated.yml`。 |
| `build/manifest.json` | 构建清单，记录 profile、构建时间、路径、镜像 tar 路径等。 |

---

## 5. 仓库目录结构

```
new-im-project/
├── rust/                      # Rust 后端、crate、E2EE、Flutter bridge
│   ├── apps/api-server        # REST / WebSocket 网关（端口 8082）
│   ├── apps/im-server         # WebSocket 消息服务（端口 8083）
│   ├── apps/admin-server      # Admin Console Rust 管理接口
│   └── crates/                # im-common、im-e2ee-*、im-flutter-bridge
├── flutter/                   # Flutter 客户端 monorepo
│   ├── apps/web               # Web 应用
│   ├── apps/mobile            # 移动应用
│   ├── apps/desktop           # 桌面应用
│   ├── apps/android           # Android 原生相关
│   └── packages/              # core、core_flutter、ui、rust_bridge、shared_features
├── spring-ai/                 # Java AI 服务（端口 8080 容器内，宿主机 8084）
├── admin-console/             # 本地运维管理后台
│   ├── backend/ruoyi-vue      # RuoYi Spring Boot 后端
│   ├── frontend/ruoyi-vue3    # RuoYi Vue3 前端
│   ├── admin-server           # Rust 管理接口服务
│   └── docker/                # Admin Console 独立 Compose
├── sql/mysql8/                # MySQL 初始化与迁移脚本
├── scripts/                   # 生命周期脚本与部署系统
│   ├── imctl.py               # 统一部署入口
│   ├── build.py               # 兼容包装器，转发到 imctl.py build
│   ├── deploy_system/         # cli、builder、core、database、middleware、services 等模块
│   └── templates/             # Docker Compose 模板
├── tests/                     # 测试入口与测试套件
│   ├── test.py                # 统一测试入口
│   ├── common/                # gate_common、workspace、test_inventory
│   ├── gates/                 # gray gate、coverage gate、manifest check
│   ├── sit/                   # SIT 测试脚本
│   ├── p0/                    # P0 验收测试
│   ├── p1/                    # P1 阶段测试
│   └── rust、flutter、spring-ai 等专项测试目录
├── deploy/profiles/           # local / sit / prod 部署配置
├── docs/                      # 架构、部署、功能、需求文档
└── build/                     # 唯一可写工作区（详见下节）
```

---

## 6. `build/` 可写工作区

`build/` 是项目唯一允许写入生成产物的目录。源码目录（`rust/`、`flutter/`、`spring-ai/`、`sql/`）禁止出现 `target/`、`.dart_tool/`、`node_modules/`、`build/` 等构建产物；仓库已配置 `scripts/deploy_system/source_guard.py` 进行检测。

```
build/
├── cache/          # Cargo、Dart pub、Maven、Docker 缓存
│   ├── cargo-home
│   ├── cargo-target
│   ├── pub-cache
│   ├── maven-repo
│   └── docker
├── dist/           # 编译产物（Rust 二进制、Spring AI jar、Flutter web、Docker 镜像 tar）
├── logs/           # 构建与脚本日志
├── reports/        # 测试、覆盖率、门控、清单报告
├── runtime/        # 本地运行时配置与数据
│   ├── compose/    # 生成的 docker-compose.generated.yml
│   ├── env/        # 运行时 .env
│   ├── mysql/      # MySQL 数据
│   ├── redis/      # Redis 数据（主库、group-hot-*、private-hot-*）
│   ├── files/      # 本地文件存储
│   └── logs/       # 运行时日志
└── work/           # 隔离构建工作区（rust、flutter、spring-ai、sql 的副本）
```

构建和测试默认在 `build/work/` 中的源码副本上执行，避免污染源码。

---

## 7. 技术栈

### 7.1 Rust

- **版本**：Edition 2021，Rust toolchain stable。
- **Web 框架**：Axum 0.7。
- **异步运行时**：Tokio。
- **数据库**：SQLx + MySQL 8。
- **缓存 / 流**：Redis（多热库分片）。
- **E2EE**：X3DH、双棘轮、AES-GCM、ed25519/x25519-dalek。
- **安全 lint**：`api-server` 主 crate 使用 `#![forbid(unsafe_code)]`、`
#![deny(clippy::unwrap_used)]`、`
#![deny(clippy::expect_used)]`、`
#![deny(clippy::panic)]` 等严格 lint。

### 7.2 Flutter

- **SDK**：`>=3.3.0 <4.0.0`，CI 使用 Flutter 3.29。
- **状态管理**：flutter_riverpod。
- **路由**：go_router。
- **网络**：dio、web_socket_channel。
- **代码生成**：freezed、json_serializable、build_runner。
- **分析**：very_good_analysis。

### 7.3 Java / Spring

- **Spring AI 服务**：Spring Boot 3.5.14 + Spring AI 1.1.5 + Java 25。
- **Admin Console 后端**：RuoYi-Vue（Spring Boot 3 分支）+ JDK 17 + MyBatis + Druid。

### 7.4 部署与中间件

- **容器化**：Docker、Docker Compose。
- **中间件**：MySQL 8.0、Redis 7.2（主库 + 群聊热库分片 + 私聊热库分片）。
- **脚本**：Python 3.12。

---

## 8. 常用命令

所有生命周期操作都通过 `scripts/imctl.py` 和 `tests/test.py` 两个入口完成。**不要直接在源码目录执行 `cargo`/`flutter`/`mvn`。**

### 8.1 部署命令

```bash
# 完整本地部署（启动中间件 + 初始化数据库 + 启动应用服务）
python scripts/imctl.py up

# 使用指定 profile 部署
python scripts/imctl.py --profile sit up
python scripts/imctl.py --profile prod up

# 停止所有服务
python scripts/imctl.py down

# 重启服务
python scripts/imctl.py restart

# 查看状态 / 日志
python scripts/imctl.py status
python scripts/imctl.py logs im-api-server --tail 200
python scripts/imctl.py logs im-api-server -f

# 数据库管理
python scripts/imctl.py db check
python scripts/imctl.py db migrate
python scripts/imctl.py db reset --yes

# 构建
python scripts/imctl.py build
python scripts/imctl.py build --clean
python scripts/imctl.py build --dry-run

# 清理
python scripts/imctl.py clean all --yes
python scripts/imctl.py clean source-pollution

# 环境检查
python scripts/imctl.py doctor
```

### 8.2 测试命令

```bash
# PR 快速门控（Rust fmt/check/test/clippy + Flutter analyze/test）
python tests/test.py pr-fast

# 主分支完整门控（含覆盖率）
python tests/test.py main-full

# 专项门控
python tests/test.py rust
python tests/test.py flutter
python tests/test.py e2ee-rust
python tests/test.py rust-bridge
python tests/test.py coverage
python tests/test.py manifest
python tests/test.py sit

# 灰度发布门控
python tests/test.py gray-release --base-url http://localhost:8082 --db-url mysql://root:xxx@127.0.0.1:3306/service_message_service_db
```

### 8.3 Admin Console 本地开发

```bash
# Admin Console 独立启动（前端 8088 / 后端 8080 / Rust 管理 8081 / MySQL 3308 / Redis 6381）
cd admin-console/docker
cp .env.example .env
# 编辑 .env 配置云端连接
docker compose up -d

# 单独本地开发
cd admin-console/backend/ruoyi-vue && mvn spring-boot:run -pl ruoyi-admin
cd admin-console/frontend/ruoyi-vue3 && npm install && npm run dev
cd admin-console/admin-server && cargo run
```

---

## 9. 代码风格与开发约定

### 9.1 Rust

- 使用 `cargo fmt` 格式化，`cargo clippy --all-targets -- -D warnings` 作为 CI 门禁。
- `api-server` 主 crate 禁止使用 `unwrap`、`expect`、`panic`、`todo`、`unimplemented`、`unsafe`、`
clippy::as_conversions`、`indexing_slicing`。
- E2EE crate（`im-e2ee-core/src`）CI 会扫描 `.unwrap(`、`.expect(`、`unsafe`、`panic!`、`unreachable!`、`todo!`、`unimplemented!` 等禁用模式。
- 优先使用 `thiserror` / `anyhow` 进行错误处理。
- crate 间共享代码优先放入 `rust/crates/im-common`。

### 9.2 Flutter / Dart

- 使用 `dart format` 格式化；CI 中 `--set-exit-if-changed` 检查格式。
- 优先使用 `very_good_analysis` 规则集。
- 平台无关业务逻辑放在 `packages/core`，Flutter 相关实现放在 `packages/core_flutter`，UI 组件放在 `packages/ui`，Rust bridge 调用封装在 `packages/rust_bridge`。
- 业务数据层禁止直接硬编码非 `/api/` 前缀的旧路径；清单门控会扫描 `legacy` 路径引用。

### 9.3 源码污染防控

- 源码目录（`rust/`、`flutter/`、`spring-ai/`、`sql/`、`tests/`）禁止生成或保留 `target/`、`.dart_tool/`、`node_modules/`、`build/`、`dist/`、`*.log`、`*.tar`、`pubspec_overrides.yaml`、`ephemeral/` 等产物（`rust/vendor/` 为已提交的 vendored 源码，除外）。
- `scripts/deploy_system/source_guard.py` 与 `scripts/deploy_system/sync_config.py` 是污染检测与同步排除规则的单一来源。
- `python scripts/imctl.py build` 与 `python tests/test.py <gate>` 会在执行前后自动调用 `check_source_pollution()`；若检测到新增污染，门控直接失败。
- 手动清理：
  ```bash
  python scripts/imctl.py clean source-pollution
  ```
- 自查命令：
  ```bash
  python -c "from scripts.deploy_system.source_guard import check_source_pollution; check_source_pollution('.', True)"
  ```

### 9.4 环境变量与密钥

- 敏感配置通过环境变量注入，模板见 `.env.example`。
- 禁止在源码、测试报告、日志快照中硬编码 token / secret / password / API key；清单门控会扫描相关快照文件。
- Admin Console 要求本地仅监听 `127.0.0.1`，云端连接配置中的密码、私钥必须加密存储，敏感字段脱敏展示。

---

## 10. 测试策略

### 10.1 单元 / 静态检查

- **Rust**：`cargo fmt --check`、`cargo check --workspace`、`cargo test --workspace`、各 package 的 `cargo clippy -p <pkg> --all-targets -- -D warnings`。
- **Flutter**：`flutter pub get`、`flutter analyze`、`flutter test`（可选 `--coverage`）。

### 10.2 E2EE 专项

- `tests/test.py e2ee-rust`：针对 `im-e2ee-core`、`im-e2ee-ffi`、`im-e2ee-wasm` 执行 fmt、clippy、test、wasm32 target check。

### 10.3 Rust Bridge

- `tests/test.py rust-bridge`：构建并测试 `im-flutter-bridge`，并对 `flutter/packages/rust_bridge` 执行 pub get / analyze / test。

### 10.4 SIT / 灰度

- **P0 / P1 SIT**：端到端加密、多设备扇出、群 E2EE、OPK 生命周期、数据库明文扫描等。
- **Gray Release Gate**：环境预检、PR Fast、覆盖率、Main Full、SIT、Smoke、前端构建验证，最终输出 GO/NO-GO 决策报告。

### 10.5 覆盖率

- Rust 覆盖率使用 `cargo-llvm-cov`，Flutter 覆盖率使用 `--coverage` + lcov，汇总到 `build/reports/coverage/`。

---

## 11. 安全与运维注意事项

- **API 安全**：内部服务间调用使用 `IM_INTERNAL_SECRET` 签名；WebSocket 票据有 TTL。
- **E2EE 安全**：服务端只负责密钥包、OPK、Sender Key 的存储与转发，不持有私钥；数据库明文扫描是 P1 强制项。
- **Admin Console 安全**：危险写操作（禁用/解禁用户、强制下线、解散群、删除文件）必须调用云端 `api-server` 管理接口，禁止本地后台直接修改业务数据库，以避免 Redis、在线路由、缓存、E2EE、文件状态不一致。
- **Admin Console 网络**：本地后台默认只监听 `127.0.0.1`；云端 MySQL/Redis 禁止裸露公网，推荐通过 SSH Tunnel / VPN 访问。
- **SSH 命令白名单**：Admin Console 查看生产日志、机器状态时，必须预定义命令白名单，禁止前端传入任意 Shell 命令。
- **危险操作审计**：所有危险操作必须二次确认、填写原因、记录操作日志。

---

## 12. 修改代码前的检查清单

- [ ] 是否已阅读相关 `docs/*.md` 与 `AGENTS.md` 文档？
- [ ] 是否使用脚本入口进行构建与测试？（`python scripts/imctl.py build`、`python tests/test.py <gate>`）
- [ ] 是否避免直接在源码目录执行 `cargo`/`flutter`/`mvn`？
- [ ] 是否运行了对应专项测试？（`python tests/test.py rust|flutter|e2ee-rust|rust-bridge|sit`）
- [ ] 是否确认没有引入源码污染？（运行前后 `python scripts/imctl.py clean source-pollution` 应报告 0 项）
- [ ] 是否避免在源码中硬编码密钥、密码、API Key？
- [ ] 是否在 Admin Console 场景中遵循“查询直连数据库/Redis，写操作必须走云端管理接口”的原则？

---

## 13. 参考文档

- `docs/architecture.md` — 架构说明与目录布局
- `docs/deployment.md` — 部署命令与 profile 配置
- `docs/features.md` — 功能模块说明
- `docs/admin-console-requirements.md` — Admin Console 需求与安全原则
- `admin-console/README.md` — Admin Console 快速开始
- `admin-console/PROJECT_PLAN.md` — Admin Console 项目计划与阶段
