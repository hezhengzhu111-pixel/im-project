# 网关集中限流压测报告模板

## 1. 基本信息

- 测试环境：
- 网关节点数：
- Redis 规格：
- 压测时间：
- 限流版本：
- 开关状态：`rate.limit.global.enabled=true`
- 网关模式：`im.gateway.rate-limit.mode=ENFORCE`

## 2. 压测目标

- 单节点 5w QPS
- P99 延迟增幅 < 5%
- 错误率 < 0.1%
- 10 节点横向扩展接近线性提升

## 3. 压测脚本

- 脚本文件：`docs/perf/gateway-rate-limit-k6.js`
- 执行命令：

```bash
k6 run docs/perf/gateway-rate-limit-k6.js
```

## 4. 结果摘要

| 场景 | 网关节点数 | 总 QPS | P99(ms) | 错误率 | 429 占比 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 基线无规则 | 1 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |
| 开启 QPS 限流 | 1 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |
| 开启 QPS+并发 | 1 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |
| 横向扩容 | 10 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |

## 5. 关键指标

- `im_gateway_rate_limit_decisions_total`
- `im_gateway_rate_limit_redis_latency_seconds`
- 网关 JVM CPU / 内存 / GC
- Redis OPS / RTT / CPU

## 6. 结论

- 是否满足目标：
- 风险项：
- 下一步建议：
