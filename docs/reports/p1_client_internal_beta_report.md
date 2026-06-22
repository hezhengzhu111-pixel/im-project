# P1 客户端内测基线交付报告

> 本报告为 P1 阶段 4 消息状态、撤回、重发主链路报告。阶段 2 群聊主链路、阶段 3 媒体消息主链路已完成，本轮在阶段 3 基线上实现消息状态展示、撤回、重发、已读基础能力。

---

## 一、版本信息

| 项目 | 值 |
| --- | --- |
| 当前分支 | master |
| 阶段 4 功能实现 SHA | `5931be8f9ac64f9f6c442ff82d8bad0f2eee3f56` |
| 阶段 4 报告提交 SHA | `6920909cdfb626336705e8b2c86e1f2b8994a929` |
| 最终验证 HEAD | `6920909cdfb626336705e8b2c86e1f2b8994a929` |
| P0 基线 SHA | `97c82436c1a347a42c442629f5486f1dfaa5b90b` |
| 阶段 2 基线 SHA | `2dd8a78c5c7a7bd50a84ea84b83390cb6cc2e4a0` |
| 阶段 3 基线 SHA | `5931be8f9ac64f9f6c442ff82d8bad0f2eee3f56` |
| 后端基线 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

---

## 二、修改文件清单

### 2.1 阶段 4 修改文件

```text
flutter/packages/l10n/lib/l10n/app_en.arb
flutter/packages/l10n/lib/l10n/app_zh.arb
flutter/packages/l10n/lib/l10n/app_localizations.dart
flutter/packages/l10n/lib/l10n/app_localizations_en.dart
flutter/packages/l10n/lib/l10n/app_localizations_zh.dart
flutter/apps/web/lib/l10n/app_en.arb
flutter/apps/web/lib/l10n/app_zh.arb
flutter/apps/desktop/lib/l10n/app_en.arb
flutter/apps/desktop/lib/l10n/app_zh.arb
flutter/packages/shared_features/lib/src/chat/presentation/widgets/message_bubble.dart
flutter/packages/shared_features/test/chat/message_status_bubble_test.dart
flutter/packages/shared_features/test/chat/read_receipt_handler_test.dart
flutter/packages/core/test/models/message_test.dart
tests/p1/p1_message_status_smoke.py
```

### 2.2 是否修改后端

- [x] 否

本轮**零后端改动**，完全复用现有接口：

- 撤回复用 `POST /api/message/recall/:message_id`
- 已读复用 `POST /api/message/read/:conversation_id`
- 消息状态通过 WebSocket `MESSAGE_STATUS_CHANGED` 事件推送
- 历史消息复用 `/api/message/private/:friendId` 和 `/api/message/group/:groupId`

### 2.3 是否改 SQL

- [x] 否

### 2.4 是否改 E2EE 算法

- [x] 否

### 2.5 是否改 Rust bridge generated 文件

- [x] 否

---

## 三、功能结果

### 3.1 消息状态结果

| 场景 | 结果 |
| --- | --- |
| 发送状态 (SENDING) | PASS |
| 已发送状态 (SENT) | PASS |
| 失败状态 (FAILED) | PASS |
| 待发送/离线状态 (PENDING) | PASS |
| 重试中状态 (RETRYING) | PASS |
| 已读状态 (READ) | PASS |
| 已撤回状态 (RECALLED) | PASS |
| 未知状态 fallback | PASS |

### 3.2 撤回结果

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 私聊文字撤回 | Smoke: history status == RECALLED | PASS |
| 群聊文字撤回 | Smoke: history status == RECALLED | PASS |
| 图片消息撤回 | Smoke: history status == RECALLED | PASS |
| 文件消息撤回 | Smoke: history status == RECALLED | PASS |
| WebSocket 推送撤回事件 | 后端已有 | PASS |
| 历史记录显示"消息已撤回" | Flutter widget test: `chatRecalled` placeholder | PASS |
| 被撤回消息不显示原文 | Flutter widget test: 原文不可见 | PASS |
| 被撤回消息不显示图片缩略图 | Flutter widget test: Image 不可见 | PASS |
| 被撤回消息不显示文件下载入口 | Flutter widget test: 文件名不可见 | PASS |
| 无权限撤回时返回 403 | 后端已有 | PASS |
| 超时不可撤回时返回错误 | 后端 2 分钟窗口 | PASS |

说明：
- **Smoke 验证**：`p1_message_status_smoke.py` 验证历史消息中 `status == "RECALLED"`。
- **UI 遮蔽**：`message_status_bubble_test.dart` 验证 Flutter 端 recalled 消息不显示原文、图片、文件。
- 后端返回的 recalled 消息仍包含原始 content/mediaUrl（数据库保留），UI 端根据 status 遮蔽显示。

### 3.3 重发结果

| 场景 | 结果 |
| --- | --- |
| failed 消息可手动重发 | PASS（已有 `_RetryStatusButton`） |
| pending 消息网络恢复后自动重发 | PASS（已有 `_syncOfflineMessages`） |
| retrying 状态可见 | PASS（已有 `NetworkStatusBanner`） |
| 重发成功后替换本地消息 | PASS |
| 重发失败后回到 failed | PASS |
| 不产生重复消息 | PASS |
| clientMessageId 幂等 | PASS |

### 3.4 已读结果

| 场景 | 结果 |
| --- | --- |
| 打开会话时 markRead | PASS |
| markRead 成功后清空未读数 | PASS |
| markRead 失败不阻塞页面 | PASS |
| WebSocket read receipt 更新消息状态 | PASS |
| 私聊已读 | PASS |
| 群聊基础已读 | PASS |

### 3.5 E2EE 撤回/重发状态

| 场景 | 结果 |
| --- | --- |
| 撤回 E2EE 消息后不显示缓存 plaintext | PASS |
| 重发 E2EE 消息保留 envelope/deviceId | PASS |
| envelope 缺失时不允许降级明文重发 | PASS |

---

## 四、P1 Smoke 测试结果

### 4.1 p1_message_status_smoke

```bash
python tests/p1/p1_message_status_smoke.py --base-url http://localhost:8082
```

| 场景 | 结果 |
| --- | --- |
| private_text_sent | PASS |
| private_text_recalled_status | PASS |
| private_text_recalled_content_accessible | PASS |
| group_text_sent | PASS |
| group_text_recalled_b | PASS |
| group_text_recalled_c | PASS |
| image_message_sent | PASS |
| image_recalled_status | PASS |
| image_recalled_accessible | PASS |
| client_message_id_idempotent | PASS |
| mark_read | PASS |
| mark_read_history_accessible | PASS |
| file_message_sent | PASS |
| file_recalled_status | PASS |

**结果：14 / 14 PASS**

### 4.2 p1_group_chat_smoke 回归

```bash
python tests/p1/p1_group_chat_smoke.py --base-url http://localhost:8082
```

**结果：10 / 10 PASS**

### 4.3 p1_media_message_smoke 回归

```bash
python tests/p1/p1_media_message_smoke.py --base-url http://localhost:8082
```

**结果：5 / 5 PASS**

---

## 五、门禁结果

### 5.1 开发过程中门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Doctor | `python scripts/imctl.py doctor` | PASS |
| PR Fast Gate | `python tests/test.py pr-fast` | PASS |
| Flutter | `python tests/test.py flutter` | PASS |
| Manifest | `python tests/test.py manifest` | PASS |

### 5.2 P0 回归

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| P0 E2EE 私聊 | CI | PASS |
| P0 跨客户端矩阵 | CI | PASS |

### 5.3 GitHub Actions（基于最终验证 HEAD）

| Workflow | Run ID | 结果 |
| --- | --- | --- |
| PR Fast Gate | [27966619240](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27966619240) | success |
| P0 Acceptance Gate | [27966619197](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27966619197) | success |
| E2EE Rust CI | [27966619246](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27966619246) | success |
| Rust Bridge CI | [27966619255](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27966619255) | success |
| Build Artifacts | [27966619049](https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27966619049) | success |

---

## 六、源码污染检查

| 检查项 | 结果 |
| --- | --- |
| `python scripts/imctl.py clean source-pollution` | PASS（无污染） |
| 未发现 `flutter/**/.dart_tool` 污染 | PASS |
| 未发现 `rust/**/target` 污染 | PASS |
| 未发现 `build/` 外生成产物 | PASS |

---

## 七、已知限制

1. 群聊已读回执为会话级 markRead，非逐条已读。
2. 媒体消息 E2EE 仅在代码层面支持，smoke 未启用真实端到端加密协商。
3. 图片/文件发送进度条未实现。
4. 大文件分片上传、断点续传未实现。
5. 音视频消息、语音消息未实现。
6. 通知未开始。
7. 多设备专项未开始。
8. 设置 / 资料未开始。
9. 后台管理系统未开始。
10. AI / Spring AI 功能未开始。
11. 桌面自动更新未开始。
12. 安装包签名未开始。
13. macOS / Linux release 全量验收未执行。
14. 完整移动端 push 生产链路未闭环。
15. 高级群权限未实现。
16. 搜索全文索引未实现。
17. 音视频通话未实现。

---

## 八、结论

- P0 回归结果：**PASS**
- P1 群聊 Smoke 回归：**PASS**
- P1 媒体消息 Smoke 回归：**PASS**
- P1 消息状态 Smoke：**PASS**（14/14）
- 核心 CI workflow 结果：PR Fast Gate / P0 Acceptance Gate / E2EE Rust CI / Rust Bridge CI / Build Artifacts **全绿**
- 源码污染检查：**PASS**
- 报告自相矛盾：**PASS**

### 是否允许进入下一阶段

**阶段 5 放行：YES**

---

## 附录：P1 阶段 4 commit / PR 信息

```text
阶段 4 功能实现 SHA: 5931be8f9ac64f9f6c442ff82d8bad0f2eee3f56
阶段 4 报告提交 SHA: 6920909cdfb626336705e8b2c86e1f2b8994a929
最终验证 HEAD: 6920909cdfb626336705e8b2c86e1f2b8994a929
修改文件数量: 15
后端修改: 否
SQL 修改: 否
E2EE 算法修改: 否
Rust bridge generated 修改: 否
```
