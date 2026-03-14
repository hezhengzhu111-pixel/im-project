# Scripts 使用说明

## 概览
当前仅保留两个 Python 部署脚本，并将 Docker 编排拆分为两个目录：
- `deploy/middleware`：中间件编排
- `deploy/services`：业务服务编排

## 脚本清单
- deploy_middleware.py
- deploy_services.py

## 使用示例
### 部署中间件
```bash
python scripts/deploy_middleware.py --clean
```

### 部署服务（不初始化数据库）
```bash
python scripts/deploy_services.py
```

### 部署服务（初始化数据库）
```bash
python scripts/deploy_services.py --init-db
```
