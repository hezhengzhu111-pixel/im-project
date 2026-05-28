# Outbox 重试机制设计文档

**日期**: 2026-05-28  
**任务**: 验证并修复消息 outbox、网络状态、重试机制与 ChatNotifierWithOutbox 的集成  

## 1. 背景

### 1.1 当前问题

验收报告指出 outbox 是架构亮点，但存在以下问题：

1. **循环依赖**：`outbox_provider.dart` 与 `chat_providers.dart` 存在循环 import
2. **测试覆盖不足**：缺少关键场景的测试
3. **防重复发送**：未检查 clientMessageId 是否已存在

### 1.2 对标能力

对标成熟 IM Web：
- 离线消息进入 outbox
- 网络恢复自动重试
- pending / retrying / failed 状态清晰
- 不重复发送
- E2EE 消息保留必要 envelope 元信息
- UI 与本地队列一致

## 2. 架构设计

### 2.1 循环依赖解决方案

将 `messageApiProvider` 从 `chat_providers.dart` 提取到独立文件：

```
lib/features/chat/data/
├── message_api_provider.dart  # 新建：messageApiProvider
├── message_outbox.dart
├── outbox_provider.dart       # 改为导入 message_api_provider.dart
└── ...

lib/features/chat/presentation/
├── chat_providers.dart        # 移除 messageApiProvider，导入新文件
└── ...
```

**依赖关系变更：**

- `outbox_provider.dart` 导入 `message_api_provider.dart`（而非 `chat_providers.dart`）
- `chat_providers.dart` 导入 `message_api_provider.dart` 和 `outbox_provider.dart`

**优点：** 彻底消除循环依赖，MessageApi 作为基础服务独立存在

### 2.2 文件变更

| 文件 | 操作 |
|------|------|
| `lib/features/chat/data/message_api_provider.dart` | 新建 |
| `lib/features/chat/data/outbox_provider.dart` | 修改导入 |
| `lib/features/chat/presentation/chat_providers.dart` | 移除 messageApiProvider，修改导入 |

## 3. 测试设计

### 3.1 测试策略

- **Memory Fake**：使用 `idbFactorySembastMemory` 替代 IndexedDB
- **Mock 依赖**：Mock MessageApi、NetworkStatus、WsClient 等
- **测试范围**：只覆盖用户指定的 6 个场景

### 3.2 MessageOutbox 单元测试

**文件**: `test/features/chat/message_outbox_test.dart`（扩展现有测试文件）

| 测试场景 | 说明 |
|----------|------|
| 私聊离线发送入队 | 验证 offline 时 enqueue 返回 pending 状态 |
| 群聊离线发送入队 | 验证 isGroupChat=true 时正确入队 |
| 网络恢复后 retryAllFailed | 验证网络恢复触发重试 |
| 最大重试次数后 failed | 验证超过 5 次重试后标记 failed |
| E2EE 消息不泄露明文 | 验证只调用 sendPrivateEncrypted |
| 不重复添加 clientMessageId | 验证防重检查逻辑 |

### 3.3 ChatNotifierWithOutbox 单元测试

**文件**: `test/features/chat/chat_notifier_with_outbox_test.dart`

| 测试场景 | 说明 |
|----------|------|
| 发送私聊消息入队 | 验证发送失败时正确入队 |
| 发送群聊消息入队 | 验证群聊发送失败时正确入队 |
| 网络恢复触发 retry | 验证 NetworkStatus 变化触发重试 |
| outbox 事件更新 UI 状态 | 验证 pendingCount/failedCount/isRetrying 更新 |
| E2EE 消息安全 | 验证不泄露明文 |

### 3.4 防重复 clientMessageId

在 `MessageOutbox.enqueue()` 中添加检查：

```dart
Future<OutboxMessage> enqueue({...}) async {
  // 检查是否已存在相同 clientMessageId 的消息
  final existing = await _getByClientMessageId(clientMessageId);
  if (existing != null) {
    return existing;
  }
  // ... 原有逻辑
}
```

## 4. 状态管理

### 4.1 NetworkStatusProvider 触发 outbox retry

当前实现已正确：

```dart
// outbox_provider.dart
ref.listen(networkStatusProvider, (prev, next) {
  if (prev != null && !prev.isOnline && next.isOnline) {
    outbox.onNetworkAvailable();
  }
});
```

**保持不变**，无需修改。

### 4.2 重试机制状态流程

```
pending → retrying → sent (成功)
                   ↓
              pending (重试)
                   ↓
              failed (超过最大重试次数)
```

**配置：**
- 最大重试次数：5 次
- 重试延迟：指数退避（5s, 10s, 20s, 40s, 80s）

### 4.3 UI 状态同步

`ChatNotifierWithOutbox` 通过监听 outbox 事件更新状态：

- `pendingCount`：待发送消息数
- `failedCount`：发送失败消息数
- `isRetrying`：是否正在重试
- `isOffline`：是否离线

UI 可通过 `chatStateProvider` 获取这些状态显示相应文案。

### 4.4 E2EE 消息安全

- E2EE 消息只存储 envelope（加密数据），不存储明文
- 通过验证只调用 `sendPrivateEncrypted` 而非 `sendPrivateMessage`
- 避免在日志中输出明文内容

## 5. 技术约束

- **不依赖真实后端**
- **使用 fake MessageApi / fake NetworkStatus**
- **不引入真实浏览器网络权限**
- **保持 IndexedDB adapter 可替换为内存 fake**
- **不修改旧 ChatNotifier**（旧代码由任务 3 清理）

## 6. 成功标准

1. ✅ 消除 outbox_provider 与 chat_providers 的循环依赖
2. ✅ 保持 chatStateProvider 仍使用 ChatNotifierWithOutbox
3. ✅ 覆盖 6 个指定测试场景
4. ✅ NetworkStatusProvider 状态切换触发 outbox retry
5. ✅ E2EE 消息不泄露明文到日志
6. ✅ 不重复添加相同 clientMessageId 消息

## 7. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 循环依赖修复引入新问题 | 充分测试现有功能 |
| 测试用例不够全面 | 只覆盖指定场景，保持简洁 |
| 防重检查影响性能 | 使用 clientMessageId 索引查询 |

## 8. 相关文件

- `lib/features/chat/data/message_outbox.dart`
- `lib/features/chat/data/outbox_provider.dart`
- `lib/features/chat/presentation/chat_providers.dart`
- `lib/features/chat/presentation/chat_provider_with_outbox.dart`
- `test/features/chat/message_outbox_test.dart`
- `test/features/chat/message_outbox_integration_test.dart`
