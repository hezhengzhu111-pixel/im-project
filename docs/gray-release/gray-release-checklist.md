# Gray Release Checklist

## 概述

本清单是灰度发布的最终检查清单，确保所有准备工作已完成。所有 Critical 项必须通过才能给出 GO 决策。

---

## Pre-flight Checklist

### Build Info

- [ ] 候选 commit SHA 已明确并记录
- [ ] Git 工作区 clean（无未提交更改）
- [ ] Build info 已生成（`build/reports/gray-build-info.json`）
- [ ] Build info 无 Critical issue

**验证命令**:

```bash
python scripts/gray_report.py build-info \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --operator <operator-name>
```

---

### Gate Results

- [ ] PR Fast Gate **PASS**
- [ ] Main Full Gate **PASS**
- [ ] Gray Release Gate **PASS**（如环境支持）
- [ ] Manifest completeness **PASS**（无 critical missing）
- [ ] Coverage gate **PASS**（达到阈值或 baseline）
- [ ] Known failures 已审查；无通配符或扩展 allowlist

**验证命令**:

```bash
python scripts/test.py manifest
python scripts/test.py pr-fast
python scripts/test.py coverage
python scripts/test.py main-full
python scripts/test.py gray-release --base-url <url> --db-url <db>
```

**Gate 结果记录**:

| Gate | 状态 | 报告路径 |
| --- | --- | --- |
| Manifest | | `build/reports/test-manifest-check.json` |
| PR Fast | | `build/reports/gray-gate-report.json` |
| Coverage | | `build/reports/coverage-summary.json` |
| Main Full | | `build/reports/gray-gate-report.json` |
| Gray Release | | `build/reports/gray-gate-report.json` |

---

### Environment Check

- [ ] API health/ready **PASS**
- [ ] MySQL 连接正常
- [ ] Redis 连接正常
- [ ] WebSocket 连接正常
- [ ] 文件存储可用
- [ ] 时间同步正常（偏差 <5 分钟）
- [ ] 配置检查通过

**验证命令**:

```bash
python scripts/gray_env_check.py \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --redis-url <redis-url>
```

**环境检查结果**: `build/reports/gray-env-check.json`

---

### Smoke Tests

- [ ] Auth smoke **PASS**
- [ ] User smoke **PASS**
- [ ] Friend smoke **PASS**
- [ ] Private message smoke **PASS**
- [ ] Private E2EE smoke **PASS**
- [ ] Group smoke **PASS**
- [ ] Group E2EE smoke **PASS**
- [ ] File/avatar smoke **PASS**
- [ ] Moments smoke **PASS/WARN**
- [ ] AI smoke **PASS/NOT RUN**（如未配置）
- [ ] Push smoke **PASS**
- [ ] WebSocket smoke **PASS**
- [ ] Security smoke **PASS**

**验证命令**:

```bash
python scripts/gray_smoke.py \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --prefix "gray_$(date +%s)"
```

**Smoke 结果**: `build/reports/gray-smoke.json`

---

### P0/P1 SIT

- [ ] P0 private text E2EE acceptance **PASS**
- [ ] P1 OPK lifecycle **PASS**
- [ ] P1 private multi-device fanout **PASS**
- [ ] P1 group E2EE **PASS**
- [ ] DB plaintext scan **PASS**（无明文泄露）

**验证命令**:

```bash
python scripts/p1_sit_gate.py \
  --base-url <api-base-url> \
  --db-url <db-url>
```

**P1 SIT 结果**: `artifacts/p1-sit/<timestamp>/summary.md`

---

### Coverage and Manifest

- [ ] Coverage summaries 已审查
  - Rust overall: ___%
  - Flutter overall: ___%
  - 达到阈值或 baseline
- [ ] Manifest summaries 已审查
  - Backend routes: ___/___ covered
  - Frontend endpoints: ___/___ covered
  - Page routes: ___/___ covered
  - Public API: ___/___ covered

---

### Frontend Build Verification

- [ ] Web 构建成功或测试通过
- [ ] Mobile 构建成功或测试通过
- [ ] Desktop 构建成功或测试通过
- [ ] 构建产物路径已记录
- [ ] 构建产物不包含测试明文 secret/token

**验证命令**:

```bash
# Web build
cd flutter && flutter build web \
  --dart-define=APP_ENV=gray \
  --dart-define=API_BASE_URL=<api-base-url> \
  --dart-define=WS_BASE_URL=<ws-base-url>

# Mobile test
cd flutter/apps/mobile && flutter test

# Desktop test
cd flutter/apps/desktop && flutter test
```

---

### Rollback Plan

- [ ] 回滚方案已文档化（见 [rollback-runbook.md](rollback-runbook.md)）
- [ ] 回滚步骤已评审
- [ ] 上一版本 artifacts 已备份
- [ ] 回滚负责人已指定
- [ ] 通讯渠道已确认

---

## Release Execution Checklist

### Pre-deployment

- [ ] Build artifacts 已生成
- [ ] Artifact checksum 已记录
- [ ] 灰度环境已选定
- [ ] 部署操作人已记录
- [ ] 部署开始时间已记录
- [ ] 部署命令已记录（secrets 已脱敏）

### Deployment

- [ ] API Server 已部署
- [ ] Web Server 已部署
- [ ] WebSocket Server 已启用
- [ ] 数据库 migrations 已应用（如需要）

### Post-deployment

- [ ] Health/ready check 通过
- [ ] Smoke 测试通过
- [ ] 监控窗口已开始
- [ ] 告警已配置

---

## Post-release Observation Checklist

### 30-minute Observation

- [ ] 登录成功率正常
- [ ] 消息发送成功率正常
- [ ] WebSocket 连接稳定
- [ ] 错误日志无 Critical 错误
- [ ] 响应时间正常（<500ms）
- [ ] 资源使用正常（CPU/内存 <80%）

### 1-hour Observation

- [ ] E2EE smoke 后 DB plaintext scan 通过
- [ ] 无异常数据写入
- [ ] 用户反馈已收集
- [ ] 异常反馈已分类

### 24-hour Observation

- [ ] 关键错误率未升高
- [ ] 无数据损坏迹象
- [ ] WebSocket 无大面积失败
- [ ] 客户端启动正常
- [ ] 用户反馈已处理

---

## Final Decision

### GO Criteria

**必须满足所有条件**:

- [ ] 所有 Critical smoke 场景 PASS
- [ ] P1 SIT PASS
- [ ] DB plaintext scan PASS
- [ ] Manifest 无 critical missing
- [ ] Coverage gate PASS
- [ ] Web/Mobile/Desktop 至少一个构建/测试通过
- [ ] 环境检查 PASS
- [ ] 回滚方案已准备

### NO-GO Criteria

**任一条件即 NO-GO**:

- [ ] 任一 Critical smoke 场景 FAIL
- [ ] P1 SIT FAIL 或 NOT RUN
- [ ] DB plaintext scan FAIL 或 NOT RUN
- [ ] Manifest critical missing
- [ ] Coverage gate FAIL
- [ ] Web/Mobile/Desktop 全部未构建/测试
- [ ] 环境检查 FAIL
- [ ] 回滚方案未准备

### Decision

| 字段 | 值 |
| --- | --- |
| **Decision** | GO / NO-GO / HOLD |
| **Operator** | |
| **Timestamp** | |
| **Required Follow-up** | |
| **Notes** | |

---

## References

- [Gray Release Runbook](gray-release-runbook.md)
- [Rollback Runbook](rollback-runbook.md)
- [Manual Test Plan](manual-test-plan.md)
- [Environment Checklist](environment-checklist.md)
- [Gray Gate Report Template](gray-gate-report-template.md)

---

*文档版本: 2.0*
*最后更新: 2026-06-18*
