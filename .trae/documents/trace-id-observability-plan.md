# 全链路 TraceID 方案计划

## Summary

- 目标：在不改业务日志文本和业务返回 JSON 的前提下，为整个后端系统补齐统一的 TraceID 生成、透传、异步线程继承与日志输出能力。
- 严格边界：
  - 仅修改 HTTP Header 操作、SLF4J MDC 上下文操作、日志 Pattern
  - 不修改业务 Controller / Service 中已有 `log.info()` / `log.error()` 文本
  - 不修改任何业务返回给前端的 JSON 结构
- 已确认决策：
  - 请求头统一切换为 `X-Log-Id`
  - Gateway 采用“新增 `TraceIdFilter` 并替换旧 `TraceIdRouteHeaderFilter`”方案
  - 各微服务逐个落地自己的 `logback-spring.xml`
  - `common` 与 `internal-client` 两处 `FeignTraceInterceptor` 同步统一

## Current State Analysis

### 1. Gateway 现状

- 现有文件：`backend/gateway/src/main/java/com/im/gateway/filter/TraceIdRouteHeaderFilter.java`
- 当前行为：
  - 从 Header 读取 `X-Trace-Id`
  - 若没有则使用 `UUID.randomUUID().toString()` 生成
  - 将 `X-Trace-Id` 回写到请求与响应 Header
  - 不操作 `MDC`
  - 结束时直接打印 `traceId=... method=... path=...`
- 现状问题：
  - Header 名与目标不一致：当前是 `X-Trace-Id`，目标是 `X-Log-Id`
  - 生成算法不一致：当前是 UUID，目标是 Snowflake
  - 没有建立标准 MDC 生命周期
  - 旧类名聚焦“RouteHeader”，职责不清，不适合作为统一 Trace 入口

### 2. Common 模块现状

#### Feign

- 现有文件：`backend/common/src/main/java/com/im/feign/FeignTraceInterceptor.java`
- 当前行为：
  - 从 `MDC.get("traceId")` 取值
  - 写入 Feign Header `X-Trace-Id`
- 现状问题：
  - Header 名与目标不一致
  - 与 Gateway 将要生成的 `X-Log-Id` 不统一

#### Servlet Trace 入口

- 现有文件：
  - `backend/common/src/main/java/com/im/interceptor/TraceIdInterceptor.java`
  - `backend/common/src/main/java/com/im/config/TraceIdWebMvcConfig.java`
- 当前行为：
  - Servlet 微服务入口从 `X-Trace-Id` 读取
  - 若缺失则 fallback 为无横杠 UUID
  - 写入 `MDC["traceId"]`
  - 请求结束时清理 MDC
- 现状问题：
  - Header 名仍是 `X-Trace-Id`
  - fallback 算法与目标不一致
  - Gateway 与下游服务入口协议不统一

#### Snowflake

- 现有文件：`backend/common/src/main/java/com/im/config/SnowflakeConfig.java`
- 当前能力：
  - 已提供 Hutool `Snowflake` Bean
- 结论：
  - 目标中的“Snowflake 算法生成 ID”基础设施已存在，不需要重复造轮子

#### 线程透传

- 现有文件：`backend/common/src/main/java/com/im/concurrent/MdcTaskDecorator.java`
- 当前行为：
  - 拷贝主线程 `MDC` 上下文
  - 在子线程执行前设置上下文
  - 执行结束后 `MDC.clear()`
- 现状问题：
  - 该类已经基本满足目标要求，但仓库搜索未发现普遍的 `setTaskDecorator(...)` 装配
  - 需要补充计划说明：执行阶段要核对并接入已有 `ThreadPoolTaskExecutor`

### 3. internal-client 现状

- 存在同名副本：
  - `backend/internal-client/src/main/java/com/im/feign/FeignTraceInterceptor.java`
- 当前实现与 `common` 版本一致，也使用 `X-Trace-Id`
- 风险：
  - 若只改 `common`，部分走 `internal-client` 的服务会继续透传旧 Header，链路无法统一

### 4. logback 现状

- 仓库中显式存在的 `logback-spring.xml` 只有：
  - `backend/common/src/main/resources/logback-spring.xml`
  - `backend/registry-monitor/src/main/resources/logback-spring.xml`
- `common` 当前 Pattern：
  - `%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level [traceId=%X{traceId}] %logger{36} - %dmsg%n`
- `registry-monitor` 当前 Pattern：
  - `%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level [traceId=%X{traceId}] %logger{36} - %msg%n`
- 仓库现状问题：
  - 大多数微服务还没有自己的 `logback-spring.xml`
  - 用户要求“所有微服务的 `logback-spring.xml`”逐服务落地，因此执行阶段需要为每个 Spring Boot 服务补齐资源文件

### 5. 真实模块范围

根据父 `pom.xml`，本次“逐服务落地日志文件”的范围至少包括：

- `gateway`
- `auth-service`
- `user-service`
- `group-service`
- `message-service`
- `file-service`
- `im-server`
- `log-service`
- `registry-monitor`

可选补充：

- 若 `common` 的 `logback-spring.xml` 仍作为公共模板保留，应同步更新
- `internal-client` / `persistence-common` 不是独立运行服务，不需要单独日志文件

## Proposed Changes

### A. Gateway：新增 `TraceIdFilter` 并退役旧 `TraceIdRouteHeaderFilter`

#### 文件

- 新增：`backend/gateway/src/main/java/com/im/gateway/filter/TraceIdFilter.java`
- 删除或退役：`backend/gateway/src/main/java/com/im/gateway/filter/TraceIdRouteHeaderFilter.java`
- 新增/更新测试：
  - `backend/gateway/src/test/java/com/im/gateway/filter/TraceIdFilterTest.java`
  - 或改造现有 `TraceIdRouteHeaderFilterTest.java`

#### 改法

- 新过滤器职责：
  - 读取请求头 `X-Log-Id`
  - 若缺失，使用 `Snowflake` 生成新的 TraceID
  - 将 TraceID 写入：
    - `ServerHttpRequest` Header：`X-Log-Id`
    - `ServerHttpResponse` Header：`X-Log-Id`
    - `MDC["traceId"]`
  - 在 Reactor 链结束时清理 MDC
- 由于 Gateway 为 WebFlux：
  - 不能仅依赖 `MDC.put()` 后直接 `chain.filter(...)`
  - 需要确保请求处理前后都正确设置/清理 MDC
  - 计划建议采用“过滤器入口设置 + `doFinally` 清理”的轻量实现
- 与现有 `TraceIdRouteHeaderFilter` 的路由头校验逻辑拆分：
  - 旧类中 `X-Gateway-Route` 校验不属于 Trace 职责
  - 执行阶段应将“Trace 生成/透传”与“路由头校验”分离
  - 如果必须保留 `X-Gateway-Route` 校验，则迁回独立网关过滤器，不与 `TraceIdFilter` 混写

#### 关键常量建议

- Header：`X-Log-Id`
- MDC key：`traceId`

### B. Common：统一 Servlet 入口 Trace 协议

#### 文件

- `backend/common/src/main/java/com/im/interceptor/TraceIdInterceptor.java`
- `backend/common/src/main/java/com/im/config/TraceIdWebMvcConfig.java`
- `backend/common/src/main/java/com/im/config/SnowflakeConfig.java`

#### 改法

- `TraceIdInterceptor`
  - 将 Header 常量从 `X-Trace-Id` 改为 `X-Log-Id`
  - 优先读取 `X-Log-Id`
  - 若缺失，则通过 `Snowflake` 生成新的 TraceID，而不是 UUID
  - 设置 `MDC["traceId"]`
  - 请求结束时清理 MDC
- `TraceIdWebMvcConfig`
  - 保持现有全路径注册方式
  - 若 `TraceIdInterceptor` 需要注入 `Snowflake` Bean，则改为通过 Spring Bean 注册，而非 `new TraceIdInterceptor()`
- `SnowflakeConfig`
  - 保留现有 Bean，执行时仅确认所有依赖 `common` 的服务都能注入

### C. Common 与 internal-client：统一 Feign 透传

#### 文件

- `backend/common/src/main/java/com/im/feign/FeignTraceInterceptor.java`
- `backend/internal-client/src/main/java/com/im/feign/FeignTraceInterceptor.java`

#### 改法

- 两处实现同步调整：
  - Header 常量改为 `X-Log-Id`
  - 继续从 `MDC["traceId"]` 取值
  - 若值为空则不写 Header
- 不修改 Feign 接口方法签名，不修改业务 DTO

#### 原因

- 避免部分服务仍走旧 `X-Trace-Id`，导致链路断裂

### D. Common：确认并接入 `MdcTaskDecorator`

#### 文件

- `backend/common/src/main/java/com/im/concurrent/MdcTaskDecorator.java`
- 各存在 `ThreadPoolTaskExecutor` 的配置类，例如：
  - `backend/im-server/src/main/java/com/im/config/ImServerAsyncConfig.java`
- 其他微服务内若存在异步线程池配置，也需纳入

#### 改法

- `MdcTaskDecorator` 本身现有实现基本满足目标：
  - 主线程 `MDC` 拷贝到子线程
  - 任务结束后清理
- 执行阶段重点不是重写类本身，而是：
  - 核对所有 `ThreadPoolTaskExecutor`
  - 调用 `setTaskDecorator(new MdcTaskDecorator())`
- 若模块使用虚拟线程或自定义 `Executor` 而非 `ThreadPoolTaskExecutor`：
  - 计划中应记录这是一个残余风险点
  - 不在本轮强行重构执行器模型

### E. 各微服务逐服务落地 `logback-spring.xml`

#### 文件范围

- `backend/gateway/src/main/resources/logback-spring.xml`
- `backend/auth-service/src/main/resources/logback-spring.xml`
- `backend/user-service/src/main/resources/logback-spring.xml`
- `backend/group-service/src/main/resources/logback-spring.xml`
- `backend/message-service/src/main/resources/logback-spring.xml`
- `backend/file-service/src/main/resources/logback-spring.xml`
- `backend/im-server/src/main/resources/logback-spring.xml`
- `backend/log-service/src/main/resources/logback-spring.xml`
- `backend/registry-monitor/src/main/resources/logback-spring.xml`
- 同步保留/更新：
  - `backend/common/src/main/resources/logback-spring.xml`

#### 改法

- 逐服务创建或修改 `logback-spring.xml`
- 日志 Pattern 中统一加入：
  - `[%X{traceId}]`
- 建议统一 Pattern 形态：
  - `%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level [traceId=%X{traceId}] %logger{36} - %msg%n`
- 若服务当前依赖 `DesensitizationConverter` 且需要 `%dmsg`：
  - 应保留原有 converter 与 `%dmsg`
  - 只在 Pattern 中插入 `traceId` 片段

#### 关键注意点

- `log-service` 当前正则已经按 `[traceId=xxx]` 解析日志
- 因此计划中必须保持日志片段格式兼容：
  - `[traceId=%X{traceId}]`
- 不可改成完全不同的结构，例如 `[trace=%X{traceId}]`

## Assumptions & Decisions

- Header 名统一以 `X-Log-Id` 为准，不再把 `X-Trace-Id` 作为主协议。
- Gateway Trace 入口通过新增 `TraceIdFilter` 完成，旧 `TraceIdRouteHeaderFilter` 退役或剥离为非 Trace 职责。
- `SnowflakeConfig` 已存在，可直接复用，不重复新建算法实现。
- `MdcTaskDecorator` 已基本存在，执行重点在“装配到线程池”而不是重写类本身。
- 所有微服务逐个提供自己的 `logback-spring.xml`，而不是只依赖 `common` 资源在运行时“隐式继承”。
- `common` 与 `internal-client` 的 Feign Trace 透传实现必须同步，以防链路协议分裂。

## Verification Steps

### 1. Gateway 验证

- 请求进入 Gateway 时：
  - 若无 `X-Log-Id`，响应头中出现新的 `X-Log-Id`
  - 若有 `X-Log-Id`，下游请求保留相同值
- 网关日志中可看到：
  - `[traceId=...]`

### 2. Servlet 微服务验证

- 进入任意微服务 Controller 前：
  - `MDC["traceId"]` 已设置
- 请求完成后：
  - MDC 被清理

### 3. Feign 验证

- 微服务 A 调用微服务 B 时：
  - Feign 请求 Header 中包含 `X-Log-Id`
  - B 的日志中打印出与 A 相同的 `traceId`

### 4. 异步线程验证

- 在带有线程池的异步任务中：
  - 子线程日志能打印出与主线程一致的 `[traceId=...]`

### 5. 日志配置验证

- 以下服务都存在 `src/main/resources/logback-spring.xml`：
  - `gateway`
  - `auth-service`
  - `user-service`
  - `group-service`
  - `message-service`
  - `file-service`
  - `im-server`
  - `log-service`
  - `registry-monitor`
- 各文件 Pattern 中都包含 `[traceId=%X{traceId}]`
- `log-service` 对日志行的解析兼容不被破坏

### 6. 非目标回归

- 不修改 Controller / Service 的日志文本内容
- 不修改业务 JSON 返回结构
- 不修改 Feign 接口签名
