# IM Project

一个基于 Java 微服务和 Vue 3 的即时通讯项目。

## 当前约定

- `auth-service` 是唯一的 Token 服务，负责签发、解析、刷新、吊销，以及生成 WebSocket ticket。
- `admin-service` 已从主工程、启动脚本和 CI 中移除。
- WebSocket 握手使用短期一次性 `ticket`，不再把 JWT 放进 URL。

## 环境约定

- `dev` 用于本地启动，服务地址使用 `127.0.0.1` 这类本机地址。
- `sit` 用于 Docker 部署，服务地址使用 `im-mysql`、`im-nacos` 这类容器服务名。
- 后端 `dev` 和 `sit` 配置直接提交在 `backend/*/src/main/resources/{dev,sit}`。
- 根目录 `.env.example` 现在只保留前端可选覆盖项。

## 仓库结构

- `backend/`: Spring Boot 微服务与公共模块
- `frontend/`: Vue 3 + Vite 前端
- `.github/workflows/`: 持续集成配置

## 本地开发

前端：

```powershell
cd frontend
npm ci
npm run dev
```

后端校验：

```powershell
mvn -f backend/pom.xml test
```

前端校验：

```powershell
cd frontend
npm run typecheck
npm run test
npm run build
```

批量启动后端服务：

```powershell
pwsh backend/start_all_services.ps1
```

## 常用命令

- `make backend-test`
- `make frontend-typecheck`
- `make frontend-test`
- `make frontend-build`
- `make quality`

## CI

默认质量门禁会执行：

- `mvn -f backend/pom.xml test`
- `npm ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## SIT Compose

- Copy `.env.example` to `.env`, then run:

```powershell
docker compose --env-file .env -f deploy/sit/docker-compose.yml up -d
```

- This makes `deploy/sit/docker-compose.yml` consume the same ports, passwords, secrets, and build arguments documented in the root `.env`.
