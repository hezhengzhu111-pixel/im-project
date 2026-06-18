# 部署

本地和 CI 生命周期由 Python 入口点和 Docker Compose 驱动。从仓库根目录运行命令。

## 环境要求

- Python 3.12 或更新版本
- Docker 和 Docker Compose（用于运行时和 SIT 工作流）
- Rust 工具链（用于 Rust 构建和测试）
- Flutter SDK（用于 Flutter 构建和测试）
- Maven 或 Docker JDK 回退（用于 Spring AI 构建）
- 可选的覆盖率工具（如 `cargo-llvm-cov`，用于覆盖率门控）

## 运行时文件

默认运行时文件位于 `build/runtime/` 下：

- 环境配置文件：`build/runtime/env/local.env`
- 生成的 Compose 文件：`build/runtime/compose/docker-compose.generated.yml`
- MySQL 数据：`build/runtime/mysql`
- Redis 数据：`build/runtime/redis`
- 文件存储：`build/runtime/files`
- 运行时日志：`build/runtime/logs`

`build/runtime/env/local.env` 在缺失时从 `.env.example` 生成。

## 工作流程

初始化运行时目录、环境配置、生成的 Compose、中间件和数据库检查：

```sh
python scripts/init.py
```

仅创建运行时目录、环境配置和生成的 Compose：

```sh
python scripts/init.py --runtime-only
```

构建产物：

```sh
python scripts/build.py all
```

启动、查看和停止服务：

```sh
python scripts/start.py start
python scripts/start.py status
python scripts/start.py stop
```

通过统一测试入口运行测试：

```sh
python tests/test.py manifest
python tests/test.py pr-fast
python tests/test.py main-full
python tests/test.py coverage
python tests/test.py sit
```

`scripts/start.py` 使用现有镜像，不会触发构建。启动前会自动检查 `build/manifest.json`，如果本地缺少镜像但 `build/dist/images/` 中存在对应 tar，会自动执行 `docker load`。如需重新构建，请显式运行 `python scripts/build.py`。

## 报告

生成的报告位于 `build/reports/` 下：

- 测试入口摘要：`build/reports/test`
- 覆盖率输出：`build/reports/coverage`
- 门控摘要：`build/reports/gates`
- 清单报告：`build/reports/manifest`

不要提交 `build/reports/` 的内容。

## 清理风险

删除 `build/runtime/` 会重置本地运行时状态，移除本地 MySQL 数据、Redis 数据、上传的文件、运行时日志、生成的 Compose 和本地环境配置。普通的 init/start/test 命令不会删除运行时数据。

## 故障排除

- 如果运行时环境配置或 Compose 缺失，运行 `python scripts/init.py --runtime-only`
- 如果代码更改后服务启动失败，运行 `python scripts/build.py all`，然后 `python scripts/start.py restart`
- 如果 Docker 命令失败，确认 Docker Desktop 或 Docker 守护进程正在运行，并且 `python scripts/init.py --check-only` 通过
- 如果测试找不到报告，检查 `build/reports/` 而不是根目录的旧报告目录
- 测试和 gate 脚本位于 `tests/` 目录下（不再位于 `scripts/`），CI 统一通过 `python tests/test.py` 调用
- 测试运行在 `build/work/` 隔离副本中，不会污染 `rust/` 或 `flutter/` 源码目录
- 如果调试需要底层脚本，优先通过 `python scripts/init.py`、`python scripts/start.py` 或 `python tests/test.py` 调用
