# P1 客户端内测基线交付报告

> 本报告在 P1 全部功能开发完成后填写，阶段 1 仅作为模板占位。

---

## 一、版本信息

| 项目 | 值 |
| --- | --- |
| 当前分支 | master |
| 当前完整 commit SHA | `________________________________________` |
| P0 基线 SHA | `97c82436c1a347a42c442629f5486f1dfaa5b90b` |
| 后端基线 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

---

## 二、修改文件清单

> P1 完成后按 git diff `--name-only` 结果补充。

```text
# 示例：
# flutter/packages/shared_features/lib/...
# flutter/packages/core/lib/...
# rust/apps/api-server/src/...
# tests/p1/...
# docs/plans/p1_client_internal_beta_plan.md
# docs/reports/p1_client_internal_beta_report.md
```

### 2.1 是否修改后端

- [ ] 是
- [ ] 否

如勾选“是”，必须在报告中补充：

- 为什么客户端不能单独解决；
- 影响哪些 API；
- 如何回滚；
- 是否影响 P0。

### 2.2 是否改 SQL

- [ ] 是
- [ ] 否

### 2.3 是否改 E2EE 算法

- [ ] 是
- [ ] 否

### 2.4 是否改 Rust bridge generated 文件

- [ ] 是
- [ ] 否

---

## 三、功能结果

### 3.1 群聊结果

| 场景 | 结果 |
| --- | --- |
| 群列表展示 | NOT RUN |
| 创建群 | NOT RUN |
| 群详情 | NOT RUN |
| 群成员列表 | NOT RUN |
| 邀请成员 | NOT RUN |
| 移除成员 | NOT RUN |
| 退出群 | NOT RUN |
| 解散群 | NOT RUN |
| 群文字消息收发 | NOT RUN |
| 群历史消息拉取 | NOT RUN |
| 群消息实时推送 | NOT RUN |
| 群聊 E2EE 基础能力 / 明确降级 | NOT RUN |

**结果：__ / __ PASS**

### 3.2 媒体消息结果

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

**结果：__ / __ PASS**

### 3.3 消息状态 / 撤回 / 重试结果

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

**结果：__ / __ PASS**

### 3.4 多设备结果

| 场景 | 结果 |
| --- | --- |
| 同账号多端在线 | NOT RUN |
| Web / Desktop / Mobile 收到同一条消息 | NOT RUN |
| 自己其他设备发送的消息同步 | NOT RUN |
| 已读状态跨设备同步 | NOT RUN |
| 退出登录后停止重连 | NOT RUN |
| token / ticket / session 不串号 | NOT RUN |

**结果：__ / __ PASS**

### 3.5 通知结果

| 场景 | 结果 |
| --- | --- |
| 新消息通知 | NOT RUN |
| 点击通知跳转对应会话 | NOT RUN |
| 当前会话不重复弹无意义通知 | NOT RUN |
| Web 浏览器通知权限处理 | NOT RUN |
| Desktop 本地通知处理 | NOT RUN |
| Mobile push 入口兼容 | NOT RUN |

**结果：__ / __ PASS**

### 3.6 设置 / 资料结果

| 场景 | 结果 |
| --- | --- |
| 语言持久化 | NOT RUN |
| 主题持久化 | NOT RUN |
| 用户资料展示 | NOT RUN |
| 用户资料编辑 | NOT RUN |
| 头像 / 昵称 / 手机号 / 邮箱不崩溃 | NOT RUN |
| Web / Desktop / Mobile 共享逻辑一致 | NOT RUN |

**结果：__ / __ PASS**

---

## 四、门禁结果

### 4.1 开发过程中门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Doctor | `python scripts/imctl.py doctor` | NOT RUN |
| PR Fast Gate | `python tests/test.py pr-fast` | NOT RUN |
| Flutter | `python tests/test.py flutter --continue-on-error` | NOT RUN |
| Rust | `python tests/test.py rust --continue-on-error` | NOT RUN |
| Rust Bridge | `python tests/test.py rust-bridge --continue-on-error` | NOT RUN |
| E2EE Rust | `python tests/test.py e2ee-rust --continue-on-error` | NOT RUN |
| Manifest | `python tests/test.py manifest` | NOT RUN |

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

### 4.5 Frontend Gate

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Gray Frontend | `python tests/gates/gray_frontend_check.py --env local-gray --api-base http://localhost:8082 --ws-base ws://localhost:8082 --desktop-build` | NOT RUN |

### 4.6 GitHub Actions

| Workflow | 结果 |
| --- | --- |
| PR Fast Gate | NOT RUN |
| PR Fast Gate (Rust + Flutter) | NOT RUN |
| E2EE Rust CI | NOT RUN |
| Rust Bridge CI | NOT RUN |
| Build Artifacts | NOT RUN |
| Main Full Gate | NOT RUN |

---

## 五、源码污染检查

| 检查项 | 结果 |
| --- | --- |
| `python scripts/imctl.py clean source-pollution` | NOT RUN |
| 未发现 `flutter/**/.dart_tool` 污染 | NOT RUN |
| 未发现 `rust/**/target` 污染 | NOT RUN |
| 未发现 `build/` 外生成产物 | NOT RUN |

---

## 六、已知限制

> 所有 P1 未覆盖项必须写入此处。

1. 后台管理系统未开始。
2. AI / Spring AI 功能未开始。
3. 桌面自动更新未开始。
4. 安装包签名未开始。
5. macOS / Linux release 全量验收未执行。
6. 完整移动端 push 生产链路未闭环（接口 / adapter 兼容）。
7. 高级群权限未实现。
8. 搜索全文索引未实现。
9. 音视频通话未实现。
10. 其他：______________________________

---

## 七、结论

- P0 回归结果：NOT RUN
- P1 acceptance 结果：NOT RUN
- 核心 CI workflow 结果：NOT RUN
- 源码污染检查：NOT RUN
- 报告自相矛盾：NOT RUN

### 是否允许进入 P2

**P1 放行：NO**（模板占位，完成后再判定）

---

## 附录：P1 完成后应补充的 commit / PR 信息

```text
完整 commit SHA: ________________________________________
PR / commit URL: ________________________________________
修改文件数量: __
后端修改: 是 / 否
SQL 修改: 是 / 否
E2EE 算法修改: 是 / 否
Rust bridge generated 修改: 是 / 否
```
