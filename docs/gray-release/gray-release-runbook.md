# Gray Release Runbook

## 概述

本手册指导灰度发布的完整流程，从 Pre-flight 检查到 Post-release 观察。

---

## 阶段 1: Pre-flight（发布前检查）

### 1.1 候选版本冻结

**负责人**: 灰度发布负责人
**时间**: 发布前 24 小时

**检查项**:

- [ ] 候选 commit SHA 明确并记录
- [ ] 工作区 clean（`git status` 无未提交更改）
- [ ] 候选版本已在 main 分支通过 CI
- [ ] 候选版本已通过 PR Fast Gate
- [ ] 候选版本已通过 Main Full Gate

**验证命令**:

```bash
# 检查 git 状态
git status
git log --oneline -1

# 生成 build info
python scripts/gray_report.py build-info \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --operator <operator-name>

# 检查 build info
cat build/reports/gray-build-info.json
```

**输出**: `build/reports/gray-build-info.json` + `build/reports/gray-build-info.md`

---

### 1.2 Gate 验证

**负责人**: 灰度发布负责人
**时间**: 发布前 24 小时

**检查项**:

- [ ] PR Fast Gate PASS
- [ ] Main Full Gate PASS
- [ ] Gray Release Gate PASS
- [ ] Coverage summary 已归档
- [ ] Manifest summary 已归档
- [ ] Known failures 已审查

**验证命令**:

```bash
# 运行完整 gate
python scripts/test.py manifest
python scripts/test.py pr-fast
python scripts/test.py coverage
python scripts/test.py main-full
python scripts/test.py gray-release --base-url <api-base-url> --db-url <db-url>

# 检查 gate 结果
cat build/reports/gray-gate-report.json
```

**Gate 通过标准**:

| Gate | 状态 | 要求 |
| --- | --- | --- |
| Manifest | PASS | 无 critical missing |
| PR Fast | PASS | 所有步骤 PASS |
| Coverage | PASS | 达到阈值或 baseline |
| Main Full | PASS | 所有步骤 PASS |
| Gray Release | PASS | P1 SIT PASS + 后端 API SIT PASS |

---

### 1.3 环境预检

**负责人**: 灰度发布负责人 + 运维
**时间**: 发布前 12 小时

**检查项**:

- [ ] API health/ready 正常
- [ ] MySQL 连接正常
- [ ] Redis 连接正常
- [ ] WebSocket 连接正常
- [ ] 文件存储可用
- [ ] 时间同步正常
- [ ] 配置检查通过

**验证命令**:

```bash
# 运行环境预检
python scripts/gray_env_check.py \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --redis-url <redis-url>

# 检查结果
cat build/reports/gray-env-check.json
```

**环境检查通过标准**:

| 检查项 | 状态 | 要求 |
| --- | --- | --- |
| API health | PASS | 200 OK |
| API ready | PASS | 200 OK |
| MySQL | PASS | 连接正常 + migrations 已应用 + 核心表存在 |
| Redis | PASS | ping OK + 读写正常 |
| WebSocket | PASS | 能获取 ticket |
| Storage | PASS | 上传/下载/删除正常 |
| Time sync | PASS/WARN | 偏差 <5 分钟 |
| Config | PASS | 环境标识正确 |

---

### 1.4 Smoke 测试

**负责人**: QA + 灰度发布负责人
**时间**: 发布前 6 小时

**检查项**:

- [ ] Auth smoke PASS
- [ ] User smoke PASS
- [ ] Friend smoke PASS
- [ ] Private message smoke PASS
- [ ] Private E2EE smoke PASS
- [ ] Group smoke PASS
- [ ] Group E2EE smoke PASS
- [ ] File/avatar smoke PASS
- [ ] Moments smoke PASS/WARN
- [ ] AI smoke PASS/NOT RUN
- [ ] Push smoke PASS
- [ ] WebSocket smoke PASS
- [ ] Security smoke PASS

**验证命令**:

```bash
# 运行 smoke 测试
python scripts/gray_smoke.py \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --prefix "gray_$(date +%s)"

# 检查结果
cat build/reports/gray-smoke.json
```

**Smoke 通过标准**:

- Critical 场景全部 PASS
- 非 Critical 场景无 FAIL（WARN 可接受）
- NOT RUN 需有合理原因

---

### 1.5 数据明文扫描

**负责人**: 安全团队 + 灰度发布负责人
**时间**: 发布前 6 小时

**检查项**:

- [ ] P0 E2EE private text acceptance PASS
- [ ] P1 OPK lifecycle PASS
- [ ] P1 private multidevice fanout PASS
- [ ] P1 group E2EE PASS
- [ ] P1 DB plaintext scan PASS

**验证命令**:

```bash
# 运行 P1 SIT（包含 DB plaintext scan）
python scripts/p1_sit_gate.py \
  --base-url <api-base-url> \
  --db-url <db-url>

# 检查 P1 SIT 结果
cat artifacts/p1-sit/<timestamp>/summary.md
```

**通过标准**:

- 所有 P1 SIT 测试 PASS
- DB plaintext scan 无明文泄露

---

### 1.6 回滚方案确认

**负责人**: 灰度发布负责人 + 运维
**时间**: 发布前 6 小时

**检查项**:

- [ ] 回滚方案已文档化（见 [rollback-runbook.md](rollback-runbook.md)）
- [ ] 回滚步骤已评审
- [ ] 备份已创建
- [ ] 回滚负责人已指定
- [ ] 通讯渠道已确认

---

## 阶段 2: Release Execution（发布执行）

### 2.1 构建产物准备

**负责人**: 构建负责人
**时间**: 发布前 2 小时

**检查项**:

- [ ] Build artifacts 已生成
- [ ] Artifact checksum 已记录
- [ ] Artifacts 已上传到分发位置
- [ ] 版本标签已创建

**验证命令**:

```bash
# 生成 build artifacts
python scripts/build.py all

# 验证 artifacts
python scripts/check_build_outputs.py

# 记录 checksum
sha256sum build/dist/*
```

**输出**:

- `build/dist/api-server-<commit>.tar.gz`
- `build/dist/web-<commit>.tar.gz`
- `build/manifest.json`

---

### 2.2 环境部署

**负责人**: 运维
**时间**: 发布窗口开始

**检查项**:

- [ ] 灰度环境已选定
- [ ] 部署操作人已记录
- [ ] 部署开始时间已记录
- [ ] 部署命令已记录（secrets 已脱敏）

**部署步骤**:

```bash
# 记录部署信息
echo "Deploy started at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Environment: <gray-environment>"
echo "Operator: <operator-name>"
echo "Commit: <commit-sha>"

# 部署 API server
docker-compose -f docker-compose.gray.yml up -d api-server

# 部署 Web
docker-compose -f docker-compose.gray.yml up -d web

# 验证部署
curl -f https://<api-base>/health
curl -f https://<api-base>/ready
```

---

### 2.3 部署后验证

**负责人**: QA + 灰度发布负责人
**时间**: 部署完成后 30 分钟内

**检查项**:

- [ ] Health/ready check 通过
- [ ] Smoke 测试通过
- [ ] 监控窗口已开始
- [ ] 告警已配置

**验证命令**:

```bash
# 运行完整 gray signoff
python scripts/test.py gray-signoff \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --redis-url <redis-url> \
  --operator <operator-name>

# 检查最终报告
cat build/reports/gray-release-report.md
```

---

## 阶段 3: Post-release Observation（发布后观察）

### 3.1 监控窗口（30 分钟）

**负责人**: 灰度发布负责人 + 运维
**时间**: 部署后 30 分钟

**监控项**:

- [ ] 登录成功率
- [ ] 消息发送成功率
- [ ] WebSocket 连接稳定性
- [ ] 错误日志
- [ ] 响应时间
- [ ] 资源使用率（CPU/内存/磁盘）

**监控命令**:

```bash
# 查看错误日志
tail -f /var/log/im/api-server.log | grep -i error

# Docker logs
docker logs --tail 100 -f im-api-server

# 查看资源使用
docker stats im-api-server
```

---

### 3.2 功能验证

**负责人**: QA
**时间**: 部署后 30 分钟

**检查项**:

- [ ] 登录功能正常
- [ ] 消息功能正常
- [ ] WebSocket 稳定
- [ ] 文件上传/下载正常
- [ ] E2EE 加解密正常

**验证方法**:

- 手动测试核心功能
- 查看用户反馈
- 查看监控指标

---

### 3.3 数据验证

**负责人**: 安全团队 + DBA
**时间**: 部署后 1 小时

**检查项**:

- [ ] E2EE smoke 后 DB plaintext scan 通过
- [ ] 无异常数据写入
- [ ] 数据一致性检查

**验证命令**:

```bash
# 运行 DB plaintext scan
python tests/p1_db_plaintext_scan.py --db-url <db-url>

# 检查数据一致性
python scripts/sit_mysql_bootstrap.py --check-only
```

---

### 3.4 用户反馈收集

**负责人**: 产品 + QA
**时间**: 部署后 1-24 小时

**检查项**:

- [ ] 用户反馈渠道已开启
- [ ] 反馈已收集
- [ ] 异常反馈已分类
- [ ] Critical 问题已处理

**反馈渠道**:

- 用户反馈表单
- 客服渠道
- 社交媒体
- 内部测试群

---

### 3.5 决策

**负责人**: 灰度发布负责人
**时间**: 部署后 1-24 小时

**决策选项**:

| 决策 | 条件 | 后续行动 |
| --- | --- | --- |
| **GO** | 所有检查通过，无 Critical 问题 | 继续灰度或全量发布 |
| **HOLD** | 有非 Critical 问题需评估 | 暂停灰度，评估后决定 |
| **ROLLBACK** | 有 Critical 问题 | 立即回滚，见 [rollback-runbook.md](rollback-runbook.md) |

**决策记录**:

```markdown
## 灰度发布决策

- **时间**: YYYY-MM-DD HH:MM:SS UTC
- **操作人**: 
- **决策**: GO / HOLD / ROLLBACK
- **原因**: 
- **后续行动**: 
```

---

## 发布检查清单

### Pre-flight Checklist

- [ ] 候选 commit fixed
- [ ] git clean
- [ ] PR Fast Gate PASS
- [ ] Main Full Gate PASS
- [ ] Gray Release Gate PASS
- [ ] coverage summary archived
- [ ] manifest summary archived
- [ ] known failures reviewed
- [ ] env check PASS
- [ ] smoke PASS
- [ ] plaintext scan PASS
- [ ] rollback plan ready

### Release Execution Checklist

- [ ] build artifacts generated
- [ ] artifact checksum recorded
- [ ] environment selected
- [ ] deployment operator recorded
- [ ] start time recorded
- [ ] deployment command recorded but secrets omitted
- [ ] health/ready check after deploy
- [ ] smoke after deploy
- [ ] monitoring window started

### Post-release Observation Checklist

- [ ] 30 min observation
- [ ] login success
- [ ] message success
- [ ] WebSocket stability
- [ ] error logs reviewed
- [ ] DB plaintext scan after E2EE smoke
- [ ] user feedback recorded
- [ ] GO / HOLD / ROLLBACK decision

---

## 附录

### 命令速查表

```bash
# Build info
python scripts/gray_report.py build-info --env <env> --api-base <url>

# Environment check
python scripts/gray_env_check.py --env <env> --api-base <url> --db-url <db>

# Smoke tests
python scripts/gray_smoke.py --env <env> --api-base <url>

# Gate tests
python scripts/test.py manifest
python scripts/test.py pr-fast
python scripts/test.py coverage
python scripts/test.py main-full
python scripts/test.py gray-release --base-url <url> --db-url <db>

# Full signoff
python scripts/test.py gray-signoff --env <env> --api-base <url> --db-url <db> --redis-url <redis>

# Final report
python scripts/gray_report.py finalize \
  --build-info build/reports/gray-build-info.json \
  --env-check build/reports/gray-env-check.json \
  --gate-summary build/reports/gray-gate-report.json \
  --smoke build/reports/gray-smoke.json \
  --coverage build/reports/coverage-summary.json \
  --manifest build/reports/test-manifest-check.json \
  --out build/reports/gray-release-report.md
```

### 文档链接

- [Rollback Runbook](rollback-runbook.md)
- [Gray Gate Report Template](gray-gate-report-template.md)
- [Gray Release Checklist](gray-release-checklist.md)
- [Manual Test Plan](manual-test-plan.md)
- [Environment Checklist](environment-checklist.md)

---

*文档版本: 1.0*
*最后更新: 2026-06-18*
