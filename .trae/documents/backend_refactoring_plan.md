# 后端代码问题分析与重构计划

## 一、 现存主要问题分析

### 1. IM 核心服务状态与集群化缺陷（致命）
*   **本地内存存储状态**：`im-server` 使用本地 `ConcurrentHashMap` 存储用户的 WebSocket 会话和在线状态，多实例部署时状态隔离。
*   **Kafka 消费者组冲突**：`im-server` 共用一个消费者组，消息只投递给一个实例，若该实例无连接则判定离线，无法集群化分发。
*   **重试与去重队列易失**：依赖本地内存，重启丢失。

### 2. `common` 模块边界被破坏（高危）
*   **实体类过度集中**：破坏微服务“限界上下文”。
*   **依赖污染**：网关等服务被迫引入 `MybatisPlusConfig`。

### 3. 网关层阻塞 I/O 调用（中危）
*   **Reactive 阻塞**：网关在 WebFlux 下使用 OpenFeign（阻塞 IO），高并发下易导致线程池枯竭。

### 4. 代码结构与规范问题（低危）
*   **Service 层逻辑复杂**：缺少 Handler 拆分。
*   **响应结构不统一**：`UserController.login` 未使用 `ApiResponse` 包装。

---

## 二、 现有重构计划方案及利弊分析

### 阶段一：实体类下放，保留 Feign 于 common，清理依赖
*   **【利】**：实体类下放能有效划定各微服务数据库边界；Feign 接口集中在 `common` 降低了互相依赖配置的复杂度，开发初期更便利；清理 `MybatisPlus` 防止了网关等组件的依赖污染。
*   **【弊】**：Feign 接口全部留在 `common` 依然会导致所有服务引入不需要的调用客户端，存在一定的代码冗余。
*   **【改进点】**：可以保持当前计划，但必须确保 `common` 中的 Feign 接口全部使用 DTO 而不引用 Entity，否则会阻碍实体类的下放。

### 阶段二：IM 服务集群化（定向路由方案 Plan B + Redis 重试/去重）
*   **【利】**：定向路由避免了消息全网广播，网络带宽利用率最高；利用 Redis 管理状态和队列实现了集群化和持久化。
*   **【弊与风险】**：
    1.  **定向路由实现复杂**：如果继续使用 Kafka，需要为每个 `im-server` 实例动态创建 Topic 或精确控制 Partition，极其复杂且难以维护。
    2.  **Redis ZSet 重试机制成本高**：手动实现 ZSet 延迟队列需要编写 Lua 脚本和轮询机制，容易引入竞态 bug 和性能瓶颈。
*   **【改进点】**：
    *   *路由改进*：改用 **Redis Pub/Sub** 作为底层实时推送通信。实例启动时订阅专属 Channel。
    *   *队列改进*：建议直接引入 Redisson 的 `RDelayedQueue`，避免手工造轮子实现重试队列。

### 阶段三：网关层非阻塞改造（弃用 OpenFeign，改用 WebClient 或直读 Redis）
*   **【利】**：彻底解决网关线程阻塞问题，吞吐量将有质的飞跃。
*   **【弊与风险】**：如果网关直接读取 Redis 进行 Token 校验，会导致网关层与 Auth 服务的内部缓存结构强耦合。
*   **【改进点】**：放弃“网关直读Redis”方案。统一使用 `WebClient` 进行纯异步非阻塞 HTTP 调用，并在网关内存中引入 `Caffeine` 做极短时间的本地缓存（如 10 秒），兼顾解耦与高性能。

### 阶段四：业务逻辑 Handler 拆分与规范对齐
*   **【利】**：代码单一职责，测试性极大幅度提升，响应规范。
*   **【弊】**：大量抽取 Handler 会导致类的数量激增，重构期间可能引入回归 Bug。
*   **【改进点】**：采用策略模式（Strategy）或责任链模式（Chain of Responsibility）进行重构。

---

## 三、 细化执行计划 (Step-by-Step)

### 阶段一：模块解耦与边界重构
*   **步骤 1.1：迁移 Entity 类**
    *   将 `common/src/main/java/com/im/entity` 下的 `User`、`Friend`、`FriendRequest` 移动到 `user-service`。
    *   将 `Group`、`GroupMember` 移动到 `group-service`。
    *   将 `Message`、`MessageReadStatus` 移动到 `message-service`。
*   **步骤 1.2：修复 Feign Client 依赖**
    *   检查 `common/feign` 下的所有接口，确保方法的入参和出参全部使用 `com.im.dto` 下的类，严禁引入 Entity。
*   **步骤 1.3：下放 Mybatis-Plus 配置**
    *   删除 `common/src/main/java/com/im/config/MybatisPlusConfig.java`。
    *   在 `user-service`、`group-service`、`message-service`、`auth-service` 等需要数据库访问的服务中，各自新建 `MybatisPlusConfig.java`。
    *   在 `gateway` 模块的 `pom.xml` 中排查并排除对持久层库的间接依赖。

### 阶段二：IM 服务集群化改造（Redis 动态路由与 Redisson）
*   **步骤 2.1：引入依赖与基础配置**
    *   在 `im-server` 和 `message-service` 的 `pom.xml` 中引入 `redisson-spring-boot-starter`。
    *   为 `im-server` 实例生成唯一标识（如 UUID 或 IP:Port 组合，在启动时生成）。
*   **步骤 2.2：重构会话与状态管理 (`ImServiceImpl.java`)**
    *   保留本地 `ConcurrentHashMap` 用于维护实际的 WebSocket 连接对象。
    *   在用户成功连接后，将 `userId -> instance_id` 写入 Redis（使用 Redis Hash 结构 `im:route:users`），并设置带有 TTL 的心跳 Key 以维持在线状态。
*   **步骤 2.3：重构消息路由机制 (定向路由)**
    *   `message-service` 接收到发送请求时，通过查询 Redis `im:route:users` 获取接收方所在的 `instance_id`。
    *   如果目标在线，`message-service` 使用 Redis Pub/Sub 将消息发布到 `im:msg:channel:{instance_id}`。
    *   如果目标离线，跳过实时推送逻辑。
*   **步骤 2.4：重构 `im-server` 接收逻辑**
    *   在 `im-server` 中新增 RedisMessageListener，订阅自身专属的 Channel (`im:msg:channel:{自身instance_id}`)。
    *   收到消息后，直接从本地的 `ConcurrentHashMap` 找到对应的 WebSocketSession 并推送。
*   **步骤 2.5：重构持久化队列**
    *   使用 Redisson 的 `RDelayedQueue` 替换原有的内存 `MessageRetryQueue`。
    *   使用 Redisson 的 `RMapCache`（带 TTL 淘汰）替换内存 `ProcessedMessageDeduplicator`。

### 阶段三：网关层性能优化（彻底异步化）
*   **步骤 3.1：引入 Caffeine 缓存**
    *   在 `gateway` 的 `pom.xml` 引入 `com.github.ben-manes.caffeine:caffeine`。
*   **步骤 3.2：重写 `JwtAuthGlobalFilter.java`**
    *   移除 `AuthServiceFeignClient` 注入。
    *   注入 Spring WebFlux 的 `WebClient.Builder`。
    *   构建一个基于 Caffeine 的本地缓存（如：最大容量 10000，过期时间 10 秒），用于缓存 `token -> 校验结果`。
    *   在 `filter` 逻辑中：先查 Caffeine，若未命中则通过 `WebClient` 异步调用 `auth-service` 的 `/api/auth/internal/validate` 接口，将结果写入缓存并放行。

### 阶段四：代码重构与接口规范对齐
*   **步骤 4.1：规范 UserController 响应**
    *   修改 `UserController.java` 中的 `login` 方法签名，返回值从 `UserAuthResponseDTO` 变更为 `ApiResponse<UserAuthResponseDTO>`。
    *   将方法体内 `return UserAuthResponseDTO.error(...)` 的阻断逻辑，统一修改为 `throw new BusinessException("...")`。
*   **步骤 4.2：复杂业务逻辑 Handler 化 (以 `MessageServiceImpl` 为例)**
    *   定义 `MessageHandler` 接口，包含 `boolean supports(MessageType type, boolean isGroup)` 和 `void handle(MessageDTO msg)` 方法。
    *   新建 `PrivateMessageHandler` 和 `GroupMessageHandler` 实现类。
    *   在 `MessageServiceImpl` 中通过 `@Autowired List<MessageHandler> handlers` 注入，使用策略模式将巨型的方法体分发到各自的 Handler 中。
*   **步骤 4.3：WebSocket 消息解析拆分**
    *   将 `im-server` 中负责接收和处理客户端上行消息的代码，从巨大的 switch-case 块中抽出，提取为独立的 `MessageDispatcher`，按消息命令类型路由给不同的处理类。