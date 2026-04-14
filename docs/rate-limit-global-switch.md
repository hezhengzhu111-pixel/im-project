# 全局限流总开关说明

> 说明：当前系统限流仅由网关集中实现；本文件只描述总开关 `rate.limit.global.enabled` 的定义、热更新和操作规范。

## 1. 目标

- 统一全系统限流是否生效的唯一权威配置项。
- 配置项命名固定为 `rate.limit.global.enabled`。
- 默认值为 `true`，即默认开启限流。
- 当配置切换为 `false` 时，所有已接入的限流逻辑立即失效并进入无限制模式。
- 当配置切换回 `true` 时，各模块恢复原有细粒度限流规则。

## 2. 当前生效范围

- 网关统一限流入口：`GatewayRateLimitFilter`
- 网关规则执行组件：`GatewayRedisRateLimitService`
- 网关规则仓库：`GatewayRateLimitPolicyRepository`
- 网关鉴权过滤器 `JwtAuthGlobalFilter` 会透传 `X-Rate-Limit-Global-Enabled`
- `internal-client` 的 `FeignInternalAuthConfig` 会继续透传该请求头
- 应用服务内部不再保留任何限流实现点

## 3. 配置结构与默认值

公共配置结构：

```yaml
rate:
  limit:
    global:
      enabled: ${RATE_LIMIT_GLOBAL_ENABLED:true}
```

说明：

- 配置键：`rate.limit.global.enabled`
- 默认值：`true`
- 环境变量覆盖：`RATE_LIMIT_GLOBAL_ENABLED`

## 4. 热更新机制

### 4.1 代码机制

- 公共组件：`com.im.config.GlobalRateLimitSwitch`
- 配置绑定：`com.im.config.RateLimitGlobalProperties`
- 热更新方式：
  - 组件启动时从 `Environment` 读取配置
  - 监听 `EnvironmentChangeEvent`
  - 事件触发后立即刷新内存态开关值

### 4.2 适用前提

- 配置中心、运行时环境注入或刷新机制需要能够更新 Spring `Environment`
- 一旦 `Environment` 发生变更并发布刷新事件，开关立即生效

### 4.3 生效语义

- 开关关闭：
  - 网关限流过滤器直接放行
  - 网关不再执行 Redis Lua 限流判定
  - 所有网关规则立即失效并回归无限制模式
- 开关开启：
  - 网关按当前激活版本和细粒度规则恢复生效

## 5. 变更审计

### 5.1 审计日志

`GlobalRateLimitSwitch` 在以下场景输出审计日志：

- 初始加载：
  - `rate limit global switch loaded: key=rate.limit.global.enabled, enabled=...`
- 热更新变更：
  - `rate limit global switch changed: key=rate.limit.global.enabled, enabled=..., source=environment-refresh`

### 5.2 审计建议

- 将该日志纳入网关服务的变更审计检索条件
- 审计字段至少包含：
  - 服务名
  - 环境
  - 配置键
  - 变更前后值
  - 变更时间
  - 操作来源

## 6. 灰度发布建议

### 6.1 推荐顺序

1. 先在 `dev` 验证动态刷新与日志审计。
2. 再在 `sit` 单实例灰度关闭开关。
3. 观察 5 到 10 分钟核心指标后，再决定是否全量。

### 6.2 重点观测指标

- 网关请求总量、错误率、95/99 延迟
- `im_gateway_rate_limit_decisions_total`
- `im_gateway_rate_limit_redis_latency_seconds`
- 网关 `429` 返回量与规则命中分布

### 6.3 灰度回滚

- 如关闭开关后出现异常流量放大、Redis/DB 压力异常升高，立即切回 `true`
- 如开启开关后出现误伤率上升，立即切回 `false`

## 7. 紧急熔断 SOP

### 场景一：限流误伤导致正常请求大量失败

1. 将 `rate.limit.global.enabled` 设为 `false`
2. 触发配置刷新事件
3. 检查网关响应头和服务日志确认已生效
4. 验证消息发送、登录、验证码接口恢复
5. 保留现场日志并回收误判样本

### 场景二：恶意流量冲击，需要快速恢复限流

1. 将 `rate.limit.global.enabled` 设为 `true`
2. 触发配置刷新事件
3. 观察网关限流指标、错误率和业务成功率
4. 如单模块规则不足，再按模块细粒度参数追加调优

### 场景三：配置中心异常，无法确认实时状态

1. 优先查看各服务最新的 `rate limit global switch loaded/changed` 日志
2. 通过网关响应头 `X-Rate-Limit-Global-Enabled` 验证外部可见状态
3. 若状态不一致，优先以实际生效日志为准，随后统一触发一次刷新

## 8. 测试覆盖

已补充的验证包括：

- 公共开关默认值与热更新测试
- 网关规则仓库绑定与规则排序测试
- 网关限流过滤器在 `429` / `Shadow` 模式下的行为测试
- 网关对开关头的注入与响应透传测试
- `internal-client` Feign SDK 的开关头透传测试
