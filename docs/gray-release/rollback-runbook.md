# Gray Release Rollback Runbook

## 回滚触发条件

当出现以下任一情况时，**必须**立即启动回滚：

### Critical 触发条件

| 触发条件 | 严重程度 | 响应时间 |
| --- | --- | --- |
| Gray gate FAIL | Critical | 立即 |
| P1 SIT FAIL | Critical | 立即 |
| DB plaintext scan FAIL | Critical | 立即 |
| 登录核心路径 FAIL | Critical | 立即 |
| 消息核心路径 FAIL | Critical | 立即 |
| E2EE 核心路径 FAIL | Critical | 立即 |
| 文件上传/下载 FAIL | Critical | 立即 |
| 群聊核心路径 FAIL | Critical | 立即 |
| 关键错误率升高 >10% | Critical | 立即 |
| 数据损坏迹象 | Critical | 立即 |
| WebSocket 大面积失败 | Critical | 立即 |
| 客户端启动失败 | Critical | 立即 |

### 非 Critical 触发条件（可评估后决定）

| 触发条件 | 严重程度 | 响应时间 |
| --- | --- | --- |
| Moments 功能异常 | High | 30分钟内 |
| Push 通知异常 | High | 30分钟内 |
| AI 功能异常 | Medium | 1小时内 |
| 用户反馈异常增多 | High | 30分钟内 |

---

## 回滚对象

### API Server

- **回滚方式**: 切换回上一个稳定版本的 Docker 镜像或二进制文件
- **版本标识**: Git commit SHA + Docker image tag
- **备份位置**: Docker registry 或 binary artifact storage

### Web Build Artifact

- **回滚方式**: 切换回上一个稳定版本的 Web 静态文件
- **版本标识**: Git commit SHA + build timestamp
- **备份位置**: CDN 或 static file server

### Mobile/Desktop Build Artifact

- **回滚方式**: 通知用户回退到上一个稳定版本（如已分发）
- **版本标识**: App version + build number
- **备份位置**: App store / 分发渠道

### Database Migrations

- **本次灰度**: 不涉及 schema 变更
- **回滚方式**: 不需要数据库回滚
- **注意事项**: 如未来版本涉及 schema 变更，需要在回滚前评估数据兼容性

### Redis Cache/Session

- **回滚方式**: 清理灰度相关的缓存和 session
- **清理策略**:
  ```bash
  # 清理灰度环境的 session（如需要）
  redis-cli -h <host> -p <port> -a <password> KEYS "session:gray_*" | xargs redis-cli DEL
  
  # 清理灰度环境的 cache（如需要）
  redis-cli -h <host> -p <port> -a <password> KEYS "cache:gray_*" | xargs redis-cli DEL
  ```
- **注意事项**: 只清理灰度相关的数据，不要清理生产数据

---

## 回滚步骤

### 阶段 1: 停止新流量（5分钟内）

1. **停止灰度流量入口**
   ```bash
   # 如使用 Nginx/负载均衡，切回生产配置
   sudo nginx -t && sudo systemctl reload nginx
   
   # 如使用 Docker Compose
   docker-compose -f docker-compose.gray.yml down
   ```

2. **通知相关人员**
   - 发送回滚通知到团队 Slack/邮件
   - 记录回滚开始时间

### 阶段 2: 切回上一版本（10分钟内）

3. **切回 API Server 上一版本**
   ```bash
   # 如使用 Docker
   docker pull <registry>/api-server:<previous-tag>
   docker-compose -f docker-compose.prod.yml up -d api-server
   
   # 如使用二进制
   cp /backup/api-server-<previous-commit> /opt/im/api-server
   systemctl restart im-api-server
   ```

4. **切回 Web 上一版本**
   ```bash
   # 如使用 Docker
   docker pull <registry>/web:<previous-tag>
   docker-compose -f docker-compose.prod.yml up -d web
   
   # 如使用静态文件
   cp -r /backup/web-<previous-commit>/* /var/www/im/
   systemctl reload nginx
   ```

5. **清理 Redis（如需要）**
   ```bash
   # 执行上面的 Redis 清理策略
   ```

### 阶段 3: 验证回滚（15分钟内）

6. **验证 health/ready**
   ```bash
   curl -f https://<api-base>/health
   curl -f https://<api-base>/ready
   ```

7. **验证核心功能**
   ```bash
   # 运行快速冒烟测试
   python scripts/gray_smoke.py \
     --env production-rollback \
     --api-base https://<api-base> \
     --prefix rollback_$(date +%s)
   ```

8. **检查错误日志**
   ```bash
   # 查看最近的错误
   tail -f /var/log/im/api-server.log | grep -i error
   
   # Docker logs
   docker logs --tail 100 im-api-server
   ```

9. **通知测试用户**
   - 通知测试用户暂停使用或重启客户端
   - 确认测试用户可以正常登录和使用

### 阶段 4: 记录 incident（30分钟内）

10. **记录 incident**
    - 回滚原因
    - 回滚时间
    - 影响范围
    - 根因分析（初步）
    - 后续改进措施

---

## 数据处理

### Disposable Gray Test Data

灰度测试产生的临时数据（测试用户、测试消息、测试文件等）可以在回滚后清理：

```sql
-- 清理灰度测试用户（根据前缀）
DELETE FROM users WHERE username LIKE 'gray_%';
DELETE FROM user_profiles WHERE user_id IN (
  SELECT id FROM users WHERE username LIKE 'gray_%'
);

-- 清理灰度测试消息
DELETE FROM private_messages WHERE sender_id IN (
  SELECT id FROM users WHERE username LIKE 'gray_%'
);

-- 清理灰度测试文件
DELETE FROM files WHERE uploader_id IN (
  SELECT id FROM users WHERE username LIKE 'gray_%'
);
```

### 用户数据保护

- **禁止**: 删除用户真实数据
- **禁止**: 修改用户密码或凭证
- **禁止**: 清理用户会话（除非明确灰度 session）

### E2EE 数据异常处理

如发现 E2EE 数据异常：

1. **保留现场**: 不要删除异常数据
2. **导出证据**: 导出相关的 E2EE session/keys 数据
3. **通知安全团队**: 立即通知安全团队评估
4. **用户通知**: 如涉及用户数据，通知受影响用户

---

## 回滚后验证清单

回滚完成后，必须验证以下项目：

### 基础验证

- [ ] `/health` 返回 200
- [ ] `/ready` 返回 200
- [ ] API 响应时间正常（<500ms）

### 核心功能验证

- [ ] 登录功能正常
- [ ] 私信发送/接收正常
- [ ] E2EE 加解密正常
- [ ] 群聊功能正常
- [ ] 文件上传/下载正常

### E2EE 验证

- [ ] 私聊 E2EE 消息正常
- [ ] 群聊 E2EE 消息正常
- [ ] DB plaintext scan 通过

### 性能验证

- [ ] 错误率回到基线水平
- [ ] 响应时间回到基线水平
- [ ] WebSocket 连接稳定

---

## 回滚决策记录

每次回滚必须记录以下信息：

| 字段 | 内容 |
| --- | --- |
| 回滚时间 | YYYY-MM-DD HH:MM:SS UTC |
| 回滚操作人 | |
| 灰度版本 | commit SHA |
| 回滚版本 | commit SHA |
| 回滚原因 | |
| 影响范围 | |
| 回滚耗时 | |
| 验证结果 | PASS / FAIL |
| 后续跟进 | |

---

## 附录

### 快速回滚命令参考

```bash
# 1. 查看当前版本
git log --oneline -1
docker images | grep api-server

# 2. 切回上一版本
git checkout <previous-commit>
docker pull <registry>/api-server:<previous-tag>

# 3. 重启服务
docker-compose -f docker-compose.prod.yml up -d

# 4. 验证
curl -f https://<api-base>/health
python scripts/gray_smoke.py --env rollback-check --api-base https://<api-base>
```

### 联系人

| 角色 | 联系方式 |
| --- | --- |
| 灰度发布负责人 | |
| 后端负责人 | |
| 前端负责人 | |
| 安全负责人 | |
| 运维负责人 | |

---

*文档版本: 1.0*
*最后更新: 2026-06-18*
