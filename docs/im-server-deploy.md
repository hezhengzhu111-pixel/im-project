# im-server 部署与运维手册

## 组件关系

- im-server：IM 实时推送与在线状态服务（REST + WebSocket），消费 Kafka 主题并向在线会话推送
- 依赖：
  - Kafka：消息订阅（必需）
  - im-auth：WebSocket 握手时 Token 校验（建议启用）
  - Redis/DB：当前版本非强依赖，但已预留连接参数便于后续扩展

## 编排与端口

- docker-compose：已包含 `im-server` 服务定义与健康检查
  - 容器端口：8083
  - 宿主映射：8085 -> 8083（可按需调整，避免与现有端口冲突）

## 启动顺序（推荐）

1. 基础设施：mysql、redis、kafka
2. 网关与鉴权：im-gateway、im-auth
3. 业务服务：im-user、im-group、im-message
4. 实时服务：im-server
5. 前端：im-frontend

说明：
- im-server 的就绪探针会检查应用就绪态与 Kafka Listener 是否运行。Kafka 未就绪时，im-server 会被标记为 NOT_READY。

## 健康检查与就绪探针

- Liveness：`GET http://<host>:8085/health`
  - 返回 200 即表示进程存活
- Readiness：`GET http://<host>:8085/ready`
  - 返回 200 表示 READY
  - 返回 503 表示 NOT_READY（通常是 Kafka Listener 未启动或应用未进入 ACCEPTING_TRAFFIC）
- docker-compose healthcheck：使用 `/ready` 判断容器是否可用

## 网关路由（/im-server 前缀）

网关已支持将 `/im-server/**` 转发到 im-server 容器端口，并自动去除前缀。

示例：
- `GET  /im-server/health` -> im-server `/health`
- `POST /im-server/api/im/heartbeat` -> im-server `/api/im/heartbeat`

## 配置参数

参考根目录 `.env.example`，常用参数如下：

- Kafka
  - `KAFKA_BOOTSTRAP_SERVERS`：Kafka 地址（默认 `im-kafka:9092`）
- 内部鉴权
  - `IM_INTERNAL_HEADER`：内部调用头名（默认 `X-Internal-Secret`）
  - `IM_INTERNAL_SECRET`：内部调用密钥（默认 `im-internal-secret`）
- 依赖服务
  - `AUTH_SERVICE_URL`：im-auth 地址（建议 `http://im-auth:8084`）
- im-server 自身
  - `IM_SERVICE_URL`：对外声明的 im-server 地址（容器内建议 `http://im-server:8083`）
- 预留（当前版本非强依赖）
  - `SPRING_DATA_REDIS_HOST`、`SPRING_DATA_REDIS_PORT`
  - `IM_SERVER_DB_URL`、`IM_SERVER_DB_USERNAME`、`IM_SERVER_DB_PASSWORD`

## 回滚方案（可追踪版本）

建议以镜像 tag 作为可追踪版本（例如 git tag 或 commit sha）。

回滚方式（示例）：
1. 将 `docker-compose.yml` 中 `im-server.image` 的 tag 切回上一版本（例如 `sha-<old>` 或 `vX.Y.Z`）
2. 执行：
   - `docker compose pull im-server`
   - `docker compose up -d im-server`
3. 验证：
   - `curl http://<host>:8085/ready`
   - `docker compose ps im-server`

## 日志查看

- 容器日志：
  - `docker compose logs --tail 200 -f im-server`
- 文件日志（默认挂载到宿主机 `./logs/im-server`）：
  - `./logs/im-server/im-server.log`

## 监控与告警建议

### 监控指标（建议接入 Prometheus/日志平台）

- 容器维度
  - 容器 health 状态持续不健康
  - 重启次数异常上升
- 应用维度
  - `/ready` 非 200 持续超过 1-3 分钟
  - `/actuator/health` 中 Kafka 指标异常（如启用）
- Kafka 维度
  - `im-private-message-group`、`im-group-message-group` consumer lag 持续升高
  - topic 写入失败/重试异常

### 告警规则（示例）

- ReadinessDown：`/ready` 连续 3 次失败（间隔 30s）触发告警
- KafkaLagHigh：consumer lag > 5k 持续 5 分钟触发告警
- ErrorRateHigh：im-server 日志中 ERROR 级别 5 分钟内超过阈值（按业务定）

## CI/CD 说明

仓库已提供 `im-server` 的 GitHub Actions 工作流（构建/测试/镜像推送/部署）。

需要配置的变量与密钥：

- Variables
  - `IMAGE_REGISTRY`：镜像仓库地址（如 `ghcr.io` 或私有 registry）
  - `IMAGE_NAMESPACE`：命名空间/组织名
- Secrets
  - `REGISTRY_USERNAME`、`REGISTRY_PASSWORD`：仓库登录
  - `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_KEY`、`DEPLOY_WORKDIR`（可选）：用于 SSH 自动部署

