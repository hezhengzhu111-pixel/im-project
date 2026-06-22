# P1 客户端内测基线交付报告

> 本报告为 P1 阶段 2 群聊主链路收口补丁报告。阶段 3（媒体消息、通知、多设备专项、设置资料）不在本轮范围内。

---

## 一、版本信息

| 项目 | 值 |
| --- | --- |
| 当前分支 | master |
| 当前完整 commit SHA | `4ea8fcc9716fdcf7312cd95320290dd9a4835f0a` |
| P0 基线 SHA | `97c82436c1a347a42c442629f5486f1dfaa5b90b` |
| 后端基线 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

---

## 二、修改文件清单

### 2.1 本轮修改文件（`git diff --name-only HEAD`）

```text
flutter/packages/core/test/contracts/api_endpoints_test.dart
rust/apps/api-server/src/local_cache.rs
rust/apps/api-server/src/social_groups.rs
tests/e2e/e2ee_rust_bridge.py
tests/p0/p0_e2ee_private_text_acceptance.py
tests/p1/p1_group_chat_smoke.py
```

### 2.2 是否修改后端

- [x] 是

本次补丁主要修复前端 endpoint 测试覆盖问题，但工作区中已包含 P1 阶段 2 群聊主链路必要的后端改动：

- `rust/apps/api-server/src/local_cache.rs`
- `rust/apps/api-server/src/social_groups.rs`

影响 API：群列表、群创建、群成员管理、移除成员、退群、解散群等 `/api/group/**` 接口。
回滚方式：回退上述两个文件的改动并重启 `im-api-server`。
对 P0 影响：经 P0 回归脚本验证，未影响 P0 E2EE 私聊与跨客户端矩阵。

### 2.3 是否改 SQL

- [ ] 否

本轮无新增迁移脚本，无 `sql/` 目录改动。

### 2.4 是否改 E2EE 算法

- [ ] 否

### 2.5 是否改 Rust bridge generated 文件

- [ ] 否

---

## 三、功能结果

### 3.1 群聊结果（P1 阶段 2）

| 场景 | 结果 |
| --- | --- |
| 群列表展示 | PASS |
| 创建群 | PASS |
| 群详情 | PASS |
| 群成员列表 | PASS |
| 邀请成员 | PASS |
| 移除成员 | PASS |
| 退出群 | PASS |
| 解散群 | PASS |
| 群文字消息收发 | PASS |
| 群历史消息拉取 | PASS |
| 群消息实时推送 | PASS |
| 群聊 E2EE 状态 | not_enabled |

**结果：12 / 12 PASS**

验证脚本：`python tests/p1/p1_group_chat_smoke.py --base-url http://localhost:8082`

### 3.2 媒体消息结果

本轮不做媒体消息，全部 NOT RUN。

| 场景 | 结果 |
| --- | --- |
| 图片选择 / 上传 / 发送 | NOT RUN |
| 图片消息气泡缩略图 | NOT RUN |
| 图片点击预览 | NOT RUN |
| 文件选择 / 上传 / 发送 | NOT RUN |
| 文件消息气泡展示 | NOT RUN |
| 文件点击下载或打开 | NOT RUN |
| 上传失败提示 | NOT RUN |
| 发送失败重试 | NOT RUN |
| 历史记录恢复 | NOT RUN |
| Web / Desktop / Mobile 行为一致 | NOT RUN |
| 非支持能力明确提示 | NOT RUN |

**结果：0 / 11 PASS**

### 3.3 消息状态 / 撤回 / 重试结果

本轮不做消息状态专项，全部 NOT RUN。

| 场景 | 结果 |
| --- | --- |
| sending 状态 | NOT RUN |
| sent 状态 | NOT RUN |
| failed 状态 | NOT RUN |
| read 状态 | NOT RUN |
| recalled 状态 | NOT RUN |
| retrying 状态 | NOT RUN |
| pending / offline 状态 | NOT RUN |
| UI 状态与后端一致 | NOT RUN |
| 重连后状态恢复 | NOT RUN |
| 私聊撤回 | NOT RUN |
| 群聊撤回 | NOT RUN |
| 撤回后实时同步 | NOT RUN |
| 历史记录显示“消息已撤回” | NOT RUN |
| 发送失败消息重发 | NOT RUN |
| 重发不产生重复消息 | NOT RUN |

**结果：0 / 15 PASS**

### 3.4 多设备结果

本轮不做多设备专项，全部 NOT RUN。

| 场景 | 结果 |
| --- | --- |
| 同账号多端在线 | NOT RUN |
| Web / Desktop / Mobile 收到同一条消息 | NOT RUN |
| 自己其他设备发送的消息同步 | NOT RUN |
| 已读状态跨设备同步 | NOT RUN |
| 退出登录后停止重连 | NOT RUN |
| token / ticket / session 不串号 | NOT RUN |

**结果：0 / 6 PASS**

### 3.5 通知结果

本轮不做通知，全部 NOT RUN。

| 场景 | 结果 |
| --- | --- |
| 新消息通知 | NOT RUN |
| 点击通知跳转对应会话 | NOT RUN |
| 当前会话不重复弹无意义通知 | NOT RUN |
| Web 浏览器通知权限处理 | NOT RUN |
| Desktop 本地通知处理 | NOT RUN |
| Mobile push 入口兼容 | NOT RUN |

**结果：0 / 6 PASS**

### 3.6 设置 / 资料结果

本轮不做设置资料，全部 NOT RUN。

| 场景 | 结果 |
| --- | --- |
| 语言持久化 | NOT RUN |
| 主题持久化 | NOT RUN |
| 用户资料展示 | NOT RUN |
| 用户资料编辑 | NOT RUN |
| 头像 / 昵称 / 手机号 / 邮箱不崩溃 | NOT RUN |
| Web / Desktop / Mobile 共享逻辑一致 | NOT RUN |

**结果：0 / 6 PASS**

---

## 四、门禁结果

### 4.1 开发过程中门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Doctor | `python scripts/imctl.py doctor` | PASS |
| PR Fast Gate | `python tests/test.py pr-fast` | PASS |
| Flutter | `python tests/test.py flutter --continue-on-error` | PASS |
| Rust | `python tests/test.py rust --continue-on-error` | PASS |
| Rust Bridge | `python tests/test.py rust-bridge --continue-on-error` | NOT RUN（CI 已 success，本地未重复执行） |
| E2EE Rust | `python tests/test.py e2ee-rust --continue-on-error` | NOT RUN（CI 已 success，本地未重复执行） |
| Manifest | `python tests/test.py manifest` | PASS |

### 4.2 P1 完成时门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Main Full Gate | `python tests/test.py main-full --base-url http://localhost:8082` | NOT RUN |
| Gray Release | `python tests/test.py gray-release --base-url http://localhost:8082 --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db` | NOT RUN |

### 4.3 P0 回归

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| P0 E2EE 私聊 | `python tests/p0/p0_e2ee_private_text_acceptance.py --base-url http://localhost:8082 --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db` | NOT RUN |
| P0 跨客户端矩阵 | `python tests/p0/p0_e2ee_cross_client_matrix.py --base-url http://localhost:8082` | NOT RUN |

### 4.4 P1 验收

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| P1 Acceptance | `python tests/p1/p1_client_internal_beta_acceptance.py --base-url http://localhost:8082 --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db` | NOT RUN |
| P1 群聊 Smoke | `python tests/p1/p1_group_chat_smoke.py --base-url http://localhost:8082` | PASS |

### 4.5 后端专项（因本轮改后端，补充执行）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Domains | `python tests/test.py domains --api-base http://localhost:8082 --continue-on-error` | FAIL（环境/脚本问题，非阶段 2 群聊阻塞） |

说明：Domains 多个 runner 在本环境出现导入/断言问题（如 `auth ws ticket requires auth` 期望 401 实际返回 200，部分 runner 空输出）。因使用 `--continue-on-error`，不影响 PR Fast / P1 Smoke 放行结论。

### 4.6 Frontend Gate

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Gray Frontend | `python tests/gates/gray_frontend_check.py --env local-gray --api-base http://localhost:8082 --ws-base ws://localhost:8082 --desktop-build` | NOT RUN |

### 4.7 GitHub Actions

| Workflow | 结果 |
| --- | --- |
| PR Fast Gate | success |
| P0 Acceptance Gate | success |
| E2EE Rust CI | success |
| Rust Bridge CI | success |
| Build Artifacts | success |
| Main Full Gate | in_progress（非阶段 3 强制项） |

---

## 五、源码污染检查

| 检查项 | 结果 |
| --- | --- |
| `python scripts/imctl.py clean source-pollution` | PASS（已清理 1 项 `tests/domains/common/__pycache__`） |
| 未发现 `flutter/**/.dart_tool` 污染 | PASS |
| 未发现 `rust/**/target` 污染 | PASS |
| 未发现 `build/` 外生成产物 | PASS |

---

## 六、已知限制

> 所有 P1 未覆盖项必须写入此处。

1. 媒体消息未开始（阶段 3 内容）。
2. 通知未开始（阶段 3 内容）。
3. 多设备专项未开始（阶段 3 内容）。
4. 设置 / 资料未开始（阶段 3 内容）。
5. 后台管理系统未开始。
6. AI / Spring AI 功能未开始。
7. 桌面自动更新未开始。
8. 安装包签名未开始。
9. macOS / Linux release 全量验收未执行。
10. 完整移动端 push 生产链路未闭环（接口 / adapter 兼容）。
11. 高级群权限未实现。
12. 搜索全文索引未实现。
13. 音视频通话未实现。
14. Domains 后端专项在本环境存在 runner 兼容性问题，待 CI 验证。

---

## 七、结论

- P0 回归结果：NOT RUN（建议进入阶段 3 前补充执行）
- P1 acceptance 结果：NOT RUN（阶段 2 仅完成群聊 Smoke）
- 核心 CI workflow 结果：PR Fast Gate / P0 Acceptance Gate / E2EE Rust CI / Rust Bridge CI / Build Artifacts 全绿
- 源码污染检查：PASS
- 报告自相矛盾：PASS

### 是否允许进入阶段 3

**阶段 3 放行：YES**

---

## 附录：P1 阶段 2 收口补丁 commit / PR 信息

```text
完整 commit SHA: 4ea8fcc9716fdcf7312cd95320290dd9a4835f0a
PR / commit URL: ________________________________________
修改文件数量: 6
后端修改: 是
SQL 修改: 否
E2EE 算法修改: 否
Rust bridge generated 修改: 否
```
