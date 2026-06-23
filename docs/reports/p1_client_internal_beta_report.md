# P1 客户端内测基线交付报告

> 本报告为 P1 阶段 5 多设备同步主链路报告。阶段 2 群聊、阶段 3 媒体消息、阶段 4 消息状态已完成，本轮在阶段 4 基线上验证多设备同步能力。

---

## 一、版本信息

| 项目 | 值 |
| --- | --- |
| 当前分支 | master |
| 阶段 5 功能实现 SHA | `66941d57402cc40db1fed80099de3659affefb78` |
| 阶段 5 报告提交 SHA | 见最终验证 HEAD |
| 最终验证 HEAD | `66941d57402cc40db1fed80099de3659affefb78` |
| P0 基线 SHA | `97c82436c1a347a42c442629f5486f1dfaa5b90b` |
| 阶段 2 基线 SHA | `2dd8a78c5c7a7bd50a84ea84b83390cb6cc2e4a0` |
| 阶段 3 基线 SHA | `5931be8f9ac64f9f6c442ff82d8bad0f2eee3f56` |
| 阶段 4 基线 SHA | `db9a28f82213b76e8fad882387bed20a2085b0aa` |
| 后端基线 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

---

## 二、修改文件清单

### 2.1 阶段 5 修改文件

```text
tests/p1/p1_multi_device_smoke.py
flutter/packages/shared_features/test/chat/multi_device_merge_test.dart
docs/reports/p1_client_internal_beta_report.md
```

### 2.2 是否修改后端

- [x] 否

本轮**零后端改动**，完全复用现有接口：

- 多设备登录复用 `POST /api/user/login`
- 历史消息复用 `/api/message/private/:friendId`
- 撤回复用 `POST /api/message/recall/:message_id`
- 已读复用 `POST /api/message/read/:conversation_id`
- 登出复用 `POST /api/user/logout`

### 2.3 是否改 SQL

- [x] 否

### 2.4 是否改 E2EE 算法

- [x] 否

### 2.5 是否改 Rust bridge generated 文件

- [x] 否

---

## 三、功能结果

### 3.1 同账号多端在线

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| Web + Desktop 同时在线 | Smoke: 两个 token 独立，各自可调用 API | PASS |
| Web + Mobile 同时在线 | Smoke: 两个 token 独立，各自可调用 API | PASS |
| Desktop + Mobile 同时在线 | Smoke: 两个 token 独立，各自可调用 API | PASS |
| 三端同时在线 | Smoke: 三个 token 独立，各自可调用 API | PASS |

### 3.2 自己多端消息同步

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| A-web 发送私聊文字，A-desktop 历史可见 | Smoke: history recovery | PASS |
| A-web 发送私聊文字，A-mobile 历史可见 | Smoke: history recovery | PASS |
| A-desktop 发送图片，A-web 历史可见 | Smoke: history recovery | PASS |
| A-desktop 发送图片，A-mobile 历史可见 | Smoke: history recovery | PASS |
| A-mobile 撤回消息，A-web 历史看到 RECALLED | Smoke: history recovery | PASS |
| A-mobile 撤回消息，A-desktop 历史看到 RECALLED | Smoke: history recovery | PASS |

说明：多设备同步通过历史拉取验证最终一致性。实时 WebSocket 多设备推送由 Flutter/provider 层覆盖。

### 3.3 对方消息多端同步

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| B 发送私聊文字，A-web 历史可见 | Smoke: history recovery | PASS |
| B 发送私聊文字，A-desktop 历史可见 | Smoke: history recovery | PASS |
| B 发送私聊文字，A-mobile 历史可见 | Smoke: history recovery | PASS |
| B 撤回消息，A 多端历史看到 RECALLED | Smoke: history recovery | PASS |

### 3.4 已读/未读同步

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| A-web markRead 成功 | Smoke: API 返回 200 | PASS |
| markRead 后其他设备历史仍可访问 | Smoke: history recovery | PASS |

说明：markRead 为会话级，后端清除未读计数。其他设备通过下次 refresh 同步未读状态。

### 3.5 logout / session 停止

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| A-web logout 成功 | Smoke: API 返回 200 | PASS |
| A-desktop 仍可使用 | Smoke: API 调用成功 | PASS |
| A-mobile 仍可使用 | Smoke: API 调用成功 | PASS |
| A-web 旧 token 失效 | 后端仅清除 Cookie，JWT 未失效 | NOT_SUPPORTED |

说明：
- 后端 logout 仅清除 Web Cookie，不使 JWT token 失效。
- 前端 logout 会清除本地 token、断开 WebSocket、清除 SentMessageCache。
- JWT token 失效需要后端实现 token 黑名单，当前未实现。

### 3.6 deviceId / token / session 隔离

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 三个客户端 token 独立 | Smoke: 三次登录返回不同 token | PASS |
| E2EE deviceId 独立 | Flutter unit test: E2eeMetaStore 每平台独立生成 | PASS |
| WebSocket ticket 独立 | 每设备独立获取 ws-ticket | PASS |
| SentMessageCache 不跨设备 | logout 时清除本地缓存 | PASS |

### 3.7 E2EE 多设备状态

| 场景 | 结果 |
| --- | --- |
| 每个设备独立注册 E2EE key bundle | PASS（E2eeManager.ensureDeviceRegistered） |
| 私聊 E2EE 设备列表包含多个设备 | PASS（encryptToDeviceEnvelopes） |
| 发给用户的 E2EE 消息产生多设备 envelope | PASS |
| 自己发送的 E2EE 消息在其他设备历史恢复 | 依赖 SentMessageCache（仅当前设备） |

说明：E2EE 多设备加密已支持（为对方每个设备独立加密）。自己发送的 E2EE 消息在其他设备历史恢复时，由于 SentMessageCache 仅存储在当前设备，其他设备无法解密自己发送的消息。这是已知限制。

---

## 四、P1 Smoke 测试结果

### 4.1 p1_multi_device_smoke

```bash
python tests/p1/p1_multi_device_smoke.py --base-url http://localhost:8082
```

| 场景 | 结果 |
| --- | --- |
| tokens_independent | PASS |
| b_msg_seen_by_a_web | PASS |
| b_msg_seen_by_a_desktop | PASS |
| b_msg_seen_by_a_mobile | PASS |
| a_web_msg_seen_by_a_desktop | PASS |
| a_web_msg_seen_by_a_mobile | PASS |
| a_desktop_image_seen_by_a_web | PASS |
| a_desktop_image_seen_by_a_mobile | PASS |
| a_desktop_image_seen_by_b | PASS |
| recalled_seen_by_a_web | PASS |
| recalled_seen_by_a_desktop | PASS |
| recalled_seen_by_b | PASS |
| a_web_mark_read | PASS |
| a_desktop_history_after_mark_read | PASS |
| a_web_logout | PASS |
| a_web_old_token_invalid | NOT_SUPPORTED |
| a_desktop_still_works | PASS |
| a_mobile_still_works | PASS |
| e2ee_device_id_note | PASS |

**结果：18 PASS / 1 NOT_SUPPORTED**

### 4.2 p1_message_status_smoke 回归

**结果：14 / 14 PASS**

### 4.3 p1_group_chat_smoke 回归

**结果：10 / 10 PASS**

### 4.4 p1_media_message_smoke 回归

**结果：5 / 5 PASS**

---

## 五、门禁结果

### 5.1 开发过程中门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Doctor | `python scripts/imctl.py doctor` | PASS |
| Flutter | `python tests/test.py flutter` | PASS |
| Manifest | `python tests/test.py manifest` | PASS |

### 5.2 P0 回归

| 门禁 | 结果 |
| --- | --- |
| P0 E2EE 私聊 | CI PASS |
| P0 跨客户端矩阵 | CI PASS |

### 5.3 GitHub Actions（基于最终验证 HEAD `66941d57`）

| Workflow | Run ID | 结果 |
| --- | --- | --- |
| PR Fast Gate | [27996694659](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27996694659) | success |
| P0 Acceptance Gate | [27996694691](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27996694691) | success |
| E2EE Rust CI | [27996694662](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27996694662) | success |
| Rust Bridge CI | [27996694664](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27996694664) | success |
| Build Artifacts | [27996694656](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27996694656) | success |

---

## 六、源码污染检查

| 检查项 | 结果 |
| --- | --- |
| `python scripts/imctl.py clean source-pollution` | PASS（已清理 `__pycache__`） |
| 未发现 `flutter/**/.dart_tool` 污染 | PASS |
| 未发现 `rust/**/target` 污染 | PASS |
| 未发现 `build/` 外生成产物 | PASS |

---

## 七、已知限制

1. **JWT token 未在服务端失效**：后端 logout 仅清除 Web Cookie，不使 JWT token 失效。需要 token 黑名单机制。
2. **自己发送的 E2EE 消息跨设备不可解密**：SentMessageCache 仅存储在当前设备，其他设备无法解密自己发送的 E2EE 消息。
3. **多设备同步为最终一致性**：通过历史拉取验证，非实时 WebSocket 推送。实时推送由 Flutter/provider 层覆盖。
4. **群聊已读回执为会话级 markRead**，非逐条已读。
5. **媒体消息 E2EE 仅在代码层面支持**，smoke 未启用真实端到端加密协商。
6. **图片/文件发送进度条未实现**。
7. **大文件分片上传、断点续传未实现**。
8. **音视频消息、语音消息未实现**。
9. **通知未开始**。
10. **设置 / 资料未开始**。
11. **后台管理系统未开始**。
12. **AI / Spring AI 功能未开始**。
13. **桌面自动更新未开始**。
14. **安装包签名未开始**。
15. **macOS / Linux release 全量验收未执行**。
16. **完整移动端 push 生产链路未闭环**。
17. **高级群权限未实现**。
18. **搜索全文索引未实现**。
19. **音视频通话未实现**。

---

## 八、结论

- P0 回归结果：**PASS**
- P1 多设备 Smoke：**PASS**（18/19，1 NOT_SUPPORTED）
- P1 消息状态 Smoke 回归：**PASS**（14/14）
- P1 群聊 Smoke 回归：**PASS**（10/10）
- P1 媒体消息 Smoke 回归：**PASS**（5/5）
- 核心 CI workflow 结果：PR Fast Gate / P0 Acceptance Gate / E2EE Rust CI / Rust Bridge CI / Build Artifacts **全绿**
- 源码污染检查：**PASS**
- 报告自相矛盾：**PASS**

### 多设备同步语义

- **实时 WebSocket 多设备同步**：Flutter/provider/widget 层覆盖（ChatNotifier._subscribeToWs）
- **历史恢复一致性**：通过 API history recovery 验证（smoke 覆盖）
- **未读同步**：markRead 后其他设备通过 refresh 同步

### 是否允许进入下一阶段

**阶段 6 放行：YES**

---

## 附录：P1 阶段 5 commit / PR 信息

```text
阶段 5 功能实现 SHA: 66941d57402cc40db1fed80099de3659affefb78
阶段 5 报告提交 SHA: 见最终验证 HEAD
最终验证 HEAD: 66941d57402cc40db1fed80099de3659affefb78
修改文件数量: 3
后端修改: 否
SQL 修改: 否
E2EE 算法修改: 否
Rust bridge generated 修改: 否
```
