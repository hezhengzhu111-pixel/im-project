# 部署

部署系统已收敛为一个统一入口：

```sh
python scripts/imctl.py <command> [options]
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `python scripts/imctl.py up` | 完整部署：启动服务、数据库、执行迁移 |
| `python scripts/imctl.py build` | 增量构建所有组件 |
| `python scripts/imctl.py down` | 停止所有服务 |
| `python scripts/imctl.py restart` | 重启服务 |
| `python scripts/imctl.py status` | 查看服务状态 |
| `python scripts/imctl.py logs <service>` | 查看服务日志 |
| `python scripts/imctl.py db reset --yes` | 重置数据库 |
| `python scripts/imctl.py db check` | 检查数据库状态 |
| `python scripts/imctl.py clean all` | 清理所有构建产物 |

## 配置文件系统

所有部署行为都通过配置文件控制，而不是命令行参数。

配置文件位于：`deploy/profiles/`

| Profile | 说明 |
|---|---|
| `local` | 本地开发环境（默认） |
| `sit` | SIT 测试环境 |
| `prod` | 生产环境 |

切换配置文件：

```sh
python scripts/imctl.py --profile sit up
python scripts/imctl.py --profile prod build
```

## 允许的命令行参数

只保留以下少量必要参数：

| 参数 | 说明 |
|---|---|
| `--profile` | 选择部署配置（local/sit/prod） |
| `--yes` | 自动确认危险操作 |
| `--verbose` | 输出详细信息 |
| `--dry-run` | 显示将要执行的操作，不实际执行 |
| `--env-file` | 指定环境文件 |

其他所有行为（如跳过数据库、跳过中间件、强制重建等）都应该在 profile 配置文件中设置，不作为命令行参数。

## 部署流程

### 本地开发环境

首次启动：

```sh
python scripts/imctl.py up
```

该命令会自动完成：
1. 准备 runtime 环境文件
2. 启动中间件（MySQL、Redis 等）
3. 初始化数据库并执行迁移
4. 启动应用服务
5. 等待服务就绪

日常启动：

```sh
python scripts/imctl.py up
```

### 测试环境

```sh
python scripts/imctl.py --profile sit up
```

### 生产环境

```sh
python scripts/imctl.py --profile prod build
python scripts/imctl.py --profile prod up
```

## 数据库管理

### 检查数据库状态

```sh
python scripts/imctl.py db check
```

### 重置数据库

```sh
python scripts/imctl.py db reset --yes
```

### 执行迁移

```sh
python scripts/imctl.py db migrate
```

## 构建

### 增量构建

```sh
python scripts/imctl.py build
```

### 清理后构建

```sh
python scripts/imctl.py build --clean
```

### 预览构建

```sh
python scripts/imctl.py build --dry-run
```

## 清理

### 清理所有构建产物

```sh
python scripts/imctl.py clean all --yes
```

### 清理特定目录

```sh
python scripts/imctl.py clean runtime --yes
python scripts/imctl.py clean cache
python scripts/imctl.py clean logs
```

### 清理源码污染

```sh
python scripts/imctl.py clean source-pollution
```

## 环境检查

```sh
python scripts/imctl.py doctor
```

## 目录结构说明

所有编译产物、中间文件、缓存、运行时文件都在 `build/` 目录下：

```
build/
├── cache/          # Rust、Dart、Maven 缓存
├── dist/           # 编译产物
├── logs/           # 运行时日志
├── reports/        # 构建报告
├── runtime/        # 运行时配置和数据
│   ├── compose/    # 生成的 Docker Compose 文件
│   ├── env/        # 环境配置文件
│   ├── mysql/      # MySQL 数据
│   ├── redis/      # Redis 数据
│   └── files/      # 文件存储
└── work/           # 构建工作目录
```

源码目录绝不应该出现 `target/`、`.dart_tool/`、`node_modules/` 等编译产物。

## Profile 配置文件

配置文件位于 `deploy/profiles/` 目录下，格式为 YAML：

```yaml
# 本地开发环境配置
profile: local

# 服务配置
services:
  default:
    - mysql8
    - redis
    - im-gateway
    - im-service
    - im-web

  include_ai: false

# 构建配置
build:
  docker: false
  pull: false
  parallel: true
  profile: debug

# 数据库配置
database:
  auto_init: true
  auto_migrate: true

# 健康检查
health:
  timeout: 180
  wait: true
```

## 常见问题

### 数据库重装后需要重新初始化

如果 runtime MySQL 数据目录被清空，只需运行：

```sh
python scripts/imctl.py db reset --yes
```

### 源码目录出现编译产物

检查并清理：

```sh
python scripts/imctl.py clean source-pollution
```

### 查看服务日志

```sh
python scripts/imctl.py logs im-service
python scripts/imctl.py logs im-gateway --tail 200
python scripts/imctl.py logs im-service -f  # 实时跟踪
```
