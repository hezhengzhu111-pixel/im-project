# 架构

本仓库围绕四个源码区域和一个生成工作区组织。

## 根目录布局

- `flutter/`：Flutter 应用程序和共享包
- `rust/`：Rust 后端服务、共享 crate、E2EE crate 和 Flutter bridge crate
- `spring-ai/`：Spring AI 服务
- `sql/`：SQL 初始化和迁移脚本
- `scripts/`：生命周期命令和兼容性 helper
- `tests/`：统一测试入口和测试套件
- `docs/`：最终项目文档
- `build/`：唯一可写的本地状态工作区

## 可写工作区

`build/` 是唯一应该写入生成的构建产物、运行时数据、报告和本地缓存的地方。

- `build/work/`：从源码目录复制的隔离构建工作区
- `build/cache/`：依赖和工具缓存（Cargo、Flutter pub、Maven、Docker 配置等）
- `build/dist/`：最终构建输出和导出的镜像
- `build/runtime/`：本地运行时配置、Docker Compose 输出、中间件数据、文件存储和日志
- `build/reports/`：测试、覆盖率、门控和清单报告
- `build/logs/`：构建和脚本日志

源码目录不应接收构建产物、依赖缓存、运行时数据、覆盖率输出或测试报告。

## 隔离构建

`python scripts/build.py` 从 `build/work/` 构建，并将依赖保存在 `build/cache/` 中。

- Rust 构建使用 `build/cache/rust-target` 而不是 `rust/target`
- Flutter 构建使用隔离的工作路径和 `build/cache/pub-cache`
- Spring AI 构建使用隔离的工作路径和 `build/cache/maven-repo`
- 最终产物进入 `build/dist/`
- 构建清单为 `build/manifest.json`

## 运行时

`python scripts/imctl.py up` 自动完成运行时准备、中间件启动、数据库初始化和应用启动。

运行时 Compose 模板位于 `scripts/templates/docker-compose.runtime.yml`，生成后输出到 `build/runtime/compose/docker-compose.generated.yml`。

- 环境配置：`build/runtime/env/local.env`
- 生成的 Compose：`build/runtime/compose/docker-compose.generated.yml`
- MySQL 数据：`build/runtime/mysql`
- Redis 数据：`build/runtime/redis/main`、`build/runtime/redis/group-hot-*`、`build/runtime/redis/private-hot-*`
- 文件存储：`build/runtime/files`
- 运行时日志：`build/runtime/logs`

## 生命周期入口

使用以下命令作为公共生命周期接口：

- `python scripts/imctl.py up` - 完整部署
- `python scripts/imctl.py build` - 构建
- `python scripts/imctl.py down` - 停止服务
- `python tests/test.py` - 运行测试

`scripts/deploy_system/` 中的模块提供核心功能：
- `cli.py`：命令行接口
- `core.py`：运行时管理
- `builder.py`：构建系统
- `database.py`：数据库管理
- `middleware.py`：中间件管理
- `services.py`：服务管理
- `profile.py`：配置文件管理
- `paths.py`：路径定义

`tests/` 目录下的辅助模块：
- `tests/common/gate_common.py`：共享测试 gate helpers（StepResult、run_step 等）
- `tests/common/workspace.py`：工作区同步逻辑（与 build.py 共享排除规则）
- `tests/common/test_inventory.py`：测试清单生成
- `tests/gates/`：gray gate、coverage gate、manifest check 等
- `tests/sit/`：SIT 测试脚本
- `tests/coverage/`：Rust/Flutter 覆盖率工具

## 镜像名

`build.py` 和 `start.py` 使用一致的 Docker 镜像名：`im-project-sit/{service}:latest`。
runtime compose 模板使用同一组镜像名。
`start.py start/restart` 会尝试从 `build/manifest.json` 加载 `build/dist/images/` 中的镜像 tar。
