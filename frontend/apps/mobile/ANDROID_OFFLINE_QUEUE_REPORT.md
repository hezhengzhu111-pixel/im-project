# Android Offline Queue Report

## 1. 目标

- 强化 Android mobile 的 SQLite、本地消息缓存、pending 队列与离线重试可靠性
- 保证断网发送、App 重启、SQLite fallback、pending retry 不丢消息、不重复消息、不静默失败

## 2. SQLite 策略

### 2.1 初始化成功

- `messageDatabase` 使用 `react-native-quick-sqlite`
- `initializeStorage()` 成功时执行 schema 初始化并标记：
  - `mode = sqlite`
  - `persistenceAvailable = true`
  - `releaseVisibilityRequired = false`

### 2.2 debug fallback

- 当 `quick-sqlite` 不可用或 schema migration 失败时：
  - 允许 memory fallback
  - 必须输出 warning
- 这样开发环境不会因为本地 SQLite 缺失而完全不可运行，但能明确看到“离线持久化不可用”

### 2.3 release fallback

- release 环境下，如果 SQLite 打开或迁移失败：
  - 仍保留 memory fallback，避免立即崩溃
  - 但 `messageDatabase.getStorageHealth()` 会显式暴露：
    - `mode = memory`
    - `persistenceAvailable = false`
    - `releaseVisibilityRequired = true`
    - `lastError`
  - 同时输出 error 日志，明确 release 不能假定离线消息持久化仍可用

### 2.4 当前暴露状态

可通过 `messageDatabase.getStorageHealth()` 获取当前状态，用于日志、诊断或后续 UI/QA 联调判断。

## 3. pending 队列策略

### 3.1 持久化字段

`mobile_pending_messages` 当前保证保存以下字段：

- `localId`
- `conversationId`
- `sendType`
- `payloadJson`
- `status`
- `retryCount`
- `nextRetryAt`
- `lastError`
- `createdAt`
- `updatedAt`

### 3.2 去重原则

- `localId` 是主键，同一个 local message 不会重复 enqueue 成多条记录
- 新增 `findByClientMessageId()` / `removeByClientMessageId()`：
  - 用于按 `clientMessageId` 找到最新 pending
  - 防止相同客户端消息在重试或恢复时重复发送
- `messageStore.enqueuePending()` 现在会拦截“不同 localId 但相同 `clientMessageId`”的重复入队

### 3.3 重试原则

- `retryPending()` 会读取所有 `pending` 与 `sending` 状态且到期的记录
- 原因：
  - App 重启前如果某条消息已进入 `sending`
  - 重启后它必须仍可恢复，而不是永远卡死
- `retryMessage()` 新增本地并发保护：
  - 同一个 `localId` 在同一时刻只允许一个重试流程执行
  - 避免多条异步链路重复发送同一条消息

### 3.4 上传任务协同

- 媒体消息重试时，先恢复并完成 upload task
- 上传成功后立即把新 `mediaUrl / thumbnailUrl / mediaName / mediaSize` 回写到 `payloadJson`
- 这样即使后续发送失败，下一次重试也能复用已上传成功的 payload

### 3.5 服务端成功后的清理

- 发送成功后：
  - 通过 `clientMessageId` 清理匹配的 pending
  - 再移除当前 `localId`
- 这样即使存在陈旧重复 pending，也不会在服务端已成功后残留重发

## 4. 消息缓存策略

### 4.1 memory fallback

- memory 模式下，写入前会先删除同会话内 identity 相同的旧消息：
  - `id`
  - `serverId`
  - `clientMessageId`
- 这样 pending 本地消息与 server 回执不会保留双记录

### 4.2 SQLite 模式

- 继续保留唯一索引：
  - `(conversationId, serverId)`
  - `(conversationId, clientMessageId)`
- 同时在 `messageRepository.upsertMessages()` 增加显式冲突清理：
  - 插入前按 `id / serverId / clientMessageId` 删除冲突旧记录
- 这样不会只修 memory fallback，而是 SQLite 模式也能避免 pending/server 双记录

### 4.3 clearAllCache

`messageRepository.clearAllCache()` 现在会一起清理：

- sessions
- messages
- media cache
- notification events
- pending messages
- upload tasks

## 5. 已补测试

新增或强化测试覆盖：

- memory fallback 下 pending 恢复 `sending` 状态
- pending repo 按 `clientMessageId` 查找与移除
- server message 替换 pending message
- duplicate `clientMessageId` 去重
- failed retry 状态保留
- `clearAllCache` 清理 sessions/messages/pending/uploads

## 6. 验证结果

- `cd frontend && npm run mobile:typecheck`
- `cd frontend && npm run mobile:test`
- `cd frontend && npm run mobile:lint`

本次修改以这三条为回归门禁。

## 7. 真实断网联调步骤

### 7.1 文本消息断网重试

1. Android 登录并打开一个私聊
2. 关闭网络或断开代理
3. 发送文本消息
4. 确认本地出现 `FAILED` / pending 记录
5. 杀掉 App 并重新启动
6. 恢复网络
7. 进入会话并触发 `bootstrap + retryPending`
8. 确认消息被成功发送且不会重复

### 7.2 图片消息断网上传恢复

1. Android 打开会话发送图片
2. 在上传阶段断网
3. 确认 upload task 进入 `failed`
4. 恢复网络后重启 App
5. 再次进入会话
6. 确认上传先恢复、随后消息发送成功
7. 确认不会产生两条图片消息

### 7.3 SQLite fallback 可见性

1. 在 debug 环境故意禁用 `react-native-quick-sqlite`
2. 启动 App
3. 确认日志有 warning，`messageDatabase.getStorageHealth()` 为 `memory`
4. 在 release 包或 release-like 构建复现相同故障
5. 确认日志输出 error 且 `releaseVisibilityRequired = true`
6. 不允许 QA 误判“离线持久化仍正常可用”
