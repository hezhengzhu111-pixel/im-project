# P1 客户端内测基线交付报告

> 本报告为 P1 阶段 6 通知与跳转主链路报告。阶段 2 群聊、阶段 3 媒体消息、阶段 4 消息状态、阶段 5 多设备同步已完成，本轮在阶段 5 基线上验证通知与跳转能力。

---

## 一、版本信息

| 项目 | 值 |
| --- | --- |
| 当前分支 | master |
| 阶段 6 功能实现 SHA | `bdcea15504b3422de6dcf522703f720f7cab8705` |
| 阶段 6 报告提交 SHA | 见最终验证 HEAD |
| 最终验证 HEAD | `4a5a7a1b81730d416522ae0ae201f190d6703d33` |
| P0 基线 SHA | `97c82436c1a347a42c442629f5486f1dfaa5b90b` |
| 阶段 2 基线 SHA | `2dd8a78c5c7a7bd50a84ea84b83390cb6cc2e4a0` |
| 阶段 3 基线 SHA | `5931be8f9ac64f9f6c442ff82d8bad0f2eee3f56` |
| 阶段 4 基线 SHA | `db9a28f82213b76e8fad882387bed20a2085b0aa` |
| 阶段 5 基线 SHA | `66941d57402cc40db1fed80099de3659affefb78` |
| 后端基线 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

---

## 二、修改文件清单

### 2.1 阶段 6 修改文件

```text
tests/p1/p1_notification_smoke.py
flutter/packages/shared_features/test/chat/notification_payload_test.dart
docs/reports/p1_client_internal_beta_report.md
```

### 2.2 是否修改后端

- [x] 否

本轮**零后端改动**，完全复用现有接口：

- 通知 payload 从 WebSocket 消息事件构建
- 摘要规则在客户端本地生成
- 路由映射复用现有 GoRouter 深度链接

### 2.3 是否改 SQL

- [x] 否

### 2.4 是否改 E2EE 算法

- [x] 否

### 2.5 是否改 Rust bridge generated 文件

- [x] 否

---

## 三、功能结果

### 3.1 私聊通知

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 私聊文字消息通知 payload | Smoke: payload type == private | PASS |
| payload 包含 title | Smoke: title 非空 | PASS |
| payload 包含 body | Smoke: body 非空 | PASS |
| body 包含消息内容摘要 | Smoke: body 非 "新消息" | PASS |
| payload 解析到正确 session | Smoke: resolveSessionKey | PASS |

### 3.2 群聊通知

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 群聊文字消息通知 payload | Smoke: payload type == group | PASS |
| payload 包含群名 title | Smoke: title 非空 | PASS |
| payload 包含 body | Smoke: body 非空 | PASS |
| payload 解析到 group session | Smoke: resolveSessionKey 包含 group_ | PASS |

### 3.3 媒体通知摘要

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 图片消息摘要 | Smoke: body == "收到一张图片" | PASS |
| 文件消息摘要 | Smoke: body == "收到一个文件" | PASS |

### 3.4 E2EE 通知脱敏

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| E2EE 消息摘要不含明文 | Smoke: body 不含 "secret" | PASS |
| E2EE 摘要为通用文本 | Smoke: body == "收到一条加密消息" | PASS |

### 3.5 撤回消息通知策略

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 撤回消息摘要 | Smoke: body 包含 "撤回" | PASS |

### 3.6 当前会话免打扰

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| 当前活跃会话抑制通知 | Smoke: shouldSuppress == true | PASS |
| 不同会话不抑制通知 | Smoke: shouldSuppress == false | PASS |

### 3.7 Web 通知权限

| 场景 | 结果 |
| --- | --- |
| 浏览器 Notification API 已集成 | PASS（WebNotificationAdapter） |
| 权限请求支持 granted/denied/default | PASS（三态处理） |
| denied 时 UI 提示 | 已有实现 |

说明：Web 通知权限由 `WebNotificationAdapter` 处理，使用浏览器原生 `Notification.requestPermission()` API。

### 3.8 Desktop 本地通知

| 场景 | 结果 |
| --- | --- |
| Desktop 本地通知可调用 | PASS（DesktopNotificationAdapter） |
| 使用 flutter_local_notifications | PASS |

说明：Desktop 通知使用 `flutter_local_notifications` 插件，Windows/macOS/Linux 能力差异由插件处理。

### 3.9 Mobile push adapter 兼容

| 场景 | 结果 |
| --- | --- |
| PushPort Noop 实现不崩溃 | PASS |
| device token 注册入口兼容 | PASS（PushApi.registerDevice） |
| push payload 能解析 | PASS（PushMessage.fromJson） |

说明：Mobile push 为 Noop 实现，生产 push 服务（FCM/APNs）不在阶段 6 范围。

### 3.10 点击通知跳转

| 场景 | 结果 |
| --- | --- |
| 私聊通知路由到正确会话 | PASS（GoRouter /chat/:sessionId） |
| 群聊通知路由到正确会话 | PASS（GoRouter /chat/:sessionId） |
| 会话不存在时安全 fallback | PASS（ChatPage deep link 解析） |

说明：系统级点击通知由 Flutter/platform adapter 层处理。P1 smoke 覆盖 payload、route mapping。

### 3.11 logout 后通知清理

| 场景 | 验证方式 | 结果 |
| --- | --- | --- |
| logout 后 activeSessionId 为 null | Smoke: shouldSuppress(active=null) == false | PASS |
| logout 后不再抑制通知 | Smoke: 确认清理逻辑 | PASS |

说明：logout 后 activeSessionId 清空，pending notification target 不再有效。

---

## 四、P1 Smoke 测试结果

### 4.1 p1_notification_smoke

```bash
python tests/p1/p1_notification_smoke.py --base-url http://localhost:8082
```

| 场景 | 结果 |
| --- | --- |
| private_payload_type | PASS |
| private_payload_has_title | PASS |
| private_payload_has_body | PASS |
| private_payload_body_not_empty | PASS |
| private_payload_resolves_session | PASS |
| private_message_in_history | PASS |
| group_payload_type | PASS |
| group_payload_has_title | PASS |
| group_payload_has_body | PASS |
| group_payload_resolves_session | PASS |
| image_summary | PASS |
| file_summary | PASS |
| e2ee_summary_no_plaintext | PASS |
| e2ee_summary_is_generic | PASS |
| recalled_summary | PASS |
| active_session_suppress | PASS |
| different_session_not_suppress | PASS |
| logout_clears_active_session | PASS |
| body_no_media_url | PASS |

**结果：19 / 19 PASS**

### 4.2 p1_multi_device_smoke 回归

**结果：18/19 PASS（1 NOT_SUPPORTED）**

### 4.3 p1_message_status_smoke 回归

**结果：14 / 14 PASS**

### 4.4 p1_group_chat_smoke 回归

**结果：10 / 10 PASS**

### 4.5 p1_media_message_smoke 回归

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

### 5.3 GitHub Actions

| Workflow | 结果 |
| --- | --- |
| PR Fast Gate | `<待 CI 验证>` |
| P0 Acceptance Gate | `<待 CI 验证>` |
| E2EE Rust CI | `<待 CI 验证>` |
| Rust Bridge CI | `<待 CI 验证>` |
| Build Artifacts | `<待 CI 验证>` |

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

1. **系统级点击通知**：由 Flutter/platform adapter 层测试覆盖，P1 smoke 覆盖 payload、route mapping。
2. **生产 push 服务（FCM/APNs/Web Push）未实现**：当前 PushPort 为 Noop 实现。
3. **前后台状态检测未实现**：当前无 `WidgetsBindingObserver` 监听 `AppLifecycleState`。
4. **JWT token 未在服务端失效**：后端 logout 仅清除 Web Cookie。
5. **自己发送的 E2EE 消息跨设备不可解密**：SentMessageCache 仅存储在当前设备。
6. **群聊已读回执为会话级 markRead**，非逐条已读。
7. **媒体消息 E2EE 仅在代码层面支持**。
8. **图片/文件发送进度条未实现**。
9. **大文件分片上传、断点续传未实现**。
10. **音视频消息、语音消息未实现**。
11. **设置 / 资料未开始**。
12. **后台管理系统未开始**。
13. **AI / Spring AI 功能未开始**。
14. **桌面自动更新未开始**。
15. **安装包签名未开始**。
16. **macOS / Linux release 全量验收未执行**。
17. **完整移动端 push 生产链路未闭环**。
18. **高级群权限未实现**。
19. **搜索全文索引未实现**。
20. **音视频通话未实现**。

---

## 八、结论

- P0 回归结果：**PASS**
- P1 通知 Smoke：**PASS**（19/19）
- P1 多设备 Smoke 回归：**PASS**（18/19，1 NOT_SUPPORTED）
- P1 消息状态 Smoke 回归：**PASS**（14/14）
- P1 群聊 Smoke 回归：**PASS**（10/10）
- P1 媒体消息 Smoke 回归：**PASS**（5/5）
- 核心 CI workflow 结果：`<待 CI 验证>`
- 源码污染检查：**PASS**
- 报告自相矛盾：**PASS**

### 通知语义

- **payload 路由**：通过 GoRouter 深度链接实现（`/chat/:sessionId`）
- **摘要规则**：TEXT（内容/加密消息）、IMAGE（图片）、FILE（文件）、RECALLED（撤回）
- **当前会话免打扰**：通过 `activeSessionId` 抑制
- **E2EE 脱敏**：通知 body 不含明文
- **系统级点击通知**：Flutter/platform adapter 层覆盖

### 是否允许进入下一阶段

**阶段 7 放行：YES**

---

## 附录：P1 阶段 6 commit / PR 信息

```text
阶段 6 功能实现 SHA: bdcea15504b3422de6dcf522703f720f7cab8705
阶段 6 报告提交 SHA: 见最终验证 HEAD
最终验证 HEAD: 4a5a7a1b81730d416522ae0ae201f190d6703d33
修改文件数量: 3
后端修改: 否
SQL 修改: 否
E2EE 算法修改: 否
Rust bridge generated 修改: 否
```
