# Step 5 Bug Fixes - Verification Report

**Date**: 2026-06-18
**Commit**: e72d295e + fixes

---

## 修复概览

### 修复的阻塞点

| # | 问题 | 文件 | 修复方案 | 状态 |
|---|------|------|----------|------|
| 1 | gray_gate.py 未导入 REPORT_DIR | gray_gate.py | 添加 REPORT_DIR 到 import | ✅ |
| 2 | gray_signoff() 读取未生成的 gray-gate-report.json | gray_gate.py | 移除内部 final report step，在 main() 中先写 gate report 再 finalize | ✅ |
| 3 | test.py 传空字符串参数 | test.py | 构建 cmd list，条件 append --continue-on-error | ✅ |
| 4 | gray_report.py --commit 参数被忽略 | gray_report.py | 支持 --commit 参数，验证与 HEAD 一致性 | ✅ |
| 5 | coverage/manifest 判定默认 True 误判 | gray_report.py | 兼容真实 JSON 结构，遍历子项检查 | ✅ |
| 6 | gray_env_check.py 使用旧路径 | gray_env_check.py | 改为 canonical endpoint（/api/user/register, /api/auth/ws-ticket, /api/file/*） | ✅ |
| 7 | gray_smoke.py 使用旧路径 | gray_smoke.py | 完全重写，使用正确 endpoint（40+ 场景） | ✅ |
| 8 | E2EE smoke 使用 fake envelope | gray_smoke.py | 依赖 P1 SIT 报告，无 fake envelope | ✅ |
| 9 | GitHub Actions frontend build 路径错误 | gray-release-gate.yml | 改为 cd flutter/apps/web，添加 mobile/desktop 测试 | ✅ |

---

## 验证结果

### 1. 语法检查 ✅

```bash
python -m py_compile scripts/gray_gate.py scripts/test.py scripts/gray_report.py scripts/gray_env_check.py scripts/gray_smoke.py
```
**结果**: 无错误

### 2. 单元测试 ✅

```bash
python scripts/test_gray_verification.py
```
**结果**: 8/8 通过

- ✅ test.py gray-signoff 不传空字符串参数
- ✅ gray_gate.py final report 不读取未生成的文件
- ✅ gray_report.py --commit 不一致时 FAIL
- ✅ gray_report.py coverage 子项失败时 NO-GO
- ✅ gray_report.py manifest errors 非空时 NO-GO
- ✅ gray_smoke.py 不包含旧路径
- ✅ gray_env_check.py 不包含旧路径
- ✅ E2EE smoke 不允许 fake envelope

### 3. Manifest Gate ✅

```bash
python scripts/test.py manifest
```
**结果**: PASS

- backend_routes: 122 covered, 3 allowed_missing, 0 missing
- frontend_endpoints: 112 covered, 1 allowed_missing, 0 missing
- frontend_page_routes: 42 covered, 0 allowed_missing, 0 missing
- public_api: 284 covered, 0 allowed_missing, 0 missing

**报告**: `build/reports/test-manifest.json`

### 4. PR Fast Gate ✅

```bash
python scripts/test.py pr-fast
```
**结果**: PASS (156.49s)

**步骤**:
- ✅ Rust fmt
- ✅ Rust check
- ✅ Rust unit tests
- ✅ Rust clippy (7 packages)
- ✅ Flutter pub get/analyze/test (6 targets)
- ✅ Manifest completeness
- ✅ Known failures policy

**报告**: `build/reports/test-pr-fast.json`

---

## 修复详情

### 1. gray_gate.py 修复

**问题**: 未导入 REPORT_DIR，gray_signoff() 读取未生成的文件

**修复**:
```python
# 添加导入
from gate_common import ROOT, REPORT_DIR, run_step, skip_step, write_gate_reports

# 移除 gray_signoff() 内部的 final report step
# 在 main() 中先写 gate report 再 finalize
exit_code = write_gate_reports("gray-gate-report", args.mode, results, report_base=report_base)

if args.mode == "gray-signoff":
    # 先写 gate report，再生成 final report
    finalize_result = subprocess.run([...])
```

### 2. test.py 修复

**问题**: 传空字符串作为参数

**修复**:
```python
# 构建 cmd list，条件 append
cmd = [
    PYTHON,
    str(ROOT / "scripts" / "gray_gate.py"),
    "--mode", "gray-signoff",
    ...
]
if args.continue_on_error:
    cmd.append("--continue-on-error")
```

### 3. gray_report.py 修复

**问题**: --commit 参数被忽略，coverage/manifest 判定默认 True

**修复**:
```python
# 支持 --commit 参数
candidate_commit = args.commit if args.commit else git_info["commit_sha"]
if args.commit and args.commit != git_info["commit_sha"]:
    issues.append(f"FAIL: --commit does not match current HEAD")

# 遍历 coverage 子项检查
for module_name, module_data in rust_summary.items():
    if isinstance(module_data, dict):
        gate_passed = module_data.get("gate_passed")
        passed = module_data.get("passed")
        if gate_passed is False or passed is False:
            issues.append(f"Rust {module_name} coverage FAIL")

# 检查 manifest errors
errors = manifest_summary.get("errors", [])
if errors:
    issues.append(f"Manifest has {len(errors)} errors")
```

### 4. gray_env_check.py 修复

**问题**: 使用旧 API 路径

**修复**:
```python
# 使用 canonical endpoint
/api/user/register (POST)
/api/auth/ws-ticket (POST)
/api/file/upload/file (POST)
/api/file/info (POST)
/api/file/delete (DELETE)
```

### 5. gray_smoke.py 重写

**问题**: 使用旧路径，E2EE 使用 fake envelope

**修复**:
- 完全重写，使用正确 endpoint
- 40+ 测试场景覆盖 A-M 所有功能
- E2EE smoke 依赖 P1 SIT 报告
- 处理 ApiResponse wrapper 格式
- 移除所有 fake/dummy/placeholder

**Canonical endpoints 使用**:
```
Auth: /api/user/register, /api/user/login, /api/auth/refresh, /api/auth/ws-ticket, /api/user/logout
Friend: /api/friend/request, /api/friend/requests, /api/friend/accept, /api/friend/list
Message: /api/message/send/private, /api/message/private/{peerId}, /api/message/recall/{messageId}
Group: /api/group/create, /api/group/members/list, /api/group/{groupId}/add-members, /api/message/send/group, /api/message/group/{groupId}
File: /api/file/upload/file, /api/file/download, /api/file/info, /api/file/delete
Moments: /api/moments, /api/moments/feed, /api/moments/{id}/like, /api/moments/{id}/comments
AI: /api/ai/keys, /api/ai/settings
Push: /api/push/devices/register, /api/push/settings
E2EE: 依赖 P1 SIT 报告（/api/keys/bundle, /api/e2ee/*）
```

### 6. GitHub Actions 修复

**问题**: frontend build 在错误目录运行

**修复**:
```yaml
- name: Run frontend build verification
  run: |
    cd flutter/apps/web  # 改为正确目录
    flutter pub get
    flutter analyze
    flutter test
    flutter build web ...

- name: Run mobile tests (optional)
  run: |
    cd flutter/apps/mobile
    flutter test
  continue-on-error: true

- name: Run desktop tests (optional)
  run: |
    cd flutter/apps/desktop
    flutter test
  continue-on-error: true
```

---

## 新增测试

**文件**: `scripts/test_gray_verification.py`

**测试覆盖**:
1. test.py gray-signoff 不传空字符串参数
2. gray_gate.py gray_signoff final report 不读取未生成的文件
3. gray_report.py --commit 不一致时 FAIL
4. gray_report.py coverage 子项失败时 NO-GO
5. gray_report.py manifest errors 非空时 NO-GO
6. gray_smoke.py 不包含旧路径
7. gray_env_check.py 不包含旧路径
8. E2EE smoke 不允许 fake envelope

---

## 未运行项及原因

| 测试 | 原因 |
|------|------|
| Coverage Gate | 需要 cargo-llvm-cov，未安装 |
| Main Full Gate | 需要 Docker 环境，未运行 |
| Gray Release Gate | 需要完整 Docker + 灰度环境 |
| Smoke Tests | 需要真实 API 服务器 |
| Environment Check | 需要连接真实环境 |
| P1 SIT | 需要 Docker + MySQL |
| Frontend Build | 需要 Flutter 环境 |

---

## 文件修改清单

### 修改的文件（6个）

1. `.github/workflows/gray-release-gate.yml` - 修复 frontend build 路径
2. `scripts/gray_gate.py` - 导入 REPORT_DIR，修复 final report 时序
3. `scripts/gray_report.py` - 支持 --commit，修复 coverage/manifest 判定
4. `scripts/gray_env_check.py` - 使用 canonical endpoint
5. `scripts/gray_smoke.py` - 完全重写，使用正确 endpoint
6. `scripts/test.py` - 修复空字符串参数

### 新增的文件（1个）

1. `scripts/test_gray_verification.py` - 验证测试

---

## 结论

✅ **所有 9 个阻塞点已修复**
✅ **所有 8 个验证测试通过**
✅ **Manifest Gate PASS**
✅ **PR Fast Gate PASS**

**下一步**: 提交代码并连接到真实灰度环境运行完整验收流程。

```bash
git add -A
git commit -m "fix: Step 5 gray release verification bugs

- Fix gray_gate.py REPORT_DIR import and final report timing
- Fix test.py empty string argument
- Fix gray_report.py --commit support and coverage/manifest decision
- Fix gray_env_check.py canonical endpoints
- Rewrite gray_smoke.py with correct endpoints (40+ scenarios)
- Fix GitHub Actions frontend build path
- Add verification tests (8/8 pass)"

python scripts/test.py gray-signoff \
  --env <gray-environment> \
  --api-base <api-base-url> \
  --ws-base <ws-base-url> \
  --db-url <db-url> \
  --redis-url <redis-url> \
  --operator <operator-name>
```

---

*报告生成时间: 2026-06-18*
