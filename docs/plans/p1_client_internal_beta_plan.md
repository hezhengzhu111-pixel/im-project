# P1 客户端内测基线计划

> 阶段：P1
> 基线分支：master @ `97c82436c1a347a42c442629f5486f1dfaa5b90b`
> 目标：在 P0 最小可用闭环之上，把 IM 客户端推进到“可内测”的功能完整度。

---

## 一、P1 总目标

让 Flutter Web / Desktop / Mobile 达到 P1 内测标准：

1. **群聊主链路可用**：创建群、群列表、群详情、群成员管理、群文字消息收发、群历史消息拉取、群消息实时推送、群聊 E2EE 基础能力或明确降级。
2. **媒体消息主链路可用**：图片 / 文件消息的发送、展示、上传失败提示、发送失败重试、历史记录恢复，三端行为一致。
3. **消息状态完整**：sending / sent / failed / read / recalled / retrying / pending / offline，UI 状态与后端一致，重连后可恢复。
4. **消息撤回与重发**：私聊 / 群聊撤回、撤回后实时同步、历史记录正确显示“消息已撤回”、发送失败消息可重发且不重复。
5. **多设备体验**：同账号多端在线、多端收到同一条消息、自己其他设备发送的消息同步、已读状态跨设备同步、退出登录后停止重连、token / ticket / session 不串号。
6. **通知体验**：新消息通知、点击通知跳转对应会话、当前会话不重复弹无意义通知、Web 浏览器通知权限处理、Desktop 本地通知处理、Mobile push 入口保持兼容。
7. **设置与资料**：语言 / 主题持久化、用户资料页可编辑基础资料、头像 / 昵称 / 手机号 / 邮箱展示不崩溃、三端共享逻辑尽量一致。
8. **错误与可观测性**：用户可见错误提示明确，区分网络 / 权限 / 上传 / E2EE 错误，不向 UI 暴露 stack trace，不记录明文敏感信息，AppLogger 分类清晰。

---

## 二、P1 范围

### 2.1 在范围内

- 群聊（创建、列表、详情、成员管理、消息收发、历史、推送、基础 E2EE）。
- 媒体消息（图片、文件、上传、展示、失败重试、历史恢复）。
- 消息状态（发送、已读、撤回、重发、pending/offline）。
- 通知与跳转（新消息通知、权限、点击跳转、当前会话去重）。
- 多设备同步（登录、消息、已读、退出、deviceId 隔离）。
- 设置与资料（语言、主题、资料展示与编辑、错误提示）。
- P1 SIT / smoke 验收脚本。
- P1 交付报告。

### 2.2 不在范围内（明确排除）

- 后台管理系统（admin-console）。
- AI / Spring AI 功能。
- 桌面自动更新。
- 安装包签名。
- macOS / Linux release 全量验收（Windows 为主，其他平台文档说明）。
- 完整移动端 push 生产链路（P1 只保持接口 / adapter 兼容）。
- 高级群权限（全员禁言、管理员层级、入群审核等）。
- 搜索全文索引。
- 音视频通话。

---

## 三、开发阶段拆分

### 阶段 1：P1 基线整理

- 修正 P0 报告中旧 HEAD SHA。
- 新增本文档 `docs/plans/p1_client_internal_beta_plan.md`。
- 新增交付报告模板 `docs/reports/p1_client_internal_beta_report.md`。
- 不改业务代码。
- 验收：文档存在、P0 SHA 对齐、门禁通过。

### 阶段 2：群聊主链路

**目标**：Web / Desktop / Mobile 共用 `shared_features` 的群聊能力。

必须完成：

- 群列表页：名称、头像、成员数、最后消息、未读数，空列表不崩溃，失败可重试。
- 创建群：从联系人选择成员，群名必填，成功后跳转群会话，失败明确提示。
- 群详情：名称、成员列表、身份标识、退出 / 解散 / 移除 / 邀请。
- 群消息：发送文字、拉取历史、WebSocket 实时插入、sessionKey 规范统一、未读数正确。
- 群 E2EE：如后端已支持则跑通基础路径；如不完整则明确提示“群聊暂未启用端到端加密”。

测试要求：

- `shared_features` group provider test
- group page widget test
- group route test
- group message send / history test
- Web / Desktop provider smoke
- P1 SIT 群聊 smoke

### 阶段 3：媒体消息

**目标**：图片 / 文件消息达到内测可用。

必须完成：

- 图片消息：选择、上传、发送、缩略图展示、点击预览、历史恢复、上传失败重试或重新选择。
- 文件消息：选择、上传、发送、文件名/大小/类型展示、点击下载或打开，Web 不支持能力明确提示，Desktop 未完成的本地打开/保存能力不崩溃。
- Outbox：图片 / 文件失败后进入 outbox，pending + failed 可重试，重试成功不重复插入。
- E2EE 媒体消息：如已支持 envelope 则保留；如暂不支持则明确降级。
- 安全：不把本地文件路径当 URL 发给后端，日志不输出本地路径 / 上传 token / 签名 URL，文件大小 / 类型限制明确。

测试要求：

- file picker adapter test
- file api test
- image bubble widget test
- file bubble widget test
- media outbox retry test
- history recovery test
- Web / Desktop / Mobile 平台差异测试

### 阶段 4：消息状态、撤回、重发

必须完成：

- 发送状态：sending / sent / failed / retrying / pending / offline。
- 已读状态：私聊已读、群聊可先做“已送达 / 未读数”（复杂则在文档说明）。
- 撤回：私聊 / 群聊撤回、WebSocket 推送撤回事件、历史记录显示撤回状态、被撤回消息不显示原文、E2EE 撤回后不泄露 plaintext。
- 重发：failed 手动重发、pending 网络恢复后自动重发、使用同一 clientMessageId 或明确幂等策略、不产生重复消息。

测试要求：

- message status reducer tests
- recall message tests
- retry failed message tests
- duplicate clientMessageId tests
- websocket status event tests

### 阶段 5：多设备同步

必须完成：

- 同账号多设备登录：Web + Desktop、Web + Mobile、Desktop + Mobile。
- 消息同步：A 设备发送，B 设备看到自己发送的消息；对方发消息所有在线设备收到；历史记录一致。
- 已读同步：一个设备读会话，其他设备未读数更新；后端不支持实时同步则至少刷新后正确。
- 退出登录：logout 后停止 WebSocket、不再重连、清理本地敏感缓存、保留用户设置。
- E2EE：每个设备独立 deviceId，不复用 device key，不把一个设备 session state 用到另一个设备，sent message cache 不导致历史恢复错误。

测试要求：

- P1 multi-device smoke
- Web / Desktop / Mobile label matrix
- logout reconnect stop test
- deviceId isolation test

### 阶段 6：通知与跳转

必须完成：

- 收到新消息时通知。
- 当前会话不重复弹干扰通知。
- 点击通知跳转对应会话。
- Web Notification 权限处理（default / granted / denied）。
- Desktop 通知展示标题和摘要，点击行为平台不支持时文档说明。
- Mobile push：P1 只要求接口 / adapter 不破坏，不要求完整生产闭环。

测试要求：

- notification adapter test
- notification permission test
- notification route jump test
- no notification for active session test

### 阶段 7：设置、资料、错误体验

必须完成：

- 语言设置：三端持久化，重启后恢复。
- 主题设置：light / dark / system，重启后恢复。
- 用户资料：昵称、头像、手机号、邮箱展示，空值不崩溃，修改后刷新状态。
- 错误体验：网络错误、401 / 403 / 404、上传失败、E2EE 失败分类提示，不展示 raw exception / stack trace。

测试要求：

- settings persistence test
- profile update test
- error mapping test
- auth expired redirect test
- forbidden page test

---

## 四、后端改动原则

优先复用现有 API。只有在客户端无法单独解决或 P1 必须补充后端能力时才允许修改后端，且必须满足：

1. 保持 P0 API 向后兼容。
2. 不破坏现有 P0 验收脚本。
3. 不降低 E2EE 安全约束。
4. 不新增破坏性数据库迁移。
5. 新增接口必须有测试。
6. 修改前写明：客户端不能单独解决的原因、影响哪些 API、如何回滚、是否影响 P0。

可能需要的后端能力：

- 群成员管理。
- 群消息历史。
- 群撤回。
- 媒体上传元数据。
- 消息状态同步。
- 多设备会话查询。
- 通知点击 payload。

禁止：

- 新增破坏性 SQL。
- 删除旧接口。
- 改变 P0 response shape。
- E2EE plaintext 存数据库。
- 服务端持有私钥。
- 绕过 DB 明文扫描。

---

## 五、源码目录约束

禁止直接在源码目录执行构建 / 测试命令：

```bash
cd rust && cargo build
cd flutter/apps/web && flutter test
cd flutter/apps/desktop && flutter build windows
cd spring-ai && mvn package
```

所有构建、测试、分析必须通过脚本入口：

```bash
python scripts/imctl.py doctor
python scripts/imctl.py clean source-pollution
python tests/test.py pr-fast
python tests/test.py flutter --continue-on-error
python tests/test.py rust --continue-on-error
python tests/test.py rust-bridge --continue-on-error
python tests/test.py e2ee-rust --continue-on-error
python tests/test.py manifest
python tests/test.py gray-release
```

新增专项命令优先加到 `tests/test.py` 或 `tests/gates/**`。

---

## 六、P1 SIT / Smoke

新增或补齐：

- `tests/p1/p1_client_internal_beta_acceptance.py`
- `tests/p1/p1_group_chat_smoke.py`
- `tests/p1/p1_media_message_smoke.py`
- `tests/p1/p1_message_status_smoke.py`
- `tests/p1/p1_multi_device_smoke.py`
- `tests/p1/p1_notification_smoke.py`

`p1_client_internal_beta_acceptance.py` 至少覆盖：

- 注册 3 个用户。
- Web / Desktop / Mobile 三类客户端 label。
- 私聊文字消息。
- 群聊创建与文字消息。
- 图片消息。
- 文件消息。
- 消息撤回。
- failed / retry 流程。
- 多设备同步。
- 通知 payload。
- E2EE 私聊不退化。
- DB 明文扫描。
- 旧 P0 脚本继续 PASS。

所有脚本必须能从仓库根目录运行。

---

## 七、必须执行的门禁

开发过程中至少执行：

```bash
python scripts/imctl.py doctor
python tests/test.py pr-fast
python tests/test.py flutter --continue-on-error
python tests/test.py rust --continue-on-error
python tests/test.py rust-bridge --continue-on-error
python tests/test.py e2ee-rust --continue-on-error
python tests/test.py manifest
```

P1 完成时执行：

```bash
python tests/test.py main-full --base-url http://localhost:8082
python tests/test.py gray-release --base-url http://localhost:8082 --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

P0 回归：

```bash
python tests/p0/p0_e2ee_private_text_acceptance.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db

python tests/p0/p0_e2ee_cross_client_matrix.py \
  --base-url http://localhost:8082
```

P1 验收：

```bash
python tests/p1/p1_client_internal_beta_acceptance.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

Frontend gate：

```bash
python tests/gates/gray_frontend_check.py \
  --env local-gray \
  --api-base http://localhost:8082 \
  --ws-base ws://localhost:8082 \
  --desktop-build
```

---

## 八、P1 完成标准

P1 只有在以下条件全部满足时才能宣布完成：

- P0 所有脚本继续 PASS。
- P1 acceptance PASS。
- Flutter 6 个 target 全部 analyze / test PASS（core / core_flutter / shared_features / web / mobile / desktop）。
- Rust gate PASS。
- Rust Bridge gate PASS。
- E2EE Rust gate PASS。
- Manifest gate PASS。
- Gray Frontend PASS。
- Build Artifacts PASS。
- GitHub Actions 核心 workflow 全绿。
- 源码目录无污染。
- 报告没有自相矛盾。
- 所有 P1 非覆盖项都写入 known limitations。

---

## 九、建议提交拆分

按小提交推进：

1. `docs: align P0 report HEAD and add P1 plan`
2. `feat(group): complete shared group chat flow`
3. `test(group): add group chat P1 smoke coverage`
4. `feat(media): support image and file message flow`
5. `test(media): add media outbox and history tests`
6. `feat(message): complete status recall retry flow`
7. `test(message): add recall retry duplicate tests`
8. `feat(device): harden multi-device sync`
9. `test(device): add P1 multi-device acceptance`
10. `feat(notification): add notification routing behavior`
11. `test(notification): add notification permission and jump tests`
12. `feat(settings): harden profile settings and error mapping`
13. `test(p1): add p1_client_internal_beta_acceptance`
14. `ci: wire P1 gates into tests/test.py and gray release`
15. `docs: write P1 delivery report`

每个提交后至少跑：

```bash
python scripts/imctl.py doctor
python tests/test.py pr-fast
```

涉及 E2EE / Rust bridge / 后端时额外跑：

```bash
python tests/test.py rust-bridge --continue-on-error
python tests/test.py e2ee-rust --continue-on-error
python tests/test.py rust --continue-on-error
```
