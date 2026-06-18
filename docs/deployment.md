# 部署

部署系统已收敛为一个统一入口：

```sh
python scripts/imctl.py <command>
```

旧入口仍然保留兼容：

```sh
python scripts/init.py
python scripts/start.py start
python scripts/deploy_middleware.py
python scripts/deploy_services.py
python scripts/init_db.py check
```

这些旧脚本现在只是 `imctl.py` 的适配层，新的部署逻辑位于 `scripts/deploy_system/`。

## 一键流程

本地或 SIT 环境常用命令：

```sh
python scripts/imctl.py up
```

该命令会按顺序完成：

1. 生成 `build/runtime/env/local.env` 和 `build/runtime/compose/docker-compose.generated.yml`
2. 启动并等待 MySQL、Redis、文件初始化容器
3. 对 MySQL 执行幂等数据库初始化
4. 执行迁移 SQL
5. 启动应用服务
6. 并发等待应用服务就绪

默认应用服务包括：

- `im-server`
- `im-api-server`
- `im-frontend`

如需启动 AI 服务：

```sh
python scripts/imctl.py up --include-ai
```

或：

```sh
python scripts/imctl.py up all --include-ai
```

## 数据库

数据库初始化不再只是检查 SQL 文件。新流程会连接 MySQL，并检查 `sql/mysql8/init_all.sql` 中声明的数据库是否存在、是否已有业务表。

幂等初始化：

```sh
python scripts/imctl.py db ensure
```

行为：

- MySQL 不存在时先启动 `im-mysql`
- 缺库时导入 `sql/mysql8/init_all.sql`
- 已有库但没有业务表时导入 `sql/mysql8/init_all.sql`
- 默认继续执行 `sql/mysql8/e2ee_migration.sql`

仅检查：

```sh
python scripts/imctl.py db check
```

仅迁移：

```sh
python scripts/imctl.py db migrate
```

强制重置：

```sh
python scripts/imctl.py db reset --yes
```

## 中间件

```sh
python scripts/imctl.py middleware up
python scripts/imctl.py middleware status
python scripts/imctl.py middleware down
```

中间件就绪等待已经改为并发等待。`im-files-init` 这类一次性容器会等待退出码为 0，MySQL/Redis 等长驻服务会等待健康状态或运行状态。

## 构建

默认构建为增量构建，不再默认清空 `build/work`、`build/dist`、`build/logs`：

```sh
python scripts/imctl.py build
```

需要清理时显式指定：

```sh
python scripts/imctl.py build --clean
```

构建 Docker 镜像：

```sh
python scripts/imctl.py build --docker
```

构建并额外导出离线镜像 tar：

```sh
python scripts/imctl.py build --docker --package-images
```

构建阶段会并行执行相互独立的 Rust 后端和 Spring AI 构建；Docker 镜像构建使用 Compose 的 parallel build。镜像 tar 不再默认生成，避免本地部署时浪费大量 IO。

## 服务管理

```sh
python scripts/imctl.py status
python scripts/imctl.py logs api
python scripts/imctl.py restart api
python scripts/imctl.py down
```

服务别名：

| 别名 | 实际服务 |
|---|---|
| `api`, `gateway` | `im-api-server` |
| `im`, `chat` | `im-server` |
| `web`, `frontend`, `front` | `im-frontend` |
| `ai`, `spring-ai` | `im-spring-ai` |

服务组：

| 组 | 服务 |
|---|---|
| `default` | `im-server`, `im-api-server`, `im-frontend` |
| `backend`, `core` | `im-server`, `im-api-server` |
| `all` | 默认服务 + `im-spring-ai` |

## Runtime 文件

默认运行时文件位于 `build/runtime/`：

- 环境配置文件：`build/runtime/env/local.env`
- 生成的 Compose 文件：`build/runtime/compose/docker-compose.generated.yml`
- MySQL 数据：`build/runtime/mysql`
- Redis 数据：`build/runtime/redis`
- 文件存储：`build/runtime/files`
- 运行时日志：`build/runtime/logs`

只生成 runtime 文件：

```sh
python scripts/imctl.py runtime ensure
```

清理 runtime：

```sh
python scripts/imctl.py clean runtime --yes
```

## 兼容旧命令

旧命令映射如下：

| 旧命令 | 新命令 |
|---|---|
| `python scripts/init.py` | `python scripts/imctl.py init` |
| `python scripts/init.py --runtime-only` | `python scripts/imctl.py runtime ensure` |
| `python scripts/init.py --middleware-only` | `python scripts/imctl.py middleware up` |
| `python scripts/init.py --db-only` | `python scripts/imctl.py db ensure` |
| `python scripts/init_db.py check` | `python scripts/imctl.py db check` |
| `python scripts/init_db.py full --yes` | `python scripts/imctl.py db reset --yes` |
| `python scripts/start.py start` | `python scripts/imctl.py up` |
| `python scripts/start.py status` | `python scripts/imctl.py status` |
| `python scripts/start.py stop` | `python scripts/imctl.py down` |

## 推荐工作流

首次启动：

```sh
python scripts/imctl.py up --build
```

日常启动：

```sh
python scripts/imctl.py up
```

代码变更后重新构建并启动：

```sh
python scripts/imctl.py build --docker
python scripts/imctl.py up
```

数据库重装或 runtime MySQL 被清空后：

```sh
python scripts/imctl.py db ensure
python scripts/imctl.py up
```
