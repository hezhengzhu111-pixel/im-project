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

`python scripts/init.py` 在 `build/runtime/` 下准备运行时状态。

- 环境配置：`build/runtime/env/local.env`
- 生成的 Compose：`build/runtime/compose/docker-compose.generated.yml`
- MySQL 数据：`build/runtime/mysql`
- Redis 数据：`build/runtime/redis`
- 文件存储：`build/runtime/files`
- 运行时日志：`build/runtime/logs`

## 生命周期入口

使用以下命令作为公共生命周期接口：

- `python scripts/init.py`
- `python scripts/build.py`
- `python scripts/start.py`
- `python tests/test.py`

`scripts/` 中的 helper 模块（如 `deploy_middleware.py`、`deploy_services.py`、`init_db.py`、`gate_common.py`、`runtime_paths.py` 和 `coverage/`）支持这些入口点，但不建议直接调用。
