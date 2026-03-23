# 后台管理平台及高阶日志管理模块设计与实施计划

## 1. 项目概述与架构设计
为现有的 IM 项目设计并实现一套完整的后台管理平台。平台包含用户管理、群组管理、消息管理、日志管理和系统管理五大核心模块。其中，日志管理模块将作为重点进行架构升级，以满足高并发、实时性、全链路追踪及高可用的要求。

**新增核心架构组件**：
- **admin-service (后台管理服务)**：处理管理平台的基础业务（用户、群组、消息、系统设置）并对接前端。
- **log-service (日志处理与查询服务)**：负责日志的实时订阅推送、ES查询与降级查询。
- **中间件栈**：Elasticsearch (存储与检索)、Kafka (日志缓冲与实时分发)、Filebeat (日志采集)。

## 2. 核心模块规划
1. **用户管理**：提供用户列表、封禁/解封、强制下线、基础信息修改功能（对接 `user-service` 和 `im-server`）。
2. **群组管理**：提供群组列表、解散群组、群成员管理功能（对接 `group-service`）。
3. **消息管理**：全局消息检索、消息撤回、敏感词拦截配置（对接 `message-service`）。
4. **系统管理**：RBAC（基于角色的权限控制）、管理员账号管理、系统字典与配置项维护。
5. **日志管理**：核心攻坚模块，满足实时、全链路、高性能、高可用和合规要求。

## 3. 日志管理高阶需求技术方案

### 3.1 全链路日志追踪 (Trace ID)
- **ID 生成**：在 `gateway` 统一拦截请求，使用 Snowflake 算法生成全局唯一且有序的 `traceId`。
- **链路透传**：
  - **HTTP**：将 `traceId` 注入 HTTP Header (`X-Log-Id`)，通过网关向下游微服务传递。
  - **RPC (Feign)**：实现 `RequestInterceptor`，在服务间调用时携带该 Header。
  - **异步/多线程**：自定义 `TaskDecorator` 和线程池包装类，在跨线程时拷贝 MDC 上下文。
  - **消息队列 (Kafka/Redis)**：在消息体或 Message Header 中封装 `traceId`。
- **日志打印**：所有微服务的 Logback 统一配置，在 pattern 中加入 `[%X{traceId}]`。

### 3.2 存储与性能架构 (吞吐 ≥ 5000 条/秒)
- **异步落盘**：使用 Logback `AsyncAppender`，将日志先高性能写入本地文件。
- **采集与缓冲**：部署 Filebeat 监控本地日志文件，将日志发送至 Kafka Topic。
- **持久化**：使用 Logstash (或自定义服务消费者) 从 Kafka 批量拉取日志写入 Elasticsearch。
- **ES 索引策略**：按天滚动拆分 (`admin-logs-yyyy.MM.dd`)，通过 ILM (Index Lifecycle Management) 配置保留 30 天。
- **查询优化**：`traceId` 设为 `keyword` 类型，并建立精确索引，确保 P99 延迟 ≤ 200 ms。

### 3.3 实时日志推送 (1秒内触达)
- **技术选型**：WebSocket 或 Server-Sent Events (SSE)。
- **实现机制**：前端建立 SSE/WS 连接，`log-service` 作为 Kafka 消费者订阅实时日志。接收到日志后，根据客户端订阅的过滤条件（服务名、日志级别），在 1 秒内将匹配的日志推送至前端。

### 3.4 容错与降级策略
- **ES 宕机降级**：在 `log-service` 中实现熔断机制（如 Sentinel）。当 ES 不可用时，触发降级策略，通过执行 Shell 命令（如 `ripgrep`）或读取共享存储（NFS）上的本地文件来响应查询。
- **限流与采样**：网关层针对日志写入突发流量进行限流；对于低级别日志（DEBUG/INFO）在高负载下通过 Logback Filter 动态降低采样率。

### 3.5 安全与合规
- **数据脱敏**：开发 Logback 自定义 Converter，使用正则匹配并替换日志文本中的敏感信息（如手机号 `\d{3}****\d{4}`、身份证号、密码）。
- **权限隔离**：基于 RBAC，超级管理员可查看所有服务的日志；普通管理员只能查询其被授权模块（如用户模块）的日志。

### 3.6 前端可视化日志面板
- **UI 交互**：Vue3 + Element Plus 构建。
- **实时滚动**：使用虚拟列表（Virtual Scroll）技术支撑大量实时日志渲染，避免浏览器卡顿。
- **查询过滤**：提供多选框过滤日志级别（ERROR/WARN/INFO/DEBUG），时间选择器，以及关键字搜索。
- **日志详情**：点击日志行弹出抽屉/弹窗，展示堆栈信息和同一 `traceId` 的上下游完整请求链路与耗时（Waterfall 图）。

## 4. 实施步骤规划 (Implementation Steps)

- **Step 1: 基础设施搭建 (Day 1)**
  - 编写并测试基于 Docker Compose 的中间件启动脚本（包含 ES, Kibana, Filebeat, Kafka, Zookeeper）。
- **Step 2: 全链路追踪与脱敏改造 (Day 2)**
  - 编写 Gateway 过滤器注入 `X-Log-Id`。
  - 配置 Feign 拦截器和多线程 MDC 传递。
  - 编写 Logback 脱敏插件，统一所有微服务的 `logback-spring.xml`。
- **Step 3: 实时日志与推送机制 (Day 3)**
  - 创建 `log-service`，集成 Kafka 消费者。
  - 实现 WebSocket/SSE 接口，完成实时日志推送。
- **Step 4: 日志存储、查询与降级 (Day 4)**
  - 实现基于 Elasticsearch 的 `traceId` 聚合查询接口。
  - 实现 ES 熔断后的本地文件读取降级查询逻辑。
- **Step 5: 后台业务模块 API 开发 (Day 5)**
  - 创建 `admin-service`，实现用户、群组、消息、系统管理的聚合和独立 API。
  - 编写 OpenAPI 3.0 文档。
- **Step 6: 前端管理面板开发 (Day 6-7)**
  - 搭建前端工程，实现 RBAC 路由。
  - 开发日志实时可视化面板（虚拟滚动、链路详情弹窗）。
  - 开发其他基础管理页面。
- **Step 7: 测试与压测验收 (Day 8)**
  - 编写单元测试，确保覆盖率 ≥ 80%。
  - 编写 JMeter 压测脚本，验证日志写入与查询性能指标。
  - 整理上线检查清单。

## 5. 最终交付物清单
1. 包含完整微服务与大数据组件的 `docker-compose.yml` 脚本。
2. 符合 OpenAPI 3.0 规范的 Swagger/SpringDoc API 接口文档。
3. JaCoCo 单元测试覆盖率报告（≥ 80%）。
4. JMeter 性能压测脚本 (`.jmx`) 与压测结果报告。
5. 系统上线检查清单 (`checklist.md`)。