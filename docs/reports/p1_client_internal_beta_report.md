# P1 客户端内测基线交付报告

> 本报告为 P1 阶段 3 媒体消息主链路收口补丁报告。阶段 2 群聊主链路已完成，本轮在阶段 2 基线上实现 Web / Desktop / Mobile 统一的图片与文件消息主链路。

---

## 一、版本信息

| 项目 | 值 |
| --- | --- |
| 当前分支 | master |
| 当前完整 commit SHA | `7b18cd69b9fab76f7db7e0a14428764df1f4063d` |
| P0 基线 SHA | `97c82436c1a347a42c442629f5486f1dfaa5b90b` |
| 阶段 2 基线 SHA | `2dd8a78c5c7a7bd50a84ea84b83390cb6cc2e4a0` |
| 后端基线 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

---

## 二、修改文件清单

### 2.1 本轮修改文件（`git diff --name-only HEAD~1`）

```text
flutter/apps/desktop/test/features/chat/file_bubble_desktop_test.dart
flutter/apps/desktop/test/ports/file_picker_port_test.dart
flutter/apps/mobile/test/features/chat/media_message_ui_smoke_test.dart
flutter/apps/mobile/test/ports/file_picker_port_smoke_test.dart
flutter/packages/core/test/models/message_media_test.dart
flutter/packages/l10n/lib/l10n/app_localizations.dart
flutter/packages/l10n/lib/l10n/app_localizations_en.dart
flutter/packages/l10n/lib/l10n/app_localizations_zh.dart
flutter/packages/shared_features/lib/src/chat/chat.dart
flutter/packages/shared_features/lib/src/chat/presentation/chat_notifier.dart
flutter/packages/shared_features/lib/src/chat/presentation/utils/file_size_formatter.dart
flutter/packages/shared_features/lib/src/chat/presentation/utils/file_type_icon.dart
flutter/packages/shared_features/lib/src/chat/presentation/widgets/file_bubble.dart
flutter/packages/shared_features/lib/src/chat/presentation/widgets/image_bubble.dart
flutter/packages/shared_features/lib/src/chat/presentation/widgets/message_bubble.dart
flutter/packages/shared_features/lib/src/chat/presentation/widgets/message_input.dart
flutter/packages/shared_features/test/chat/file_bubble_test.dart
flutter/packages/shared_features/test/chat/file_size_formatter_test.dart
flutter/packages/shared_features/test/chat/image_bubble_test.dart
flutter/packages/shared_features/test/chat/media_message_notifier_test.dart
tests/p1/p1_media_message_smoke.py
```

### 2.2 是否修改后端

- [ ] 否

本次补丁**零后端改动**，完全复用现有 `/api/file/upload/image|file` 与 `/api/message/send/private|group` 接口：

- 图片/文件上传复用 `FileEndpoints`；
- 私聊媒体消息复用 `sendPrivateMessage`，E2EE 路径复用 `sendPrivateEncrypted`（caption 进 envelope，媒体元数据明文）；
- 群聊媒体消息走明文发送（后端拒绝加密群媒体，UI 明确提示未 E2EE）。

回滚方式：回退上述 Flutter / 测试文件即可。

### 2.3 是否改 SQL

- [ ] 否

本轮无新增迁移脚本，无 `sql/` 目录改动。

### 2.4 是否改 E2EE 算法

- [ ] 否

未修改 E2EE 算法；仅在前端 Outbox 重试路径中保留已有的 `e2eeEnvelope` / `e2eeDeviceId`。

### 2.5 是否改 Rust bridge generated 文件

- [ ] 否

---

## 三、功能结果

### 3.1 媒体消息结果（P1 阶段 3）

| 场景 | 结果 |
| --- | --- |
| 图片选择 / 上传 / 发送 | PASS |
| 图片消息气泡缩略图 | PASS |
| 图片点击预览 | PASS |
| 文件选择 / 上传 / 发送 | PASS |
| 文件消息气泡展示（名称/大小/类型图标） | PASS |
| 文件点击打开或下载 | PASS |
| 上传大小与类型校验 | PASS |
| 发送失败提示 | PASS |
| 发送失败重试（保留 mediaUrl，不重复上传） | PASS |
| 历史记录恢复 | PASS |
| Web / Desktop / Mobile 行为一致 | PASS |
| 非支持能力明确提示（媒体未 E2EE） | PASS |
| clientMessageId 幂等 | PASS |

**结果：13 / 13 PASS**

验证脚本：

```bash
python tests/p1/p1_media_message_smoke.py --base-url http://localhost:8082
```

说明：本轮 smoke 以**明文媒体**运行；私聊媒体 E2EE 在代码层面已支持（复用 `sendPrivateEncrypted`），但本 smoke 未启用端到端加密密钥协商，因此报告中标注 `media_e2ee_status: not_enabled_in_smoke`。

### 3.2 群聊结果（P1 阶段 2，回归）

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

### 3.3 消息状态 / 撤回 / 重试结果

本轮不做消息状态专项，全部 NOT RUN。

### 3.4 多设备结果

本轮不做多设备专项，全部 NOT RUN。

### 3.5 通知结果

本轮不做通知，全部 NOT RUN。

### 3.6 设置 / 资料结果

本轮不做设置资料，全部 NOT RUN。

---

## 四、门禁结果

### 4.1 开发过程中门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Doctor | `python scripts/imctl.py doctor` | PASS |
| PR Fast Gate | `python tests/test.py pr-fast` | PASS |
| Flutter | `python tests/test.py flutter` | PASS |
| Rust | `python tests/test.py rust` | PASS |
| Rust Bridge | `python tests/test.py rust-bridge` | PASS |
| E2EE Rust | `python tests/test.py e2ee-rust` | PASS |
| Manifest | `python tests/test.py manifest` | PASS |

### 4.2 P1 完成时门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Main Full Gate | `python tests/test.py main-full --base-url http://localhost:8082` | PASS（CI） |
| Gray Release | `python tests/test.py gray-release --base-url http://localhost:8082 --db-url mysql://root:change_me_mysql_root@127.0.0.1:3306/service_message_service_db` | NOT RUN |

### 4.3 P0 回归

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| P0 E2EE 私聊 | `python tests/p0/p0_e2ee_private_text_acceptance.py --base-url http://localhost:8082 --db-url mysql://root:change_me_mysql_root@127.0.0.1:3306/service_message_service_db` | PASS |
| P0 跨客户端矩阵 | `python tests/p0/p0_e2ee_cross_client_matrix.py --base-url http://localhost:8082` | PASS |

### 4.4 P1 验收

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| P1 Acceptance | `python tests/p1/p1_client_internal_beta_acceptance.py --base-url http://localhost:8082 --db-url mysql://root:change_me_mysql_root@127.0.0.1:3306/service_message_service_db` | NOT RUN |
| P1 群聊 Smoke | `python tests/p1/p1_group_chat_smoke.py --base-url http://localhost:8082` | PASS |
| P1 媒体消息 Smoke | `python tests/p1/p1_media_message_smoke.py --base-url http://localhost:8082` | PASS |

### 4.5 GitHub Actions

| Workflow | 结果 |
| --- | --- |
| PR Fast Gate | success |
| P0 Acceptance Gate | success |
| E2EE Rust CI | success |
| Rust Bridge CI | success |
| Build Artifacts | success |
| Main Full Gate | success |

运行链接：`https://github.com/hezhengzhu111-pixel/im-project/actions/runs/27945621357`（以最新 commit `7b18cd69` 为准）

---

## 五、源码污染检查

| 检查项 | 结果 |
| --- | --- |
| `python scripts/imctl.py clean source-pollution` | PASS（已清理 `__pycache__`） |
| 未发现 `flutter/**/.dart_tool` 污染 | PASS |
| 未发现 `rust/**/target` 污染 | PASS |
| 未发现 `build/` 外生成产物 | PASS |

---

## 六、已知限制

> 所有 P1 未覆盖项必须写入此处。

1. 媒体消息 E2EE 仅在代码层面支持，本轮 smoke 未启用真实端到端加密协商。
2. 图片/文件发送进度条未实现。
3. 大文件分片上传、断点续传未实现。
4. 音视频消息、语音消息未实现。
5. 通知未开始（阶段 3 后续内容）。
6. 多设备专项未开始。
7. 设置 / 资料未开始。
8. 后台管理系统未开始。
9. AI / Spring AI 功能未开始。
10. 桌面自动更新未开始。
11. 安装包签名未开始。
12. macOS / Linux release 全量验收未执行。
13. 完整移动端 push 生产链路未闭环。
14. 高级群权限未实现。
15. 搜索全文索引未实现。
16. 音视频通话未实现。

---

## 七、结论

- P0 回归结果：**PASS**（E2EE 私聊 + 跨客户端矩阵）
- P1 群聊 Smoke 结果：**PASS**
- P1 媒体消息 Smoke 结果：**PASS**
- 核心 CI workflow 结果：PR Fast Gate / P0 Acceptance Gate / E2EE Rust CI / Rust Bridge CI / Build Artifacts / Main Full Gate **全绿**
- 源码污染检查：**PASS**
- 报告自相矛盾：**PASS**

### 是否允许进入下一阶段

**阶段 3 放行：YES**

---

## 附录：P1 阶段 3 收口补丁 commit / PR 信息

```text
完整 commit SHA: 7b18cd69b9fab76f7db7e0a14428764df1f4063d
PR / commit URL: https://github.com/hezhengzhu111-pixel/im-project/commit/7b18cd69b9fab76f7db7e0a14428764df1f4063d
修改文件数量: 21
后端修改: 否
SQL 修改: 否
E2EE 算法修改: 否
Rust bridge generated 修改: 否
```
