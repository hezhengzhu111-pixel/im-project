# 后端全场景测试用例生成计划

## 1. 完善测试基础设施 (Test Infrastructure Setup)
- **创建缺失目录**：检查并创建所有后端服务（特别是 `im-server` 等）缺失的 `src/test/java/com/im` 及相应包目录结构。
- **补全测试依赖**：检查各个服务的 `pom.xml`，确保引入了必要的测试依赖，包括 `spring-boot-starter-test` (包含 JUnit 5, Mockito)，以及特定场景所需的 `spring-websocket` (针对 `im-server`)、`reactor-test` (针对 `gateway`) 等。
- **统一 Mock 策略**：确保所有单元测试使用 Mock 机制（如 `@Mock`, `@InjectMocks`, `@MockBean`），脱离真实的外部依赖（MySQL, Redis, Nacos, Kafka）以保证独立运行且稳定。

## 2. 重点攻坚：`im-server` (WebSocket 全场景测试)
由于 WebSocket 是 IM 的核心，测试需覆盖所有边缘场景：
- **WebSocket 握手拦截器 (`WebSocketHandshakeInterceptor`)**：
  - 测试携带有效 Token 成功建立连接。
  - 测试携带无效/过期/空 Token 拒绝连接并返回相应错误码。
- **WebSocket 处理器与分发器 (`WebSocketHandler`, `WsMessageDispatcher`)**：
  - 测试连接建立后的 Session 成功注册与属性绑定。
  - 测试各类消息接收与路由分发（心跳消息、单聊、群聊、系统通知等）。
  - 测试 WebSocket 断开连接（正常断开、客户端 1006 异常断开）、清理逻辑以及并发控制。
- **消息具体处理器 (`HeartbeatWsMessageHandler`, `WsMessageHandler`)**：
  - 测试心跳机制的正确响应与心跳时间戳更新。
  - 测试异常/非法消息格式的捕获与优雅处理。
- **核心服务与组件 (`ImServiceImpl`, `MessageRetryQueue`, `ProcessedMessageDeduplicator`)**：
  - 测试消息推送机制（对本地连接直接推送、对跨节点连接通过 Redis 广播推送）。
  - **单用户互踢逻辑**：测试新连接建立时主动发送关闭旧连接指令，并验证旧连接关闭状态（核心记忆点覆盖）。
  - **系统消息推送拦截**：测试系统消息 (`MessageType.SYSTEM`) 推送逻辑，确保不会被错误覆盖为 `MESSAGE` 类型（核心记忆点覆盖）。
  - 测试消息重试队列调度和基于 Redis/本地缓存的幂等去重逻辑。
- **消息监听器 (`RedisMessageListener`)**：
  - 测试集群内消息广播接收与反序列化，触发本地 WebSocket 推送的完整流程。

## 3. `user-service` 测试覆盖
- **Controller 层**：针对 `UserController`, `FriendController`, `UserInternalController` 进行全接口 Mock MVC 测试（正常参数、非法参数校验拦截、边界条件）。
- **Service 层**：`UserServiceImpl`, `FriendServiceImpl` 的业务逻辑测试。
  - 用户注册、登录、更新信息、密码修改验证。
  - **好友申请状态兼容**：测试前端传入 "PENDING", "待处理", 0 时状态解析与处理兼容逻辑（核心记忆点覆盖）。
  - **双向互斥**：测试好友申请双向互斥异常捕获（如 400 已有待处理的好友申请）。
  - **双向系统通知**：测试发送好友申请后，触发给目标和自身的双向系统通知 (`REFRESH_FRIEND_REQUESTS`)。

## 4. `group-service` 测试覆盖
- **Controller 层**：`GroupController`, `GroupInternalController` 的 API 接口路由与权限校验拦截测试。
- **Service 层**：`GroupServiceImpl` 业务测试。
  - 覆盖建群、解散群、加群、退群、移除成员的全流程。
  - 覆盖群主权限转让及管理员鉴权机制。
  - 验证内部接口调用的正确数据返回。

## 5. `message-service` 测试覆盖
- **Controller 层**：`MessageController`, `MessageActionController`, `MessageRetryController` 接口全场景覆盖。
- **Service/Handler 层**：`MessageServiceImpl`, `GroupMessageHandler`, `PrivateMessageHandler`, `OutboxService`。
  - 发送消息的限流拦截逻辑 (`MessageRateLimiter`)。
  - 消息入库及 Outbox 事件生成的事务一致性保障。
  - 消息状态更新（已读回执上报、消息撤回）。
  - 群聊/单聊离线消息拉取及游标处理逻辑。

## 6. `auth-service` 测试覆盖
- 补充并完善已有的 `AuthPermissionServiceTest`, `AuthTokenServiceTest`。
- 新增 Controller 层全接口测试 (`AuthController`, `AuthInternalController`)。
- 覆盖 Token 颁发、刷新、校验、强制下线撤销等生命周期管理场景。

## 7. `gateway` 与 `registry-monitor` 测试覆盖
- **Gateway**：针对 `JwtAuthGlobalFilter`, `WhiteListAuthFilter`。
  - 测试白名单路径放行逻辑。
  - 测试 Token 校验失败处理逻辑（返回 401），以及验证 WebClient 正确调用 `im-auth-service`（核心记忆点覆盖）。
- **Registry Monitor**：`RegistryPoller`, `RegistryMonitorController`。
  - 测试轮询 Nacos 实例时的异常处理（如跳过 `serviceName` 为空导致的 400，健康检查接口返回 404 等被正确 catch）（核心记忆点覆盖）。

## 8. `file-service` 测试覆盖
- 完善 `FileController` 和 StorageService (`CosStorageService`, `LocalStorageService`)。
- 测试文件上传成功、超出大小限制报错拦截、下载流处理与删除逻辑。

## 9. 实施与验证步骤 (Execution Strategy)
1. **基础设施铺垫**：优先创建测试目录及补充所有 `pom.xml` 缺失的依赖。
2. **逐个模块突破**：按照 `im-server` -> `message-service` -> `user-service` -> `group-service` -> `auth-service` -> `file-service` -> `gateway`/`registry-monitor` 的顺序依次生成。
3. **独立运行验证**：每完成一个模块的测试生成，通过 `mvn test -pl <module>` 验证测试是否全部通过，确保不存在真实中间件依赖。
4. **覆盖率确认**：确保各模块的核心 `if-else` 分支（特别是项目中记录的特殊场景兼容代码）均被覆盖。
