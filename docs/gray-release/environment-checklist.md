# Gray Release Environment Checklist

## 概述

本清单列出灰度发布前环境准备的所有检查项。所有检查项必须在发布前完成。

---

## 1. 基础设施检查

### 1.1 API Server

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 1.1.1 | API Server 已部署到灰度环境 | | | |
| 1.1.2 | API Server 版本与候选 commit 一致 | | | |
| 1.1.3 | `/health` 端点返回 200 | | | |
| 1.1.4 | `/ready` 端点返回 200 | | | |
| 1.1.5 | API Server 日志无 Critical 错误 | | | |
| 1.1.6 | API Server 资源使用正常（CPU <80%, 内存 <80%） | | | |

**验证命令**:

```bash
# 检查 API Server 状态
curl -f https://<api-base>/health
curl -f https://<api-base>/ready

# 检查资源使用
docker stats im-api-server
# 或
top -p $(pgrep api-server)
```

---

### 1.2 Web Server

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 1.2.1 | Web Server 已部署到灰度环境 | | | |
| 1.2.2 | Web 版本与候选 commit 一致 | | | |
| 1.2.3 | Web 首页可访问 | | | |
| 1.2.4 | 静态资源加载正常 | | | |
| 1.2.5 | 无 404/500 错误 | | | |

**验证命令**:

```bash
# 检查 Web Server
curl -I https://<web-base>/

# 检查静态资源
curl -I https://<web-base>/main.dart.js
```

---

### 1.3 WebSocket Server

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 1.3.1 | WebSocket Server 已启用 | | | |
| 1.3.2 | WebSocket URL 可访问 | | | |
| 1.3.3 | WebSocket 握手成功 | | | |
| 1.3.4 | WebSocket 认证正常 | | | |

**验证命令**:

```bash
# 获取 WebSocket ticket
curl -H "Authorization: Bearer <token>" https://<api-base>/api/ws/ticket

# 测试 WebSocket 连接（需要 wscat 或类似工具）
wscat -c "wss://<ws-base>/ws?ticket=<ticket>"
```

---

## 2. 数据库检查

### 2.1 MySQL

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 2.1.1 | MySQL 服务运行正常 | | | |
| 2.1.2 | MySQL 可连接 | | | |
| 2.1.3 | 数据库已创建 | | | |
| 2.1.4 | Migrations 已应用 | | | |
| 2.1.5 | 核心表已创建 | | | |
| 2.1.6 | 测试数据已准备（如需要） | | | |

**核心表清单**:

- [ ] `users`
- [ ] `user_profiles`
- [ ] `auth_sessions`
- [ ] `private_messages`
- [ ] `group_messages`
- [ ] `groups`
- [ ] `group_members`
- [ ] `e2ee_device_keys`
- [ ] `e2ee_sessions`
- [ ] `e2ee_one_time_pre_keys`
- [ ] `files`
- [ ] `moments`
- [ ] `push_devices`
- [ ] `ai_keys`

**验证命令**:

```bash
# 连接 MySQL
mysql -h <host> -P <port> -u <user> -p<password> <database>

# 检查 migrations
SELECT * FROM _sqlx_migrations ORDER BY version DESC LIMIT 10;

# 检查核心表
SHOW TABLES;

# 检查表结构
DESCRIBE users;
DESCRIBE private_messages;
```

---

### 2.2 Redis

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 2.2.1 | Redis 服务运行正常 | | | |
| 2.2.2 | Redis 可连接 | | | |
| 2.2.3 | Redis ping 返回 PONG | | | |
| 2.2.4 | Redis 读写测试通过 | | | |
| 2.2.5 | Redis 认证正常（如启用） | | | |

**验证命令**:

```bash
# 连接 Redis
redis-cli -h <host> -p <port> -a <password>

# 测试 ping
PING

# 测试读写
SET gray-check-test "test-value"
GET gray-check-test
DEL gray-check-test
```

---

## 3. 存储检查

### 3.1 文件存储

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 3.1.1 | 文件存储服务可用 | | | |
| 3.1.2 | 上传目录/桶已创建 | | | |
| 3.1.3 | 上传权限已配置 | | | |
| 3.1.4 | 下载权限已配置 | | | |
| 3.1.5 | 上传/下载测试通过 | | | |

**验证命令**:

```bash
# 本地存储
ls -la /path/to/upload/dir
touch /path/to/upload/dir/test.txt
rm /path/to/upload/dir/test.txt

# S3/对象存储
aws s3 ls s3://<bucket>/
aws s3 cp test.txt s3://<bucket>/test.txt
aws s3 rm s3://<bucket>/test.txt
```

---

## 4. 网络检查

### 4.1 网络连通性

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 4.1.1 | API Server 可从测试环境访问 | | | |
| 4.1.2 | Web Server 可从测试环境访问 | | | |
| 4.1.3 | WebSocket 可从测试环境访问 | | | |
| 4.1.4 | 数据库可从 API Server 访问 | | | |
| 4.1.5 | Redis 可从 API Server 访问 | | | |

**验证命令**:

```bash
# 测试端口连通性
telnet <api-host> <api-port>
telnet <db-host> <db-port>
telnet <redis-host> <redis-port>

# 测试 HTTP 访问
curl -I https://<api-base>/health
curl -I https://<web-base>/
```

---

### 4.2 DNS 和 SSL

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 4.2.1 | DNS 解析正确 | | | |
| 4.2.2 | SSL 证书有效 | | | |
| 4.2.3 | SSL 证书链完整 | | | |
| 4.2.4 | HTTPS 可访问 | | | |

**验证命令**:

```bash
# DNS 解析
nslookup <api-host>
dig <api-host>

# SSL 证书
openssl s_client -connect <api-host>:443 -servername <api-host>
curl -vI https://<api-base>/health 2>&1 | grep -i "ssl\|certificate"
```

---

## 5. 配置检查

### 5.1 应用配置

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 5.1.1 | APP_ENV / IM_ENV 设置正确 | | | |
| 5.1.2 | 数据库连接配置正确 | | | |
| 5.1.3 | Redis 连接配置正确 | | | |
| 5.1.4 | JWT secret 已配置且长度合理 | | | |
| 5.1.5 | Cookie 配置正确（secure/sameSite） | | | |
| 5.1.6 | CORS 配置正确 | | | |
| 5.1.7 | Body size limit 配置正确 | | | |
| 5.1.8 | Upload size limit 配置正确 | | | |

**验证命令**:

```bash
# 检查环境变量
env | grep -i "im_\|app_\|mysql\|redis"

# 检查配置文件
cat /path/to/config.toml
cat /path/to/.env
```

---

### 5.2 安全配置

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 5.2.1 | 无硬编码密码/secrets | | | |
| 5.2.2 | 日志脱敏已启用 | | | |
| 5.2.3 | 错误响应不泄露敏感信息 | | | |
| 5.2.4 | 旧 API 路径已禁用 | | | |

**验证命令**:

```bash
# 检查配置文件中的密码（应该从环境变量读取）
grep -i "password\|secret\|token" /path/to/config.toml

# 测试旧路径
curl -I https://<api-base>/user/profile  # 应返回 404/405
```

---

## 6. 时间同步检查

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 6.1 | API Server 时间准确 | | | |
| 6.2 | 数据库服务器时间准确 | | | |
| 6.3 | 客户端与服务器时间偏差 <5 分钟 | | | |

**验证命令**:

```bash
# 检查本机时间
date

# 检查 API Server 时间
curl -s https://<api-base>/health | jq '.timestamp'

# 检查 MySQL 时间
mysql -e "SELECT NOW();"

# 检查 Redis 时间
redis-cli TIME
```

---

## 7. 备份检查

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 7.1 | 数据库已备份 | | | |
| 7.2 | 配置文件已备份 | | | |
| 7.3 | 上一版本 artifacts 已备份 | | | |
| 7.4 | 备份可恢复已验证 | | | |

**验证命令**:

```bash
# 检查备份文件
ls -lh /path/to/backup/

# 验证备份完整性
md5sum /path/to/backup/*.sql.gz
```

---

## 8. 监控和告警检查

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 8.1 | 监控系统已配置 | | | |
| 8.2 | 告警规则已配置 | | | |
| 8.3 | 告警接收人已配置 | | | |
| 8.4 | 日志收集已配置 | | | |

**监控指标**:

- API Server 响应时间
- 错误率
- CPU/内存使用率
- 数据库连接数
- Redis 连接数
- WebSocket 连接数

---

## 9. 通讯准备

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 9.1 | 发布通知已准备 | | | |
| 9.2 | 回滚通知已准备 | | | |
| 9.3 | 通讯渠道已确认（Slack/邮件） | | | |
| 9.4 | 相关人员已通知 | | | |

---

## 10. 文档检查

| # | 检查项 | 状态 | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 10.1 | Gray Release Runbook 已准备 | | | |
| 10.2 | Rollback Runbook 已准备 | | | |
| 10.3 | Manual Test Plan 已准备 | | | |
| 10.4 | 环境信息已记录 | | | |

---

## 环境信息记录

| 字段 | 值 |
| --- | --- |
| Gray Environment Name | |
| API Base URL | |
| Web Base URL | |
| WebSocket Base URL | |
| MySQL Host | |
| MySQL Port | |
| Redis Host | |
| Redis Port | |
| Operator | |
| Date | |

---

## 检查清单签名

| 角色 | 姓名 | 签名 | 日期 |
| --- | --- | --- | --- |
| 灰度发布负责人 | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| 运维负责人 | | | |
| QA 负责人 | | | |

---

## 备注

（记录任何特殊注意事项或已知问题）

---

*文档版本: 1.0*
*最后更新: 2026-06-18*
