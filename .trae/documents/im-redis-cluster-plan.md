# IM Redis Cluster 改造计划

## Summary

- 目标：将当前 `im-server` / `message-service` 的“多实例集合路由 + 实例 Topic 分发”收敛为你要求的“单路由 Hash + 定向 Redis Pub/Sub + Redis 延迟重试队列”模型，同时保留现有 `message_outbox` 的可靠投递能力。
- 改造边界：仅调整 WebSocket Session 路由存储/查找、跨微服务消息推送路径、以及 WebSocket 推送失败后的重试队列实现与消费方式；不触碰握手协议、鉴权逻辑、消息落 MySQL 的业务结构。
- 关键决策：
  - 保留 `message_outbox` 表与 `OutboxPublisher`，不改消息持久化模型。
  - Redis 路由从 `RSetMultimap + lease bucket` 切换为单值 `RMapCache/HSET` 语义。
  - IM 节点订阅独占频道 `im:msg:channel:{instanceId}`。
  - 本地仍保留 `ConcurrentHashMap<UserId, Session>` / `sessionIdsByUser`，允许同一实例内单用户多会话。

## Current State Analysis

### 1. 依赖与实例标识

- `backend/im-server/pom.xml` 已存在 `redisson-spring-boot-starter`。
- `backend/message-service/pom.xml` 已存在 `redisson-spring-boot-starter`。
- `backend/im-server/src/main/java/com/im/config/ImNodeIdentity.java` 已能按以下优先级生成实例标识：`im.instance-id` 配置 -> 注册中心 `instanceId` -> `host:port`。
- 现状不需要新增实例标识基础能力，只需要在计划中复用现有 `ImNodeIdentity`。

### 2. IM Server 当前路由与会话实现

- `backend/im-server/src/main/java/com/im/service/impl/ImServiceImpl.java`
  - 本地使用 `sessionsById`、`sessionIdsByUser` 维护 WebSocket 会话。
  - Redis 路由使用 `RSetMultimap<String, String>`，一个用户可对应多个 `instanceId`。
  - 在线判断依赖 `im:route:lease:{userId}:{instanceId}` 的 bucket TTL。
  - `registerSession()` 在首个本地会话建立时注册路由；`unregisterSession()` 在最后一个本地会话断开时删路由。
  - `touchUserHeartbeat()` / `refreshRouteHeartbeat()` 目前只更新本地 `lastHeartbeat`，真正的 Redis TTL 续期由定时任务处理。
- `backend/im-server/src/main/java/com/im/task/LocalRouteLeaseRenewTask.java`
  - 定时遍历本地在线用户，批量续租 `lease bucket` 并重复写入 `RSetMultimap`。
- 这与目标模型存在两点差异：
  - 目标要求 `HSET im:route:users {userId} {instanceId}` 单路由，而当前是多路由集合。
  - 目标要求“写入路由并设置心跳 TTL”，当前 TTL 存在于独立 lease key，而非路由记录本身。

### 3. Message Service 当前跨服务推送链路

- `backend/message-service/src/main/java/com/im/service/impl/MessageServiceImpl.java`
  - 当前更多是消息业务编排入口，真正的落库后投递由 handler / outbox 负责。
- `backend/message-service/src/main/java/com/im/handler/PrivateMessageHandler.java`
  - 私聊落库后调用 `outboxService.enqueueAfterCommit(...)` 写出 Outbox 事件。
- `backend/message-service/src/main/java/com/im/handler/GroupMessageHandler.java`
  - 群聊落库后同样写出 Outbox 事件。
- `backend/message-service/src/main/java/com/im/service/OutboxService.java`
  - 负责插入 `message_outbox` 并在事务提交后触发 `OutboxPublisher.publishById()`。
- `backend/message-service/src/main/java/com/im/service/OutboxPublisher.java`
  - 当前会读取 `targetsJson` 中的用户列表。
  - 按用户查询 `RSetMultimap` 路由集合与 lease bucket。
  - 将目标用户按 `instanceId` 分组。
  - 发布到 `im:channel:{instanceId}` 的 Redisson Topic，消息体为 `WsPushEvent`。
- 结论：仓库里已经没有 Kafka 广播；真正要修改的是 Redis 路由解析模型和频道命名/消息监听链路。

### 4. IM Server 当前消息订阅与重试实现

- `backend/im-server/src/main/java/com/im/listener/WsPushTopicSubscriber.java`
  - 启动时订阅 `im:channel:{instanceId}`。
  - 收到 `WsPushEvent` 后交由 `WsPushEventDispatcher` 异步分发。
- `backend/im-server/src/main/java/com/im/service/WsPushEventDispatcher.java`
  - 根据 `targetUserIds` 找本地 session，再调用 `IImService` 推送。
  - 对单 session 推送失败会写入 `MessageRetryQueue`。
- `backend/im-server/src/main/java/com/im/service/MessageRetryQueue.java`
  - 现状已经不是“内存队列”，而是实例级 `RBlockingQueue + RDelayedQueue`。
  - `backend/im-server/src/main/java/com/im/task/MessageRetryTask.java` 轮询 ready queue 再重试推送。
  - `backend/im-server/src/main/java/com/im/task/RetryQueueJanitor.java` 负责清理孤儿实例队列。
- 与目标的差异不在“是否使用 Redis”，而在于：
  - 需要把队列协议与新的实例频道/单路由模型对齐。
  - 需要评估是否继续保留 `RBlockingQueue + poll`，还是按目标收敛为更直接的 Redisson 延迟队列消费模型。

## Proposed Changes

### A. 路由模型收敛为单路由 Hash

#### 文件

- `backend/im-server/src/main/java/com/im/service/impl/ImServiceImpl.java`
- `backend/im-server/src/main/java/com/im/task/LocalRouteLeaseRenewTask.java`
- `backend/im-server/src/main/resources/dev/application.yml`
- `backend/im-server/src/main/resources/sit/application.yml`
- `backend/message-service/src/main/resources/dev/application.yml`
- `backend/message-service/src/main/resources/sit/application.yml`

#### 改法

- 将 `ImServiceImpl` 中的 `routeMultimap` 改为单值路由存储，优先使用 `RMapCache<String, String>` 表达 `HSET + TTL` 语义：
  - key：`im:route:users`
  - field：`userId`
  - value：`instanceId`
- `registerSession()`：
  - 在首个本地活跃会话建立时写入 `userId -> currentInstanceId`。
  - 同时为该条路由设置 TTL，TTL 值沿用当前 `im.route.lease-ttl-ms` 配置，避免新增不必要参数。
- `refreshRouteHeartbeat()` / `touchUserHeartbeat()`：
  - 除更新本地 `UserSession.lastHeartbeat` 外，同时刷新 Redis 路由 TTL。
- `unregisterSession()` / `userOffline()`：
  - 仅在该用户本地最后一个 session 断开时删除 Redis 路由。
  - 删除前需校验 Redis 当前值是否仍是本实例，避免误删用户已迁移到其他实例后的新路由。
- `LocalRouteLeaseRenewTask`：
  - 保留定时保活职责，但改为刷新 `RMapCache` 中当前实例用户的 TTL，不再维护独立 lease bucket。
  - 若实现中在 `refreshRouteHeartbeat()` 已足够可靠，可简化为“兜底续期任务”而非主心跳机制。
- 配置层：
  - 将 `users-key` 保留。
  - 将 `lease-key-prefix` 废弃或删除，新增 `channel-prefix: im:msg:channel:`。

#### 原因

- 满足你指定的 `HSET im:route:users {userId} {instance_id}` 单路由语义。
- 去掉“路由集合 + 额外 lease key”双结构后，消息服务侧只需单次读取即可完成定向。

### B. 定向推送改为单实例频道发布

#### 文件

- `backend/message-service/src/main/java/com/im/service/OutboxPublisher.java`
- `backend/message-service/src/main/java/com/im/service/impl/MessageServiceImpl.java`
- `backend/message-service/src/main/java/com/im/handler/PrivateMessageHandler.java`
- `backend/message-service/src/main/java/com/im/handler/GroupMessageHandler.java`
- `backend/message-service/src/main/resources/dev/application.yml`
- `backend/message-service/src/main/resources/sit/application.yml`

#### 改法

- `OutboxPublisher` 从“按目标用户查多实例集合并分组发布”改为：
  - 从 `targetsJson` 读取目标用户列表。
  - 对每个用户执行单值路由查询，拿到唯一 `instanceId`。
  - 按 `instanceId` 聚合目标用户。
  - 向 `im:msg:channel:{instanceId}` 发布 `WsPushEvent`。
- `WsPushEvent` 结构可复用当前 DTO，不需要改消息持久化结构：
  - `eventId`
  - `eventType`
  - `messageId`
  - `targetUserIds`
  - `payload`
- `MessageServiceImpl` 本身以“入口委托”角色保留，不强行把全部发送逻辑塞回该类；但要在计划中明确：
  - 私聊/群聊/已读回执的最终发布路径仍通过 `OutboxService -> OutboxPublisher`。
  - 如需给 executor 一个更清晰入口，可在 `MessageServiceImpl` 增加注释或小型封装方法，指向新的 Redis 路由发布语义。
- `PrivateMessageHandler` / `GroupMessageHandler`：
  - 继续负责构造 payload 和 target user 列表。
  - 不改消息落库逻辑、不改 DTO 结构。

#### 原因

- 满足“保留 Outbox 可靠投递，只改 Redis 路由与频道格式”的已确认决策。
- 避免绕过当前事务后发布机制，减少可靠性回退。

### C. IM Server 订阅器改为实例独占频道监听

#### 文件

- `backend/im-server/src/main/java/com/im/listener/WsPushTopicSubscriber.java`
  或新增
- `backend/im-server/src/main/java/com/im/listener/RedisMessageListener.java`
- `backend/im-server/src/main/java/com/im/service/WsPushEventDispatcher.java`
- `backend/im-server/src/main/resources/dev/application.yml`
- `backend/im-server/src/main/resources/sit/application.yml`

#### 改法

- 订阅频道由 `im:channel:{instanceId}` 改为 `im:msg:channel:{instanceId}`。
- 若保留 `WsPushTopicSubscriber`：
  - 可以只改类内频道前缀与日志文案。
- 若新增 `RedisMessageListener`：
  - 让它承接当前 `WsPushTopicSubscriber` 的职责。
  - 旧类删除或保留为兼容 wrapper，但最终只应存在一种订阅实现，避免双订阅。
- `WsPushEventDispatcher`：
  - 保持“按 `targetUserIds` 找本地 session 并推送”的核心逻辑。
  - 不再依赖“一个用户可能映射多个实例”的前提，分发逻辑可更聚焦于本地会话列表。

#### 原因

- 满足“实例只监听自己的频道”的目标。
- 保留现有异步执行器和去重逻辑，降低改造风险。

### D. 重试队列与新链路对齐

#### 文件

- `backend/im-server/src/main/java/com/im/service/MessageRetryQueue.java`
- `backend/im-server/src/main/java/com/im/task/MessageRetryTask.java`
- `backend/im-server/src/main/java/com/im/task/RetryQueueJanitor.java`
- `backend/im-server/src/main/java/com/im/service/WsPushEventDispatcher.java`
- 相关测试文件：
  - `backend/im-server/src/test/java/com/im/service/MessageRetryQueueTest.java`
  - `backend/im-server/src/test/java/com/im/service/WsPushEventDispatcherTest.java`
  - `backend/im-server/src/test/java/com/im/task/RetryQueueJanitorTest.java`

#### 改法

- 现状已使用 Redisson 队列，因此本次不是“从内存替换到 Redis”，而是“把现有 Redis 重试实现收敛到目标架构”：
  - 保留 `RDelayedQueue` 作为延迟重试主实现。
  - `RetryItem` 中继续带 `instanceId + userId + sessionId + WsPushEvent`，确保重试仍在正确实例上发生。
  - 若用户路由已迁移到其他实例，则重试消费时直接丢弃旧实例任务，避免向错误实例反复重试。
- `MessageRetryTask`：
  - 保留 ready-queue 轮询模型，除非执行阶段确认 Redisson Listener 更适合当前工程；计划阶段默认不额外引入新的线程/监听器复杂度。
- `RetryQueueJanitor`：
  - 继续保留，确保下线实例的延迟队列被清理。
- 备注：
  - 这里不再做“移除内存队列”的动作，因为仓库现状已经完成了这一步，executor 只需避免误回退。

#### 原因

- 与仓库现状保持连续性，不做无效返工。
- 满足“可靠队列底层使用 Redisson 延迟队列”的目标语义。

### E. 测试与回归范围

#### 文件

- `backend/im-server/src/test/java/com/im/service/impl/ImServiceImplTest.java`
- `backend/im-server/src/test/java/com/im/listener/WsPushTopicSubscriberTest.java`
- `backend/im-server/src/test/java/com/im/service/MessageRetryQueueTest.java`
- `backend/im-server/src/test/java/com/im/service/WsPushEventDispatcherTest.java`
- `backend/message-service/src/test/java/com/im/service/OutboxPublisherTest.java`
- `backend/message-service/src/test/java/com/im/service/impl/MessageServiceImplTest.java`
- `backend/message-service/src/test/java/com/im/handler/PrivateMessageHandlerTest.java`
- `backend/message-service/src/test/java/com/im/handler/GroupMessageHandlerTest.java`

#### 改法

- `ImServiceImplTest`
  - 校验首个 session 建立时写入单路由 Hash。
  - 校验最后一个 session 断开时仅在 Redis 当前路由属于本实例时删除。
  - 校验 heartbeat 会刷新本地状态和 Redis TTL。
- `OutboxPublisherTest`
  - 校验从单路由 Hash 读取实例。
  - 校验多个用户按实例聚合后分别发布到 `im:msg:channel:{instanceId}`。
  - 校验无路由用户被跳过但不影响其他用户发布。
- `WsPushTopicSubscriberTest`
  - 校验订阅频道名切到 `im:msg:channel:{instanceId}`。
- `WsPushEventDispatcherTest`
  - 校验本地 session 推送失败时仍进入 Redisson 重试队列。
  - 校验重试任务在实例不匹配/路由迁移后被丢弃。
- `MessageRetryQueueTest`
  - 保留对 `RDelayedQueue` 行为的断言，必要时更新队列 key 或字段。
- `MessageServiceImplTest` / handler tests
  - 主要更新对 Outbox topic/channel 路由语义的预期，不改消息持久化断言。

## Assumptions & Decisions

- 已确认保留 `message_outbox` 可靠投递链路，不改为 `message-service` 直接同步发布。
- 已确认 Redis 用户路由采用单路由 Hash 模型，而不是一个用户多实例集合模型。
- 默认允许“同一实例内一用户多 session”，但 Redis 只记录该用户当前所在实例。
- 不修改握手协议、鉴权逻辑、消息 MySQL 持久化字段与表结构。
- `ImNodeIdentity` 现有能力足以满足“基于 UUID 或 IP:Port 生成全局唯一 instance_id”中的 `IP:Port` 路径；执行时仅在确有必要时补充 UUID fallback。
- `MessageServiceImpl` 不是当前唯一真实发送点，执行时允许同时修改实际落地的 handler / publisher / listener / task 类，只要不突破改动边界。

## Verification Steps

### 单元验证

- 运行 `im-server` 与 `message-service` 现有相关单测，重点覆盖：
  - `ImServiceImplTest`
  - `WsPushTopicSubscriberTest`
  - `MessageRetryQueueTest`
  - `WsPushEventDispatcherTest`
  - `OutboxPublisherTest`
  - `MessageServiceImplTest`
  - `PrivateMessageHandlerTest`
  - `GroupMessageHandlerTest`

### 集成验证

- 启动两个 `im-server` 实例，确认各自 `instanceId` 不同。
- 让用户 A 连接到实例 1：
  - Redis 中存在 `im:route:users[A] = instance-1`。
  - 路由 TTL 可随 heartbeat / 定时任务刷新。
- 由 `message-service` 发送 A 的私聊/群聊/已读事件：
  - `message_outbox` 仍插入事件。
  - `OutboxPublisher` 仅向 `im:msg:channel:instance-1` 发布。
  - 实例 2 不消费到该事件。
- 断开 A 的最后一个本地 session：
  - Redis 路由删除。
  - 再次发送时记录“无路由跳过”，但系统不抛出链路异常。
- 模拟 WebSocket 推送失败：
  - 事件进入 `MessageRetryQueue`。
  - 达到重试次数或 session 失效后停止重试。
  - 实例下线后其孤儿队列可被 janitor 清理。

### 非目标回归

- 确认以下行为无改动：
  - WebSocket 握手地址与参数不变。
  - 鉴权拦截与用户识别逻辑不变。
  - 消息持久化表与 `MessageDTO` / `Message` 业务字段不变。
