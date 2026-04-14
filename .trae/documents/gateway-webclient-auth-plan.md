# Gateway WebClient 鉴权重构计划

## Summary

- 目标：将 Gateway 鉴权链路整理为你要求的“`JwtAuthGlobalFilter` 内部初始化 `WebClient` + 单一 Caffeine 结果缓存 + 响应式 `.flatMap()` 鉴权放行”模型。
- 严格边界：
  - 仅调整 Gateway 调用 `auth-service` 的客户端工具与鉴权结果缓存机制。
  - 不改 RouteLocator 路由规则、不改 Token 生成/解析逻辑、不改 CORS。
- 已确认实现偏好：
  - 缓存采用“严格单缓存”方案，只保留单一 10 秒鉴权结果缓存。
  - `WebClient` 采用“类内初始化”方案，不依赖外部注入的 `AuthServiceFeignClient` 或 `WebClient.Builder`。

## Current State Analysis

### 1. 依赖现状

- `backend/gateway/pom.xml`
  - 当前已经包含 `spring-boot-starter-webflux`。
  - 当前已经包含 `com.github.ben-manes.caffeine:caffeine`。
  - 当前未发现 `spring-cloud-starter-openfeign` 或任何 Gateway 模块内的 Feign 依赖。
- 结论：
  - 你要求的第 1 步在当前仓库里大概率已完成。
  - `pom.xml` 是否实际修改，应以“删除冗余说明/保证最终依赖集合准确”为准，而不是机械新增依赖。

### 2. 过滤器现状

- `backend/gateway/src/main/java/com/im/gateway/filter/JwtAuthGlobalFilter.java`
  - 当前已经是响应式 `GlobalFilter`，并且已经在使用 `WebClient`。
  - 当前通过构造器注入 `plainWebClientBuilder` / `loadBalancedWebClientBuilder`，不是“类内直接初始化 `WebClient`”。
  - 当前缓存远超目标复杂度：
    - `tokenCache`
    - `invalidTokenCache`
    - `userResourceCache`
    - `tokenValidationInflight`
    - `userResourceInflight`
  - 当前不仅做 Token 校验，还会额外调用 `/api/auth/internal/user-resource/{userId}` 拉取用户资源并注入签名头。
- 结论：
  - 当前实现已经不是阻塞式 Feign，但与本次目标要求的“类内初始化 + 单缓存 + 简化鉴权流”不一致。

### 3. auth-service 内部接口现状

- `backend/auth-service/src/main/java/com/im/controller/AuthInternalController.java`
  - Token 校验接口真实路径为 `POST /api/auth/internal/validate-token`。
  - 请求头需要携带内部鉴权头：`${im.internal.header}` / `${im.internal.secret}`。
  - 请求体为原始 `String token`。
  - 可选头 `X-Check-Revoked` 控制是否检查吊销状态。
- 结论：
  - `JwtAuthGlobalFilter` 的新 `WebClient` 应直接对接该接口。

### 4. 相关但非目标文件

- `backend/gateway/src/main/java/com/im/gateway/config/WebClientConfig.java`
  - 当前提供 `plainWebClientBuilder` 和 `loadBalancedWebClientBuilder`。
  - 按你已确认的方案，本次计划不依赖它来完成 `JwtAuthGlobalFilter` 的目标重构。
- `backend/gateway/src/test/java/com/im/gateway/filter/JwtAuthGlobalFilterTest.java`
  - 当前测试覆盖了白名单、内部路径拦截、Token 校验、负缓存、超时等现有复杂行为。
  - 若执行阶段把过滤器收敛成单缓存模型，测试需要同步调整。

## Proposed Changes

### A. `backend/gateway/pom.xml`

- 核查并确保保留以下依赖：
  - `org.springframework.boot:spring-boot-starter-webflux`
  - `com.github.ben-manes.caffeine:caffeine`
- 核查并确保不存在 Gateway 模块内的 OpenFeign 依赖：
  - `spring-cloud-starter-openfeign`
  - 其他直接 Feign starter
- 由于当前文件已满足大部分要求，执行阶段只有在发现冗余或与目标冲突时才改动该文件。

### B. `backend/gateway/src/main/java/com/im/gateway/filter/JwtAuthGlobalFilter.java`

#### 目标形态

- 去掉任何 `AuthServiceFeignClient` 注入。
- 不再依赖外部 `WebClient.Builder` bean。
- 在类内部直接初始化：
  - `WebClient`
  - `Caffeine Cache`

#### 具体改法

- 构造器收敛：
  - 保留必要的非鉴权业务依赖，例如 `ObjectMapper`、`GlobalRateLimitSwitch`。
  - 通过配置值构造 `WebClient.builder().baseUrl(authServiceUrl).build()`。
- 缓存收敛：
  - 删除当前多级缓存与 inflight 去重结构。
  - 保留一个单一 `Cache<String, TokenParseResultDTO>` 或等价“鉴权结果对象缓存”。
  - 固定参数：
    - `maximumSize(10000)`
    - `expireAfterWrite(Duration.ofSeconds(10))`
- `filter()` 主流程收敛为：
  1. 提取请求 Token。
  2. 白名单/内部路径/缺 Token 等前置分支仍保留。
  3. 先查单一 Caffeine 缓存。
  4. 命中则直接构造已鉴权请求并 `chain.filter(exchange)`。
  5. 未命中则使用 `WebClient` 异步请求 `auth-service`。
  6. 在 `.flatMap()` 中写缓存并继续构造 `chain.filter(exchange)` 响应式流。
- 内部校验调用：
  - `POST /api/auth/internal/validate-token`
  - 带内部鉴权头和 `X-Check-Revoked`
  - 处理 `ApiResponse<TokenParseResultDTO>`
- 鉴权失败路径：
  - 继续保持 `401` / `503` / `504` 这类网关响应式返回方式。
- 注意：
  - 不修改 Token 的实际解析规则，仍由 `auth-service` 返回校验结果。
  - 不修改 Gateway 路由规则、CORS、或其他过滤器顺序以外的配置。

#### 关于“完整重构代码”的落地方式

- 执行阶段应将 `JwtAuthGlobalFilter` 收敛成你要求的“单缓存版完整代码”，而不是继续保留当前的负缓存、用户资源缓存和 inflight 去重。
- 如果现有“用户资源查询并注入签名头”仍是网关后续链路必需，则执行时需在不违背“单缓存”前提下决定：
  - 要么保留必要的用户资源调用但不再缓存其结果；
  - 要么在 Token 校验结果足以支持当前下游头注入时，删除额外调用。
- 基于当前仓库代码，执行阶段需要优先检查下游是否强依赖 `X-Auth-User` / `X-Auth-Perms` / `X-Auth-Data` 这些头；若强依赖，则不可贸然删掉资源查询步骤，只能把“缓存机制”收敛，而不是把“资源加载”整体删掉。

### C. 测试同步

- `backend/gateway/src/test/java/com/im/gateway/filter/JwtAuthGlobalFilterTest.java`
  - 更新测试构造方式，适配“类内初始化 `WebClient`”后的过滤器构造器。
  - 删除或调整与以下旧实现强绑定的断言：
    - 负缓存
    - 用户资源缓存
    - inflight 去重
  - 保留并强化以下断言：
    - 白名单直接放行
    - 内部路径拒绝
    - 缺失 Token 返回 `401`
    - 缓存命中时不再访问 `auth-service`
    - 缓存未命中时通过 `WebClient` 异步调用鉴权接口
    - 调用成功后写入缓存并放行
    - `auth-service` 超时/异常时返回预期网关状态码

## Assumptions & Decisions

- 当前 Gateway 模块已经不存在 OpenFeign 依赖，本次 `pom.xml` 可能只需做“确认性调整”或保持不变。
- 本次计划以“严格单缓存 + 类内初始化 `WebClient`”为准，不保留当前多缓存和 inflight 去重设计。
- `auth-service` 仍是 Token 真正的校验方，Gateway 不新增本地解析逻辑。
- 若网关下游头注入强依赖用户资源接口，执行阶段可以保留该调用，但其缓存机制不再扩展为额外本地缓存。
- 不改 `WebClientConfig.java`，除非执行阶段发现它与新构造器直接冲突；默认视为可保留但不再被本过滤器使用。

## Verification Steps

### 代码验证

- 确认 `backend/gateway/pom.xml` 中：
  - 存在 `caffeine`
  - 不存在 Gateway 模块的 OpenFeign 依赖
- 确认 `JwtAuthGlobalFilter` 中：
  - 不再有 `AuthServiceFeignClient` 注入
  - `WebClient` 在类内部初始化
  - 仅保留单一 Caffeine 缓存
  - `filter()` 使用响应式 `.flatMap()` 串联鉴权与放行

### 测试验证

- 运行 `backend/gateway` 的 `JwtAuthGlobalFilterTest`
- 核验以下关键场景：
  - 白名单请求不访问 `auth-service`
  - 有效 Token 首次访问触发 `WebClient` 调用
  - 同一 Token 10 秒内再次访问命中 Caffeine 缓存
  - 无效 Token 返回 `401`
  - `auth-service` 超时返回 `504` 或当前既有降级状态

### 回归边界验证

- 路由转发规则不变：不修改 `application.yml` 中的 route 定义
- Token 解析/生成逻辑不变：仍由 `auth-service` 负责
- CORS 配置不变
