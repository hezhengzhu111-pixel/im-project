# 网关集中限流方案

## 1. 现状梳理

- 正常流量统一只走网关 `GatewayRateLimitFilter`
- 应用服务不再承载任何限流判断、限流计数或限流开关
- 限流总开关唯一权威配置为 `rate.limit.global.enabled`

## 2. 网关集中限流设计

### 2.1 入口

- 过滤器：`com.im.gateway.filter.GatewayRateLimitFilter`
- 顺序：`-90`
- 位置：位于认证过滤器 `JwtAuthGlobalFilter(-100)` 之后

### 2.2 核心能力

- Redis + Lua
  - QPS：令牌桶
  - 并发：Redis 计数信号量
- 维度支持
  - `GLOBAL`
  - `IP`
  - `USER`
  - `API`
  - `USER_API`
  - `IP_API`
- 灰度策略
  - `grayPercent`
  - `grayBy` 支持 `IP/USER/PATH/TRACE/ROUTE`
- 版本化
  - `activeVersion`
  - `previousVersion`
  - `versions.<version>.rules`
- 模式
  - `ENFORCE`
  - `SHADOW`
  - `DISABLED`

## 3. 动态配置

- 规则前缀：`im.gateway.rate-limit`
- 规则仓库：`GatewayRateLimitPolicyRepository`
- 热更新方式：
  - 启动时从 `Environment` 绑定
  - 监听 `EnvironmentChangeEvent`
  - 配置中心推送后自动重载版本化规则
- 配置中心：
  - 配置结构兼容当前 Spring / Nacos 配置模型
  - `application-nacos.yml` 已增加 `IM_NACOS_CONFIG_ENABLED` 可控开关

## 4. 全局开关与回滚

- 集中限流总开关：`rate.limit.global.enabled`

推荐回滚顺序：

1. 先关闭 `rate.limit.global.enabled`
2. 如需恢复能力，回滚网关限流规则版本或回滚网关发布包

## 5. 统一错误响应

网关命中限流后：

- HTTP 状态码：`429`
- Header：
  - `Retry-After`
  - `X-Rate-Limit-Rule`
  - `X-Rate-Limit-Reason`
- JSON：

```json
{
  "code": 42901,
  "message": "请求过于频繁，请稍后再试"
}
```

## 6. 可观测性

### 6.1 指标

- `im_gateway_rate_limit_decisions_total`
- `im_gateway_rate_limit_redis_latency_seconds`

### 6.2 配套文件

- 规则模板：`docs/templates/gateway-rate-limit-template.yml`
- 告警规则：`docs/observability/gateway-rate-limit-alert-rules.yml`
- Grafana 大盘：`docs/observability/gateway-rate-limit-dashboard.json`
- 压测脚本：`docs/perf/gateway-rate-limit-k6.js`
- 压测报告模板：`docs/perf/gateway-rate-limit-report-template.md`
- 上线手册：`docs/release/gateway-rate-limit-rollout.md`

## 7. 已完成验证

- 网关规则仓库绑定与排序测试
- 网关过滤器 429 与 Shadow 放行测试
- 网关认证过滤器与总开关头透传测试
- 消息发送与登录/验证码链路回归测试

## 8. 未在当前环境完成的外部交付物

以下内容已提供模板或产物落位，但需在真实环境执行后补齐：

- 5w QPS / 10 节点压测实测结果
- Grafana 大盘截图
- 代码评审 MR 链接
