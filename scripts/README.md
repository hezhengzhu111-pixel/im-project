# Scripts 使用说明

## 概览
本目录包含统一后的部署、测试与数据库初始化脚本，所有脚本均支持 `--help` 与 `--version`。

## 脚本清单
- deploy_linux_middleware.py
- deploy_linux_project.py
- deploy_win_middleware.py
- deploy_win_project.py
- run_all_tests.py（仓库根目录）
- git_commit.py
- init_mysql.py
- stop_all.ps1

## 使用示例
### Linux 中间件部署
```bash
python3 scripts/deploy_linux_middleware.py --host 127.0.0.1 --data-dir /home/data --log-dir /home/new-im-project/logs
```

### Linux 项目部署
```bash
python3 scripts/deploy_linux_project.py --repo https://gitee.com/myhzz/new-im-project.git --branch master --dir /home/new-im-project
```

### Windows 中间件部署
```powershell
python scripts\deploy_win_middleware.py --data-dir C:\im-data --log-dir C:\im-logs
```

### Windows 项目部署
```powershell
python scripts\deploy_win_project.py --repo https://gitee.com/myhzz/new-im-project.git --branch master --dir C:\new-im-project
```

### 统一测试
```bash
python3 run_all_tests.py --config test_config.yaml
```

### MySQL 初始化
```bash
python3 scripts/init_mysql.py --config db/config.ini --sql-dir sql
```

### Git 提交
```bash
python3 scripts/git_commit.py
```

## 异常代码表
- 1: 参数或环境异常
- 2: 外部命令执行失败
- 3: 依赖服务未就绪
