# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

- **Auto-commit after every fix**: After completing any fix or change, stage and commit with a descriptive message. Do not wait for confirmation.

## Architecture

全栈 IM（即时通讯）应用，包含端到端加密（E2EE）：

```
前端 (Vue 3 SPA + React Native)
        │
   Nginx (反向代理 :80)
        │
   ┌────┴────┐
   ▼         ▼
api-server-rs  (HTTP API + WS 网关 :8082)
   │    │
   │    ├── Redis (缓存/路由/流)
   │    ├── MySQL (持久化)
   │    └── 内嵌 Push Dispatcher ──► im-server-rs (WS 扇出 :8083)
   │
   └── Redis Stream im:ai:tasks ──► spring-ai (Java 25 LLM :8084)
```

- **`backend/`** — Rust Cargo workspace：`common`（共享类型/JWT）、`api-server-rs`（HTTP API + WS 网关 + 内嵌 Push）、`im-server-rs`（WS 扇出/在线状态，独立运行时）、`e2ee-core/ffi/wasm`（端到端加密）、`spring-ai`（Java 25 + Spring Boot + Spring AI，LLM 微服务）
- **`frontend/`** — npm workspaces monorepo：`apps/web`（Vue 3 + Vite + Pinia + Element Plus）、`apps/mobile`（React Native）、`packages/*`（共享包）
- **`scripts/`** — Python 部署和集成测试工具
- **`deploy/sit/docker-compose.yml`** — 完整 SIT 环境（MySQL、Redis、后端服务、Nginx）
- **`sql/mysql8/`** — 数据库 schema（9 个库，消息发件箱模式）

### 关键架构细节

- **消息流**：消息通过持久化发件箱（`message_outbox` 表）→ Redis Streams（`im:events`）→ 内嵌 dispatcher → `im-server-rs` → WebSocket 推送到用户
- **AI 路径**：前端 → api-server-rs（快速：验证/加密/缓存）→ Redis Stream（`im:ai:tasks`）→ spring-ai（慢速：LLM 调用/流式/RAG）→ Pub/Sub 流式块 → SSE 前端；同时 HMAC 回调注入 MessageDto → 正常推送流
- **Redis 分片**：私聊/群聊热数据可分片（`IM_PRIVATE_HOT_SHARDS` / `IM_GROUP_HOT_SHARDS`），其他 Redis 用途共享单实例
- **im-server-rs 不使用 workspace dependencies** — 其 `Cargo.toml` 独立锁定版本。给 im-server-rs 添加依赖时直接加在其 Cargo.toml，不要加在 workspace 表中
- **WebSocket 网关**：基于 ticket 的认证，im-server 实例注册在 Redis 路由表中，dispatcher 通过路由表查找目标节点进行精确推送
- **BYOK**：用户 API key 由 Rust 在 MySQL 中使用 AES-256-GCM 加密存储，仅由 Spring AI 在内存中按需解密，调用完成后丢弃

## Commands

### Frontend（从 `frontend/` 运行）

| 命令 | 说明 |
|------|------|
| `npm install` | 安装所有 workspace 依赖 |
| `npm run web:dev` | Web 开发服务器（端口 3000） |
| `npm run web:build` | 生产构建（typecheck → Vite 构建） |
| `npm run typecheck` | 检查所有包和应用的类型 |
| `npm run web:lint` | ESLint 自动修复 |
| `npm run web:lint:check` | ESLint 仅检查（CI 安全） |
| `npm run test` | 运行所有 workspace 测试 |
| `npm run test --workspace=@im/shared-im-core` | 运行单个包测试 |

### Backend Rust（从 `backend/` 运行）

| 命令 | 说明 |
|------|------|
| `cargo build -p api-server-rs` | 构建 API 服务器 |
| `cargo build -p im-server-rs` | 构建 IM 服务器 |
| `cargo build --workspace` | 构建所有 crate |
| `cargo test -p api-server-rs` | 运行 api-server 测试 |
| `cargo fmt --check` | 格式检查 |
| `cargo clippy -- -D warnings` | **质量门** — 必须零警告通过 |

### Backend Spring AI（从 `backend/spring-ai/` 运行，需要 JDK 25 + Maven）

| 命令 | 说明 |
|------|------|
| `mvn compile` | 编译 Java 源码 |
| `mvn package -DskipTests` | 构建 fat jar |
| `mvn test` | 运行 JUnit 测试 |
| `./mvnw compile` | 使用 Maven Wrapper 构建 |

### 部署（从仓库根目录运行）

```bash
python scripts/deploy_middleware.py    # 启动 MySQL + Redis + 文件卷
python scripts/init_db.py --full       # 初始化数据库（首次或 schema 变更）
python scripts/deploy_services.py      # 构建并启动所有 4 个服务
python scripts/deploy_services.py api  # 部署单个服务
python scripts/test.py                 # 运行集成测试套件
```

## Rust 编码规则（编译强制）

所有 crate 在 `main.rs` / `lib.rs` 顶部共享这些 lint 属性，**违反则无法编译**：

| Lint | 禁止内容 |
|------|---------|
| `#![forbid(unsafe_code)]` | `unsafe` 块/函数/trait |
| `#![deny(clippy::unwrap_used)]` | `.unwrap()` |
| `#![deny(clippy::expect_used)]` | `.expect()` |
| `#![deny(clippy::indexing_slicing)]` | 直接数组索引 `arr[i]` |
| `#![deny(clippy::panic)]` | `panic!()`、`todo!()`、`unimplemented!()` |
| `#![deny(clippy::as_conversions)]` | `as` 类型转换（使用 `From`/`TryFrom`） |
| `#![deny(unused_must_use)]` | 未消费的 `Result` 和 `Option` |

- 只能使用 **stable Rust**，不得使用 `#![feature(...)]`
- 所有错误必须通过 `?` 传播或显式处理
- 整数运算优先使用 `checked_*`、`saturating_*`、`wrapping_*`

## 关键注意事项

- **SCSS 自动导入**：每个 `.vue` `<style lang="scss">` 自动注入 `@use "@/styles/variables.scss" as *;`，不要手动添加该导入
- **前端构建目标为 `es2020`**：不要使用 ES2021+ 语法
- **im-server 运行时需要 OpenSSL**：其 Dockerfile 安装 `libssl3`，api-server-rs 不需要
- **Docker 镜像使用中国镜像源**：基础镜像前缀 `docker.m.daocloud.io/library/`
- **前端开发代理**：目标由 `VITE_GATEWAY_HOST` / `VITE_GATEWAY_PORT` 环境变量控制（在 `frontend/.env.*` 文件中）
- **生成的文件不要编辑**：`auto-imports.d.ts`、`components.d.ts`、`dist/`、`target/`

## 参考文档

- `AGENTS.md` — 完整的工作流、架构、命令参考和本地开发环境设置
- `backend/API.md` — API 端点文档和运行时拓扑
- `frontend/README.md` — 前端 workspace 结构和包依赖图
- `frontend/apps/mobile/README.md` — 移动端文档
- `backend/e2ee-core/README.md` — E2EE 核心库文档
