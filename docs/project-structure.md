# 项目结构与 Build 契约

本文档描述项目的目录结构规则、build/ 工作区契约和后续迁移计划。

## 1. 最终目标根目录结构

项目重构完成后，根目录将只保留以下主要目录：

```
.
├── flutter/          # Flutter 前端源码（只读）
├── rust/             # Rust 后端源码（只读）
├── spring-ai/        # Spring AI 服务源码（只读）
├── sql/              # 数据库迁移脚本（只读）
├── scripts/          # 构建、部署和运维脚本
├── tests/            # 集成测试和端到端测试
├── docs/             # 项目文档
├── build/            # 唯一可写工作区
├── .github/          # GitHub Actions 配置
├── .gitignore        # Git 忽略规则
└── .gitattributes    # Git 属性配置
```

**注意：** 项目完成迁移后，根目录将不再有：
- `backend/` (已迁移至 `spring-ai/`)
- `deploy/` (已迁移至 `scripts/`)
- `artifacts/` (已迁移至 `build/dist/`)
- `docker-compose.sit.yml` (已迁移至 `build/runtime/`)

## 2. 源码目录只读规则

### 规则

源码目录（`flutter/`、`rust/`、`spring-ai/`、`sql/`）遵循以下原则：

1. **不得在源码目录产生构建产物**（.class、.dex、.wasm、编译目标文件等）
2. **不得在源码目录存储依赖缓存**（.dart_tool/、target/、.m2/ 等）
3. **不得在源码目录存储运行时数据**（日志、缓存、数据库文件等）
4. **不得在源码目录存储测试报告**（覆盖率、测试结果等）
5. **不得在源码目录存储镜像或打包产物**（Docker tar、APK、JAR 等）

### 违规处理

如果在源码目录发现上述产物，必须：
1. 立即将其移动到 `build/` 对应子目录
2. 更新相应的 `.gitignore` 规则
3. 清理源码目录中的残留文件

## 3. Build/ 唯一可写工作区契约

### 核心原则

`build/` 是项目中**唯一允许产生构建产物和运行时数据的工作区**。

所有以下类型的内容**必须**存储在 `build/` 中：
- ✅ 编译产物（.class、.dex、.wasm、Rust target）
- ✅ 依赖缓存（Cargo、Flutter pub、Maven .m2）
- ✅ 运行时数据（Redis AOF、PostgreSQL、Docker volumes）
- ✅ 中间件数据（消息队列、配置文件）
- ✅ 日志文件（脚本日志、应用日志）
- ✅ 测试报告（覆盖率、测试结果、Gate 判定报告）
- ✅ 镜像导出（Docker tar、OCI image）
- ✅ 构建 manifest（依赖关系、构建参数、产物清单）

### 不允许存储的内容

- ❌ 源代码或源码配置文件
- ❌ 版本控制数据（.git 目录）
- ❌ 环境变量文件（.env、.env.local 等）—— 这些应在根目录

## 4. Build/ 子目录结构

```
build/
├── cache/                # 依赖缓存和工具链缓存
│   ├── cargo-home/       # Cargo 和 Rust 依赖缓存
│   ├── rust-target/      # Rust 编译目标缓存
│   ├── pub-cache/        # Flutter pub 缓存
│   ├── maven-repo/       # Maven 和 Spring 依赖缓存 (.m2)
│   ├── docker/           # Docker 层缓存和镜像构建缓存
│   └── tools/            # 构建工具和运行时缓存
├── work/                 # 隔离构建工作区（每个构建任务独立）
│   ├── flutter/          # Flutter 构建工作区
│   ├── rust/             # Rust 构建目标和中间文件
│   ├── spring-ai/        # Spring 构建工作区
│   └── sql/              # SQL 迁移和验证工作区
├── dist/                 # 最终产物和发布物
│   ├── frontend/         # Flutter Web、Desktop、Mobile 打包产物
│   ├── rust/             # Rust 二进制和库文件
│   ├── spring-ai/        # Spring JAR 和可执行文件
│   └── images/           # Docker 镜像导出（tar 格式）
├── runtime/              # 本地运行时和中间件数据
│   ├── env/              # 环境配置文件
│   ├── compose/          # Docker Compose 配置
│   ├── mysql/            # MySQL 数据目录
│   ├── redis/            # Redis 数据目录和 AOF
│   ├── files/            # 文件存储数据
│   └── logs/             # 运行时日志
├── reports/              # 测试、覆盖率和质量报告
│   ├── test/             # 单元测试和集成测试结果
│   ├── coverage/         # 代码覆盖率报告
│   ├── gates/            # Gate 判定和质量门禁报告
│   └── manifest/         # 构建 manifest 和依赖关系报告
└── logs/                 # 脚本和构建日志
```

### 4.1 cache/ - 依赖缓存

存储所有语言和工具的依赖缓存，避免重复下载。

| 子目录 | 内容 | 示例 |
|-------|------|------|
| `cargo-home/` | Cargo 和 Rust 依赖 | `~/.cargo` 的子集 |
| `rust-target/` | Rust 编译目标缓存 | `target/` 缓存 |
| `pub-cache/` | Flutter pub 缓存 | `~/.pub-cache` 的子集 |
| `maven-repo/` | Maven 依赖缓存 | `.m2/repository` |
| `docker/` | Docker 层缓存 | 构建上下文缓存 |
| `tools/` | 工具链缓存 | `rustup`、`flutter` SDK 缓存 |

**注意：** 使用环境变量重定向依赖管理器：
- `CARGO_HOME=build/cache/cargo-home`
- `PUB_CACHE=build/cache/pub-cache`
- `MAVEN_OPTS=-Dmaven.repo.local=build/cache/maven-repo/repository`

### 4.2 work/ - 隔离构建工作区

为每个构建任务提供隔离的临时工作区，避免构建冲突。

| 子目录 | 内容 | 说明 |
|-------|------|------|
| `flutter/` | Flutter 构建工作区 | `.dart_tool`、`.flutter-plugins` 等 |
| `rust/` | Rust 目标文件和中间编译文件 | `target/` 的隔离副本 |
| `spring-ai/` | Spring 构建工作区 | `target/`、`.mvn` 等 |
| `sql/` | SQL 迁移和验证 | 数据库脚本测试工作区 |

**清理策略：** 每次完整构建前清理 `work/`，确保干净构建。

### 4.3 dist/ - 最终产物

存储所有构建完成的最终产物和发布物。

| 子目录 | 内容 | 格式 |
|-------|------|------|
| `frontend/` | Flutter 打包产物 | `.wasm`、`.apk`、`.ipa`、`.exe` |
| `rust/` | Rust 二进制和库文件 | `.exe`、`.dll`、`.so` |
| `spring-ai/` | Spring JAR 和可执行文件 | `.jar`、可执行 JAR |
| `images/` | Docker 镜像导出 | `.tar`、OCI image |

### 4.4 runtime/ - 本地运行时

存储本地开发和测试所需的运行时数据。

| 子目录 | 内容 | 说明 |
|-------|------|------|
| `env/` | 环境配置文件 | 环境变量和配置 |
| `compose/` | Docker Compose 配置 | 运行时配置文件 |
| `mysql/` | MySQL 数据 | 数据目录和备份 |
| `redis/` | Redis 数据和 AOF | 持久化存储 |
| `files/` | 文件存储数据 | 上传文件存储 |
| `logs/` | 运行时日志 | 服务运行日志 |

**注意：** 运行时数据不应提交到 Git（已被 .gitignore 忽略）。

### 4.5 reports/ - 测试和质量报告

存储所有测试结果、覆盖率和质量门禁报告。

| 子目录 | 内容 | 格式 |
|-------|------|------|
| `test/` | 测试结果 | JUnit XML、HTML 报告 |
| `coverage/` | 覆盖率报告 | HTML、LCOV |
| `gate/` | Gate 判定 | JSON、Markdown 报告 |
| `manifest/` | 构建 manifest | 依赖关系、构建参数 |

### 4.6 logs/ - 日志和状态

存储脚本、构建和部署过程的日志和状态文件。

| 子目录 | 内容 | 说明 |
|-------|------|------|
| `scripts/` | 脚本执行日志 | 脚本运行日志 |
| `build/` | 构建过程日志 | 构建详细日志 |
| `deploy/` | 部署过程日志 | 部署详细日志 |

### 4.7 manifest.json - 构建 manifest

项目级构建 manifest 文件，记录：
- 构建时间和环境信息
- 各组件版本和依赖关系
- 构建参数和配置
- 产物清单和校验和

```json
{
  "version": "1.0",
  "buildTime": "2026-06-18T14:30:00Z",
  "components": {
    "rust": { "version": "1.0.0", "commit": "abc123" },
    "flutter": { "version": "3.10.0", "commit": "def456" },
    "spring-ai": { "version": "2.0.0", "commit": "ghi789" }
  },
  "artifacts": {
    "rust": [
      "build/dist/rust/api-server/api-server.exe",
      "build/dist/rust/im-server/im-server.exe",
      "build/dist/rust/rust-bridge/im_rust_bridge.dll"
    ],
    "flutter": ["build/dist/frontend/web/index.html"],
    "spring-ai": ["build/dist/spring-ai/spring-ai-im-0.1.0.jar"]
  }
}
```

## 5. 后续迁移计划（Batch 3 - Batch 6）

本阶段（Batch 1 和 Batch 2）已完成规则建立、契约制定和根目录清理。后续批次将进行实际迁移：

### 第 3 批：Phase 4 - 完成隔离工作区构建 ✅ 已完成

**目标：**
- ✅ 完成隔离工作区构建
- ✅ 所有编译在 `build/work/` 下进行
- ✅ 依赖缓存进 `build/cache/`
- ✅ 最终产物进 `build/dist/`

**改动范围：**
- ✅ 实现完整的 build/work 隔离构建
- ✅ 更新 scripts/build.py 以使用隔离工作区
- ✅ 配置依赖缓存路径
- ✅ 不改动业务代码和部署逻辑

### 第 4 批：Phase 5 - 迁移中间件和 runtime

**目标：**
- 迁移中间件配置到 `build/runtime/`
- 生成默认运行时配置（MySQL、Redis、文件存储）
- 更新所有配置文件中的路径引用
- 验证本地开发环境启动

**改动范围：**
- 移动和重构配置文件
- 创建运行时初始化脚本
- 更新部署脚本中的路径引用
- 不改动中间件配置参数

### 第 5 批：Phase 6 + Phase 7 - 迁移 tests 和 docs / CI

**目标：**
- 迁移 `tests/` 到统一的测试目录结构
- 整理 `docs/` 结构，创建清晰的文档入口
- 更新 CI 配置以使用新的目录结构
- 验证所有测试套件和 CI 完整运行

**改动范围：**
- 重组测试目录结构
- 更新 pytest、cargo test 配置
- 创建文档索引和导航
- 更新 GitHub Actions 配置
- 不改动测试逻辑和 CI 触发条件

### 第 6 批：Phase 8 - 删除遗留内容

**目标：**
- 清理根目录中的旧目录和文件
- 更新 `.gitignore` 和相关配置
- 最终验证所有功能正常
- 更新项目文档和变更日志

**改动范围：**
- 删除迁移后的旧目录
- 更新根目录配置文件
- 验证完整开发和部署流程
- 创建迁移完成报告

## 6. 验证清单

本阶段完成后，必须验证以下内容：

- [ ] `build/` 已在 `.gitignore` 中明确忽略
- [ ] `.gitignore` 无重复规则
- [ ] 新文档已创建并描述了项目结构规则
- [ ] 新文档已描述 build/ 契约和各子目录用途
- [ ] 新文档已列出后续六批迁移计划
- [ ] 现有业务代码、构建逻辑、部署逻辑、测试逻辑未改变
- [ ] `git diff` 中没有大规模源码移动
- [ ] `git status` 中没有 `build/` 下的任何文件
- [ ] 源码目录没有构建产物或运行时数据

## 7. 快速参考

### 常用命令

```bash
# 清理构建工作区
rm -rf build/work/*

# 运行隔离构建
CARGO_HOME=build/cache/cargo-home CARGO_TARGET_DIR=build/cache/rust-target cargo build

# 查看构建 manifest
cat build/manifest.json | jq .

# 检查源码目录是否有违规文件
find flutter/ rust/ spring-ai/ sql/ \
  \( -name "*.class" -o -name "*.dex" -o -name "*.wasm" -o -name "target" \) \
  -print
```

### 环境变量

```bash
# 依赖缓存重定向
export CARGO_HOME=build/cache/cargo-home
export CARGO_TARGET_DIR=build/cache/rust-target
export PUB_CACHE=build/cache/pub-cache
export MAVEN_OPTS="-Dmaven.repo.local=build/cache/maven-repo/repository"

# 构建目录配置
export BUILD_WORK_DIR=build/work
export BUILD_DIST_DIR=build/dist
export BUILD_REPORTS_DIR=build/reports
```

---

## 8. 当前项目状态 (Batch 2 完成后)

### 目录结构

当前项目已完成 Batch 1 和 Batch 2 的迁移，根目录结构如下：

```
.
├── flutter/          # Flutter 前端源码（只读）✅
├── rust/             # Rust 后端源码（只读）✅
├── spring-ai/        # Spring AI 服务源码（只读）✅ 已从 backend/ 迁移
├── sql/              # 数据库迁移脚本（只读）✅
├── scripts/          # 构建、部署和运维脚本 ✅
│   ├── init.py       # 项目初始化入口 ✅ NEW
│   ├── build.py      # 编译和打包入口 ✅
│   └── start.py      # 服务启动入口 ✅ NEW
├── tests/            # 集成测试和端到端测试
├── docs/             # 项目文档
├── build/            # 唯一可写工作区 ✅
├── .github/          # GitHub Actions 配置
├── .gitignore        # Git 忽略规则
└── .gitattributes    # Git 属性配置
```

**已完成的迁移：**
- ✅ `backend/spring-ai/` → `spring-ai/`
- ✅ `backend/` 已删除（迁移后为空）
- ✅ 根目录 wrapper 脚本已删除：
  - `deploy.py`
  - `1_deploy_middleware.py`
  - `2_init_db.py`
  - `3_deploy_services.py`
- ✅ 三个主要生命周期入口已创建

### 生命周期入口脚本

现在项目有三个主要的生命周期入口脚本，所有操作都应通过这些脚本进行：

#### 1. scripts/init.py - 项目初始化

**职责：**
- 环境检查（Docker、Docker Compose、必要工具）
- build/ 标准目录结构初始化
- 中间件准备（MySQL、Redis 等）
- 数据库初始化或检查

**不负责：**
- 编译业务代码（由 build.py 负责）
- 启动完整业务项目（由 start.py 负责）

**常用命令：**
```bash
# 检查环境（仅检查，不执行操作）
python scripts/init.py --check-only

# 完整初始化（推荐首次使用）
python scripts/init.py

# 初始化但跳过中间件
python scripts/init.py --skip-middleware

# 初始化但跳过数据库检查
python scripts/init.py --skip-db

# 强制重建中间件容器
python scripts/init.py --force-recreate
```

#### 2. scripts/build.py - 编译和打包

**职责：**
- 编译 Flutter Web 应用
- 编译 Rust 后端服务
- 构建 Docker 镜像
- 生成构建 manifest

**不负责：**
- 环境初始化（由 init.py 负责）
- 启动服务（由 start.py 负责）

**常用命令：**
```bash
# 构建所有组件
python scripts/build.py all

# 仅构建 Rust 服务
python scripts/build.py rust

# 仅构建 Flutter Web
python scripts/build.py web

# 构建 Docker 镜像
python scripts/build.py docker-images

# 清理构建目录
python scripts/build.py clean
```

#### 3. scripts/start.py - 服务管理

**职责：**
- 启动所有服务或指定服务
- 查看服务状态
- 停止服务
- 重启服务
- 查看服务日志

**不负责：**
- 编译业务代码（由 build.py 负责）
- 环境初始化（由 init.py 负责）

**常用命令：**
```bash
# 启动所有服务
python scripts/start.py start

# 启动指定服务
python scripts/start.py start im-server im-api-server

# 查看服务状态
python scripts/start.py status

# 停止所有服务
python scripts/start.py stop

# 重启所有服务
python scripts/start.py restart

# 查看服务日志
python scripts/start.py logs im-server

# 实时跟踪日志
python scripts/start.py logs im-server --follow
```

### 推荐工作流程

#### 首次设置
```bash
# 1. 初始化环境和基础设施
python scripts/init.py

# 2. 构建项目
python scripts/build.py all

# 3. 启动服务
python scripts/start.py start
```

#### 日常开发
```bash
# 查看服务状态
python scripts/start.py status

# 重启特定服务（修改代码后）
python scripts/start.py restart im-server

# 查看日志调试
python scripts/start.py logs im-server --follow

# 停止所有服务
python scripts/start.py stop
```

#### 重新构建
```bash
# 清理并重新构建
python scripts/build.py clean
python scripts/build.py all

# 重启服务
python scripts/start.py restart
```

### 已删除的旧入口

以下根目录 wrapper 脚本已删除，其功能已整合到新的生命周期入口：

| 旧脚本 | 新入口 | 说明 |
|-------|-------|------|
| `deploy.py` | `scripts/deploy.py` | 底层部署工具（不建议直接调用） |
| `1_deploy_middleware.py` | `scripts/init.py` | 中间件初始化已整合到 init.py |
| `2_init_db.py` | `scripts/init.py` | 数据库检查已整合到 init.py |
| `3_deploy_services.py` | `scripts/start.py` | 服务启动已整合到 start.py |

**注意：** `scripts/deploy.py`、`scripts/deploy_middleware.py`、`scripts/init_db.py`、`scripts/deploy_services.py` 仍然存在并可用，但建议通过新的入口脚本调用。

### 迁移进度

- ✅ **Batch 1:** 建立规则和 build/ 契约（已完成）
- ✅ **Batch 2:** 迁移 spring-ai 和 scripts 入口（已完成）
- ⏳ **Batch 3:** 迁移 runtime/ 和中间件配置（待完成）
- ⏳ **Batch 4:** 迁移 tests/ 和测试配置（待完成）
- ⏳ **Batch 5:** 迁移 docs/ 和文档结构（待完成）
- ⏳ **Batch 6:** 更新 CI/CD 和 GitHub Actions（待完成）
- ⏳ **Batch 7:** 清理和验证（待完成）

---

**最后更新：** 2026-06-18
**维护者：** IM Developer
**版本：** 2.0 (Batch 2 - Phase 2 + Phase 3)
