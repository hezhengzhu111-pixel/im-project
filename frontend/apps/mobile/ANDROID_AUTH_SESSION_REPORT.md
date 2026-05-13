# Android Auth Session Report

## 1. 当前认证模型

### 1.1 本地状态与存储位置

- `accessToken`
  - 内存：`authStore.accessToken`
  - 安全存储：Keychain `im.mobile.access-token`
- refresh / session cookie
  - 浏览器兼容层：`CookieManager`
  - 调试镜像：Keychain `im.mobile.cookie-mirror`
- `currentUser`
  - 内存：`authStore.currentUser`
  - 快照：MMKV `im.mobile.user-snapshot`
- `permissions`
  - 内存：`authStore.permissions`
  - 恢复来源：`/auth/parse` 返回值
- session meta
  - 安全存储：Keychain `im.mobile.session-meta`
  - 记录用户 id、username、是否持有 access token、保存时间
- 通知 token
  - MMKV：`im.mobile.fcm-token`
  - Zustand：`notificationStore.fcmToken`

### 1.2 认证恢复链路

1. 先读取 Keychain access token 与 cookie mirror
2. 若两者都不存在：
   - 不进入主界面
   - 若存在陈旧 `userSnapshot`，立即清理本地半登录痕迹
3. 若存在 token 或 cookie：
   - 先调用 `/auth/parse`
   - 若 parse 不通过，再尝试一次 refresh
   - refresh 成功后重新 parse
   - 仅在 parse 最终有效时进入主界面并应用 side effects

### 1.3 401 refresh 链路

- 并发 401 通过 `shared-auth-core/createRefreshCoordinator()` 合并，只发一次 refresh
- refresh 成功后：
  - 重新镜像 Cookie
  - 清除旧 access token header 来源，后续请求优先走 cookie
  - 重放原请求
- refresh 失败后：
  - 统一走 session invalid 清理路径
  - 不保留半登录状态

## 2. 本次修复点

### 2.1 restoreSession 强化

- 无 token 且无 cookie 时，不再因为 `userSnapshot` 存在而误判已登录
- `userSnapshot` 与 parse 出来的用户不一致时，不再盲目信任旧快照
- parse 失败时增加一次 refresh 补救
- refresh 仍失败时，清理半登录状态并保持 `authReady=true` 返回登录页

### 2.2 logout / clearSession 清理边界统一

现在 `logout()` 和 `401 refresh` 失败都统一落到 `clearSession()` / 本地会话清理逻辑，保证以下范围一致：

- `authStore` 内存：
  - `currentUser`
  - `accessToken`
  - `permissions`
  - `authReady`
- Keychain：
  - `im.mobile.access-token`
  - `im.mobile.session-meta`
  - `im.mobile.cookie-mirror`
- `CookieManager`
- WebSocket：
  - 主连接断开
  - reconnect 计数归零
- chat runtime：
  - `chatStore.clearRuntime()`
  - `messageStore`
  - `sessionStore`
  - 联系人/群组运行态
- SQLite / 仓储：
  - 会话缓存
  - 消息缓存
  - 上传任务
  - 通知事件
- MMKV session scope：
  - `userSnapshot`
  - `currentSessionId`
  - `drafts`
  - `wsCache`
  - `lastSyncAt`
- 通知路由：
  - pending notification route 清空

### 2.3 pending queue 策略

- logout / session invalid / stale restore 时，清空 pending message queue
- 原因：
  - pending payload 与会话、发送者身份强绑定
  - 切换用户后继续重试旧 pending，属于旧用户数据泄漏风险

### 2.4 FCM token 本地缓存策略

- 本次明确选择：`保留本地 FCM token 缓存，清除 binding 状态`
- 保留原因：
  - FCM token 是设备级标识，不是用户 secret
  - 重新登录后可复用 token，减少重复注册成本
- 清理内容：
  - `notificationStore.tokenBound = false`
  - 通知事件清空
  - pending notification route 清空
- 不清理内容：
  - MMKV `im.mobile.fcm-token`
  - `notificationStore.fcmToken`

## 3. 测试覆盖

已补或已确认通过的核心测试：

- login 保存 session
  - access token 落 Keychain
  - cookie mirror 保存
  - user snapshot 保存
  - session meta 保存
- restore 成功
  - parse 成功后恢复 `currentUser`
  - side effects 已 mock 并验证不阻塞
- restore 失败
  - 无 token/cookie 且存在 stale snapshot 时，不进入主界面
  - stale snapshot 与 pending/session 数据被清理
- logout 清理
  - 清理 auth / Cookie / runtime / SQLite / pending / upload / notification event
  - 保留本地 FCM token cache
- 401 并发 refresh 合并
  - 多请求 401 只触发一次 refresh
- refresh 失败清理
  - 401 + refresh 失败后统一清理 session

## 4. 验证结果

- `cd frontend && npm run mobile:typecheck`
- `cd frontend && npm run mobile:test`
- `cd frontend && npm run mobile:lint`

以上命令在本次修改后应作为回归门禁。

## 5. 移动端 token 协议后续建议

### 5.1 短期建议

- 继续保留 `Authorization + Cookie` 双兼容模式
- refresh 成功后默认降级为 cookie 优先，避免长期持有陈旧 access token header
- `sessionMeta` 后续可继续扩展为：
  - 最近成功登录用户
  - 最近 refresh 成功时间
  - 最近 session invalid 原因

### 5.2 中期建议

- 明确后端移动端首选鉴权介质：
  - 纯 cookie
  - 或显式 access token rotate 返回体
- 若继续支持移动端 bearer：
  - refresh 接口最好显式返回新的 access token
  - 这样可避免 refresh 后 header/token 状态分叉

### 5.3 安全建议

- 用户级缓存与设备级缓存要继续分层
  - 用户级：auth / session / pending / message / session list
  - 设备级：theme / locale / FCM token
- 任何“session invalid”场景都应走统一清理入口
- 不要依赖 `userSnapshot` 单独决定登录态，必须以 token/cookie 可验证性为准
