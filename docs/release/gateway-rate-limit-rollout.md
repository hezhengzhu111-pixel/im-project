# 网关集中限流上线手册

## 1. 变更目标

- 限流能力统一由网关承载并运行。
- 所有限流判断统一收敛到网关 `GatewayRateLimitFilter`。
- 统一由 `rate.limit.global.enabled` 控制网关集中限流总开关。

## 2. 上线步骤

1. 确认 `gateway` 已部署包含 `GatewayRateLimitFilter`、Prometheus 暴露和 Redis Lua 脚本的新版本。
2. 在网关启用 `IM_GATEWAY_RATE_LIMIT_ENABLED=true`。
3. 先配置 `IM_GATEWAY_RATE_LIMIT_MODE=SHADOW`，并将 `IM_GATEWAY_RATE_LIMIT_V1_GRAY_PERCENT=10`。
4. 观察 24h：
   - `im_gateway_rate_limit_decisions_total{result="shadow_reject"}`
   - 网关 P99
   - 业务错误率
   - Redis RTT
5. 若指标稳定，切换为 `IM_GATEWAY_RATE_LIMIT_MODE=ENFORCE`。
6. 再将灰度比例提升到 `100`，完成全量切换。

## 3. 回滚方案

### 3.1 1 分钟内快速回退

1. 设置 `RATE_LIMIT_GLOBAL_ENABLED=false`，立即关闭网关集中限流。
2. 触发配置刷新或重载环境。
3. 如仍需回退行为，切换到上一个稳定规则版本或回滚网关发布包。

### 3.2 版本回滚

1. 将 `IM_GATEWAY_RATE_LIMIT_ACTIVE_VERSION` 切回上一个稳定版本。
2. `IM_GATEWAY_RATE_LIMIT_PREVIOUS_VERSION` 记录当前失败版本，便于审计。

## 4. 审计项

- 配置变更人
- 生效环境
- `active-version`
- `mode`
- `gray-percent`
- `RATE_LIMIT_GLOBAL_ENABLED`
